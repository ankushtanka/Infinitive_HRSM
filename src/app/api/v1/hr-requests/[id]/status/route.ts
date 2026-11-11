import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const VALID_TRANSITIONS: Record<string, string[]> = {
  Open: ['Assigned', 'In Progress', 'Resolved', 'Closed'],
  Assigned: ['In Progress', 'Open', 'Resolved', 'Closed'],
  'In Progress': ['Resolved', 'Assigned', 'Open', 'Closed'],
  Resolved: ['Closed', 'In Progress', 'Open'],
  Closed: ['Open'], // Re-open
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { id } = params;
    const body = await req.json();
    const { status: targetStatus } = body;

    if (!targetStatus) {
      return NextResponse.json({ success: false, message: 'Status field is required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    const ticketDoc = await db.collection('hr_requests').findOne({
      organizationId: orgId,
      $or: [{ id }, { ticketNo: id }],
    });

    if (!ticketDoc) {
      return NextResponse.json({ success: false, message: 'HR Support Ticket not found' }, { status: 404 });
    }

    // Access control for Employees
    if (auth.role === 'EMPLOYEE') {
      const empId = auth.employeeId || auth.userId;
      if (ticketDoc.employeeId !== empId && ticketDoc.employeeId !== auth.userId) {
        return NextResponse.json({ success: false, message: 'Forbidden. You can only update status of your own support tickets.' }, { status: 403 });
      }
    }

    // Access control for Managers
    if (auth.role === 'MANAGER') {
      const managerEmpId = auth.employeeId;
      if (!managerEmpId) {
        return NextResponse.json({ success: false, message: 'Forbidden. Manager employee profile missing.' }, { status: 403 });
      }

      const isTeamMember = await db.collection('employees').findOne({
        organizationId: orgId,
        $or: [{ employeeId: ticketDoc.employeeId }, { id: ticketDoc.employeeId }],
        $and: [
          { $or: [{ managerId: managerEmpId }, { reportingTo: managerEmpId }] },
        ],
      });

      const isAssigned = ticketDoc.assignedToId === managerEmpId || ticketDoc.assignedToId === auth.userId;

      if (!isTeamMember && !isAssigned) {
        return NextResponse.json({ success: false, message: 'Forbidden. Ticket does not belong to an authorized team member.' }, { status: 403 });
      }
    }

    const currentStatus = ticketDoc.status || 'Open';
    const allowed = VALID_TRANSITIONS[currentStatus] || ['Assigned', 'In Progress', 'Resolved', 'Closed'];

    if (!allowed.includes(targetStatus) && currentStatus !== targetStatus) {
      return NextResponse.json(
        { success: false, message: `Invalid status transition from "${currentStatus}" to "${targetStatus}".` },
        { status: 400 }
      );
    }

    const nowISO = new Date().toISOString();
    const historyItem = {
      action: `Status changed from ${currentStatus} to ${targetStatus}`,
      performedBy: auth.name || 'HR Admin',
      timestamp: nowISO,
    };

    const updateFields: any = {
      status: targetStatus,
      updatedAt: nowISO,
    };

    if (targetStatus === 'Resolved') updateFields.resolvedAt = nowISO;
    if (targetStatus === 'Closed') updateFields.closedAt = nowISO;

    await db.collection('hr_requests').updateOne(
      { _id: ticketDoc._id },
      {
        $set: updateFields,
        $push: { history: historyItem } as any,
      }
    );

    // Notify employee of status change
    const notifDoc = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: ticketDoc.employeeId,
      organizationId: orgId,
      title: `Ticket ${ticketDoc.ticketNo} Status: ${targetStatus}`,
      message: `Status of your HR request (${ticketDoc.subject}) updated to "${targetStatus}".`,
      category: 'system',
      priority: 'medium',
      isRead: false,
      link: '/employee/helpdesk',
      createdAt: nowISO,
      updatedAt: nowISO,
    };
    await db.collection('notifications').insertOne(notifDoc);

    // Audit Event
    await logAuditEvent(req, 'UPDATE_HR_TICKET_STATUS', {
      employeeId: ticketDoc.employeeId,
      oldValue: { status: currentStatus },
      newValue: { status: targetStatus },
      details: { ticketNo: ticketDoc.ticketNo },
    });

    return NextResponse.json({
      success: true,
      message: `Ticket ${ticketDoc.ticketNo} status updated to ${targetStatus}`,
      status: targetStatus,
    });
  } catch (error: any) {
    console.error('Error updating ticket status:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to update status' }, { status: 500 });
  }
}
