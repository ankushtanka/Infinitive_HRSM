import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { createNotification } from '@/lib/notifications/notificationService';
import { ObjectId } from 'mongodb';
import { formatLeaveDurationText, reconcileAttendanceForLeaveRange, checkIsSelfApproval } from '@/lib/leaveUtils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const leaveId = params.id;

    let query: any = { organizationId: orgId };
    if (ObjectId.isValid(leaveId)) {
      query.$or = [{ _id: new ObjectId(leaveId) }, { id: leaveId }];
    } else {
      query.id = leaveId;
    }

    const leaveDoc = await db.collection('leaves').findOne(query);
    if (!leaveDoc) {
      return NextResponse.json({ success: false, message: 'Leave request not found.' }, { status: 404 });
    }

    // Permission check for employee
    if (auth.role === 'EMPLOYEE' && leaveDoc.employeeId !== auth.employeeId) {
      return NextResponse.json({ success: false, message: 'Unauthorized access to leave request.' }, { status: 403 });
    }

    // Permission check for manager
    if (auth.role === 'MANAGER' && auth.employeeId) {
      const isTeamMember = await db.collection('employees').findOne({
        organizationId: orgId,
        employeeId: leaveDoc.employeeId,
        $or: [{ managerId: auth.employeeId }, { reportingTo: auth.employeeId }, { employeeId: auth.employeeId }],
      });
      if (!isTeamMember) {
        return NextResponse.json({ success: false, message: 'Unauthorized to view team member request.' }, { status: 403 });
      }
    }

    // Fetch employee details
    const employee = await db.collection('employees').findOne({
      organizationId: orgId,
      employeeId: leaveDoc.employeeId,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...leaveDoc,
        id: leaveDoc.id || leaveDoc._id.toString(),
        isUrgent: Boolean(leaveDoc.isUrgent),
        durationType: leaveDoc.durationType || 'FULL_DAY',
        session: leaveDoc.session || null,
        requestedStartTime: leaveDoc.requestedStartTime || null,
        requestedEndTime: leaveDoc.requestedEndTime || null,
        requestedHours: leaveDoc.requestedHours || null,
        durationDays: Number(leaveDoc.durationDays) || 1,
        department: employee?.department || leaveDoc.department || 'General',
        designation: employee?.designation || leaveDoc.designation || 'Team Member',
        email: employee?.email || '',
        phone: employee?.phone || '',
        history: leaveDoc.history || [],
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch leave request detail' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const leaveId = params.id;
    const body = await req.json();
    const { action, status, rejectionReason, adminComments, comments } = body;

    const targetStatus = (status || action || '').toString().trim();
    const normalizedStatus =
      targetStatus.toLowerCase() === 'approved' || targetStatus.toLowerCase() === 'approve'
        ? 'Approved'
        : targetStatus.toLowerCase() === 'rejected' || targetStatus.toLowerCase() === 'reject'
        ? 'Rejected'
        : targetStatus.toLowerCase() === 'cancelled' || targetStatus.toLowerCase() === 'cancel'
        ? 'Cancelled'
        : null;

    if (!normalizedStatus) {
      return NextResponse.json(
        { success: false, message: 'Invalid action/status. Must be Approved, Rejected, or Cancelled.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();

    let query: any = { organizationId: orgId };
    if (ObjectId.isValid(leaveId)) {
      query.$or = [{ _id: new ObjectId(leaveId) }, { id: leaveId }];
    } else {
      query.id = leaveId;
    }

    const leaveDoc = await db.collection('leaves').findOne(query);
    if (!leaveDoc) {
      return NextResponse.json({ success: false, message: 'Leave request not found.' }, { status: 404 });
    }

    const currentStatus = leaveDoc.status || 'Pending';
    const durationDays = Number(leaveDoc.durationDays) || 1;
    const empId = leaveDoc.employeeId;
    const leaveType = leaveDoc.leaveType;
    const currentYear = new Date().getFullYear();
    const durationText = formatLeaveDurationText(leaveDoc);

    // -------------------------------------------------------------
    // SECURITY CHECK 1: EMPLOYEE ROLE RESTRICTIONS
    // -------------------------------------------------------------
    if (auth.role === 'EMPLOYEE') {
      if (empId !== auth.employeeId) {
        return NextResponse.json({ success: false, message: 'Forbidden: You can only manage your own leave requests.' }, { status: 403 });
      }
      if (normalizedStatus !== 'Cancelled') {
        return NextResponse.json({ success: false, message: 'Forbidden: Employees can only cancel their own leave requests.' }, { status: 403 });
      }
    }

    // -------------------------------------------------------------
    // SECURITY CHECK 2: STRICT SELF-APPROVAL PREVENTION
    // -------------------------------------------------------------
    if (normalizedStatus === 'Approved' || normalizedStatus === 'Rejected') {
      const isSelf = await checkIsSelfApproval({
        auth,
        targetEmployeeId: empId,
        targetDoc: leaveDoc,
        db,
        organizationId: orgId,
      });

      if (isSelf) {
        return NextResponse.json(
          { success: false, message: 'Forbidden: Self-approval is strictly forbidden. You cannot approve or reject your own leave request.' },
          { status: 403 }
        );
      }
    }

    // -------------------------------------------------------------
    // SECURITY CHECK 3: MANAGER TEAM SCOPE RESTRICTIONS
    // -------------------------------------------------------------
    if (auth.role === 'MANAGER' && auth.employeeId) {
      const isTeamMember = await db.collection('employees').findOne({
        organizationId: orgId,
        employeeId: empId,
        $or: [{ managerId: auth.employeeId }, { reportingTo: auth.employeeId }],
      });
      if (!isTeamMember) {
        return NextResponse.json(
          { success: false, message: 'Forbidden: You can only process leave requests for employees in your direct team.' },
          { status: 403 }
        );
      }
    }

    // History step record
    const decisionComments = (adminComments || comments || rejectionReason || '').trim();
    const historyItem = {
      action: normalizedStatus.toUpperCase(),
      performedBy: auth.name || auth.userId,
      performedById: auth.userId,
      role: auth.role,
      timestamp: now.toISOString(),
      comments: decisionComments || undefined,
    };

    // -------------------------------------------------------------
    // ACTION: APPROVE
    // -------------------------------------------------------------
    if (normalizedStatus === 'Approved') {
      if (currentStatus === 'Approved') {
        return NextResponse.json({ success: false, message: 'Leave request is already approved.' }, { status: 409 });
      }
      if (currentStatus !== 'Pending') {
        return NextResponse.json({ success: false, message: `Cannot approve leave request in "${currentStatus}" state.` }, { status: 400 });
      }

      // ATOMIC UPDATE PRECONDITION (status MUST still be Pending in DB)
      const updateResult = await db.collection('leaves').updateOne(
        { _id: leaveDoc._id, organizationId: orgId, status: 'Pending' },
        {
          $set: {
            status: 'Approved',
            approvedBy: auth.name || 'HR Admin',
            approvedAt: now,
            adminComments: decisionComments || undefined,
            updatedAt: now,
          },
          $push: { history: historyItem } as any,
        }
      );

      if (updateResult.modifiedCount === 0) {
        return NextResponse.json(
          { success: false, message: 'Conflict: Leave request has already been processed or status changed by another user.' },
          { status: 409 }
        );
      }

      // Deduct balance from leave_balances atomically using $inc (handling fractional days)
      const balanceDoc: any = await db.collection('leave_balances').findOne({
        organizationId: orgId,
        employeeId: empId,
        year: currentYear,
      });

      if (balanceDoc?.balances) {
        const typeKey = Object.keys(balanceDoc.balances).find(
          (k) => k.toLowerCase() === leaveType.toLowerCase()
        ) || leaveType;

        await db.collection('leave_balances').updateOne(
          { _id: balanceDoc._id },
          {
            $inc: {
              [`balances.${typeKey}.pending`]: -durationDays,
              [`balances.${typeKey}.used`]: durationDays,
              [`balances.${typeKey}.remaining`]: -durationDays,
            },
            $set: { updatedAt: now },
          }
        );
      }

      // -------------------------------------------------------------
      // ATTENDANCE INTEGRATION ON APPROVED LEAVE
      // -------------------------------------------------------------
      try {
        const orgSettings = await db.collection('organization_settings').findOne({ organizationId: orgId });
        await reconcileAttendanceForLeaveRange({
          db,
          organizationId: orgId,
          employeeId: empId,
          startDate: leaveDoc.startDate,
          endDate: leaveDoc.endDate || leaveDoc.startDate,
          employeeName: leaveDoc.employeeName,
          now,
          shiftConfig: orgSettings?.attendance,
        });
      } catch (attErr) {
        console.error('Error integrating attendance with approved leave:', attErr);
      }

      // Idempotent Notification
      await createNotification({
        organizationId: orgId,
        recipientType: 'EMPLOYEE',
        recipientId: empId,
        eventType: 'leave_approved',
        eventId: `leave:${leaveDoc._id.toString()}:approved`,
        category: 'LEAVE',
        title: `Leave Request Approved${leaveDoc.isUrgent ? ' (Urgent)' : ''}`,
        message: `Your ${leaveDoc.isUrgent ? 'urgent ' : ''}${leaveType} leave request for ${durationText} (${leaveDoc.startDate} to ${leaveDoc.endDate}) has been approved.${decisionComments ? ` Comments: "${decisionComments}"` : ''}`,
        priority: 'HIGH',
        actionUrl: '/employee/leave',
        metadata: { leaveId: leaveDoc._id.toString(), durationDays, isUrgent: leaveDoc.isUrgent },
      });

      await logAuditEvent(req, 'LEAVE_APPROVED', {
        details: {
          leaveId: leaveDoc._id.toString(),
          employeeId: empId,
          durationDays,
          isUrgent: leaveDoc.isUrgent,
          durationType: leaveDoc.durationType,
          comments: decisionComments,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Leave request approved successfully for ${leaveDoc.employeeName}.`,
        data: { ...leaveDoc, status: 'Approved' },
      });
    }

    // -------------------------------------------------------------
    // ACTION: REJECT
    // -------------------------------------------------------------
    if (normalizedStatus === 'Rejected') {
      if (currentStatus === 'Rejected') {
        return NextResponse.json({ success: false, message: 'Leave request is already rejected.' }, { status: 409 });
      }
      if (currentStatus !== 'Pending') {
        return NextResponse.json({ success: false, message: `Cannot reject leave request in "${currentStatus}" state.` }, { status: 400 });
      }

      const reasonToSave = (rejectionReason || decisionComments || '').trim();
      if (!reasonToSave) {
        return NextResponse.json({ success: false, message: 'Rejection reason is required when rejecting a leave request.' }, { status: 400 });
      }

      // ATOMIC UPDATE PRECONDITION (status MUST still be Pending in DB)
      const updateResult = await db.collection('leaves').updateOne(
        { _id: leaveDoc._id, organizationId: orgId, status: 'Pending' },
        {
          $set: {
            status: 'Rejected',
            rejectionReason: reasonToSave,
            rejectedBy: auth.name || 'HR Admin',
            rejectedAt: now,
            updatedAt: now,
          },
          $push: { history: historyItem } as any,
        }
      );

      if (updateResult.modifiedCount === 0) {
        return NextResponse.json(
          { success: false, message: 'Conflict: Leave request has already been processed or status changed.' },
          { status: 409 }
        );
      }

      // Restore pending count atomically using $inc
      const balanceDoc: any = await db.collection('leave_balances').findOne({
        organizationId: orgId,
        employeeId: empId,
        year: currentYear,
      });

      if (balanceDoc?.balances) {
        const typeKey = Object.keys(balanceDoc.balances).find(
          (k) => k.toLowerCase() === leaveType.toLowerCase()
        ) || leaveType;

        await db.collection('leave_balances').updateOne(
          { _id: balanceDoc._id },
          {
            $inc: { [`balances.${typeKey}.pending`]: -durationDays },
            $set: { updatedAt: now },
          }
        );
      }

      // Idempotent Notification
      await createNotification({
        organizationId: orgId,
        recipientType: 'EMPLOYEE',
        recipientId: empId,
        eventType: 'leave_rejected',
        eventId: `leave:${leaveDoc._id.toString()}:rejected`,
        category: 'LEAVE',
        title: `Leave Request Rejected${leaveDoc.isUrgent ? ' (Urgent)' : ''}`,
        message: `Your ${leaveDoc.isUrgent ? 'urgent ' : ''}${leaveType} request for ${durationText} was rejected. Reason: ${reasonToSave}`,
        priority: 'HIGH',
        actionUrl: '/employee/leave',
        metadata: { leaveId: leaveDoc._id.toString(), rejectionReason: reasonToSave },
      });

      await logAuditEvent(req, 'LEAVE_REJECTED', {
        details: { leaveId: leaveDoc._id.toString(), employeeId: empId, rejectionReason: reasonToSave },
      });

      return NextResponse.json({
        success: true,
        message: `Leave request rejected for ${leaveDoc.employeeName}.`,
        data: { ...leaveDoc, status: 'Rejected', rejectionReason: reasonToSave },
      });
    }

    // -------------------------------------------------------------
    // ACTION: CANCEL
    // -------------------------------------------------------------
    if (normalizedStatus === 'Cancelled') {
      if (currentStatus === 'Cancelled') {
        return NextResponse.json({ success: false, message: 'Leave request is already cancelled.' }, { status: 409 });
      }

      // ATOMIC UPDATE PRECONDITION (status MUST match currentStatus)
      const updateResult = await db.collection('leaves').updateOne(
        { _id: leaveDoc._id, organizationId: orgId, status: currentStatus },
        {
          $set: {
            status: 'Cancelled',
            cancelledBy: auth.name || 'User',
            cancelledAt: now,
            updatedAt: now,
          },
          $push: { history: historyItem } as any,
        }
      );

      if (updateResult.modifiedCount === 0) {
        return NextResponse.json(
          { success: false, message: 'Conflict: Leave request status was modified during operation.' },
          { status: 409 }
        );
      }

      // Restore balances atomically using $inc
      const balanceDoc: any = await db.collection('leave_balances').findOne({
        organizationId: orgId,
        employeeId: empId,
        year: currentYear,
      });

      if (balanceDoc?.balances) {
        const typeKey = Object.keys(balanceDoc.balances).find(
          (k) => k.toLowerCase() === leaveType.toLowerCase()
        ) || leaveType;

        if (currentStatus === 'Pending') {
          await db.collection('leave_balances').updateOne(
            { _id: balanceDoc._id },
            {
              $inc: { [`balances.${typeKey}.pending`]: -durationDays },
              $set: { updatedAt: now },
            }
          );
        } else if (currentStatus === 'Approved') {
          // Restore used and remaining balances cleanly
          await db.collection('leave_balances').updateOne(
            { _id: balanceDoc._id },
            {
              $inc: {
                [`balances.${typeKey}.used`]: -durationDays,
                [`balances.${typeKey}.remaining`]: durationDays,
              },
              $set: { updatedAt: now },
            }
          );
        }
      }

      // Reconcile attendance on cancellation (restores remaining leaves or physical punches)
      if (currentStatus === 'Approved') {
        try {
          const orgSettings = await db.collection('organization_settings').findOne({ organizationId: orgId });
          await reconcileAttendanceForLeaveRange({
            db,
            organizationId: orgId,
            employeeId: empId,
            startDate: leaveDoc.startDate,
            endDate: leaveDoc.endDate || leaveDoc.startDate,
            employeeName: leaveDoc.employeeName,
            now,
            shiftConfig: orgSettings?.attendance,
          });
        } catch (attErr) {
          console.error('Error reconciling attendance on leave cancellation:', attErr);
        }
      }

      // Idempotent Notification
      await createNotification({
        organizationId: orgId,
        recipientType: auth.role === 'EMPLOYEE' ? 'ADMIN' : 'EMPLOYEE',
        recipientId: auth.role === 'EMPLOYEE' ? (leaveDoc.managerId || 'ADMIN') : empId,
        eventType: 'leave_cancelled',
        eventId: `leave:${leaveDoc._id.toString()}:cancelled`,
        category: 'LEAVE',
        title: 'Leave Request Cancelled',
        message: `${leaveDoc.employeeName}'s ${leaveType} leave request (${durationText}) has been cancelled.`,
        priority: 'NORMAL',
        actionUrl: '/admin/leave',
        metadata: { leaveId: leaveDoc._id.toString() },
      });

      await logAuditEvent(req, 'LEAVE_CANCELLED', {
        details: { leaveId: leaveDoc._id.toString(), employeeId: empId, previousStatus: currentStatus },
      });

      return NextResponse.json({
        success: true,
        message: 'Leave request cancelled successfully.',
        data: { ...leaveDoc, status: 'Cancelled' },
      });
    }

    return NextResponse.json({ success: false, message: 'Unhandled action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Failed to update leave request status' }, { status: 500 });
  }
}
