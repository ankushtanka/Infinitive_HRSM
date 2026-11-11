import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { id } = params;
    const { db } = await connectToDatabase();

    const query: any = {
      $or: [{ id }, { _id: ObjectId.isValid(id) ? new ObjectId(id) : null }].filter(Boolean),
    };

    if (auth.role !== 'SUPER_ADMIN') {
      query.organizationId = auth.organizationId;
    }

    const alert = await db.collection('attendance_alerts').findOne(query);
    if (!alert) {
      return NextResponse.json({ success: false, message: 'Attendance alert not found.' }, { status: 404 });
    }

    // Role check: manager can only see their team, employee can only see own
    if (auth.role === 'EMPLOYEE' && alert.employeeId !== auth.employeeId) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: alert });
  } catch (error: any) {
    console.error('Error in GET /api/v1/attendance/alerts/[id]:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch alert.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { id } = params;
    const body = await req.json();
    const { status, resolutionNote } = body;

    const allowedStatuses = ['PENDING', 'SENT', 'READ', 'RESOLVED'];
    if (status && !allowedStatuses.includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid status value.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const query: any = {
      $or: [{ id }, { _id: ObjectId.isValid(id) ? new ObjectId(id) : null }].filter(Boolean),
    };
    if (auth.role !== 'SUPER_ADMIN') {
      query.organizationId = auth.organizationId;
    }

    const existingAlert = await db.collection('attendance_alerts').findOne(query);
    if (!existingAlert) {
      return NextResponse.json({ success: false, message: 'Attendance alert not found.' }, { status: 404 });
    }

    // Permissions: Resolving an alert requires HR, Admin, Super Admin, or assigned Manager
    if (status === 'RESOLVED') {
      const isElevated = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(auth.role);
      const isAssignedManager = auth.role === 'MANAGER' && existingAlert.managerId === auth.employeeId;
      if (!isElevated && !isAssignedManager) {
        return NextResponse.json(
          { success: false, message: 'Only Managers or Admins/HR can resolve attendance alerts.' },
          { status: 403 }
        );
      }
    }

    const now = new Date();
    const updateDoc: any = {
      updatedAt: now,
    };

    if (status) {
      updateDoc.status = status;
    }
    if (status === 'RESOLVED') {
      updateDoc.resolvedBy = auth.name || auth.email;
      updateDoc.resolvedAt = now;
      if (typeof resolutionNote === 'string') {
        updateDoc.resolutionNote = resolutionNote.trim();
      }
    } else if (typeof resolutionNote === 'string' && resolutionNote.trim()) {
      updateDoc.resolutionNote = resolutionNote.trim();
    }

    await db.collection('attendance_alerts').updateOne(
      { _id: existingAlert._id },
      { $set: updateDoc }
    );

    await logAuditEvent(req, 'ATTENDANCE_ALERT_UPDATE', {
      employeeId: existingAlert.employeeId,
      details: {
        alertId: existingAlert.id,
        status: status || existingAlert.status,
        resolutionNote,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance alert updated successfully.',
      data: { ...existingAlert, ...updateDoc },
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/v1/attendance/alerts/[id]:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update alert.' },
      { status: 500 }
    );
  }
}
