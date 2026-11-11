import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { generateNumericOTP, hashToken, hashPassword } from '@/lib/cryptoAuth';
import { sendOtpEmail } from '@/lib/email';
import { generateNextEmployeeId } from '@/lib/employeeId';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

function formatRoleTitle(role?: string): string {
  if (!role) return 'Role Not Assigned';
  const cleanRole = role.toUpperCase();
  switch (cleanRole) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'ADMIN':
      return 'Admin';
    case 'HR':
      return 'HR';
    case 'MANAGER':
      return 'Manager';
    case 'EMPLOYEE':
      return 'Employee';
    default:
      return role;
  }
}

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
    const orgFilter = searchParams.get('organizationId')?.trim() || 'All';
    const deptFilter = searchParams.get('department')?.trim() || 'All';
    const desigFilter = searchParams.get('designation')?.trim() || 'All';
    const roleFilter = searchParams.get('role')?.trim() || 'All';
    const statusFilter = searchParams.get('status')?.trim() || 'All';
    const empTypeFilter = searchParams.get('employmentType')?.trim() || 'All';
    const exportFormat = searchParams.get('export')?.trim() || '';

    // 1. Fetch All Organizations and build orgMap
    const orgDocs = await db.collection('organization_settings').find({}).toArray();
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

    // 2. Fetch All Users to build maps for canonical user role linkage
    const allUsers = await db.collection('users').find({}, {
      projection: { password: 0, passwordHash: 0, salt: 0, otp: 0 }
    }).toArray();

    const userByEmailMap = new Map<string, any>();
    const userByOrgAndEmpIdMap = new Map<string, any>();
    const userByUserIdMap = new Map<string, any>();

    allUsers.forEach((u) => {
      if (u.email) userByEmailMap.set(u.email.toLowerCase(), u);
      if (u.employeeId) {
        const orgKey = `${u.organizationId || 'org-default'}_${u.employeeId}`;
        userByOrgAndEmpIdMap.set(orgKey, u);
      }
      if (u.id) userByUserIdMap.set(u.id, u);
      if (u._id) userByUserIdMap.set(u._id.toString(), u);
    });

    // 3. Fetch All Employees to compute global KPIs & Health metrics
    const allEmployees = await db.collection('employees').find({}).toArray();

    // Distinct metadata for filters
    const distinctDeptsSet = new Set<string>();
    const distinctDesigsSet = new Set<string>();
    allEmployees.forEach((e) => {
      if (e.department && e.department !== 'Unassigned') distinctDeptsSet.add(e.department);
      if (e.designation && e.designation !== 'Unassigned') distinctDesigsSet.add(e.designation);
    });

    // Also include departments and designations from collection documents if available
    const deptDocs = await db.collection('departments').find({}).toArray();
    deptDocs.forEach((d) => {
      if (d.name) distinctDeptsSet.add(d.name);
    });
    const desigDocs = await db.collection('designations').find({}).toArray();
    desigDocs.forEach((d) => {
      if (d.title || d.name) distinctDesigsSet.add(d.title || d.name);
    });

    const departmentsList = Array.from(distinctDeptsSet).sort();
    const designationsList = Array.from(distinctDesigsSet).sort();

    // 4. Calculate KPI Statistics
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let activeCount = 0;
    let inactiveCount = 0;
    let newCount = 0;

    allEmployees.forEach((emp) => {
      const isAct = emp.status === 'Active' || emp.status === 'ACTIVE';
      if (isAct) {
        activeCount++;
      } else {
        inactiveCount++;
      }

      const joinDate = emp.joiningDate ? new Date(emp.joiningDate) : emp.createdAt ? new Date(emp.createdAt) : null;
      if (joinDate && joinDate >= thirtyDaysAgo) {
        newCount++;
      }
    });

    const totalEmployees = allEmployees.length;

    // 5. Compute Data Quality / Directory Health Metrics
    let employeesWithoutOrg = 0;
    let employeesWithoutDept = 0;
    let employeesWithoutDesig = 0;
    let employeesWithoutUserAccount = 0;
    let roleMappingIssuesCount = 0;

    allEmployees.forEach((emp) => {
      if (!emp.organizationId) employeesWithoutOrg++;
      if (!emp.department || emp.department === 'Unassigned') employeesWithoutDept++;
      if (!emp.designation || emp.designation === 'Unassigned') employeesWithoutDesig++;

      // User account matching check: requires matching organizationId or valid userId/email
      const orgEmpKey = emp.organizationId ? `${emp.organizationId}_${emp.employeeId}` : null;
      const user = (emp.userId && userByUserIdMap.get(emp.userId)) ||
        (emp.email && userByEmailMap.get(emp.email.toLowerCase())) ||
        (orgEmpKey ? userByOrgAndEmpIdMap.get(orgEmpKey) : null) || null;

      if (!user) {
        employeesWithoutUserAccount++;
        roleMappingIssuesCount++;
      } else {
        // Check for role mismatch
        const systemRole = user.role;
        if (!systemRole) {
          roleMappingIssuesCount++;
        } else if (emp.role && emp.role.toUpperCase() !== systemRole.toUpperCase()) {
          roleMappingIssuesCount++;
        }
      }
    });

    // Users without Employee Profile
    const empEmailSet = new Set(allEmployees.map(e => e.email?.toLowerCase()).filter(Boolean));
    const empIdSet = new Set(allEmployees.map(e => e.employeeId).filter(Boolean));
    let usersWithoutEmployeeProfile = 0;
    allUsers.forEach((u) => {
      const hasEmp = (u.email && empEmailSet.has(u.email.toLowerCase())) || (u.employeeId && empIdSet.has(u.employeeId));
      if (!hasEmp) usersWithoutEmployeeProfile++;
    });

    // 6. Build Filter Query for Paginated Output
    let query: any = {};

    if (orgFilter !== 'All') {
      query.organizationId = orgFilter;
    }
    if (deptFilter !== 'All') {
      query.department = deptFilter;
    }
    if (desigFilter !== 'All') {
      query.designation = desigFilter;
    }
    if (statusFilter !== 'All') {
      if (statusFilter === 'Active') {
        query.status = { $in: ['Active', 'ACTIVE'] };
      } else if (statusFilter === 'Inactive') {
        query.status = { $in: ['Inactive', 'INACTIVE', 'Terminated', 'Disabled'] };
      } else {
        query.status = statusFilter;
      }
    }
    if (empTypeFilter !== 'All') {
      query.employmentType = empTypeFilter;
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { employeeId: regex },
        { email: regex },
        { phone: regex },
        { department: regex },
        { designation: regex },
        { organizationId: regex },
      ];
    }

    // Execute query for matching employees
    let filteredEmpDocs = await db.collection('employees').find(query).sort({ createdAt: -1, _id: -1 }).toArray();

    // Map and enrich each employee document with User Role and Org Info
    let formattedEmployees = filteredEmpDocs.map((emp) => {
      // Canonical User linkage: strict matching requiring matching organizationId or valid userId/email
      const orgEmpKey = emp.organizationId ? `${emp.organizationId}_${emp.employeeId}` : null;
      const user = (emp.userId && userByUserIdMap.get(emp.userId)) ||
        (emp.email && userByEmailMap.get(emp.email.toLowerCase())) ||
        (orgEmpKey ? userByOrgAndEmpIdMap.get(orgEmpKey) : null) || null;

      // CRITICAL DATA CORRECTION: Derive System Role strictly from users.role
      const systemRoleKey = user?.role || null;
      const systemRoleTitle = formatRoleTitle(user?.role);

      // Identity Mapping Issue check
      let hasIdentityMappingIssue = false;
      let mappingIssueReason = '';

      if (!user) {
        hasIdentityMappingIssue = true;
        mappingIssueReason = 'No user authentication account found';
      } else if (!user.role) {
        hasIdentityMappingIssue = true;
        mappingIssueReason = 'User account has no role assigned';
      } else if (emp.role && emp.role.toUpperCase() !== user.role.toUpperCase()) {
        hasIdentityMappingIssue = true;
        mappingIssueReason = `Role Mismatch: User (${user.role}) vs Profile (${emp.role})`;
      }

      if (!emp.organizationId) {
        hasIdentityMappingIssue = true;
        mappingIssueReason = mappingIssueReason
          ? `${mappingIssueReason}; Unassigned organization / Legacy record`
          : 'Unassigned organization / Legacy record';
      }

      const orgId = emp.organizationId || 'Unassigned';
      const isUnassignedOrg = !emp.organizationId;
      const orgInfo = !isUnassignedOrg
        ? (orgMap.get(orgId) || {
            id: orgId,
            name: orgId.replace(/^org-?/, '').toUpperCase() + ' Org',
            code: orgId.toUpperCase().slice(0, 6),
          })
        : {
            id: 'unassigned',
            name: 'Unassigned (Legacy / Missing Org)',
            code: 'UNASSIGNED',
          };

      const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Employee Profile';

      return {
        id: emp._id.toString(),
        employeeId: emp.employeeId || 'EMP-000',
        firstName: emp.firstName || '',
        lastName: emp.lastName || '',
        fullName,
        email: emp.email || 'N/A',
        phone: emp.phone || 'N/A',
        department: emp.department || 'Unassigned',
        designation: emp.designation || 'Unassigned',

        // Canonical System Role from users.role
        systemRole: systemRoleKey,
        systemRoleTitle,
        hasIdentityMappingIssue,
        mappingIssueReason,

        status: emp.status || 'Active',
        employmentType: emp.employmentType || 'Full Time',
        joiningDate: emp.joiningDate ? new Date(emp.joiningDate).toISOString().split('T')[0] : 'N/A',
        location: emp.location || 'Headquarters',
        managerId: emp.managerId || '',

        // Organization Info
        organizationId: orgId,
        organizationName: orgInfo.name,
        organizationCode: orgInfo.code,

        // User Account Link
        userId: user?.id || user?._id?.toString() || null,
        userStatus: user?.status || 'NO_ACCOUNT',
        userLastLogin: user?.lastLogin || user?.updatedAt || 'Never',

        // Avatar & Dates
        avatar: emp.avatar || user?.avatar || '',
        createdAt: emp.createdAt ? new Date(emp.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: emp.updatedAt ? new Date(emp.updatedAt).toISOString() : new Date().toISOString(),
      };
    });

    // Apply role filter on the mapped systemRole if roleFilter is active
    if (roleFilter !== 'All') {
      formattedEmployees = formattedEmployees.filter((e) => {
        if (roleFilter === 'UNASSIGNED') {
          return !e.systemRole;
        }
        return e.systemRole?.toUpperCase() === roleFilter.toUpperCase();
      });
    }

    // Total filtered count after role filtering
    const totalFilteredCount = formattedEmployees.length;

    // Support CSV Export
    if (exportFormat === 'csv') {
      await logAuditEvent(req, 'EMPLOYEE_EXPORT_REQUESTED', {
        details: { totalExported: totalFilteredCount, search, orgFilter, deptFilter, roleFilter },
      });

      const csvHeaders = ['Employee ID', 'Full Name', 'Email', 'Organization Name', 'Organization Code', 'Department', 'Designation', 'System Role', 'Status', 'Employment Type', 'Joining Date'];
      const csvRows = formattedEmployees.map(e => [
        `"${e.employeeId}"`,
        `"${e.fullName}"`,
        `"${e.email}"`,
        `"${e.organizationName}"`,
        `"${e.organizationCode}"`,
        `"${e.department}"`,
        `"${e.designation}"`,
        `"${e.systemRoleTitle}"`,
        `"${e.status}"`,
        `"${e.employmentType}"`,
        `"${e.joiningDate}"`,
      ].join(','));

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="global_workforce_directory_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Apply server-side pagination slicing
    const paginatedEmployees = formattedEmployees.slice((page - 1) * limit, page * limit);

    // Audit Log view event
    await logAuditEvent(req, 'EMPLOYEE_VIEWED', {
      details: { page, limit, totalFilteredCount, search, orgFilter, deptFilter, roleFilter },
    });

    return NextResponse.json({
      success: true,
      data: {
        kpi: {
          totalEmployees,
          activeEmployees: activeCount,
          inactiveEmployees: inactiveCount,
          newEmployees: newCount,
          totalDepartments: departmentsList.length,
          totalOrganizations: organizationsList.length,
        },
        directoryHealth: {
          employeesWithoutOrg,
          employeesWithoutDept,
          employeesWithoutDesig,
          employeesWithoutUserAccount,
          usersWithoutEmployeeProfile,
          roleMappingIssues: roleMappingIssuesCount,
          isHealthy: roleMappingIssuesCount === 0 && employeesWithoutUserAccount === 0 && usersWithoutEmployeeProfile === 0,
        },
        filters: {
          organizations: organizationsList,
          departments: departmentsList,
          designations: designationsList,
          roles: ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'UNASSIGNED'],
          statuses: ['Active', 'Inactive', 'Pending', 'Suspended'],
          employmentTypes: ['Full Time', 'Part Time', 'Contract', 'Intern'],
        },
        employees: paginatedEmployees,
        pagination: {
          total: totalFilteredCount,
          page,
          limit,
          totalPages: Math.ceil(totalFilteredCount / limit) || 1,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching global workforce directory:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch global workforce directory' }, { status: 500 });
  }
}

// PATCH /api/v1/super-admin/employees - Update employee profile (safe fields only)
export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    const { id, firstName, lastName, email, phone, department, designation, organizationId, joiningDate, location, employmentType, status, managerId } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: 'Employee document ID is required.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const empObjId = new ObjectId(id);
    const existingEmp = await db.collection('employees').findOne({ _id: empObjId });

    if (!existingEmp) {
      return NextResponse.json({ success: false, message: 'Employee record not found.' }, { status: 404 });
    }

    const updateFields: any = {
      updatedAt: new Date(),
    };

    if (firstName !== undefined) updateFields.firstName = firstName.trim();
    if (lastName !== undefined) updateFields.lastName = lastName.trim();
    if (email !== undefined) updateFields.email = email.trim().toLowerCase();
    if (phone !== undefined) updateFields.phone = phone.trim();
    if (department !== undefined) updateFields.department = department.trim();
    if (designation !== undefined) updateFields.designation = designation.trim();
    if (organizationId !== undefined) updateFields.organizationId = organizationId.trim();
    if (joiningDate !== undefined) updateFields.joiningDate = joiningDate.trim();
    if (location !== undefined) updateFields.location = location.trim();
    if (employmentType !== undefined) updateFields.employmentType = employmentType.trim();
    if (status !== undefined) updateFields.status = status.trim();
    if (managerId !== undefined) updateFields.managerId = managerId.trim();

    await db.collection('employees').updateOne({ _id: empObjId }, { $set: updateFields });

    // Also update associated user document (name, department, designation, status, role) if user exists
    const userEmail = existingEmp.email?.toLowerCase();
    if (userEmail) {
      const userUpdateFields: any = { updatedAt: new Date() };
      if (firstName || lastName) {
        const fn = firstName || existingEmp.firstName || '';
        const ln = lastName || existingEmp.lastName || '';
        userUpdateFields.name = `${fn} ${ln}`.trim();
      }
      if (department) userUpdateFields.department = department;
      if (designation) userUpdateFields.designation = designation;
      if (body.role) userUpdateFields.role = body.role.toUpperCase();
      if (status) {
        const isDeactivated = ['Inactive', 'INACTIVE', 'Disabled', 'Terminated', 'Suspended'].includes(status);
        userUpdateFields.status = isDeactivated ? 'INACTIVE' : 'ACTIVE';
        if (isDeactivated) {
          await db.collection('user_sessions').deleteMany({
            $or: [{ email: userEmail }, { employeeId: existingEmp.employeeId }],
          });
        }
      }
      await db.collection('users').updateOne({ email: userEmail }, { $set: userUpdateFields });
    }

    await logAuditEvent(req, 'EMPLOYEE_UPDATED', {
      employeeId: existingEmp.employeeId,
      oldValue: {
        firstName: existingEmp.firstName,
        lastName: existingEmp.lastName,
        department: existingEmp.department,
        designation: existingEmp.designation,
        status: existingEmp.status,
      },
      newValue: updateFields,
    });

    const updatedEmp = await db.collection('employees').findOne({ _id: empObjId });

    return NextResponse.json({
      success: true,
      message: 'Employee profile updated successfully.',
      data: updatedEmp,
    });
  } catch (error: any) {
    console.error('Error updating employee profile:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to update employee profile' }, { status: 500 });
  }
}

// POST /api/v1/super-admin/employees - Create employee profile and user account (Super Admin Only)
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
      phone,
      department,
      designation,
      role = 'EMPLOYEE',
      organizationId,
      joiningDate,
      location = 'Headquarters',
      employmentType = 'Full Time',
      status = 'Active',
      managerId,
      employeeId: inputEmpId,
    } = body;

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { success: false, message: 'First name, last name, and email address are required.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const requestedRole = (role || 'EMPLOYEE').toUpperCase();
    const validRoles = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'];

    if (!validRoles.includes(requestedRole)) {
      return NextResponse.json({ success: false, message: `Invalid account role: ${role}` }, { status: 400 });
    }

    const orgId = organizationId?.trim() || auth.organizationId || 'org-default';
    const { db } = await connectToDatabase();
    const now = new Date();

    // 1. Check duplicate email in users or employees
    const [existingUser, existingEmp] = await Promise.all([
      db.collection('users').findOne({ email: cleanEmail }),
      db.collection('employees').findOne({ email: cleanEmail }),
    ]);

    if (existingUser || existingEmp) {
      return NextResponse.json(
        { success: false, message: `An account or employee profile already exists for email "${cleanEmail}".` },
        { status: 409 }
      );
    }

    // 2. Generate or validate Employee ID
    let employeeId = inputEmpId?.trim();
    if (!employeeId || employeeId.toLowerCase().includes('auto') || employeeId === 'Auto-generated') {
      employeeId = await generateNextEmployeeId(db, orgId);
    }

    const existingEmpId =
      (await db.collection('employees').findOne({ organizationId: orgId, employeeId })) ||
      (await db.collection('users').findOne({ employeeId }));

    if (existingEmpId) {
      return NextResponse.json({ success: false, message: `Employee ID "${employeeId}" already exists.` }, { status: 409 });
    }

    // 3. Validate Manager
    let validatedManagerId = '';
    if (managerId && managerId.trim()) {
      const cleanMgr = managerId.trim();
      if (cleanMgr === employeeId || cleanMgr === cleanEmail) {
        return NextResponse.json(
          { success: false, message: 'An employee cannot be assigned as their own reporting manager.' },
          { status: 400 }
        );
      }
      const mgr = await db.collection('employees').findOne({
        organizationId: orgId,
        $or: [{ employeeId: cleanMgr }, { id: cleanMgr }, { email: cleanMgr.toLowerCase() }],
      });
      if (mgr) {
        validatedManagerId = mgr.employeeId || cleanMgr;
      }
    }

    // 4. Create Employee Record
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
      status: status || 'Active',
      employmentType: employmentType || 'Full Time',
      joiningDate: joiningDate || now.toISOString().split('T')[0],
      location: location || 'Headquarters',
      managerId: validatedManagerId,
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80',
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('employees').updateOne(
      { organizationId: orgId, employeeId },
      { $set: employeeDoc, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    // 5. Create linked user record in PENDING_VERIFICATION state
    const tempPass = `TempInv_${Date.now()}`;
    const { formatted, salt } = hashPassword(tempPass);
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
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('users').updateOne(
      { email: cleanEmail },
      { $set: userDoc, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    // 6. Generate 6-digit OTP for invitation completion
    const rawOtp = generateNumericOTP(6);
    const otpHash = hashToken(rawOtp);
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await db.collection('auth_otp_tokens').deleteMany({ email: cleanEmail });
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

    // 7. Send invitation email
    const emailResult = await sendOtpEmail({
      to: cleanEmail,
      otp: rawOtp,
      purpose: 'ACCOUNT_INVITATION',
      userName: `${firstName.trim()} ${lastName.trim()}`,
      organizationName: orgId,
      role: requestedRole,
    });

    // 8. Log audit event
    await logAuditEvent(req, 'EMPLOYEE_CREATED', {
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

    return NextResponse.json({
      success: true,
      message: `Employee profile created and invitation dispatched to ${cleanEmail}.`,
      data: {
        employeeId,
        email: cleanEmail,
        role: requestedRole,
        organizationId: orgId,
        emailDelivered: emailResult.success,
      },
    });
  } catch (error: any) {
    console.error('Error creating employee in Super Admin:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to create employee profile.' }, { status: 500 });
  }
}

// DELETE /api/v1/super-admin/employees - Delete employee profile (Super Admin Only with safeguards)
export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const employeeIdOrDocId = searchParams.get('id') || body.id;
    const force = searchParams.get('force') === 'true' || body.force === true;

    if (!employeeIdOrDocId) {
      return NextResponse.json({ success: false, message: 'Employee ID is required.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    let query: any = {};
    if (ObjectId.isValid(employeeIdOrDocId)) {
      query.$or = [{ _id: new ObjectId(employeeIdOrDocId) }, { employeeId: employeeIdOrDocId }, { id: employeeIdOrDocId }];
    } else {
      query.$or = [{ employeeId: employeeIdOrDocId }, { id: employeeIdOrDocId }, { email: employeeIdOrDocId.toLowerCase() }];
    }

    const empDoc = await db.collection('employees').findOne(query);

    if (!empDoc) {
      return NextResponse.json({ success: false, message: 'Employee record not found.' }, { status: 404 });
    }

    const canonicalEmpId = empDoc.employeeId;
    const cleanEmail = (empDoc.email || '').trim().toLowerCase();
    const empIdAliases = [canonicalEmpId, canonicalEmpId.toUpperCase(), canonicalEmpId.toLowerCase()].filter(Boolean);

    // Safeguard: Check if linked user is Super Admin
    const linkedUser = await db.collection('users').findOne({
      $or: [{ email: cleanEmail }, { employeeId: { $in: empIdAliases } }],
    });

    if (linkedUser?.role === 'SUPER_ADMIN') {
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

      if (auth.userId === linkedUser.id || auth.email?.toLowerCase() === cleanEmail) {
        return NextResponse.json(
          {
            success: false,
            message: 'You cannot permanently delete your own active Super Admin account.',
          },
          { status: 400 }
        );
      }
    }

    // Check historical dependencies
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
      db.collection('payroll_records').countDocuments({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
      db.collection('salary_assignments').countDocuments({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
      db.collection('attendance').countDocuments({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
      db.collection('leaves').countDocuments({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
      db.collection('documents').countDocuments({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
      db.collection('performance_reviews').countDocuments({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
      db.collection('hr_requests').countDocuments({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
      db.collection('offer_letters').countDocuments({ $or: [{ employeeId: { $in: empIdAliases } }, { candidateEmail: cleanEmail }] }),
    ]);

    const financialCount = payrollCount + salaryAssignmentCount;
    const nonFinancialCount = attendanceCount + leaveCount + documentCount + performanceCount + hrRequestCount + offerLetterCount;

    // RULE: Financial compliance records must NEVER be cascade deleted automatically.
    if (financialCount > 0) {
      return NextResponse.json(
        {
          success: false,
          code: 'FINANCIAL_RECORDS_PRESERVED',
          message: 'Employee cannot be deleted because historical payroll or compensation records must be preserved for financial compliance and statutory auditing. Please deactivate the employee instead.',
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

    if (nonFinancialCount > 0 && !force) {
      return NextResponse.json(
        {
          success: false,
          code: 'EMPLOYEE_DELETE_BLOCKED',
          message: 'Employee has associated records (attendance, leaves, documents, etc.). Deactivate the employee instead, or confirm force delete for non-financial records.',
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

    if (nonFinancialCount > 0 && force) {
      await Promise.all([
        db.collection('attendance').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
        db.collection('leaves').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
        db.collection('documents').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
        db.collection('performance_reviews').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
        db.collection('hr_requests').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { email: cleanEmail }] }),
        db.collection('offer_letters').deleteMany({ $or: [{ employeeId: { $in: empIdAliases } }, { candidateEmail: cleanEmail }] }),
      ]);
    }

    // Delete employee & linked user
    await db.collection('employees').deleteOne({ _id: empDoc._id });

    if (cleanEmail || canonicalEmpId) {
      await db.collection('users').deleteMany({
        $or: [{ email: cleanEmail }, { employeeId: { $in: empIdAliases } }],
      });

      await db.collection('user_sessions').deleteMany({
        $or: [{ email: cleanEmail }, { employeeId: { $in: empIdAliases } }],
      });

      await db.collection('auth_otp_tokens').deleteMany({ email: cleanEmail });
      await db.collection('password_reset_tokens').deleteMany({ email: cleanEmail });
    }

    await logAuditEvent(req, 'EMPLOYEE_PERMANENTLY_DELETED', {
      details: {
        deletedEmployeeId: canonicalEmpId,
        deletedEmail: cleanEmail,
        deletedName: `${empDoc.firstName || ''} ${empDoc.lastName || ''}`.trim(),
        force,
        nonFinancialRecordsCleared: nonFinancialCount,
        deletedBy: auth.email || auth.userId,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Employee "${empDoc.firstName || ''} ${empDoc.lastName || ''}" (${canonicalEmpId}) has been permanently deleted.`,
    });
  } catch (error: any) {
    console.error('Error deleting employee in Super Admin:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete employee profile.' }, { status: 500 });
  }
}

