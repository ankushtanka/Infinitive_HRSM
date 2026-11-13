import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';
import { calculateSalaryBreakdown } from '@/lib/salaryBreakdown';

export const dynamic = 'force-dynamic';

const ALLOWED_UPDATE_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'department',
  'designation',
  'location',
  'employmentType',
  'joiningDate',
  'salary',
  'avatar',
  'dateOfBirth',
  'gender',
  'bloodGroup',
  'address',
  'city',
  'state',
  'country',
  'emergencyContactName',
  'emergencyRelationship',
  'emergencyPhone',
  'emergencyAddress',
  'bankName',
  'accountNumber',
  'ifscCode',
  'accountHolder',
  'panNumber',
  'aadhaarNo',
  'passportNo',
  'shift',
  'grade',
  'manager',
  'managerId',
  'reportingTo',
];

const ALLOWED_STATUSES = [
  'Active',
  'Probation',
  'Intern',
  'On Leave',
  'Terminated',
  'Resigned',
  'Suspended',
  'Former Employee',
];

const ALLOWED_EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Intern',
  'Temporary',
];

async function updateEmployeeHandler(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const rawId = params.id;
    const targetId = decodeURIComponent(rawId).trim();
    const body = await req.json().catch(() => ({}));

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    // Tenant Isolation: strictly require authenticated organization scope for tenant operations
    const organizationScope: any = (auth.role === 'SUPER_ADMIN')
      ? {}
      : { organizationId: orgId || 'org-default' };

    let existing: any = null;
    if (ObjectId.isValid(targetId)) {
      // Unambiguous primary key lookup
      const idQuery: any = { _id: new ObjectId(targetId) };
      if (auth.role !== 'SUPER_ADMIN') {
        idQuery.organizationId = orgId || 'org-default';
      }
      existing = await db.collection('employees').findOne(idQuery);
    } else {
      // Lookup by employeeId within tenant scope
      const empQuery: any = {
        employeeId: { $in: [targetId, targetId.toUpperCase()] },
        ...organizationScope,
      };
      const matches = await db.collection('employees').find(empQuery).toArray();
      if (matches.length > 1) {
        return NextResponse.json(
          {
            success: false,
            code: 'AMBIGUOUS_EMPLOYEE_ID',
            message: `Multiple records found with employee ID "${targetId}". Please specify the unique record ID to update.`,
          },
          { status: 409 }
        );
      }
      existing = matches[0] || null;
    }

    if (!existing) {
      return NextResponse.json({ success: false, message: 'Employee not found.' }, { status: 404 });
    }

    const cleanOldEmail = String(existing.email || '').trim().toLowerCase();
    const cleanNewEmail = body.email !== undefined ? String(body.email).trim().toLowerCase() : cleanOldEmail;

    // Email Uniqueness & Validation
    if (body.email !== undefined && cleanNewEmail && cleanNewEmail !== cleanOldEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanNewEmail)) {
        return NextResponse.json(
          { success: false, message: 'Please provide a valid official email address.' },
          { status: 400 }
        );
      }

      const escapedEmail = cleanNewEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Check collision in employees collection
      const existingEmpWithEmail = await db.collection('employees').findOne({
        _id: { $ne: existing._id },
        email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
      });
      if (existingEmpWithEmail) {
        return NextResponse.json(
          {
            success: false,
            code: 'EMAIL_ALREADY_EXISTS',
            message: `Official email "${body.email}" is already in use by employee ${existingEmpWithEmail.employeeId} (${existingEmpWithEmail.firstName} ${existingEmpWithEmail.lastName}).`,
          },
          { status: 409 }
        );
      }

      // Check collision in users collection
      const existingUserWithEmail = await db.collection('users').findOne({
        email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
        employeeId: { $ne: existing.employeeId },
      });
      if (existingUserWithEmail) {
        return NextResponse.json(
          {
            success: false,
            code: 'EMAIL_ALREADY_EXISTS',
            message: `Official email "${body.email}" is already associated with another user account.`,
          },
          { status: 409 }
        );
      }
    }

    // Self-reporting manager validation
    const mgrVal = (body.manager || body.managerId || '').trim();
    if (mgrVal && (mgrVal === existing.employeeId || mgrVal.toLowerCase() === cleanOldEmail)) {
      return NextResponse.json(
        { success: false, message: 'An employee cannot be designated as their own reporting manager.' },
        { status: 400 }
      );
    }

    // Construct explicit update payload from allowlisted fields
    const updateDoc: Record<string, any> = {
      updatedAt: new Date(),
    };

    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (body[field] !== undefined) {
        updateDoc[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
      }
    }

    // Input Format Validations (Salary, PAN, Aadhaar, IFSC)
    if (body.salary !== undefined && body.salary !== null && body.salary !== '') {
      const numSalary = Number(body.salary);
      if (!Number.isFinite(numSalary) || numSalary < 0) {
        return NextResponse.json({ success: false, message: 'Salary must be a valid non-negative number.' }, { status: 400 });
      }
      updateDoc.salary = numSalary;
    }

if (
  body.panNumber !== undefined &&
  body.panNumber !== null &&
  String(body.panNumber).trim() !== '' &&
  String(body.panNumber).trim().toUpperCase() !== 'N/A'
) {      const cleanPan = String(body.panNumber).trim().toUpperCase();
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
        return NextResponse.json({ success: false, message: 'Invalid PAN number format (e.g. ABCDE1234F).' }, { status: 400 });
      }
      updateDoc.panNumber = cleanPan;
    }

    if (body.aadhaarNo !== undefined && body.aadhaarNo !== null && String(body.aadhaarNo).trim() !== '') {
      const cleanAadhaar = String(body.aadhaarNo).trim().replace(/[\s-]/g, '');
      if (!/^\d{12}$/.test(cleanAadhaar) && !/^[X\*\.]{8}\d{4}$/.test(cleanAadhaar)) {
        return NextResponse.json({ success: false, message: 'Invalid Aadhaar number (expected 12 digits).' }, { status: 400 });
      }
      updateDoc.aadhaarNo = cleanAadhaar;
    }

    if (body.ifscCode !== undefined && body.ifscCode !== null && String(body.ifscCode).trim() !== '') {
      const cleanIfsc = String(body.ifscCode).trim().toUpperCase();
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
        return NextResponse.json({ success: false, message: 'Invalid IFSC code format (e.g. HDFC0001234).' }, { status: 400 });
      }
      updateDoc.ifscCode = cleanIfsc;
    }

    // Employment Type Validation
    if (body.employmentType !== undefined && body.employmentType !== null && body.employmentType !== '') {
      if (!ALLOWED_EMPLOYMENT_TYPES.includes(body.employmentType)) {
        return NextResponse.json(
          {
            success: false,
            message: `Invalid employment type "${body.employmentType}". Allowed values: ${ALLOWED_EMPLOYMENT_TYPES.join(', ')}`,
          },
          { status: 400 }
        );
      }
      updateDoc.employmentType = body.employmentType;
    }

    // Status Validation
    if (body.status !== undefined && body.status !== null && body.status !== '') {
      if (!ALLOWED_STATUSES.includes(body.status)) {
        return NextResponse.json(
          {
            success: false,
            message: `Invalid status "${body.status}". Allowed values: ${ALLOWED_STATUSES.join(', ')}`,
          },
          { status: 400 }
        );
      }
      updateDoc.status = body.status;
    }

    // Role Escalation Protection
    if (body.role !== undefined && body.role !== null && String(body.role).trim() !== '') {
      const targetRole = String(body.role).trim().toUpperCase();
      const validRoles = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'];
      if (!validRoles.includes(targetRole)) {
        return NextResponse.json(
          { success: false, message: `Invalid role: "${body.role}". Allowed roles: ${validRoles.join(', ')}` },
          { status: 400 }
        );
      }
      if (targetRole === 'SUPER_ADMIN' && auth.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ success: false, message: 'Only a Super Admin can grant the SUPER_ADMIN role.' }, { status: 403 });
      }
      if (targetRole === 'ADMIN' && auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN') {
        return NextResponse.json({ success: false, message: 'Only an Administrator or Super Admin can grant the ADMIN role.' }, { status: 403 });
      }
      updateDoc.role = targetRole;
    }

    // Email change requires re-verification across both employees and users collections
    const userUpdateDoc: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (body.email !== undefined && cleanNewEmail && cleanNewEmail !== cleanOldEmail) {
      updateDoc.email = cleanNewEmail;
      updateDoc.emailVerified = false;
      updateDoc.emailVerificationStatus = 'PENDING_VERIFICATION';

      userUpdateDoc.email = cleanNewEmail;
      userUpdateDoc.emailVerified = false;
      userUpdateDoc.emailVerificationStatus = 'PENDING_VERIFICATION';
    }

    // Strictly protect immutable fields
    delete updateDoc._id;
    delete updateDoc.id;
    delete updateDoc.organizationId;
    delete updateDoc.employeeId;
    delete updateDoc.createdAt;
    delete updateDoc.password;
    delete updateDoc.passwordHash;
    delete updateDoc.salt;
    delete updateDoc.otp;

    // Update employee record in MongoDB
    await db.collection('employees').updateOne({ _id: existing._id }, { $set: updateDoc });

    // Synchronize associated record in users collection
    const targetOrgId = existing.organizationId || orgId || 'org-default';
    const userQuery: any = {
      $or: [
        { employeeId: existing.employeeId },
        { email: cleanOldEmail },
      ],
      // CRITICAL: Protect Super Admin accounts from being altered or deactivated by employee records
      role: { $nin: ['SUPER_ADMIN', 'Super Admin'] },
    };
    if (targetOrgId) {
      userQuery.organizationId = (targetOrgId === 'org-default')
        ? { $in: ['org-default', null, undefined] }
        : targetOrgId;
    }

    const newFirstName = updateDoc.firstName !== undefined ? updateDoc.firstName : existing.firstName;
    const newLastName = updateDoc.lastName !== undefined ? updateDoc.lastName : existing.lastName;
    if (newFirstName !== undefined || newLastName !== undefined) {
      userUpdateDoc.name = `${newFirstName || ''} ${newLastName || ''}`.trim();
    }

    if (updateDoc.department !== undefined) userUpdateDoc.department = updateDoc.department;
    if (updateDoc.designation !== undefined) userUpdateDoc.designation = updateDoc.designation;
    if (updateDoc.avatar !== undefined) userUpdateDoc.avatar = updateDoc.avatar;
    if (updateDoc.phone !== undefined) userUpdateDoc.phone = updateDoc.phone;
    if (updateDoc.role !== undefined) userUpdateDoc.role = updateDoc.role;

    if (updateDoc.status !== undefined) {
      if (['Terminated', 'Suspended', 'Resigned', 'Former Employee'].includes(updateDoc.status)) {
        userUpdateDoc.status = 'INACTIVE';
      } else if (['Active', 'Probation', 'Intern', 'On Leave'].includes(updateDoc.status)) {
        userUpdateDoc.status = 'ACTIVE';
      }
    }

    await db.collection('users').updateOne(userQuery, { $set: userUpdateDoc });

    // Synchronize salary assignment if salary amount was updated
    if (updateDoc.salary !== undefined && Number(updateDoc.salary) > 0) {
      const breakdown = calculateSalaryBreakdown(Number(updateDoc.salary));
      const now = new Date();
      await db.collection('salary_assignments').updateOne(
        {
          organizationId: targetOrgId,
          employeeId: existing.employeeId,
          status: 'Active',
        },
        {
          $set: {
            organizationId: targetOrgId,
            employeeId: existing.employeeId,
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

    // Audit Logging
    await logAuditEvent(req, 'UPDATE_EMPLOYEE', {
      employeeId: existing.employeeId,
      organizationId: targetOrgId,
      oldValue: existing,
      newValue: updateDoc,
    });

    const updated = await db.collection('employees').findOne(
      { _id: existing._id },
      { projection: { password: 0, passwordHash: 0, salt: 0, otp: 0 } }
    );

    return NextResponse.json({
      success: true,
      message: 'Employee updated successfully.',
      data: updated,
    });
  } catch (error: any) {
    console.error('Error updating employee:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to update employee' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return updateEmployeeHandler(req, { params });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return updateEmployeeHandler(req, { params });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const rawId = params.id;
    const targetId = decodeURIComponent(rawId).trim();
    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    const organizationScope: any = (auth.role === 'SUPER_ADMIN')
      ? {}
      : { organizationId: orgId || 'org-default' };

    let existing: any = null;
    if (ObjectId.isValid(targetId)) {
      // Unambiguous primary key lookup
      const idQuery: any = { _id: new ObjectId(targetId) };
      if (auth.role !== 'SUPER_ADMIN') {
        idQuery.organizationId = orgId || 'org-default';
      }
      existing = await db.collection('employees').findOne(idQuery);
    } else {
      // Lookup by employeeId within tenant scope
      const empQuery: any = {
        employeeId: { $in: [targetId, targetId.toUpperCase()] },
        ...organizationScope,
      };
      const matches = await db.collection('employees').find(empQuery).toArray();
      if (matches.length > 1) {
        return NextResponse.json(
          {
            success: false,
            code: 'AMBIGUOUS_EMPLOYEE_ID',
            message: `Multiple records found with employee ID "${targetId}". Please specify the unique record ID to delete.`,
          },
          { status: 409 }
        );
      }
      existing = matches[0] || null;
    }

    if (!existing) {
      return NextResponse.json({ success: false, message: 'Employee was not found. Refresh the page and try again.' }, { status: 404 });
    }

    const canonicalEmpId = existing.employeeId || targetId;
    const mongoIdStr = existing._id.toString();
    const internalId = existing.id;
    const cleanEmail = (existing.email || '').trim().toLowerCase();
    const targetOrgId = existing.organizationId || orgId;

    const empIdAliases = Array.from(new Set([
      canonicalEmpId,
      mongoIdStr,
      internalId,
    ].filter(Boolean)));

    // Diagnostic logging in development environment
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DELETE /api/v1/employees/${targetId}] AuthRole: ${auth.role}, OrgId: ${targetOrgId}, TargetId: ${canonicalEmpId}`);
    }

    // Inspect protected historical HR records and currently assigned hardware assets
    const [
      payrollCount,
      attendanceCount,
      leaveCount,
      salaryAssignmentCount,
      documentCount,
      performanceCount,
      hrRequestCount,
      offerLetterCount,
      assignedAssetsCount,
    ] = await Promise.all([
      db.collection('payroll_records').countDocuments({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
      db.collection('attendance').countDocuments({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
      db.collection('leaves').countDocuments({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
      db.collection('salary_assignments').countDocuments({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
      db.collection('documents').countDocuments({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
      db.collection('performance_reviews').countDocuments({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
      db.collection('hr_requests').countDocuments({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
      db.collection('offer_letters').countDocuments({ organizationId: targetOrgId, $or: [{ employeeId: { $in: empIdAliases } }, { candidateEmail: cleanEmail }] }),
      db.collection('assets').countDocuments({ organizationId: targetOrgId, 'assignedTo.employeeId': { $in: empIdAliases }, isArchived: { $ne: true } }),
    ]);

    const totalProtectedCount = payrollCount + attendanceCount + leaveCount + salaryAssignmentCount + documentCount + performanceCount + hrRequestCount + offerLetterCount + assignedAssetsCount;
    const force = req.nextUrl.searchParams.get('force') === 'true';

    if (totalProtectedCount > 0 && !force) {
      const assetWarning = assignedAssetsCount > 0
        ? ` There are ${assignedAssetsCount} active hardware asset(s) currently assigned to this employee. Please return or reassign these assets first.`
        : '';
      return NextResponse.json(
        {
          success: false,
          code: 'EMPLOYEE_DELETE_BLOCKED',
          message: `Employee cannot be deleted because historical HR records or assigned assets exist.${assetWarning} Deactivate the employee instead, or confirm force delete to remove all associated records.`,
          protectedRecords: {
            payrollCount,
            attendanceCount,
            leaveCount,
            salaryAssignmentCount,
            documentCount,
            performanceCount,
            hrRequestCount,
            offerLetterCount,
            assignedAssetsCount,
          },
        },
        { status: 409 }
      );
    }

    if (totalProtectedCount > 0 && force) {
      if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN') {
        return NextResponse.json(
          { success: false, message: 'Only an Administrator or Super Admin can force delete an employee with historical records.' },
          { status: 403 }
        );
      }

      // Cascade delete historical HR records for this employee
      await Promise.all([
        db.collection('payroll_records').deleteMany({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
        db.collection('attendance').deleteMany({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
        db.collection('leaves').deleteMany({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
        db.collection('salary_assignments').deleteMany({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
        db.collection('documents').deleteMany({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
        db.collection('performance_reviews').deleteMany({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
        db.collection('hr_requests').deleteMany({ organizationId: targetOrgId, employeeId: { $in: empIdAliases } }),
        db.collection('offer_letters').deleteMany({ organizationId: targetOrgId, $or: [{ employeeId: { $in: empIdAliases } }, { candidateEmail: cleanEmail }] }),
      ]);

      // Safely release assigned assets and archive assignment history without deleting audit history
      if (assignedAssetsCount > 0) {
        const now = new Date();
        await db.collection('asset_assignments').updateMany(
          {
            organizationId: targetOrgId,
            employeeId: { $in: empIdAliases },
            status: 'ACTIVE',
          },
          {
            $set: {
              status: 'RETURNED',
              returnedAt: now,
              returnedBy: auth.userId,
              returnedByName: auth.name || 'System Admin',
              conditionAtReturn: 'GOOD',
              returnNotes: 'Automatically unassigned and closed during administrative employee force-deletion.',
              updatedAt: now,
            },
          }
        );

        await db.collection('assets').updateMany(
          {
            organizationId: targetOrgId,
            'assignedTo.employeeId': { $in: empIdAliases },
          },
          {
            $set: {
              status: 'AVAILABLE',
              assignedTo: null,
              updatedAt: now,
            },
          }
        );
      }
    }

    // Permanent Safe Deletion
    await db.collection('employees').deleteOne({ _id: existing._id });

    // Clean up linked user account if uniquely linked
    if (cleanEmail || canonicalEmpId) {
      const userOrConditions: any[] = [];
      if (canonicalEmpId) userOrConditions.push({ employeeId: canonicalEmpId });
      if (cleanEmail) userOrConditions.push({ email: cleanEmail });

      if (userOrConditions.length > 0) {
        await db.collection('users').deleteMany({
          organizationId: targetOrgId,
          role: { $nin: ['SUPER_ADMIN', 'Super Admin'] },
          $or: userOrConditions,
        });
        const isSuperAdminEmail = await db.collection('users').findOne({
          email: cleanEmail,
          role: { $in: ['SUPER_ADMIN', 'Super Admin'] },
        });
        if (!isSuperAdminEmail) {
          await db.collection('auth_otp_tokens').deleteMany({ email: cleanEmail });
        }
      }
    }

    // Audit Logging
    await logAuditEvent(req, force ? 'EMPLOYEE_FORCE_DELETED' : 'EMPLOYEE_DELETED', {
      employeeId: canonicalEmpId,
      details: {
        employeeId: canonicalEmpId,
        name: `${existing.firstName || ''} ${existing.lastName || ''}`.trim(),
        department: existing.department || '',
        designation: existing.designation || '',
        organizationId: targetOrgId,
        deletedBy: auth.email || auth.userId,
        force,
        clearedRecordsCount: totalProtectedCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Employee deleted successfully.',
    });
  } catch (error: any) {
    console.error(`Error in DELETE /api/v1/employees/${params.id}:`, error);
    return NextResponse.json({ success: false, message: 'Unable to delete employee. Please try again.' }, { status: 500 });
  }
}
