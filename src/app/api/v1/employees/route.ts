import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { generateNumericOTP, hashToken, hashPassword, generateSecureToken } from '@/lib/cryptoAuth';
import { sendOtpEmail } from '@/lib/email';
import { generateNextEmployeeId } from '@/lib/employeeId';
import { calculateSalaryBreakdown } from '@/lib/salaryBreakdown';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limitParam = searchParams.get('limit');
    const limit = Math.max(1, Math.min(1000, parseInt(limitParam || '200', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const department = searchParams.get('department')?.trim();
    const status = searchParams.get('status')?.trim();

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    const andConditions: any[] = [];

    // Tenant Isolation & Super Admin multi-org support
    if (auth.role === 'SUPER_ADMIN') {
      const requestedOrg = searchParams.get('organizationId')?.trim();
      if (requestedOrg && requestedOrg !== 'All') {
        andConditions.push({ organizationId: requestedOrg });
      }
    } else {
      andConditions.push({ organizationId: orgId || 'org-default' });
    }

    // RBAC: MANAGER role can only see direct report team members
    if (auth.role === 'MANAGER' && auth.employeeId) {
      andConditions.push({
        $or: [
          { managerId: auth.employeeId },
          { reportingTo: auth.employeeId },
          { employeeId: auth.employeeId },
        ],
      });
    } else if (auth.role === 'EMPLOYEE' && auth.employeeId) {
      andConditions.push({ employeeId: auth.employeeId });
    }

    if (department && department !== 'All') {
      andConditions.push({ department });
    }
    if (status && status !== 'All') {
      andConditions.push({ status });
    }
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safeSearch, 'i');
      andConditions.push({
        $or: [
          { firstName: regex },
          { lastName: regex },
          { employeeId: regex },
          { email: regex },
          { department: regex },
          { designation: regex },
        ],
      });
    }

    const filter = andConditions.length > 1 ? { $and: andConditions } : andConditions.length === 1 ? andConditions[0] : {};

    const totalCount = await db.collection('employees').countDocuments(filter);

    const rawEmployees = await db
      .collection('employees')
      .find(filter, { projection: { password: 0, passwordHash: 0, salt: 0, otp: 0 } })
      .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Deduplicate by employeeId to handle any duplicate/migration documents cleanly
    const seenMap = new Map<string, any>();
    rawEmployees.forEach((emp) => {
      const key = (emp.employeeId || emp._id?.toString() || '').trim().toLowerCase();
      if (!key) return;
      if (!seenMap.has(key)) {
        seenMap.set(key, emp);
      } else {
        const curr = seenMap.get(key);
        const currScore = (curr.firstName ? 1 : 0) + (curr.lastName ? 1 : 0) + (curr.email ? 1 : 0);
        const newScore = (emp.firstName ? 1 : 0) + (emp.lastName ? 1 : 0) + (emp.email ? 1 : 0);
        if (newScore > currScore) {
          seenMap.set(key, emp);
        }
      }
    });

    const employees = Array.from(seenMap.values());

    return NextResponse.json({
      success: true,
      data: employees,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (error: any) {
    console.error('Error fetching employees:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch employees list.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    const { firstName, lastName, email, department, designation, role, phone, joiningDate, salary, location, managerId } = body;

    if (!firstName || !lastName || !email) {
      return NextResponse.json({ success: false, message: 'First name, last name, and email address are required.' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const requestedRole = (role || 'EMPLOYEE').toUpperCase();
    const validRoles = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'];

    if (!validRoles.includes(requestedRole)) {
      return NextResponse.json({ success: false, message: `Invalid account role: ${role}` }, { status: 400 });
    }

    // Role Security: Admin/HR users cannot create SUPER_ADMIN accounts
    if (requestedRole === 'SUPER_ADMIN' && auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Only a Super Admin can create accounts with the SUPER_ADMIN role.' },
        { status: 403 }
      );
    }

    // Tenant Isolation: Force organizationId from server auth context for Admin/HR callers
    let orgId = auth.organizationId;
    if (auth.role === 'SUPER_ADMIN' && body.organizationId) {
      orgId = body.organizationId;
    }

    const { db } = await connectToDatabase();
    const now = new Date();

    // Case-insensitive Duplicate Email & Employee Profile Check
    const existingUser = await db.collection('users').findOne({ email: cleanEmail });
    if (existingUser) {
      return NextResponse.json(
        { success: false, message: `Employee profile or account already exists for email "${cleanEmail}".` },
        { status: 409 }
      );
    }

    // Generate or validate Employee ID
    let employeeId = body.employeeId?.trim();
    if (!employeeId || employeeId.toLowerCase().includes('auto') || employeeId === 'Auto-generated') {
      employeeId = await generateNextEmployeeId(db, orgId);
    }

    // Check duplicate employee ID; if duplicate exists under concurrency, auto-generate next ID
    const existingEmpId = await db.collection('employees').findOne({ organizationId: orgId, employeeId }) ||
      await db.collection('users').findOne({ employeeId });
    if (existingEmpId) {
      // Regenerate next available ID safely to resolve conflict
      employeeId = await generateNextEmployeeId(db, orgId);
    }

    // Server-Side Manager Validation (Prevent cross-tenant assignment & self-reporting)
    let validatedManagerId = '';
    if (managerId && managerId.trim()) {
      const cleanMgr = managerId.trim();
      if (cleanMgr === employeeId || cleanMgr === cleanEmail) {
        return NextResponse.json(
          { success: false, message: 'An employee cannot be assigned as their own reporting manager.' },
          { status: 400 }
        );
      }

      const managerRecord = await db.collection('employees').findOne({
        organizationId: orgId,
        $or: [{ employeeId: cleanMgr }, { id: cleanMgr }, { email: cleanMgr.toLowerCase() }],
      });

      if (!managerRecord) {
        return NextResponse.json(
          { success: false, message: 'The specified Reporting Manager does not exist within your organization.' },
          { status: 400 }
        );
      }
      validatedManagerId = managerRecord.employeeId || cleanMgr;
    }

    let isEmployeeSaved = false;
    let isUserSaved = false;

    try {
      const employeeDoc = {
        organizationId: orgId,
        employeeId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: cleanEmail,
        phone: phone ? phone.trim() : '',
        department: department || 'General',
        designation: designation || 'Staff',
        role: requestedRole,
        status: 'Active',
        joiningDate: joiningDate || now.toISOString().split('T')[0],
        location: location || 'Headquarters',
        managerId: validatedManagerId,
        avatar: body.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80',
        updatedAt: now,
      };

      await db.collection('employees').updateOne(
        { organizationId: orgId, employeeId },
        { $set: employeeDoc, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
      isEmployeeSaved = true;

      // Create user record in users collection with emailVerified: false & PENDING_VERIFICATION
      const rawPass = body.password || generateSecureToken(12);
      const { formatted, salt } = hashPassword(rawPass);
      const userDoc = {
        id: `usr-${employeeId.toLowerCase()}`,
        employeeId,
        name: `${firstName.trim()} ${lastName.trim()}`,
        email: cleanEmail,
        avatar: employeeDoc.avatar,
        role: requestedRole,
        organizationId: orgId,
        department: employeeDoc.department,
        designation: employeeDoc.designation,
        passwordHash: formatted,
        salt,
        status: 'PENDING_VERIFICATION',
        emailVerified: false,
        emailVerificationStatus: 'PENDING_VERIFICATION',
        isTwoFactorEnabled: false,
        updatedAt: now,
      };

      await db.collection('users').updateOne(
        { email: cleanEmail },
        { $set: userDoc, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
      isUserSaved = true;

      // Auto-create salary assignment using revised breakdown formula:
      // Basic 50%, HRA 30% of Basic (15% of Gross), Conveyance ₹2,353, Special Allowance remainder
      // For ₹25,000: Basic ₹12,500, HRA ₹3,750, Conveyance ₹2,353, Special Allowance ₹6,397
      const numSalary = Number(salary);
      if (Number.isFinite(numSalary) && numSalary > 0) {
        const breakdown = calculateSalaryBreakdown(numSalary);

        await db.collection('salary_assignments').updateOne(
          { organizationId: orgId, employeeId, status: 'Active' },
          {
            $set: {
              organizationId: orgId,
              employeeId,
              salaryStructureId: 'struct-custom',
              basicSalary: breakdown.basicSalary,
              hra: breakdown.hra,
              conveyance: breakdown.conveyance,
              medical: 0,
              specialAllowance: breakdown.specialAllowance,
              effectiveFrom: now,
              status: 'Active',
              assignedBy: auth.email || auth.userId,
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true }
        );
      }

      // Generate cryptographically secure 6-digit OTP for account invitation (24-hour TTL)
      const rawOtp = generateNumericOTP(6);
      const otpHash = hashToken(rawOtp);
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour TTL

      // Invalidate existing unused invitation tokens for this email
      await db.collection('auth_otp_tokens').deleteMany({
        email: cleanEmail,
        purpose: 'ACCOUNT_INVITATION',
      });

      // Store SHA-256 hashed OTP in auth_otp_tokens
      await db.collection('auth_otp_tokens').insertOne({
        userId: employeeId,
        email: cleanEmail,
        organizationId: orgId,
        otpHash,
        purpose: 'ACCOUNT_INVITATION',
        expiresAt,
        attempts: 0,
        createdAt: now,
      });

      // Dispatch email safely without letting SMTP failure crash account creation
      let emailResult: { success: boolean; error?: string } = { success: false, error: '' };
      try {
        emailResult = await sendOtpEmail({
          to: cleanEmail,
          otp: rawOtp,
          purpose: 'ACCOUNT_INVITATION',
          userName: `${firstName.trim()} ${lastName.trim()}`,
          organizationName: orgId,
          role: requestedRole,
        });
      } catch (emailErr: any) {
        console.error('Warning: sendOtpEmail threw an exception:', emailErr?.message || emailErr);
        emailResult = { success: false, error: emailErr?.message || 'SMTP dispatch error' };
      }

      // Audit Logging
      await logAuditEvent(req, 'ACCOUNT_CREATED', {
        employeeId,
        details: {
          actorId: auth.userId,
          actorRole: auth.role,
          organizationId: orgId,
          targetUserId: userDoc.id,
          targetEmployeeId: employeeId,
          role: requestedRole,
          email: cleanEmail,
        },
      });

      await logAuditEvent(req, 'ADD_EMPLOYEE', { employeeId, details: employeeDoc });
      await logAuditEvent(req, 'OTP_REQUESTED', { details: { email: cleanEmail, purpose: 'ACCOUNT_INVITATION', emailDelivered: emailResult.success } });

      const newEmp = await db.collection('employees').findOne({ organizationId: orgId, employeeId });

      if (!emailResult.success) {
        return NextResponse.json({
          success: true,
          message: 'Account created, but the invitation email could not be sent. Please resend the invitation email.',
          data: newEmp,
          emailVerificationSent: false,
          email: cleanEmail,
        });
      }

      return NextResponse.json({
        success: true,
        message: `Account created successfully. Invitation email sent to ${cleanEmail}.`,
        data: newEmp,
        emailVerificationSent: true,
        email: cleanEmail,
      });
    } catch (saveError: any) {
      console.error('Critical failure during employee/user document creation:', saveError?.stack || saveError?.message || saveError);

      // Compensating rollback: clean up orphaned records if partial failure occurred
      try {
        if (isEmployeeSaved) {
          await db.collection('employees').deleteOne({ organizationId: orgId, employeeId });
        }
        if (isUserSaved) {
          await db.collection('users').deleteOne({ email: cleanEmail });
        }
      } catch (rollbackErr) {
        console.error('Rollback cleanup exception:', rollbackErr);
      }

      throw saveError;
    }
  } catch (error: any) {
    console.error('Error in POST /api/v1/employees:', error?.stack || error?.message || error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to create account record.' },
      { status: 500 }
    );
  }
}
