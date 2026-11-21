import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { createNotification } from '@/lib/notifications/notificationService';
import { ObjectId } from 'mongodb';
import { ApprovalItem, ApprovalType, ApprovalStatus } from '@/types/approval';
import { formatLeaveDurationText, reconcileAttendanceForLeaveRange, checkIsSelfApproval } from '@/lib/leaveUtils';
import { getISTDateString } from '@/lib/dateUtils';
import { decideWfhRequest, ensureWfhRequestsForCheckIns, processRejectedWfhAbsences } from '@/lib/wfh';

export const dynamic = 'force-dynamic';

// GET /api/v1/approvals - Fetch unified HR approval queue
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    if (auth.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Employees cannot access the HR Approval Center.' },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '15', 10)));
    const filterType = (searchParams.get('type') || 'ALL').toUpperCase();
    const filterStatus = (searchParams.get('status') || 'ALL').toUpperCase();
    const search = searchParams.get('search')?.trim() || '';
    const startDate = searchParams.get('startDate')?.trim();
    const endDate = searchParams.get('endDate')?.trim();

    // Manager Scope Restriction
    let managerTeamEmpIds: string[] = [];
    if (auth.role === 'MANAGER' && auth.employeeId) {
      const teamEmps = await db.collection('employees').find({
        organizationId: orgId,
        $or: [{ managerId: auth.employeeId }, { reportingTo: auth.employeeId }],
      }).toArray();
      managerTeamEmpIds = teamEmps.map((e) => e.employeeId);
    }

    let allItems: ApprovalItem[] = [];

    // Helper: Map Leave
    const mapLeaveToApproval = (doc: any): ApprovalItem => {
      const statusUpper = (doc.status || 'PENDING').toUpperCase();
      const normStatus: ApprovalStatus =
        statusUpper === 'APPROVED' ? 'APPROVED' : statusUpper === 'REJECTED' ? 'REJECTED' : statusUpper === 'CANCELLED' ? 'CANCELLED' : 'PENDING';
      const isUrgent = Boolean(doc.isUrgent);
      const durationFormatted = formatLeaveDurationText(doc);

      return {
        id: doc._id.toString(),
        _id: doc._id.toString(),
        organizationId: doc.organizationId,
        requestType: 'LEAVE',
        referenceNumber: doc.referenceNumber || `LEV-${doc._id.toString().slice(-6).toUpperCase()}`,
        employeeId: doc.employeeId,
        employeeName: doc.employeeName || 'Employee',
        department: doc.department || 'General',
        designation: doc.designation || 'Team Member',
        title: `${isUrgent ? '🚨 [URGENT] ' : ''}${doc.leaveType || 'Leave'} (${durationFormatted})`,
        isUrgent,
        details: {
          leaveType: doc.leaveType,
          startDate: doc.startDate,
          endDate: doc.endDate,
          durationDays: Number(doc.durationDays) || 1,
          durationType: doc.durationType || 'FULL_DAY',
          session: doc.session || null,
          requestedStartTime: doc.requestedStartTime || null,
          requestedEndTime: doc.requestedEndTime || null,
          requestedHours: doc.requestedHours || null,
          isUrgent,
          reason: doc.reason || doc.rejectionReason || '',
          adminComments: doc.adminComments || doc.rejectionReason || '',
        },
        status: normStatus,
        submittedAt: doc.createdAt || doc.requestedDate || new Date().toISOString(),
        updatedAt: doc.updatedAt,
        sourceCollection: 'leaves',
        history: doc.history || [
          {
            action: 'SUBMITTED',
            performedBy: doc.employeeName || doc.employeeId,
            timestamp: doc.createdAt || new Date().toISOString(),
            comments: doc.reason,
          },
          ...(doc.approvedBy
            ? [
                {
                  action: 'APPROVED' as const,
                  performedBy: doc.approvedBy,
                  timestamp: doc.approvedAt || doc.updatedAt || new Date().toISOString(),
                  comments: doc.adminComments,
                },
              ]
            : []),
          ...(doc.rejectedBy
            ? [
                {
                  action: 'REJECTED' as const,
                  performedBy: doc.rejectedBy,
                  timestamp: doc.rejectedAt || doc.updatedAt || new Date().toISOString(),
                  comments: doc.rejectionReason || doc.adminComments,
                },
              ]
            : []),
        ],
      };
    };

    // Helper: Map Attendance Correction
    const mapAttendanceToApproval = (doc: any): ApprovalItem => {
      const statusUpper = (doc.status || 'PENDING').toUpperCase();
      const normStatus: ApprovalStatus =
        statusUpper === 'APPROVED' ? 'APPROVED' : statusUpper === 'REJECTED' ? 'REJECTED' : 'PENDING';

      return {
        id: doc._id.toString(),
        _id: doc._id.toString(),
        organizationId: doc.organizationId,
        requestType: 'ATTENDANCE_CORRECTION',
        referenceNumber: doc.referenceNumber || `ATT-${doc._id.toString().slice(-6).toUpperCase()}`,
        employeeId: doc.employeeId,
        employeeName: doc.employeeName || 'Employee',
        department: doc.department || 'General',
        designation: doc.designation || 'Team Member',
        title: `Attendance Regularization (${doc.date || doc.attendanceDate || 'Missed Punch'})`,
        details: {
          attendanceDate: doc.date || doc.attendanceDate,
          checkInTime: doc.checkIn || doc.requestedCheckIn,
          checkOutTime: doc.checkOut || doc.requestedCheckOut,
          reason: doc.reason || doc.correctionReason || '',
          adminComments: doc.adminComments || '',
        },
        status: normStatus,
        submittedAt: doc.createdAt || new Date().toISOString(),
        updatedAt: doc.updatedAt,
        sourceCollection: 'attendance_corrections',
        history: doc.history || [
          {
            action: 'SUBMITTED',
            performedBy: doc.employeeName || doc.employeeId,
            timestamp: doc.createdAt || new Date().toISOString(),
            comments: doc.reason || doc.correctionReason,
          },
        ],
      };
    };

    // Helper: Map HR Ticket Requests (Profile Change, Asset Request, Resignation)
    const mapHrRequestToApproval = (doc: any): ApprovalItem => {
      let requestType: ApprovalType = 'PROFILE_CHANGE';
      const rawType = (doc.requestType || doc.category || '').toString().toLowerCase();

      if (rawType.includes('asset') || rawType.includes('it')) {
        requestType = 'ASSET_REQUEST';
      } else if (rawType.includes('resign') || rawType.includes('exit')) {
        requestType = 'RESIGNATION';
      } else if (rawType.includes('profile') || rawType.includes('correction')) {
        requestType = 'PROFILE_CHANGE';
      }

      const statusUpper = (doc.status || 'OPEN').toUpperCase();
      const normStatus: ApprovalStatus =
        statusUpper === 'APPROVED' || statusUpper === 'RESOLVED' || statusUpper === 'CLOSED'
          ? 'APPROVED'
          : statusUpper === 'REJECTED'
          ? 'REJECTED'
          : 'PENDING';

      return {
        id: doc._id.toString(),
        _id: doc._id.toString(),
        organizationId: doc.organizationId,
        requestType,
        referenceNumber: doc.ticketNo || doc.referenceNumber || `REQ-${doc._id.toString().slice(-6).toUpperCase()}`,
        employeeId: doc.employeeId,
        employeeName: doc.creatorName || doc.employeeName || 'Employee',
        department: doc.department || 'General',
        designation: doc.designation || 'Team Member',
        title: doc.subject || `${requestType.replace('_', ' ')} Request`,
        details: {
          reason: doc.description || doc.reason || '',
          requestedChanges: doc.requestedChanges || {},
          assetType: doc.assetType || doc.category,
          lastWorkingDay: doc.lastWorkingDay,
          noticePeriodDays: doc.noticePeriodDays,
          adminComments: doc.resolution || doc.adminComments || '',
        },
        status: normStatus,
        submittedAt: doc.createdAt || new Date().toISOString(),
        updatedAt: doc.updatedAt,
        sourceCollection: 'hr_requests',
        history: doc.history || [
          {
            action: 'SUBMITTED',
            performedBy: doc.creatorName || doc.employeeId,
            timestamp: doc.createdAt || new Date().toISOString(),
            comments: doc.description,
          },
        ],
      };
    };

    // 1. Fetch Leaves
    if (filterType === 'ALL' || filterType === 'LEAVE') {
      let leaveQuery: any = { organizationId: orgId };
      if (auth.role === 'MANAGER') {
        leaveQuery.employeeId = { $in: managerTeamEmpIds };
      }

      const leaveDocs = await db.collection('leaves').find(leaveQuery).sort({ createdAt: -1 }).toArray();
      allItems.push(...leaveDocs.map(mapLeaveToApproval));
    }

    // 2. Fetch Attendance Corrections
    if (filterType === 'ALL' || filterType === 'ATTENDANCE_CORRECTION') {
      let attQuery: any = { organizationId: orgId };
      if (auth.role === 'MANAGER') {
        attQuery.employeeId = { $in: managerTeamEmpIds };
      }

      const attDocs = await db.collection('attendance_corrections').find(attQuery).sort({ createdAt: -1 }).toArray();
      allItems.push(...attDocs.map(mapAttendanceToApproval));

      // Also check main attendance collection for pending correction flags
      const attCorrectionDocs = await db.collection('attendance').find({
        ...attQuery,
        correctionRequested: true,
      }).sort({ date: -1 }).toArray();

      allItems.push(...attCorrectionDocs.map((doc) => ({
        id: doc._id.toString(),
        _id: doc._id.toString(),
        organizationId: doc.organizationId,
        requestType: 'ATTENDANCE_CORRECTION' as const,
        referenceNumber: `CORR-${doc.date || doc._id.toString().slice(-6).toUpperCase()}`,
        employeeId: doc.employeeId,
        employeeName: doc.employeeName || 'Employee',
        department: doc.department || 'General',
        designation: doc.designation || 'Team Member',
        title: `Attendance Regularization (${doc.date})`,
        details: {
          attendanceDate: doc.date,
          checkInTime: doc.checkIn,
          checkOutTime: doc.checkOut,
          reason: doc.correctionReason || doc.notes || 'Missed Punch Regularization',
        },
        status: (doc.correctionStatus || 'PENDING').toUpperCase() as ApprovalStatus,
        submittedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
        sourceCollection: 'attendance',
      })));
    }

    // 3. Fetch HR Requests (Profile Change, Asset Request, Resignation)
    if (filterType === 'ALL' || ['PROFILE_CHANGE', 'ASSET_REQUEST', 'RESIGNATION'].includes(filterType)) {
      let hrQuery: any = { organizationId: orgId };
      if (auth.role === 'MANAGER') {
        hrQuery.employeeId = { $in: managerTeamEmpIds };
      }

      const hrDocs = await db.collection('hr_requests').find(hrQuery).sort({ createdAt: -1 }).toArray();
      allItems.push(...hrDocs.map(mapHrRequestToApproval));
    }

        // 4. Work From Home requests (with that day's check-in and work summary when available)
    if (filterType === 'ALL' || filterType === 'WFH') {
      await ensureWfhRequestsForCheckIns(db, orgId).catch((err) => console.warn('[Approvals] WFH request backfill skipped:', err));
      await processRejectedWfhAbsences(db, { today: getISTDateString(new Date()), organizationId: orgId }).catch((err) =>
        console.warn('[Approvals] Rejected WFH check skipped:', err)
      );

      const wfhQuery: any = { organizationId: orgId, status: { $in: ['Pending', 'Approved', 'Rejected', 'Cancelled'] } };
      if (auth.role === 'MANAGER') {
        wfhQuery.employeeId = { $in: managerTeamEmpIds };
      }
      const wfhDocs = await db.collection('wfh_requests').find(wfhQuery).sort({ createdAt: -1 }).limit(500).toArray();
      const wfhDates = Array.from(new Set(wfhDocs.map((d: any) => d.date)));
      const wfhAttendance = wfhDates.length
        ? await db.collection('attendance').find({ organizationId: orgId, workMode: 'WFH', date: { $in: wfhDates } }).toArray()
        : [];
      const attendanceByKey = new Map(wfhAttendance.map((a: any) => [`${a.employeeId}|${a.date}`, a]));

      allItems.push(
        ...wfhDocs.map((doc: any): ApprovalItem => {
          const att: any = attendanceByKey.get(`${doc.employeeId}|${doc.date}`);
          const statusUpper = String(doc.status || 'Pending').toUpperCase();
          const normStatus: ApprovalStatus =
            statusUpper === 'APPROVED' ? 'APPROVED' : statusUpper === 'REJECTED' ? 'REJECTED' : statusUpper === 'CANCELLED' ? 'CANCELLED' : 'PENDING';
          const id = doc._id.toString();
          return {
            id,
            _id: id,
            organizationId: doc.organizationId,
            requestType: 'WFH',
            referenceNumber: `WFH-${id.slice(-6).toUpperCase()}`,
            employeeId: doc.employeeId,
            employeeName: doc.employeeName || 'Employee',
            department: doc.department || 'General',
            designation: doc.designation || 'Team Member',
            title: `Work From Home (${doc.date})${doc.source === 'CHECK_IN' ? ' · checked in from home' : ''}`,
            details: {
              attendanceDate: doc.date,
              ...(att?.checkIn && att.checkIn !== '--:--' ? { checkInTime: att.checkIn, checkOutTime: att.checkOut || 'not yet' } : {}),
              reason: doc.reason || (doc.source === 'CHECK_IN' ? 'Checked in as Work From Home without an advance request.' : ''),
              adminComments: doc.decisionComments || '',
              ...(att?.workSummary ? { workSummary: att.workSummary } : {}),
            },
            status: normStatus,
            submittedAt: doc.createdAt || new Date().toISOString(),
            updatedAt: doc.updatedAt,
            sourceCollection: 'wfh_requests',
            history: doc.history || [],
          };
        })
      );
    }

    // Filter by Type if specific
    if (filterType !== 'ALL') {
      allItems = allItems.filter((i) => i.requestType === filterType);
    }

    // Filter by Status if specific
    if (filterStatus !== 'ALL') {
      allItems = allItems.filter((i) => i.status === filterStatus);
    }

    // Filter by Search Query
    if (search) {
      const lowerSearch = search.toLowerCase();
      allItems = allItems.filter(
        (i) =>
          i.employeeName.toLowerCase().includes(lowerSearch) ||
          i.employeeId.toLowerCase().includes(lowerSearch) ||
          i.referenceNumber.toLowerCase().includes(lowerSearch) ||
          i.title.toLowerCase().includes(lowerSearch) ||
          i.department.toLowerCase().includes(lowerSearch)
      );
    }

    // Filter by Date Range
    if (startDate) {
      const startMs = new Date(startDate).getTime();
      allItems = allItems.filter((i) => new Date(i.submittedAt).getTime() >= startMs);
    }
    if (endDate) {
      const endMs = new Date(endDate).getTime() + 86400000;
      allItems = allItems.filter((i) => new Date(i.submittedAt).getTime() <= endMs);
    }

    // Sort by submittedAt descending
    allItems.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    // Flag Self-Approval Protection
    let callerEmployeeId = auth.employeeId;
    if (!callerEmployeeId && (auth.userId || auth.email)) {
      const linkedEmp = await db.collection('employees').findOne({
        organizationId: orgId,
        $or: [
          ...(auth.userId ? [{ userId: auth.userId }, { id: auth.userId }] : []),
          ...(auth.email ? [{ email: auth.email }] : []),
        ],
      });
      if (linkedEmp?.employeeId) callerEmployeeId = linkedEmp.employeeId;
    }

    allItems = allItems.map((item) => {
      const isSelf = Boolean(callerEmployeeId && item.employeeId === callerEmployeeId);
      return {
        ...item,
        canApprove: !isSelf,
      };
    });

    // Pagination
    const totalCount = allItems.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = allItems.slice(startIndex, startIndex + limit);

    // Calculate Summary Stats
    const pendingCount = allItems.filter((i) => i.status === 'PENDING').length;
    const nowMonth = new Date().getMonth();
    const nowYear = new Date().getFullYear();

    const approvedThisMonthCount = allItems.filter((i) => {
      const d = new Date(i.updatedAt || i.submittedAt);
      return i.status === 'APPROVED' && d.getMonth() === nowMonth && d.getFullYear() === nowYear;
    }).length;

    const rejectedThisMonthCount = allItems.filter((i) => {
      const d = new Date(i.updatedAt || i.submittedAt);
      return i.status === 'REJECTED' && d.getMonth() === nowMonth && d.getFullYear() === nowYear;
    }).length;

    return NextResponse.json({
      success: true,
      data: {
        approvals: paginatedItems,
        stats: {
          pendingCount,
          approvedThisMonthCount,
          rejectedThisMonthCount,
          avgProcessingTimeHours: 4.2,
        },
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit) || 1,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching HR approval queue:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch approval queue.' },
      { status: 500 }
    );
  }
}

// POST /api/v1/approvals - Process Approve / Reject action on target request
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    if (auth.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Employees cannot process approval actions.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { requestId, requestType, sourceCollection, action, comments } = body;

    if (!requestId || !requestType || !action) {
      return NextResponse.json(
        { success: false, message: 'Request ID, request type, and action (APPROVE/REJECT) are required.' },
        { status: 400 }
      );
    }

    const normalizedAction = action.toString().toUpperCase();
    if (normalizedAction !== 'APPROVE' && normalizedAction !== 'REJECT') {
      return NextResponse.json(
        { success: false, message: 'Invalid action. Action must be "APPROVE" or "REJECT".' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();

    // Determine target collection
    let targetCollection = sourceCollection;
    if (!targetCollection) {
      if (requestType === 'LEAVE') targetCollection = 'leaves';
      else if (requestType === 'ATTENDANCE_CORRECTION') targetCollection = 'attendance_corrections';
      else if (requestType === 'WFH') targetCollection = 'wfh_requests';
      else targetCollection = 'hr_requests';
    }

    const targetObjId = ObjectId.isValid(requestId) ? new ObjectId(requestId) : requestId;
    const query: any = { organizationId: orgId };
    if (ObjectId.isValid(requestId)) {
      query.$or = [{ _id: new ObjectId(requestId) }, { id: requestId }];
    } else {
      query.id = requestId;
    }

    const targetDoc = await db.collection(targetCollection).findOne(query);
    if (!targetDoc) {
      return NextResponse.json(
        { success: false, message: `Target request not found in ${targetCollection}.` },
        { status: 404 }
      );
    }

    // -----------------------------------------------------------------
    // SECURITY CHECK 1: SELF-APPROVAL PROTECTION
    // -----------------------------------------------------------------
    const isSelfApproval = await checkIsSelfApproval({
      auth,
      targetEmployeeId: targetDoc.employeeId,
      targetDoc,
      db,
      organizationId: orgId,
    });

    if (isSelfApproval) {
      return NextResponse.json(
        {
          success: false,
          message: 'Forbidden: Self-approval is strictly forbidden. You cannot approve or reject your own request.',
        },
        { status: 403 }
      );
    }

    // -----------------------------------------------------------------
    // SECURITY CHECK 2: MANAGER SCOPE AUTHORIZATION
    // -----------------------------------------------------------------
    if (auth.role === 'MANAGER' && auth.employeeId) {
      const isTeamMember = await db.collection('employees').findOne({
        organizationId: orgId,
        employeeId: targetDoc.employeeId,
        $or: [{ managerId: auth.employeeId }, { reportingTo: auth.employeeId }],
      });
      if (!isTeamMember) {
        return NextResponse.json(
          { success: false, message: 'Forbidden: You can only process requests for employees in your direct team.' },
          { status: 403 }
        );
      }
    }

    // -----------------------------------------------------------------
    // WORK FROM HOME REQUEST PROCESSING
    // -----------------------------------------------------------------
    if (requestType === 'WFH' || targetCollection === 'wfh_requests') {
      const decision = await decideWfhRequest(db, {
        organizationId: orgId,
        request: targetDoc,
        action: normalizedAction === 'APPROVE' ? 'APPROVE' : 'REJECT',
        comments,
        decidedBy: { name: auth.name || auth.email || 'Approver', userId: auth.userId, role: auth.role },
        now,
      });
      if (!decision.ok) {
        return NextResponse.json({ success: false, message: decision.message }, { status: decision.status });
      }
      await logAuditEvent(req, normalizedAction === 'APPROVE' ? 'WFH_APPROVED' : 'WFH_REJECTED', {
        employeeId: targetDoc.employeeId,
        details: { date: targetDoc.date, comments: comments || '', extendedTo: decision.extendedTo || null },
      });
      return NextResponse.json({ success: true, message: decision.message, data: decision.request });
    }

    // -----------------------------------------------------------------
    // BUSINESS LOGIC & ATOMIC STATE TRANSITION
    // -----------------------------------------------------------------
    const newStatus = normalizedAction === 'APPROVE' ? 'Approved' : 'Rejected';
    const historyItem = {
      action: normalizedAction === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const),
      performedBy: auth.name || auth.userId,
      performedById: auth.userId,
      role: auth.role,
      timestamp: now.toISOString(),
      comments: comments ? comments.trim() : undefined,
    };

    // 1. LEAVE REQUEST PROCESSING
    if (requestType === 'LEAVE' || targetCollection === 'leaves') {
      const currentStatus = targetDoc.status || 'Pending';
      if (currentStatus.toLowerCase() !== 'pending') {
        return NextResponse.json(
          { success: false, message: `Conflict: Leave request is already ${currentStatus.toLowerCase()}.` },
          { status: 409 }
        );
      }

      const updateRes = await db.collection('leaves').updateOne(
        { _id: targetDoc._id, organizationId: orgId, status: currentStatus },
        {
          $set: {
            status: newStatus,
            approvedBy: normalizedAction === 'APPROVE' ? auth.name : undefined,
            approvedAt: normalizedAction === 'APPROVE' ? now : undefined,
            rejectedBy: normalizedAction === 'REJECT' ? auth.name : undefined,
            rejectedAt: normalizedAction === 'REJECT' ? now : undefined,
            adminComments: comments ? comments.trim() : undefined,
            updatedAt: now.toISOString(),
          },
          $push: { history: historyItem } as any,
        }
      );

      if (updateRes.modifiedCount === 0) {
        return NextResponse.json(
          { success: false, message: 'Conflict: Leave request was modified by another user.' },
          { status: 409 }
        );
      }

      // Update Leave Balances
      const durationDays = Number(targetDoc.durationDays) || 1;
      const currentYear = new Date().getFullYear();
      const balanceDoc: any = await db.collection('leave_balances').findOne({
        organizationId: orgId,
        employeeId: targetDoc.employeeId,
        year: currentYear,
      });

      if (balanceDoc?.balances) {
        const typeKey = Object.keys(balanceDoc.balances).find(
          (k) => k.toLowerCase() === (targetDoc.leaveType || '').toLowerCase()
        ) || targetDoc.leaveType;

        const cat = balanceDoc.balances[typeKey] || { total: 12, used: 0, pending: 0, remaining: 12 };
        if (normalizedAction === 'APPROVE') {
          await db.collection('leave_balances').updateOne(
            { _id: balanceDoc._id },
            {
              $inc: {
                [`balances.${typeKey}.pending`]: -durationDays,
                [`balances.${typeKey}.used`]: durationDays,
                [`balances.${typeKey}.remaining`]: -durationDays,
              },
              $set: { updatedAt: now.toISOString() },
            }
          );

          // Synchronize attendance records on approved leave
          try {
            const orgSettings = await db.collection('organization_settings').findOne({ organizationId: orgId });
            await reconcileAttendanceForLeaveRange({
              db,
              organizationId: orgId,
              employeeId: targetDoc.employeeId,
              startDate: targetDoc.startDate,
              endDate: targetDoc.endDate || targetDoc.startDate,
              employeeName: targetDoc.employeeName,
              now,
              shiftConfig: orgSettings?.attendance,
            });
          } catch (attErr) {
            console.error('Error synchronizing attendance from approvals endpoint:', attErr);
          }
        } else {
          await db.collection('leave_balances').updateOne(
            { _id: balanceDoc._id },
            {
              $inc: { [`balances.${typeKey}.pending`]: -durationDays },
              $set: { updatedAt: now.toISOString() },
            }
          );
        }
      }

      // Notification
      const durationText = formatLeaveDurationText(targetDoc);
      await createNotification({
        organizationId: orgId,
        recipientType: 'EMPLOYEE',
        recipientId: targetDoc.employeeId,
        eventType: normalizedAction === 'APPROVE' ? 'leave_approved' : 'leave_rejected',
        eventId: `leave:${targetDoc._id.toString()}:${normalizedAction.toLowerCase()}`,
        category: 'LEAVE',
        title: `Leave Request ${newStatus}${targetDoc.isUrgent ? ' (Urgent)' : ''}`,
        message: `Your ${targetDoc.isUrgent ? 'urgent ' : ''}${targetDoc.leaveType} leave request for ${durationText} has been ${newStatus.toLowerCase()}.${
          comments ? ` Comments: ${comments}` : ''
        }`,
        priority: 'HIGH',
        actionUrl: '/employee/leave',
      });

      await logAuditEvent(req, `LEAVE_${normalizedAction}`, {
        details: { leaveId: targetDoc._id.toString(), employeeId: targetDoc.employeeId, comments },
      });

      return NextResponse.json({
        success: true,
        message: `Leave request ${newStatus.toLowerCase()} successfully.`,
      });
    }

    // 2. ATTENDANCE CORRECTION PROCESSING
    if (requestType === 'ATTENDANCE_CORRECTION' || targetCollection === 'attendance_corrections' || targetCollection === 'attendance') {
      const updateRes = await db.collection(targetCollection).updateOne(
        { _id: targetDoc._id, organizationId: orgId },
        {
          $set: {
            status: newStatus,
            correctionStatus: newStatus,
            approvedBy: auth.name,
            adminComments: comments ? comments.trim() : undefined,
            updatedAt: now.toISOString(),
          },
          $push: { history: historyItem } as any,
        }
      );

      if (updateRes.modifiedCount === 0) {
        return NextResponse.json(
          { success: false, message: 'Conflict: Attendance correction request was modified.' },
          { status: 409 }
        );
      }

      // If approved, update main attendance record
      if (normalizedAction === 'APPROVE' && targetDoc.date) {
        await db.collection('attendance').updateOne(
          { organizationId: orgId, employeeId: targetDoc.employeeId, date: targetDoc.date },
          {
            $set: {
              status: 'Present',
              checkIn: targetDoc.checkIn || targetDoc.requestedCheckIn || '09:30 AM',
              checkOut: targetDoc.checkOut || targetDoc.requestedCheckOut || '06:30 PM',
              correctionRequested: false,
              correctionStatus: 'Approved',
              updatedAt: now.toISOString(),
            },
          }
        );
      }

      await createNotification({
        organizationId: orgId,
        recipientType: 'EMPLOYEE',
        recipientId: targetDoc.employeeId,
        eventType: normalizedAction === 'APPROVE' ? 'attendance_approved' : 'attendance_rejected',
        eventId: `att:${targetDoc._id.toString()}:${normalizedAction.toLowerCase()}`,
        category: 'ATTENDANCE',
        title: `Attendance Correction ${newStatus}`,
        message: `Your attendance regularization for ${targetDoc.date || 'missed punch'} was ${newStatus.toLowerCase()}.`,
        priority: 'NORMAL',
        actionUrl: '/employee/attendance',
      });

      await logAuditEvent(req, `ATTENDANCE_CORRECTION_${normalizedAction}`, {
        details: { requestId: targetDoc._id.toString(), employeeId: targetDoc.employeeId, comments },
      });

      return NextResponse.json({
        success: true,
        message: `Attendance correction request ${newStatus.toLowerCase()} successfully.`,
      });
    }

    // 3. HR REQUESTS (PROFILE CHANGE, ASSET REQUEST, RESIGNATION)
    const updateRes = await db.collection('hr_requests').updateOne(
      { _id: targetDoc._id, organizationId: orgId },
      {
        $set: {
          status: normalizedAction === 'APPROVE' ? 'Resolved' : 'Rejected',
          resolution: comments ? comments.trim() : `Request ${newStatus.toLowerCase()} by HR.`,
          updatedAt: now.toISOString(),
        },
        $push: { history: historyItem } as any,
      }
    );

    if (updateRes.modifiedCount === 0) {
      return NextResponse.json(
        { success: false, message: 'Conflict: HR request was modified by another user.' },
        { status: 409 }
      );
    }

    // If PROFILE_CHANGE & Approved -> apply profile updates
    if (requestType === 'PROFILE_CHANGE' && normalizedAction === 'APPROVE' && targetDoc.requestedChanges) {
      await db.collection('employees').updateOne(
        { organizationId: orgId, employeeId: targetDoc.employeeId },
        { $set: { ...targetDoc.requestedChanges, updatedAt: now.toISOString() } }
      );
    }

    // If RESIGNATION & Approved -> update employee status
    if (requestType === 'RESIGNATION' && normalizedAction === 'APPROVE') {
      await db.collection('employees').updateOne(
        { organizationId: orgId, employeeId: targetDoc.employeeId },
        { $set: { status: 'Resigned', updatedAt: now.toISOString() } }
      );
    }

    await createNotification({
      organizationId: orgId,
      recipientType: 'EMPLOYEE',
      recipientId: targetDoc.employeeId,
      eventType: 'hr_request_updated',
      eventId: `hr_req:${targetDoc._id.toString()}:${normalizedAction.toLowerCase()}`,
      category: 'SYSTEM',
      title: `${requestType.replace('_', ' ')} Request ${newStatus}`,
      message: `Your request (${targetDoc.ticketNo || targetDoc.subject}) was ${newStatus.toLowerCase()}.${
        comments ? ` Comments: ${comments}` : ''
      }`,
      priority: 'HIGH',
      actionUrl: '/employee/helpdesk',
    });

    await logAuditEvent(req, `APPROVAL_ACTION_${normalizedAction}`, {
      details: { requestId: targetDoc._id.toString(), requestType, employeeId: targetDoc.employeeId, comments },
    });

    return NextResponse.json({
      success: true,
      message: `${requestType.replace('_', ' ')} request ${newStatus.toLowerCase()} successfully.`,
    });
  } catch (error: any) {
    console.error('Error processing approval action:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to process approval action.' },
      { status: 500 }
    );
  }
}
