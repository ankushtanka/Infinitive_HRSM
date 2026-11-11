import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { generateNumericOTP, hashToken } from '@/lib/cryptoAuth';
import { sendOtpEmail } from '@/lib/email';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// GET /api/v1/super-admin/users/[id] - Get detailed single user profile & active sessions
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const userId = params.id;
    const { db } = await connectToDatabase();
    const now = new Date();

    let query: any = {};
    if (ObjectId.isValid(userId)) {
      query.$or = [{ _id: new ObjectId(userId) }, { id: userId }, { email: userId }];
    } else {
      query.$or = [{ id: userId }, { email: userId }];
    }

    // Explicitly exclude passwords, hashes, salts, and secrets
    const userDoc = await db.collection('users').findOne(query, {
      projection: { password: 0, passwordHash: 0, salt: 0, otp: 0, secret: 0 },
    });

    if (!userDoc) {
      return NextResponse.json({ success: false, message: 'User record not found' }, { status: 404 });
    }

    // Fetch matching employee record if available
    const empDoc = await db.collection('employees').findOne(
      { $or: [{ email: userDoc.email }, { employeeId: userDoc.employeeId }] },
      { projection: { password: 0 } }
    );

    // Fetch active session tokens from authoritative user_sessions collection
    const activeSessionsDocs = await db
      .collection('user_sessions')
      .find({
        $or: [{ userId: userDoc.id }, { email: userDoc.email }],
        expiresAt: { $gt: now },
        status: 'ACTIVE',
      })
      .toArray();

    // Map sessions securely without revealing token values
    const safeSessions = activeSessionsDocs.map((s) => ({
      id: s._id.toString(),
      type: 'ACTIVE_SESSION',
      createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : now.toISOString(),
      expiresAt: s.expiresAt ? new Date(s.expiresAt).toISOString() : now.toISOString(),
      ipAddress: s.ipAddress || '127.0.0.1',
      userAgent: s.userAgent || 'Web Browser',
      status: 'Active',
    }));

    // Fetch organization info
    const orgDoc = await db.collection('organization_settings').findOne({
      $or: [{ organizationId: userDoc.organizationId }, { 'organization.code': userDoc.organizationId }],
    });

    const orgDetails = orgDoc?.organization || {};

    const profileData = {
      id: userDoc._id.toString(),
      userId: userDoc.id || userDoc._id.toString(),
      employeeId: userDoc.employeeId || empDoc?.employeeId || 'N/A',
      name: userDoc.name || userDoc.fullName || `${empDoc?.firstName || ''} ${empDoc?.lastName || ''}`.trim() || 'User Account',
      firstName: empDoc?.firstName || (userDoc.name ? userDoc.name.split(' ')[0] : ''),
      lastName: empDoc?.lastName || (userDoc.name ? userDoc.name.split(' ').slice(1).join(' ') : ''),
      email: userDoc.email,
      phone: empDoc?.phone || userDoc.phone || '',
      role: userDoc.role || 'EMPLOYEE',
      department: empDoc?.department || userDoc.department || 'General',
      designation: empDoc?.designation || userDoc.designation || 'Staff',
      managerId: empDoc?.managerId || '',
      joiningDate: empDoc?.joiningDate || '',
      employmentType: empDoc?.employmentType || 'Full-time',
      organizationId: userDoc.organizationId || 'org-default',
      organizationName: orgDetails.name || orgDoc?.name || 'Infinitive Cloud Solutions',
      organizationCode: orgDetails.code || orgDoc?.code || 'ICS-HQ',
      status: userDoc.status || 'Active',
      emailVerificationStatus: userDoc.emailVerificationStatus || (userDoc.emailVerified ? 'VERIFIED' : 'PENDING'),
      emailVerified: !!userDoc.emailVerified || userDoc.emailVerificationStatus === 'VERIFIED',
      isTwoFactorEnabled: !!userDoc.isTwoFactorEnabled,
      avatar: userDoc.avatar || empDoc?.avatar || '',
      lastLogin: userDoc.lastLogin || userDoc.updatedAt || userDoc.createdAt || 'Never',
      createdAt: userDoc.createdAt || new Date().toISOString(),
      updatedAt: userDoc.updatedAt || new Date().toISOString(),
      activeSessionsCount: safeSessions.length,
      activeSessions: safeSessions,
    };

    return NextResponse.json({ success: true, data: profileData });
  } catch (error: any) {
    console.error('Error fetching user details:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch user profile' }, { status: 500 });
  }
}

// PATCH /api/v1/super-admin/users/[id] - Update User & Employee Details (Super Admin Full Control)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const userId = params.id;
    const body = await req.json();
    const {
      name,
      firstName,
      lastName,
      email,
      phone,
      department,
      designation,
      managerId,
      joiningDate,
      employmentType,
      role,
      status,
      organizationId,
    } = body;

    const { db } = await connectToDatabase();
    const now = new Date();

    let query: any = {};
    if (ObjectId.isValid(userId)) {
      query.$or = [{ _id: new ObjectId(userId) }, { id: userId }, { email: userId }];
    } else {
      query.$or = [{ id: userId }, { email: userId }];
    }

    const userDoc = await db.collection('users').findOne(query);

    if (!userDoc) {
      return NextResponse.json({ success: false, message: 'User record not found.' }, { status: 404 });
    }

    const currentRole = userDoc.role;
    const currentStatus = userDoc.status;
    const isTargetSuperAdmin = currentRole === 'SUPER_ADMIN';

    // 1. PREVENT LAST SUPER ADMIN LOCKOUT / DEMOTION
    const isDemotingSuperAdmin = isTargetSuperAdmin && role && role !== 'SUPER_ADMIN';
    const isDisablingSuperAdmin =
      isTargetSuperAdmin && status && ['INACTIVE', 'Inactive', 'Disabled', 'LOCKED', 'Locked', 'Suspended'].includes(status);

    if (isDemotingSuperAdmin || isDisablingSuperAdmin) {
      const activeSuperAdminCount = await db.collection('users').countDocuments({
        role: 'SUPER_ADMIN',
        status: { $in: ['ACTIVE', 'Active'] },
      });

      if (activeSuperAdminCount <= 1) {
        return NextResponse.json(
          {
            success: false,
            message: 'Cannot demote or disable this account because at least one active Super Admin must remain in the system.',
          },
          { status: 400 }
        );
      }
    }

    // 2. Prepare Updates
    const userUpdateFields: any = { updatedAt: now };
    const empUpdateFields: any = { updatedAt: now };
    let actionType = 'USER_UPDATED';

    // Role
    if (role !== undefined) {
      const validRoles = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'];
      const requestedRole = role.toUpperCase();
      if (!validRoles.includes(requestedRole)) {
        return NextResponse.json({ success: false, message: `Invalid account role: ${role}` }, { status: 400 });
      }
      userUpdateFields.role = requestedRole;
      empUpdateFields.role = requestedRole;
      actionType = 'USER_ROLE_CHANGED';
    }

    // Status
    if (status !== undefined) {
      const isDeactivating = ['INACTIVE', 'Inactive', 'Disabled', 'LOCKED', 'Locked', 'Suspended'].includes(status);
      const isActivating = ['ACTIVE', 'Active'].includes(status);

      if (isDeactivating) {
        const canonicalStatus = status.toLowerCase().includes('lock') || status.toLowerCase().includes('suspend') ? 'LOCKED' : 'INACTIVE';
        userUpdateFields.status = canonicalStatus;
        empUpdateFields.status = 'Inactive';
        actionType = canonicalStatus === 'LOCKED' ? 'USER_LOCKED' : 'USER_DEACTIVATED';

        // Revoke all active sessions immediately
        await db.collection('user_sessions').deleteMany({
          $or: [{ userId: userDoc.id }, { email: userDoc.email }],
        });
      } else if (isActivating) {
        userUpdateFields.status = 'ACTIVE';
        empUpdateFields.status = 'Active';
        actionType = 'USER_ACTIVATED';
      } else {
        userUpdateFields.status = status;
        empUpdateFields.status = status;
      }
    }

    // Name (First & Last)
    let finalFullName = '';
    if (name !== undefined && name.trim()) {
      finalFullName = name.trim();
      userUpdateFields.name = finalFullName;
      const parts = finalFullName.split(' ');
      empUpdateFields.firstName = parts[0] || '';
      empUpdateFields.lastName = parts.slice(1).join(' ') || '';
    } else if (firstName !== undefined || lastName !== undefined) {
      const fn = firstName !== undefined ? firstName.trim() : '';
      const ln = lastName !== undefined ? lastName.trim() : '';
      finalFullName = `${fn} ${ln}`.trim();
      if (finalFullName) userUpdateFields.name = finalFullName;
      if (firstName !== undefined) empUpdateFields.firstName = fn;
      if (lastName !== undefined) empUpdateFields.lastName = ln;
    }

    // Phone
    if (phone !== undefined) {
      userUpdateFields.phone = phone.trim();
      empUpdateFields.phone = phone.trim();
    }

    // Department & Designation
    if (department !== undefined) {
      userUpdateFields.department = department.trim();
      empUpdateFields.department = department.trim();
    }
    if (designation !== undefined) {
      userUpdateFields.designation = designation.trim();
      empUpdateFields.designation = designation.trim();
    }

    // Joining Date & Employment Type
    if (joiningDate !== undefined) {
      empUpdateFields.joiningDate = joiningDate.trim();
    }
    if (employmentType !== undefined) {
      empUpdateFields.employmentType = employmentType.trim();
    }

    // Manager validation
    if (managerId !== undefined) {
      const cleanMgr = managerId.trim();
      if (cleanMgr) {
        if (cleanMgr === userDoc.employeeId || cleanMgr === userDoc.email) {
          return NextResponse.json(
            { success: false, message: 'An employee cannot be assigned as their own reporting manager.' },
            { status: 400 }
          );
        }
        empUpdateFields.managerId = cleanMgr;
      } else {
        empUpdateFields.managerId = '';
      }
    }

    // Organization Assignment
    if (organizationId !== undefined && organizationId.trim()) {
      userUpdateFields.organizationId = organizationId.trim();
      empUpdateFields.organizationId = organizationId.trim();
    }

    // Email change with re-verification
    let emailChangeTriggered = false;
    if (email !== undefined && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      if (cleanEmail !== userDoc.email?.toLowerCase()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
          return NextResponse.json({ success: false, message: 'Please provide a valid email address.' }, { status: 400 });
        }

        // Check uniqueness in users and employees
        const [existingUser, existingEmp] = await Promise.all([
          db.collection('users').findOne({ _id: { $ne: userDoc._id }, email: cleanEmail }),
          db.collection('employees').findOne({ email: cleanEmail, employeeId: { $ne: userDoc.employeeId } }),
        ]);

        if (existingUser || existingEmp) {
          return NextResponse.json(
            { success: false, message: `The email address "${cleanEmail}" is already in use by another account.` },
            { status: 409 }
          );
        }

        userUpdateFields.email = cleanEmail;
        userUpdateFields.emailVerified = false;
        userUpdateFields.emailVerificationStatus = 'PENDING';
        empUpdateFields.email = cleanEmail;
        emailChangeTriggered = true;

        // Revoke active sessions for old email
        await db.collection('user_sessions').deleteMany({
          $or: [{ userId: userDoc.id }, { email: userDoc.email }],
        });

        // Generate verification OTP for new email
        const rawOtp = generateNumericOTP(6);
        const otpHash = hashToken(rawOtp);
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        await db.collection('auth_otp_tokens').deleteMany({ email: cleanEmail });
        await db.collection('auth_otp_tokens').insertOne({
          userId: userDoc.employeeId || userDoc.id,
          email: cleanEmail,
          organizationId: userUpdateFields.organizationId || userDoc.organizationId || 'org-default',
          otpHash,
          purpose: 'EMAIL_VERIFICATION',
          expiresAt,
          attempts: 0,
          createdAt: now,
        });

        // Send verification email
        await sendOtpEmail({
          to: cleanEmail,
          otp: rawOtp,
          purpose: 'EMAIL_VERIFICATION',
          userName: finalFullName || userDoc.name || 'User',
          organizationName: userDoc.organizationId || 'Infinitive Cloud',
        });
      }
    }

    // 3. Execute updates in MongoDB
    await db.collection('users').updateOne({ _id: userDoc._id }, { $set: userUpdateFields });

    // Sync to employees collection
    await db.collection('employees').updateMany(
      { $or: [{ email: userDoc.email }, { employeeId: userDoc.employeeId }] },
      { $set: empUpdateFields }
    );

    // 4. Log Audit Event
    await logAuditEvent(req, actionType, {
      details: {
        targetUserId: userDoc.id || userDoc._id.toString(),
        targetEmail: userUpdateFields.email || userDoc.email,
        oldRole: currentRole,
        newRole: userUpdateFields.role || currentRole,
        oldStatus: currentStatus,
        newStatus: userUpdateFields.status || currentStatus,
        emailChanged: emailChangeTriggered,
      },
    });

    return NextResponse.json({
      success: true,
      message: emailChangeTriggered
        ? 'User profile updated. Since email changed, re-verification email has been dispatched.'
        : 'User profile updated successfully.',
      data: {
        userId: userDoc.id || userDoc._id.toString(),
        ...userUpdateFields,
        ...empUpdateFields,
      },
    });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to update user profile' }, { status: 500 });
  }
}

// DELETE /api/v1/super-admin/users/[id] - Permanently Delete Eligible Account (Super Admin Safeguarded)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const userId = params.id;
    const force = req.nextUrl.searchParams.get('force') === 'true';
    const { db } = await connectToDatabase();

    let query: any = {};
    if (ObjectId.isValid(userId)) {
      query.$or = [{ _id: new ObjectId(userId) }, { id: userId }, { email: userId }];
    } else {
      query.$or = [{ id: userId }, { email: userId }];
    }

    const userDoc = await db.collection('users').findOne(query);

    if (!userDoc) {
      return NextResponse.json({ success: false, message: 'User record not found.' }, { status: 404 });
    }

    const targetEmail = (userDoc.email || '').trim().toLowerCase();
    const targetEmpId = (userDoc.employeeId || '').trim();

    // 1. SAFEGUARD: Protect Super Admin accounts & prevent accidental deletion of self or last Super Admin
    if (userDoc.role === 'SUPER_ADMIN') {
      const activeSuperAdminCount = await db.collection('users').countDocuments({
        role: 'SUPER_ADMIN',
        status: { $in: ['ACTIVE', 'Active'] },
      });

      if (activeSuperAdminCount <= 1) {
        return NextResponse.json(
          {
            success: false,
            message: 'Cannot delete the final active Super Admin account. At least one active Super Admin must remain in the system.',
          },
          { status: 400 }
        );
      }

      if (auth.userId === userDoc.id || auth.email?.toLowerCase() === targetEmail) {
        return NextResponse.json(
          {
            success: false,
            message: 'You cannot permanently delete your own active Super Admin account. Another Super Admin must perform this action.',
          },
          { status: 400 }
        );
      }
    }

    // 2. CHECK HISTORICAL DEPENDENCIES
    const empIdAliases = [targetEmpId, targetEmpId.toUpperCase(), targetEmpId.toLowerCase()].filter(Boolean);

    const [
      payrollCount,
      salaryAssignmentCount,
      attendanceCount,
      leaveCount,
      documentCount,
      performanceCount,
      hrRequestCount,
      offerLetterCount,
    ] = await Promise.all([
      db.collection('payroll_records').countDocuments({
        $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }],
      }),
      db.collection('salary_assignments').countDocuments({
        $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }],
      }),
      db.collection('attendance').countDocuments({
        $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }],
      }),
      db.collection('leaves').countDocuments({
        $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }],
      }),
      db.collection('documents').countDocuments({
        $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }],
      }),
      db.collection('performance_reviews').countDocuments({
        $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }],
      }),
      db.collection('hr_requests').countDocuments({
        $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }],
      }),
      db.collection('offer_letters').countDocuments({
        $or: [{ employeeId: { $in: empIdAliases } }, { candidateEmail: targetEmail }],
      }),
    ]);

    const financialCount = payrollCount + salaryAssignmentCount;
    const nonFinancialCount = attendanceCount + leaveCount + documentCount + performanceCount + hrRequestCount + offerLetterCount;
    const totalCount = financialCount + nonFinancialCount;

    // RULE: Financial compliance records must NEVER be cascade deleted automatically.
    if (financialCount > 0) {
      return NextResponse.json(
        {
          success: false,
          code: 'FINANCIAL_RECORDS_PRESERVED',
          message: 'Account cannot be deleted because historical payroll or compensation records must be preserved for financial compliance and statutory auditing. Please deactivate the account instead.',
          protectedRecords: {
            payrollCount,
            salaryAssignmentCount,
            attendanceCount,
            leaveCount,
            documentCount,
            performanceCount,
            hrRequestCount,
            offerLetterCount,
          },
        },
        { status: 409 }
      );
    }

    // RULE: If other historical records exist and force is not specified, block deletion.
    if (nonFinancialCount > 0 && !force) {
      return NextResponse.json(
        {
          success: false,
          code: 'USER_DELETE_BLOCKED',
          message: 'Account has associated records (attendance, leaves, documents, etc.). Deactivate the account instead, or confirm force delete for non-financial records.',
          protectedRecords: {
            attendanceCount,
            leaveCount,
            documentCount,
            performanceCount,
            hrRequestCount,
            offerLetterCount,
          },
        },
        { status: 409 }
      );
    }

    // 3. Clean up non-financial records if force delete confirmed
    if (nonFinancialCount > 0 && force) {
      await Promise.all([
        db.collection('attendance').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }] }),
        db.collection('leaves').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }] }),
        db.collection('documents').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }] }),
        db.collection('performance_reviews').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }] }),
        db.collection('hr_requests').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { email: targetEmail }] }),
        db.collection('offer_letters').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { candidateEmail: targetEmail }] }),
      ]);
    }

    // 4. Delete user, employee, sessions, tokens
    await db.collection('users').deleteOne({ _id: userDoc._id });

    if (targetEmail || targetEmpId) {
      await db.collection('employees').deleteMany({
        $or: [{ email: targetEmail }, { employeeId: { $in: empIdAliases } }],
      });

      await db.collection('user_sessions').deleteMany({
        $or: [{ userId: userDoc.id }, { email: targetEmail }],
      });

      await db.collection('auth_otp_tokens').deleteMany({ email: targetEmail });
      await db.collection('password_reset_tokens').deleteMany({ email: targetEmail });
    }

    // 5. Log permanent deletion audit event
    await logAuditEvent(req, 'USER_PERMANENTLY_DELETED', {
      details: {
        deletedUserId: userDoc.id || userDoc._id.toString(),
        deletedEmail: targetEmail,
        deletedEmployeeId: targetEmpId,
        deletedRole: userDoc.role,
        organizationId: userDoc.organizationId,
        force,
        nonFinancialRecordsCleared: nonFinancialCount,
        deletedBy: auth.email || auth.userId,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Account for "${userDoc.name || targetEmail}" has been permanently deleted.`,
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete user account.' }, { status: 500 });
  }
}
