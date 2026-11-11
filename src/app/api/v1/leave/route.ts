import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { createNotification } from '@/lib/notifications/notificationService';
import { getISTDateString, parseDateInput } from '@/lib/dateUtils';
import {
  calculateAuthoritativeDuration,
  checkLeaveDateOverlap,
  formatLeaveDurationText,
} from '@/lib/leaveUtils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const statusFilter = searchParams.get('status')?.trim();
    const leaveTypeFilter = searchParams.get('leaveType')?.trim();
    const startDateFilter = searchParams.get('startDate')?.trim();
    const endDateFilter = searchParams.get('endDate')?.trim();
    const deptFilter = searchParams.get('department')?.trim();
    const urgencyFilter = searchParams.get('urgency')?.trim() || searchParams.get('isUrgent')?.trim();
    const durationTypeFilter = searchParams.get('durationType')?.trim();
    const dateHorizonFilter = searchParams.get('dateHorizon')?.trim();

    const todayIST = getISTDateString(new Date());

    let query: any = { organizationId: orgId };

    if (auth.role === 'EMPLOYEE' && auth.employeeId) {
      query.employeeId = auth.employeeId;
    } else if (auth.role === 'MANAGER' && auth.employeeId) {
      const team = await db
        .collection('employees')
        .find({
          organizationId: orgId,
          $or: [{ managerId: auth.employeeId }, { reportingTo: auth.employeeId }, { employeeId: auth.employeeId }],
        })
        .toArray();
      const teamEmpIds = team.map((e) => e.employeeId || e._id.toString());
      query.employeeId = { $in: teamEmpIds };
    }

    if (deptFilter && deptFilter !== 'All') {
      const deptEmployees = await db
        .collection('employees')
        .find({ organizationId: orgId, department: deptFilter })
        .toArray();
      const deptEmpIds = deptEmployees.map((e) => e.employeeId || e._id.toString());
      query.employeeId = { $in: deptEmpIds };
    }

    if (statusFilter && statusFilter !== 'All') {
      query.status = { $regex: `^${statusFilter}$`, $options: 'i' };
    }

    if (leaveTypeFilter && leaveTypeFilter !== 'All') {
      query.leaveType = { $regex: leaveTypeFilter, $options: 'i' };
    }

    // Urgency Filter
    if (urgencyFilter && urgencyFilter !== 'All') {
      if (urgencyFilter === 'Urgent' || urgencyFilter === 'true' || urgencyFilter === 'URGENT') {
        query.isUrgent = true;
      } else if (urgencyFilter === 'Normal' || urgencyFilter === 'false' || urgencyFilter === 'NORMAL') {
        query.isUrgent = { $ne: true };
      }
    }

    // Duration Type Filter (Full Day, Half Day, Custom Hours)
    if (durationTypeFilter && durationTypeFilter !== 'All') {
      const normDuration = durationTypeFilter.toUpperCase().replace(/\s+/g, '_');
      if (['FULL_DAY', 'HALF_DAY', 'CUSTOM_HOURS'].includes(normDuration)) {
        query.durationType = normDuration;
      }
    }

    // Date Horizon Filter (Same Day vs Future Date)
    if (dateHorizonFilter && dateHorizonFilter !== 'All') {
      if (dateHorizonFilter === 'Same Day' || dateHorizonFilter === 'SAME_DAY') {
        query.startDate = todayIST;
      } else if (dateHorizonFilter === 'Future Date' || dateHorizonFilter === 'FUTURE') {
        query.startDate = { $gt: todayIST };
      }
    }

    if (startDateFilter || endDateFilter) {
      query.startDate = query.startDate || {};
      if (typeof query.startDate === 'object') {
        if (startDateFilter) query.startDate.$gte = startDateFilter;
        if (endDateFilter) query.startDate.$lte = endDateFilter;
      }
    }

    if (search) {
      query.$or = [
        { employeeName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
        { leaveType: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [total, leaves, leaveBalances] = await Promise.all([
      db.collection('leaves').countDocuments(query),
      db
        .collection('leaves')
        .find(query)
        .sort({ isUrgent: -1, requestedDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('leave_balances').find({ organizationId: orgId }).toArray(),
    ]);

    const formattedLeaves = leaves.map((doc) => ({
      ...doc,
      id: doc.id || doc._id.toString(),
      isUrgent: Boolean(doc.isUrgent),
      durationType: doc.durationType || 'FULL_DAY',
      session: doc.session || null,
      requestedStartTime: doc.requestedStartTime || null,
      requestedEndTime: doc.requestedEndTime || null,
      requestedHours: doc.requestedHours || null,
      durationDays: Number(doc.durationDays) || 1,
      isSameDay: doc.startDate === todayIST,
      history: doc.history || [],
    }));

    return NextResponse.json({
      success: true,
      data: {
        leaves: formattedLeaves,
        leaveBalances,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch leave requests' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    const {
      employeeId,
      leaveType,
      startDate,
      endDate,
      durationType,
      session,
      requestedStartTime,
      requestedEndTime,
      reason,
      isUrgent,
      attachmentFileId,
      attachmentName,
    } = body;

    // Security: Employee can only create their own requests
    if (auth.role === 'EMPLOYEE' && employeeId && employeeId !== auth.employeeId) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Employees may only submit leave requests for themselves.' },
        { status: 403 }
      );
    }

    const targetEmpId = auth.role === 'EMPLOYEE' ? (auth.employeeId || employeeId) : (employeeId || auth.employeeId);
    if (!targetEmpId || !leaveType || !startDate) {
      return NextResponse.json(
        { success: false, message: 'Employee ID, leave type, and start date are required.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();
    const todayIST = getISTDateString(now);

    const emp = await db.collection('employees').findOne({ organizationId: orgId, employeeId: targetEmpId });
    if (!emp && auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Employee profile not found in your organization.' },
        { status: 404 }
      );
    }

    const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : auth.name || 'Employee';
    const managerId = emp?.managerId || '';
    const department = emp?.department || 'General';
    const designation = emp?.designation || 'Staff';

    // Normalize duration type
    const normDurationType =
      durationType === 'HALF_DAY'
        ? 'HALF_DAY'
        : durationType === 'CUSTOM_HOURS'
        ? 'CUSTOM_HOURS'
        : 'FULL_DAY';

    // For partial day (Half Day or Custom Hours), endDate is equal to startDate
    const cleanStartDate = String(startDate).trim();
    const cleanEndDate = normDurationType === 'FULL_DAY' ? String(endDate || startDate).trim() : cleanStartDate;

    const startObj = parseDateInput(cleanStartDate);
    const endObj = parseDateInput(cleanEndDate);

    if (!startObj || !endObj) {
      return NextResponse.json({ success: false, message: 'Invalid start date or end date format.' }, { status: 400 });
    }

    if (endObj < startObj) {
      return NextResponse.json({ success: false, message: 'End date cannot be prior to start date.' }, { status: 400 });
    }

    // Past date validation
    if (cleanStartDate < todayIST) {
      return NextResponse.json(
        { success: false, message: 'Leave cannot be applied for past dates. Please contact HR for regularization.' },
        { status: 400 }
      );
    }

    // Organization Policies Check
    const orgSettings = await db.collection('organization_settings').findOne({ organizationId: orgId });
    const leavePolicy = orgSettings?.leave || {
      noticePeriodDays: 2,
      attachmentRequiredDays: 3,
      maxCarryForwardDays: 30,
      halfDayAllowed: true,
      customHoursAllowed: false,
    };
    const attendanceRules = orgSettings?.attendance || {
      workStartTime: '09:00 AM',
      workEndTime: '06:00 PM',
      halfDayThresholdHours: 4,
      minHoursFullDay: 8,
    };

    // Policy Check: Half-day
    if (normDurationType === 'HALF_DAY' && leavePolicy.halfDayAllowed === false) {
      return NextResponse.json(
        { success: false, message: 'Half-day leaves are currently disabled by organization policy.' },
        { status: 400 }
      );
    }

    // Policy Check: Custom hours
    if (normDurationType === 'CUSTOM_HOURS' && !leavePolicy.customHoursAllowed && !isUrgent) {
      return NextResponse.json(
        { success: false, message: 'Custom hours leave requests are not enabled by organization policy.' },
        { status: 400 }
      );
    }

    // Server-Side Authoritative Duration Calculation
    const calculated = calculateAuthoritativeDuration({
      durationType: normDurationType,
      startDate: cleanStartDate,
      endDate: cleanEndDate,
      session,
      customStartTime: requestedStartTime,
      customEndTime: requestedEndTime,
      shiftConfig: attendanceRules,
    });

    if (!calculated.isValid) {
      return NextResponse.json(
        { success: false, message: calculated.errorMessage || 'Invalid leave duration or interval.' },
        { status: 400 }
      );
    }

    const durationDays = calculated.durationDays;
    const urgentFlag = Boolean(isUrgent);

    // Notice Period Validation
    // Notice period is skipped for emergency / urgent leaves!
    if (leavePolicy.noticePeriodDays > 0 && auth.role === 'EMPLOYEE' && !urgentFlag) {
      const minNoticeDate = new Date();
      minNoticeDate.setHours(0, 0, 0, 0);
      minNoticeDate.setDate(minNoticeDate.getDate() + (leavePolicy.noticePeriodDays - 1));
      const minNoticeStr = getISTDateString(minNoticeDate);

      if (cleanStartDate < minNoticeStr) {
        return NextResponse.json(
          {
            success: false,
            message: `Leave policy requires applying at least ${leavePolicy.noticePeriodDays} day(s) in advance. For sudden emergencies, please select the "Urgent / Emergency Leave" option.`,
          },
          { status: 400 }
        );
      }
    }

    // Overlapping Leave Detection
    const existingActiveLeaves = await db
      .collection('leaves')
      .find({
        organizationId: orgId,
        employeeId: targetEmpId,
        status: { $in: ['Pending', 'Approved'] },
      })
      .toArray();

    const overlapResult = checkLeaveDateOverlap({
      existingLeaves: existingActiveLeaves,
      startDate: cleanStartDate,
      endDate: cleanEndDate,
      durationType: calculated.durationType,
      session: calculated.session,
    });

    if (overlapResult.hasConflict) {
      return NextResponse.json(
        {
          success: false,
          message: overlapResult.conflictReason || 'A conflicting leave request already exists for the selected dates.',
        },
        { status: 409 }
      );
    }

    // Attachment check if duration >= threshold
    if (durationDays >= (leavePolicy.attachmentRequiredDays || 3) && !attachmentFileId && !urgentFlag) {
      return NextResponse.json(
        {
          success: false,
          message: `Supporting attachment document is mandatory for leave requests of ${leavePolicy.attachmentRequiredDays || 3} day(s) or longer.`,
        },
        { status: 400 }
      );
    }

    // Fetch or initialize leave balance for employee
    const currentYear = new Date().getFullYear();
    let balanceDoc: any = await db.collection('leave_balances').findOne({
      organizationId: orgId,
      employeeId: targetEmpId,
      year: currentYear,
    });

    if (!balanceDoc) {
      const activeTypes = await db.collection('leave_types').find({ organizationId: orgId, active: true }).toArray();
      const configuredTypes = activeTypes.length > 0 ? activeTypes : [
        { name: 'Casual Leave', code: 'CL', allowanceDays: 12 },
        { name: 'Sick Leave', code: 'SL', allowanceDays: 10 },
        { name: 'Earned Leave', code: 'EL', allowanceDays: 15 },
        { name: 'Unpaid Leave / LOP', code: 'LOP', allowanceDays: 30 },
      ];

      const defaultBalances: any = {};
      for (const lt of configuredTypes) {
        const key = lt.name || lt.code;
        const total = lt.allowanceDays || 12;
        defaultBalances[key] = { total, used: 0, pending: 0, remaining: total };
      }

      const newBal = {
        organizationId: orgId,
        employeeId: targetEmpId,
        year: currentYear,
        balances: defaultBalances,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection('leave_balances').insertOne(newBal as any);
      balanceDoc = newBal;
    }

    const typeKey = Object.keys(balanceDoc?.balances || {}).find(
      (k) => k.toLowerCase() === leaveType.toLowerCase()
    ) || leaveType;
    const currentCategory = balanceDoc?.balances?.[typeKey] || { total: 12, used: 0, pending: 0, remaining: 12 };

    // Check if leave type is unpaid from DB configuration or naming conventions
    const leaveTypesDoc = await db.collection('leave_types').find({ organizationId: orgId }).toArray();
    const matchedLt = leaveTypesDoc.find((lt: any) => lt.name?.toLowerCase() === leaveType.toLowerCase() || lt.code?.toLowerCase() === leaveType.toLowerCase());
    const isUnpaid = matchedLt ? (matchedLt.isPaid === false || matchedLt.isPaid === 'false') : (leaveType.toLowerCase().includes('unpaid') || leaveType.toLowerCase().includes('lop'));

    if (!isUnpaid && (currentCategory.remaining || 0) < durationDays) {
      return NextResponse.json(
        {
          success: false,
          message: `Insufficient ${leaveType} balance. Available: ${currentCategory.remaining} day(s), Requested: ${durationDays} day(s).`,
        },
        { status: 400 }
      );
    }

    const isSameDay = cleanStartDate === todayIST;

    const leaveDoc = {
      organizationId: orgId,
      employeeId: targetEmpId,
      employeeName: empName,
      avatar: emp?.avatar || '',
      department,
      designation,
      managerId,
      leaveType,
      startDate: cleanStartDate,
      endDate: cleanEndDate,
      durationDays,
      durationType: calculated.durationType,
      session: calculated.session || null,
      requestedStartTime: calculated.requestedStartTime || null,
      requestedEndTime: calculated.requestedEndTime || null,
      requestedHours: calculated.requestedHours || null,
      requestedDays: durationDays,
      isUrgent: urgentFlag,
      reason: (reason || '').trim(),
      attachmentFileId: attachmentFileId || null,
      attachmentName: attachmentName || null,
      requestedDate: todayIST,
      approver: managerId ? 'Manager / HR' : 'HR Administrator',
      status: 'Pending',
      history: [
        {
          action: 'SUBMITTED',
          performedBy: empName,
          performedById: auth.userId,
          role: auth.role,
          timestamp: now.toISOString(),
          comments: (reason || '').trim(),
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const insertRes = await db.collection('leaves').insertOne(leaveDoc);
    const insertedIdStr = insertRes.insertedId.toString();

    // Increment pending balance in leave_balances atomically using $inc
    await db.collection('leave_balances').updateOne(
      { organizationId: orgId, employeeId: targetEmpId, year: currentYear },
      { $inc: { [`balances.${typeKey}.pending`]: durationDays }, $set: { updatedAt: now } }
    );

    // Formatted duration description for messages
    const durationText = formatLeaveDurationText(leaveDoc);

    // High Priority Notification if Urgent or Same-Day
    const notifTitle = urgentFlag
      ? `🚨 Urgent Leave Request: ${empName}`
      : isSameDay
      ? `Same-Day Leave Request: ${empName}`
      : `New Leave Request: ${empName}`;

    const notifPriority = urgentFlag ? 'HIGH' : isSameDay ? 'HIGH' : 'NORMAL';

    await createNotification({
      organizationId: orgId,
      recipientType: 'ADMIN',
      recipientId: managerId || 'usr-admin-1',
      eventType: urgentFlag ? 'urgent_leave_submitted' : 'leave_submitted',
      eventId: `leave:${insertedIdStr}:submitted`,
      category: 'LEAVE',
      title: notifTitle,
      message: `${urgentFlag ? '[URGENT] ' : ''}${empName} submitted a ${leaveType} request for ${durationText} on ${cleanStartDate}.${reason ? ` Reason: "${reason.slice(0, 100)}"` : ''}`,
      priority: notifPriority,
      actionUrl: '/admin/leave',
      metadata: {
        leaveId: insertedIdStr,
        employeeId: targetEmpId,
        durationDays,
        durationType: calculated.durationType,
        isUrgent: urgentFlag,
        session: calculated.session || null,
      },
    });

    await logAuditEvent(req, 'SUBMIT_LEAVE_REQUEST', {
      details: {
        leaveId: insertedIdStr,
        employeeId: targetEmpId,
        leaveType,
        durationDays,
        durationType: calculated.durationType,
        session: calculated.session,
        isUrgent: urgentFlag,
        isSameDay,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${urgentFlag ? 'Urgent ' : ''}Leave request for ${durationText} submitted successfully.`,
      data: { ...leaveDoc, _id: insertRes.insertedId, id: insertedIdStr },
    });
  } catch (error: any) {
    console.error('Error submitting leave request:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to submit leave request' }, { status: 500 });
  }
}
