import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { getISTDateString, formatISTTime, formatISTDate } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    // Role Security Check
    if (auth.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, message: 'Access Denied: Manager authorization required.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.max(1, Math.min(500, parseInt(limitParam, 10))) : 10;
    const search = searchParams.get('search')?.trim() || '';
    const department = searchParams.get('department')?.trim() || 'All';
    const designation = searchParams.get('designation')?.trim() || 'All';
    const status = searchParams.get('status')?.trim() || 'All';
    const attendanceStatusFilter = searchParams.get('attendanceStatus')?.trim() || 'All';

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();
    const todayIST = getISTDateString(now);

    // 1. Resolve manager identity & team scope (strict server-side enforcement)
    const managerEmpId = auth.employeeId || auth.userId;
    let baseTeamQuery: any = { organizationId: orgId };

    if (auth.role === 'MANAGER' && managerEmpId) {
      baseTeamQuery.$or = [
        { managerId: managerEmpId },
        { reportingTo: managerEmpId },
        { employeeId: managerEmpId },
      ];
    }

    // Projection to exclude sensitive security fields
    const projection = {
      _id: 1,
      employeeId: 1,
      firstName: 1,
      lastName: 1,
      name: 1,
      email: 1,
      phone: 1,
      department: 1,
      designation: 1,
      status: 1,
      joiningDate: 1,
      createdAt: 1,
      managerId: 1,
      reportingTo: 1,
      photoUrl: 1,
      avatar: 1,
    };

    // Fetch all team members for KPI computation & filter option extraction
    const allTeamDocs = await db.collection('employees').find(baseTeamQuery, { projection }).toArray();

    const teamEmpIds = allTeamDocs.map((e: any) => e.employeeId || e._id.toString());

    // 2. Fetch today's attendance records for the team
    const attendanceDocs = teamEmpIds.length > 0
      ? await db
          .collection('attendance')
          .find({
            organizationId: orgId,
            employeeId: { $in: teamEmpIds },
            date: todayIST,
          })
          .toArray()
      : [];

    // 3. Fetch active leaves & pending leave approvals for the team
    const leaveDocs = teamEmpIds.length > 0
      ? await db
          .collection('leaves')
          .find({
            organizationId: orgId,
            employeeId: { $in: teamEmpIds },
            status: { $in: ['Pending', 'Approved', 'pending', 'approved'] },
          })
          .toArray()
      : [];

    // Map attendance & leave statuses per employee ID
    const attendanceMap = new Map<string, any>();
    attendanceDocs.forEach((att: any) => {
      if (att.employeeId) {
        attendanceMap.set(att.employeeId, att);
      }
    });

    const leaveMap = new Map<string, any>();
    let pendingLeavesCount = 0;

    leaveDocs.forEach((lv: any) => {
      const empId = lv.employeeId;
      const lvStatus = (lv.status || '').toLowerCase();
      if (lvStatus === 'pending') {
        pendingLeavesCount++;
      }

      // Check if employee is on leave today
      if (lvStatus === 'approved') {
        const startDateStr = lv.startDate ? getISTDateString(new Date(lv.startDate)) : '';
        const endDateStr = lv.endDate ? getISTDateString(new Date(lv.endDate)) : startDateStr;
        if (todayIST >= startDateStr && todayIST <= endDateStr) {
          leaveMap.set(empId, lv);
        }
      }
    });

    // Helper to evaluate member attendance status
    const resolveAttendance = (empId: string) => {
      const att = attendanceMap.get(empId);
      const lv = leaveMap.get(empId);

      let attStatus: string = 'Not Marked';
      let clockIn: string | null = null;
      let clockOut: string | null = null;
      let workHours: string | null = null;

      if (lv) {
        attStatus = 'On Leave';
      } else if (att) {
        const rawStatus = (att.status || '').toLowerCase();
        if (rawStatus === 'present') attStatus = 'Present';
        else if (rawStatus === 'late') attStatus = 'Late';
        else if (rawStatus === 'half_day' || rawStatus === 'half-day' || rawStatus === 'half day') attStatus = 'Half Day';
        else if (rawStatus === 'absent') attStatus = 'Absent';
        else if (rawStatus === 'leave' || rawStatus === 'on_leave') attStatus = 'On Leave';
        else attStatus = att.status || 'Present';

        if (att.clockIn) clockIn = formatISTTime(att.clockIn);
        if (att.clockOut) clockOut = formatISTTime(att.clockOut);
        if (att.workHours != null) workHours = `${Number(att.workHours).toFixed(1)} hrs`;
        else if (att.totalHours != null) workHours = `${Number(att.totalHours).toFixed(1)} hrs`;
      }

      return {
        date: todayIST,
        status: attStatus,
        clockIn,
        clockOut,
        workHours,
      };
    };

    // 4. Compute Real Team KPIs
    let activeMembersCount = 0;
    let presentTodayCount = 0;
    let onLeaveTodayCount = 0;

    const formattedAllMembers = allTeamDocs.map((emp: any) => {
      const empId = emp.employeeId || emp._id.toString();
      const empStatus = emp.status || 'Active';
      const isEmpActive = empStatus.toLowerCase() === 'active';
      if (isEmpActive) activeMembersCount++;

      const attInfo = resolveAttendance(empId);
      if (attInfo.status === 'Present' || attInfo.status === 'Late' || attInfo.status === 'Half Day') {
        presentTodayCount++;
      } else if (attInfo.status === 'On Leave') {
        onLeaveTodayCount++;
      }

      const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Employee';

      return {
        id: emp._id.toString(),
        employeeId: empId,
        firstName: emp.firstName || '',
        lastName: emp.lastName || '',
        name: fullName,
        email: emp.email || '',
        phone: emp.phone || '',
        department: emp.department || 'General',
        designation: emp.designation || 'Staff Member',
        status: empStatus,
        joiningDate: emp.joiningDate ? formatISTDate(emp.joiningDate) : undefined,
        managerId: emp.managerId || '',
        reportingTo: emp.reportingTo || '',
        photoUrl: emp.photoUrl || emp.avatar || null,
        todayAttendance: attInfo,
      };
    });

    // Dynamic Filter Option Lists
    const availableDepartments = Array.from(
      new Set(formattedAllMembers.map((m) => m.department).filter(Boolean))
    ).sort();
    const availableDesignations = Array.from(
      new Set(formattedAllMembers.map((m) => m.designation).filter(Boolean))
    ).sort();
    const availableStatuses = Array.from(
      new Set(formattedAllMembers.map((m) => m.status).filter(Boolean))
    ).sort();

    // 5. Apply Search & Filters safely with $and logic
    let filteredMembers = formattedAllMembers;

    if (department !== 'All') {
      filteredMembers = filteredMembers.filter((m) => m.department === department);
    }
    if (designation !== 'All') {
      filteredMembers = filteredMembers.filter((m) => m.designation === designation);
    }
    if (status !== 'All') {
      filteredMembers = filteredMembers.filter(
        (m) => m.status.toLowerCase() === status.toLowerCase()
      );
    }
    if (attendanceStatusFilter !== 'All') {
      filteredMembers = filteredMembers.filter(
        (m) => m.todayAttendance.status.toLowerCase() === attendanceStatusFilter.toLowerCase()
      );
    }
    if (search) {
      const q = search.toLowerCase();
      filteredMembers = filteredMembers.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.employeeId.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.department.toLowerCase().includes(q) ||
          m.designation.toLowerCase().includes(q)
      );
    }

    const totalFilteredCount = filteredMembers.length;

    // 6. Pagination Slicing
    const totalPages = Math.ceil(totalFilteredCount / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedMembers = filteredMembers.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      success: true,
      data: {
        manager: {
          name: auth.name || 'Manager',
          email: auth.email || '',
          role: auth.role || 'MANAGER',
          employeeId: managerEmpId,
          organizationId: orgId,
        },
        kpis: {
          totalTeamMembers: allTeamDocs.length,
          activeMembersCount,
          presentTodayCount,
          onLeaveTodayCount,
          pendingLeavesCount,
        },
        filters: {
          departments: availableDepartments,
          designations: availableDesignations,
          statuses: availableStatuses,
        },
        teamMembers: paginatedMembers,
        pagination: {
          total: totalFilteredCount,
          page,
          limit,
          totalPages,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching manager team list:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load manager team members.' },
      { status: 500 }
    );
  }
}
