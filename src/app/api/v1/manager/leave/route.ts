import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { getISTDateString, formatISTDate } from '@/lib/dateUtils';
import { formatLeaveDurationText } from '@/lib/leaveUtils';

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
    const limit = limitParam ? Math.max(1, Math.min(100, parseInt(limitParam, 10))) : 10;

    const search = searchParams.get('search')?.trim() || '';
    const statusFilter = searchParams.get('status')?.trim() || 'All';
    const leaveTypeFilter = searchParams.get('leaveType')?.trim() || 'All';
    const departmentFilter = searchParams.get('department')?.trim() || 'All';
    const urgencyFilter = searchParams.get('urgency')?.trim() || searchParams.get('isUrgent')?.trim() || 'All';
    const durationTypeFilter = searchParams.get('durationType')?.trim() || 'All';
    const dateHorizonFilter = searchParams.get('dateHorizon')?.trim() || 'All';
    const startDateFilter = searchParams.get('startDate')?.trim() || '';
    const endDateFilter = searchParams.get('endDate')?.trim() || '';

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();
    const todayIST = getISTDateString(now);

    // 1. Resolve Manager identity & Team Scope (server-derived)
    const managerEmpId = auth.employeeId || auth.userId;
    let baseTeamQuery: any = { organizationId: orgId };

    if (auth.role === 'MANAGER' && managerEmpId) {
      baseTeamQuery.$or = [
        { managerId: managerEmpId },
        { reportingTo: managerEmpId },
      ];
    }

    const projection = {
      _id: 1,
      employeeId: 1,
      firstName: 1,
      lastName: 1,
      name: 1,
      email: 1,
      department: 1,
      designation: 1,
      status: 1,
      photoUrl: 1,
      avatar: 1,
    };

    // Fetch team members matching scope
    const allTeamDocs = await db.collection('employees').find(baseTeamQuery, { projection }).toArray();
    const teamEmpIds = allTeamDocs.map((e: any) => e.employeeId || e._id.toString());

    if (teamEmpIds.length === 0) {
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
            pendingCount: 0,
            urgentPendingCount: 0,
            sameDayPendingCount: 0,
            approvedCount: 0,
            rejectedCount: 0,
            onLeaveTodayCount: 0,
            totalRequests: 0,
            leaveDaysUsed: 0,
          },
          filters: {
            departments: [],
            leaveTypes: [],
            statuses: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
            urgencies: ['All', 'Urgent', 'Normal'],
            durationTypes: ['All', 'Full Day', 'Half Day', 'Custom Hours'],
          },
          leaves: [],
          leaveBalances: [],
          pagination: {
            total: 0,
            page: 1,
            limit,
            totalPages: 1,
          },
        },
      });
    }

    // 2. Fetch all team leave requests for KPI computation & filter lists
    const allTeamLeaves = await db
      .collection('leaves')
      .find({ organizationId: orgId, employeeId: { $in: teamEmpIds } })
      .sort({ isUrgent: -1, requestedDate: -1, createdAt: -1 })
      .toArray();

    // 3. Calculate Real Team KPIs (including Urgent & Same Day)
    let pendingCount = 0;
    let urgentPendingCount = 0;
    let sameDayPendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let onLeaveTodayCount = 0;
    let leaveDaysUsed = 0;

    const onLeaveEmpSet = new Set<string>();

    allTeamLeaves.forEach((lv: any) => {
      const st = (lv.status || 'Pending').toString();
      const stLower = st.toLowerCase();
      const durDays = Number(lv.durationDays) || 1;
      const isUrgent = Boolean(lv.isUrgent);
      const isSameDay = lv.startDate === todayIST;

      if (stLower === 'pending') {
        pendingCount++;
        if (isUrgent) urgentPendingCount++;
        if (isSameDay) sameDayPendingCount++;
      } else if (stLower === 'approved') {
        approvedCount++;
        leaveDaysUsed += durDays;

        // On Leave Today calculation (IST)
        const startStr = lv.startDate ? getISTDateString(new Date(lv.startDate)) : '';
        const endStr = lv.endDate ? getISTDateString(new Date(lv.endDate)) : startStr;
        if (todayIST >= startStr && todayIST <= endStr) {
          onLeaveEmpSet.add(lv.employeeId);
        }
      } else if (stLower === 'rejected') {
        rejectedCount++;
      }
    });

    onLeaveTodayCount = onLeaveEmpSet.size;

    // Dynamic Filter Option Lists
    const availableDepartments = Array.from(
      new Set(allTeamDocs.map((m) => m.department).filter(Boolean))
    ).sort();
    const availableLeaveTypes = Array.from(
      new Set(allTeamLeaves.map((l) => l.leaveType).filter(Boolean))
    ).sort();

    // 4. Safe $and Query Composition for Main List
    const andConditions: any[] = [
      { organizationId: orgId },
      { employeeId: { $in: teamEmpIds } },
    ];

    if (statusFilter !== 'All') {
      andConditions.push({ status: { $regex: `^${statusFilter}$`, $options: 'i' } });
    }

    if (leaveTypeFilter !== 'All') {
      andConditions.push({ leaveType: { $regex: leaveTypeFilter, $options: 'i' } });
    }

    if (urgencyFilter !== 'All') {
      if (urgencyFilter === 'Urgent' || urgencyFilter === 'true' || urgencyFilter === 'URGENT') {
        andConditions.push({ isUrgent: true });
      } else if (urgencyFilter === 'Normal' || urgencyFilter === 'false' || urgencyFilter === 'NORMAL') {
        andConditions.push({ isUrgent: { $ne: true } });
      }
    }

    if (durationTypeFilter !== 'All') {
      const normDuration = durationTypeFilter.toUpperCase().replace(/\s+/g, '_');
      if (['FULL_DAY', 'HALF_DAY', 'CUSTOM_HOURS'].includes(normDuration)) {
        andConditions.push({ durationType: normDuration });
      }
    }

    if (dateHorizonFilter !== 'All') {
      if (dateHorizonFilter === 'Same Day' || dateHorizonFilter === 'SAME_DAY') {
        andConditions.push({ startDate: todayIST });
      } else if (dateHorizonFilter === 'Future Date' || dateHorizonFilter === 'FUTURE') {
        andConditions.push({ startDate: { $gt: todayIST } });
      }
    }

    if (departmentFilter !== 'All') {
      const deptEmployees = allTeamDocs.filter((e) => e.department === departmentFilter);
      const deptEmpIds = deptEmployees.map((e) => e.employeeId || e._id.toString());
      andConditions.push({ employeeId: { $in: deptEmpIds } });
    }

    if (startDateFilter || endDateFilter) {
      const dateCond: any = {};
      if (startDateFilter) dateCond.$gte = startDateFilter;
      if (endDateFilter) dateCond.$lte = endDateFilter;
      andConditions.push({ startDate: dateCond });
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      andConditions.push({
        $or: [
          { employeeName: regex },
          { employeeId: regex },
          { leaveType: regex },
          { reason: regex },
        ],
      });
    }

    const leaveQuery = andConditions.length > 1 ? { $and: andConditions } : andConditions[0];

    const totalFilteredCount = await db.collection('leaves').countDocuments(leaveQuery);
    const skip = (page - 1) * limit;

    const rawLeaves = await db
      .collection('leaves')
      .find(leaveQuery)
      .sort({ isUrgent: -1, requestedDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Enrich leaves with employee details & IST dates
    const formattedLeaves = rawLeaves.map((doc: any) => {
      const emp = allTeamDocs.find((e) => (e.employeeId || e._id.toString()) === doc.employeeId);
      const fullName = doc.employeeName || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() || emp?.name || 'Employee';
      const isSameDay = doc.startDate === todayIST;
      const isSelf = auth.employeeId ? doc.employeeId === auth.employeeId : false;

      return {
        id: doc._id.toString(),
        leaveId: doc.id || doc._id.toString(),
        employeeId: doc.employeeId,
        employeeName: fullName,
        email: emp?.email || '',
        department: emp?.department || doc.department || 'General',
        designation: emp?.designation || doc.designation || 'Staff Member',
        photoUrl: emp?.photoUrl || emp?.avatar || null,
        leaveType: doc.leaveType || 'Annual Leave',
        startDate: doc.startDate ? formatISTDate(doc.startDate) : '--',
        endDate: doc.endDate ? formatISTDate(doc.endDate) : '--',
        durationDays: Number(doc.durationDays) || 1,
        durationType: doc.durationType || 'FULL_DAY',
        session: doc.session || null,
        requestedStartTime: doc.requestedStartTime || null,
        requestedEndTime: doc.requestedEndTime || null,
        requestedHours: doc.requestedHours || null,
        isUrgent: Boolean(doc.isUrgent),
        isSameDay,
        durationFormatted: formatLeaveDurationText(doc),
        reason: doc.reason || 'No reason provided',
        status: doc.status || 'Pending',
        approvedBy: doc.approvedBy || null,
        approvedAt: doc.approvedAt ? formatISTDate(doc.approvedAt) : null,
        rejectedBy: doc.rejectedBy || null,
        rejectedAt: doc.rejectedAt ? formatISTDate(doc.rejectedAt) : null,
        rejectionReason: doc.rejectionReason || null,
        requestedDate: doc.requestedDate ? formatISTDate(doc.requestedDate) : formatISTDate(doc.createdAt),
        attachmentFileId: doc.attachmentFileId || null,
        attachmentName: doc.attachmentName || null,
        history: doc.history || [],
        canApprove: !isSelf, // Prevent self-approval strictly
      };
    });

    // 5. Fetch Team Member Leave Balances
    const leaveBalancesDocs = await db
      .collection('leave_balances')
      .find({ organizationId: orgId, employeeId: { $in: teamEmpIds } })
      .toArray();

    const formattedBalances = leaveBalancesDocs.map((bal: any) => {
      const emp = allTeamDocs.find((e) => (e.employeeId || e._id.toString()) === bal.employeeId);
      return {
        id: bal._id.toString(),
        employeeId: bal.employeeId,
        employeeName: `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() || emp?.name || 'Employee',
        department: emp?.department || 'General',
        designation: emp?.designation || 'Staff Member',
        year: bal.year || new Date().getFullYear(),
        balances: bal.balances || {},
      };
    });

    const totalPages = Math.ceil(totalFilteredCount / limit) || 1;

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
          pendingCount,
          urgentPendingCount,
          sameDayPendingCount,
          approvedCount,
          rejectedCount,
          onLeaveTodayCount,
          totalRequests: allTeamLeaves.length,
          leaveDaysUsed: Math.round(leaveDaysUsed * 10) / 10,
        },
        filters: {
          departments: availableDepartments,
          leaveTypes: availableLeaveTypes,
          statuses: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
          urgencies: ['All', 'Urgent', 'Normal'],
          durationTypes: ['All', 'Full Day', 'Half Day', 'Custom Hours'],
        },
        leaves: formattedLeaves,
        leaveBalances: formattedBalances,
        pagination: {
          total: totalFilteredCount,
          page,
          limit,
          totalPages,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching manager leave data:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load team leave requests.' },
      { status: 500 }
    );
  }
}
