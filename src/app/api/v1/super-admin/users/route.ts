import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { generateNumericOTP, hashToken, hashPassword } from '@/lib/cryptoAuth';
import { sendOtpEmail } from '@/lib/email';
import { generateNextEmployeeId, generateNextSuperAdminId } from '@/lib/employeeId';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// GET /api/v1/super-admin/users - Fetch paginated system users, KPIs, and filter options
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '15', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const roleFilter = searchParams.get('role')?.trim() || 'All';
    const statusFilter = searchParams.get('status')?.trim() || 'All';
    const orgFilter = searchParams.get('organizationId')?.trim() || 'All';
    const verificationFilter = searchParams.get('verification')?.trim() || 'All';

    const now = new Date();

    // 1. Fetch Summary KPI Counts
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      pendingVerifyUsers,
      lockedAccounts,
      activeSessions,
      orgDocs,
    ] = await Promise.all([
      db.collection('users').countDocuments(),
      db.collection('users').countDocuments({ status: { $in: ['ACTIVE', 'Active'] } }),
      db.collection('users').countDocuments({ status: { $in: ['INACTIVE', 'Inactive', 'Disabled'] } }),
      db.collection('users').countDocuments({
        $or: [
          { emailVerificationStatus: 'PENDING' },
          { emailVerified: false },
          { emailVerificationStatus: { $exists: false }, emailVerified: { $ne: true } },
        ],
      }),
      db.collection('users').countDocuments({ status: { $in: ['LOCKED', 'Locked', 'Suspended'] } }),
      db.collection('user_sessions').countDocuments({ expiresAt: { $gt: now }, status: 'ACTIVE' }),
      db.collection('organization_settings').find({}).toArray(),
    ]);

    // Format organization list for dropdown filters
    const orgMap = new Map<string, { id: string; name: string; code: string }>();
    orgDocs.forEach((doc) => {
      const orgId = doc.organizationId || doc._id.toString();
      const details = doc.organization || {};
      if (!orgMap.has(orgId)) {
        orgMap.set(orgId, {
          id: orgId,
          name: details.name || doc.name || 'Infinitive Cloud Solutions',
          code: details.code || doc.code || 'ICS-HQ',
        });
      }
    });

    if (!orgMap.has('org-default')) {
      orgMap.set('org-default', {
        id: 'org-default',
        name: 'Infinitive Cloud Solutions',
        code: 'ICS-HQ',
      });
    }

    const organizationsList = Array.from(orgMap.values());

    // 2. Build Filter Query
    let query: any = {};

    if (roleFilter !== 'All') {
      query.$or = [{ role: roleFilter }, { roleTitle: roleFilter }];
    }

    if (statusFilter !== 'All') {
      if (statusFilter === 'Active') {
        query.status = { $in: ['ACTIVE', 'Active'] };
      } else if (statusFilter === 'Inactive') {
        query.status = { $in: ['INACTIVE', 'Inactive', 'Disabled'] };
      } else if (statusFilter === 'Locked' || statusFilter === 'Suspended') {
        query.status = { $in: ['LOCKED', 'Locked', 'Suspended'] };
      } else if (statusFilter === 'Pending Verification') {
        query.$or = [{ emailVerificationStatus: 'PENDING' }, { emailVerified: false }];
      } else {
        query.status = statusFilter;
      }
    }

    if (orgFilter !== 'All') {
      query.organizationId = orgFilter;
    }

    if (verificationFilter !== 'All') {
      if (verificationFilter === 'Verified') {
        query.$or = [{ emailVerified: true }, { emailVerificationStatus: 'VERIFIED' }];
      } else if (verificationFilter === 'Pending') {
        query.$or = [{ emailVerified: false }, { emailVerificationStatus: 'PENDING' }];
      }
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { name: regex },
            { fullName: regex },
            { email: regex },
            { role: regex },
            { employeeId: regex },
            { organizationId: regex },
          ],
        },
      ];
    }

    // 3. Execute Paginated Query
    const totalFilteredCount = await db.collection('users').countDocuments(query);
    const userDocs = await db
      .collection('users')
      .find(query, { projection: { password: 0, passwordHash: 0, salt: 0, otp: 0 } })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Fetch matching employee records for complete profile view/edit
    const userEmails = userDocs.map((u) => (u.email || '').toLowerCase()).filter(Boolean);
    const userEmpIds = userDocs.map((u) => u.employeeId).filter(Boolean);
    const matchingEmps = await db
      .collection('employees')
      .find({
        $or: [{ email: { $in: userEmails } }, { employeeId: { $in: userEmpIds } }],
      })
      .toArray();

    const empByEmailMap = new Map<string, any>();
    const empByOrgAndEmpIdMap = new Map<string, any>();
    const empByUserIdMap = new Map<string, any>();

    matchingEmps.forEach((e) => {
      if (e.email) {
        empByEmailMap.set(e.email.toLowerCase(), e);
      }
      if (e.userId) {
        empByUserIdMap.set(e.userId.toString(), e);
      }
      if (e.employeeId) {
        const orgKey = `${e.organizationId || 'unassigned'}_${e.employeeId}`;
        const existing = empByOrgAndEmpIdMap.get(orgKey);
        if (!existing) {
          empByOrgAndEmpIdMap.set(orgKey, e);
        } else {
          // Prioritize record with higher data completeness
          const existingScore = (existing.email ? 2 : 0) + (existing.department ? 1 : 0) + (existing.status ? 1 : 0);
          const newScore = (e.email ? 2 : 0) + (e.department ? 1 : 0) + (e.status ? 1 : 0);
          if (newScore > existingScore) {
            empByOrgAndEmpIdMap.set(orgKey, e);
          }
        }
      }
    });

    // Map each user record with organization details and active session count from user_sessions
    const formattedUsers = await Promise.all(
      userDocs.map(async (u) => {
        const uOrgId = u.organizationId || 'org-default';
        const orgInfo = orgMap.get(uOrgId) || {
          id: uOrgId,
          name: uOrgId.replace(/^org-?/, '').toUpperCase() + ' Org',
          code: uOrgId.toUpperCase().slice(0, 6),
        };

        const orgEmpKey = `${uOrgId}_${u.employeeId}`;
        const empDoc = (u.id && empByUserIdMap.get(u.id)) ||
          (u._id && empByUserIdMap.get(u._id.toString())) ||
          (u.email && empByEmailMap.get(u.email.toLowerCase())) ||
          (u.employeeId ? empByOrgAndEmpIdMap.get(orgEmpKey) : null) ||
          null;

        const sessionCount = await db.collection('user_sessions').countDocuments({
          $or: [{ userId: u.id }, { email: u.email }],
          expiresAt: { $gt: now },
          status: 'ACTIVE',
        });

        const isVerified = u.emailVerified === true || u.emailVerificationStatus === 'VERIFIED';
        const isLocked = u.status === 'LOCKED' || u.status === 'Locked' || u.status === 'Suspended';
        const isActive = u.status === 'ACTIVE' || u.status === 'Active';

        return {
          id: u._id.toString(),
          userId: u.id || u._id.toString(),
          employeeId: u.employeeId || empDoc?.employeeId || 'N/A',
          name: u.name || u.fullName || `${empDoc?.firstName || ''} ${empDoc?.lastName || ''}`.trim() || 'User Account',
          firstName: empDoc?.firstName || (u.name ? u.name.split(' ')[0] : ''),
          lastName: empDoc?.lastName || (u.name ? u.name.split(' ').slice(1).join(' ') : ''),
          email: u.email || 'N/A',
          phone: empDoc?.phone || u.phone || '',
          role: u.role || 'EMPLOYEE',
          department: empDoc?.department || u.department || 'General',
          designation: empDoc?.designation || u.designation || 'Staff',
          managerId: empDoc?.managerId || '',
          joiningDate: empDoc?.joiningDate || '',
          employmentType: empDoc?.employmentType || 'Full-time',
          organizationId: uOrgId,
          organizationName: orgInfo.name,
          organizationCode: orgInfo.code,
          status: isActive ? 'Active' : isLocked ? 'Locked' : 'Inactive',
          emailVerificationStatus: isVerified ? 'Verified' : 'Pending Verification',
          emailVerified: isVerified,
          isTwoFactorEnabled: !!u.isTwoFactorEnabled,
          activeSessionsCount: sessionCount,
          avatar: u.avatar || empDoc?.avatar || '',
          lastLogin: u.lastLogin || u.updatedAt || u.createdAt || 'Never',
          createdAt: u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : 'N/A',
        };
      })
    );

    // Fetch active managers/leads for reporting manager assignment dropdown
    const activeManagers = await db.collection('employees').find(
      {
        role: { $in: ['MANAGER', 'ADMIN', 'HR', 'SUPER_ADMIN'] },
        status: { $in: ['ACTIVE', 'Active'] },
      },
      {
        projection: {
          employeeId: 1,
          firstName: 1,
          lastName: 1,
          name: 1,
          email: 1,
          role: 1,
          department: 1,
          designation: 1,
          organizationId: 1,
        },
      }
    ).toArray();

    const managersList = activeManagers.map((m) => ({
      employeeId: m.employeeId,
      name: m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.employeeId,
      email: m.email || '',
      role: m.role || 'MANAGER',
      department: m.department || '',
      designation: m.designation || '',
      organizationId: m.organizationId || 'org-default',
    }));

    // Audit Log
    await logAuditEvent(req, 'USER_VIEWED', {
      details: { page, limit, totalFilteredCount, search, roleFilter, statusFilter },
    });

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalUsers,
          activeUsers,
          inactiveUsers,
          pendingVerify: pendingVerifyUsers,
          lockedAccounts,
          activeSessions,
        },
        organizations: organizationsList,
        managers: managersList,
        users: formattedUsers,
        pagination: {
          total: totalFilteredCount,
          page,
          limit,
          totalPages: Math.ceil(totalFilteredCount / limit) || 1,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching system users:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch system users' }, { status: 500 });
  }
}

// POST /api/v1/super-admin/users - Create system user and send account invitation (Super Admin Only)
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    const {
      firstName,
      lastName,
      email,
      role,
      phone,
      department,
      designation,
      managerId,
      organizationId,
      employeeId: inputEmpId,
      joiningDate,
      status: inputStatus,
      employmentType,
      location,
    } = body;

    // 1. Validate required fields
    if (!firstName || !firstName.trim() || !lastName || !lastName.trim() || !email || !email.trim()) {
      return NextResponse.json(
        { success: false, message: 'First name, last name, and email address are required.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json({ success: false, message: 'Please provide a valid email address.' }, { status: 400 });
    }

    // 2. Strict Role Validation: Support SUPER_ADMIN, ADMIN, HR, MANAGER, EMPLOYEE
    const requestedRole = (role || 'EMPLOYEE').trim().toUpperCase();
    const validRoles = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'];
    if (!validRoles.includes(requestedRole)) {
      return NextResponse.json(
        { success: false, message: `Invalid account role: "${role}". Permitted roles are: Super Admin, Admin, HR, Manager, Employee.` },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const now = new Date();

    // 3. Organization Validation & Tenant Isolation
    const rawOrgId = (organizationId && organizationId.trim())
      ? organizationId.trim()
      : (requestedRole === 'SUPER_ADMIN' ? 'org-default' : '');

    if (!rawOrgId) {
      return NextResponse.json({ success: false, message: 'Organization selection is required.' }, { status: 400 });
    }
    let orgQuery: any = {
      $or: [
        { organizationId: rawOrgId },
        { 'organization.code': rawOrgId },
      ],
    };
    if (ObjectId.isValid(rawOrgId)) {
      orgQuery.$or.push({ _id: new ObjectId(rawOrgId) });
    }

    const orgDoc = await db.collection('organization_settings').findOne(orgQuery);

    if (!orgDoc && rawOrgId !== 'org-default') {
      return NextResponse.json(
        { success: false, message: `Selected organization "${rawOrgId}" does not exist in the system.` },
        { status: 400 }
      );
    }

    if (orgDoc && (orgDoc.status === 'Inactive' || orgDoc.status === 'Disabled')) {
      return NextResponse.json(
        { success: false, message: `Selected organization "${orgDoc.organization?.name || orgDoc.name || rawOrgId}" is currently inactive.` },
        { status: 400 }
      );
    }

    const orgId = orgDoc?.organizationId || rawOrgId;
    const orgDisplayName = orgDoc?.organization?.name || orgDoc?.name || 'Infinitive Cloud Solutions';

    // 4. Duplicate Checks
    // Check email uniqueness across both users and employees collections
    const [existingUser, existingEmpByEmail] = await Promise.all([
      db.collection('users').findOne({ email: cleanEmail }),
      db.collection('employees').findOne({ email: cleanEmail }),
    ]);

    if (existingUser || existingEmpByEmail) {
      return NextResponse.json(
        { success: false, message: `An account or employee profile already exists for email "${cleanEmail}".` },
        { status: 409 }
      );
    }

    // Check or generate Employee ID
    let employeeId = inputEmpId?.trim()?.toUpperCase();
    if (!employeeId || employeeId.includes('AUTO') || employeeId === 'AUTO-GENERATING...') {
      if (requestedRole === 'SUPER_ADMIN') {
        employeeId = await generateNextSuperAdminId(db);
      } else {
        employeeId = await generateNextEmployeeId(db, orgId);
      }
    }

    const existingEmpById = await db.collection('employees').findOne({
      $or: [
        { organizationId: orgId, employeeId },
        { employeeId }
      ]
    }) || await db.collection('users').findOne({ employeeId });

    if (existingEmpById) {
      return NextResponse.json(
        { success: false, message: `Account/Employee ID "${employeeId}" already exists in the system.` },
        { status: 409 }
      );
    }

    // 5. Reporting Manager Validation (where applicable - Super Admins do not report to anyone)
    let validatedManagerId = '';
    if (requestedRole !== 'SUPER_ADMIN' && managerId && managerId.trim() && managerId.trim() !== 'none' && managerId.trim() !== 'None') {
      const cleanMgr = managerId.trim();
      if (cleanMgr.toUpperCase() === employeeId || cleanMgr.toLowerCase() === cleanEmail) {
        return NextResponse.json(
          { success: false, message: 'An employee cannot be assigned as their own reporting manager.' },
          { status: 400 }
        );
      }

      const mgrDoc = await db.collection('employees').findOne({
        organizationId: orgId,
        $or: [
          { employeeId: cleanMgr },
          { employeeId: cleanMgr.toUpperCase() },
          { id: cleanMgr },
          { email: cleanMgr.toLowerCase() },
        ],
      });

      if (!mgrDoc) {
        return NextResponse.json(
          {
            success: false,
            message: `The specified reporting manager "${cleanMgr}" was not found in the selected organization (${orgDisplayName}).`,
          },
          { status: 400 }
        );
      }

      validatedManagerId = mgrDoc.employeeId || cleanMgr;
    }

    // 6. Role-Based Account Creation: Create Employee Profile
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const defaultDesignation =
      designation?.trim() ||
      (requestedRole === 'SUPER_ADMIN'
        ? 'Platform Super Admin'
        : requestedRole === 'MANAGER'
        ? 'Team Lead / Manager'
        : requestedRole === 'HR'
        ? 'HR Specialist'
        : requestedRole === 'ADMIN'
        ? 'Organization Admin'
        : 'Software Engineer');

    const defaultDepartment =
      department?.trim() ||
      (requestedRole === 'SUPER_ADMIN'
        ? 'Executive Governance'
        : 'General');

    const employeeDoc = {
      id: `emp-${employeeId.toLowerCase()}`,
      userId: `usr-${employeeId.toLowerCase()}`,
      organizationId: orgId,
      employeeId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name: fullName,
      email: cleanEmail,
      phone: phone ? phone.trim() : '',
      department: defaultDepartment,
      designation: defaultDesignation,
      role: requestedRole,
      status: inputStatus || 'Active',
      employmentType: employmentType || 'Full-time',
      joiningDate: joiningDate || now.toISOString().split('T')[0],
      location: location?.trim() || 'Headquarters',
      managerId: validatedManagerId,
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80',
      emailVerified: false,
      emailVerificationStatus: 'PENDING_VERIFICATION',
      updatedAt: now,
    };

    await db.collection('employees').updateOne(
      { organizationId: orgId, employeeId },
      { $set: employeeDoc, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    // 7. Role-Based Account Creation: Create User Account in PENDING_VERIFICATION state
    const tempPass = `TempInv_${Date.now()}`;
    const { formatted, salt } = hashPassword(tempPass);
    const userDoc = {
      id: `usr-${employeeId.toLowerCase()}`,
      employeeId,
      name: fullName,
      email: cleanEmail,
      avatar: employeeDoc.avatar,
      role: requestedRole,
      organizationId: orgId,
      department: employeeDoc.department,
      designation: employeeDoc.designation,
      phone: employeeDoc.phone,
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

    // 8. Generate 6-digit OTP for invitation completion (Single-use, 24-hr TTL)
    const rawOtp = generateNumericOTP(6);
    const otpHash = hashToken(rawOtp);
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour invitation TTL

    await db.collection('auth_otp_tokens').deleteMany({
      email: cleanEmail,
      purpose: 'ACCOUNT_INVITATION',
    });

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

    // 9. Send invitation email via Gmail SMTP
    const emailResult = await sendOtpEmail({
      to: cleanEmail,
      otp: rawOtp,
      purpose: 'ACCOUNT_INVITATION',
      userName: fullName,
      organizationName: orgDisplayName,
      role: requestedRole,
    });

    // 10. Audit Logging
    await logAuditEvent(req, 'USER_CREATED', {
      employeeId,
      details: {
        actorId: auth.userId,
        actorRole: auth.role,
        organizationId: orgId,
        targetEmail: cleanEmail,
        role: requestedRole,
        emailDelivered: emailResult.success,
      },
    });

    await logAuditEvent(req, 'ACCOUNT_INVITATION_SENT', {
      employeeId,
      details: {
        actorId: auth.userId,
        actorRole: auth.role,
        organizationId: orgId,
        targetEmail: cleanEmail,
        role: requestedRole,
        emailDelivered: emailResult.success,
      },
    });

    if (!emailResult.success) {
      return NextResponse.json(
        {
          success: true,
          message: `Account created for ${cleanEmail}, but invitation email could not be delivered (${emailResult.error || 'SMTP delivery issue'}). The invitation remains pending and can be resent from the user table.`,
          data: {
            email: cleanEmail,
            employeeId,
            role: requestedRole,
            organizationId: orgId,
            organizationName: orgDisplayName,
            emailDelivered: false,
          },
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Account created and invitation sent successfully to ${cleanEmail}.`,
        data: {
          email: cleanEmail,
          employeeId,
          role: requestedRole,
          organizationId: orgId,
          organizationName: orgDisplayName,
          emailDelivered: true,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/super-admin/users:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create user account and issue invitation.' },
      { status: 500 }
    );
  }
}

