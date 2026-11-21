import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { getISTDateString } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

/** PATCH /api/v1/wfh/:id { action: 'CANCEL' } - withdraw your own pending request for a future day. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    if (String(body.action || '').toUpperCase() !== 'CANCEL') {
      return NextResponse.json(
        { success: false, message: 'Only CANCEL is supported here. Approve or reject from the Approval Center.' },
        { status: 400 }
      );
    }
    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json({ success: false, message: 'Request not found.' }, { status: 404 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const request: any = await db.collection('wfh_requests').findOne({ _id: new ObjectId(params.id), organizationId: orgId });
    if (!request || request.employeeId !== auth.employeeId) {
      return NextResponse.json({ success: false, message: 'Request not found.' }, { status: 404 });
    }
    if (request.status !== 'Pending') {
      return NextResponse.json({ success: false, message: `This request is already ${String(request.status).toLowerCase()}.` }, { status: 409 });
    }
    if (request.date <= getISTDateString(new Date())) {
      return NextResponse.json({ success: false, message: 'Requests for today or earlier cannot be cancelled.' }, { status: 409 });
    }

    const now = new Date();
    await db.collection('wfh_requests').updateOne(
      { _id: request._id },
      {
        $set: {
          status: 'Cancelled',
          updatedAt: now,
          history: [
            ...(Array.isArray(request.history) ? request.history : []),
            { action: 'CANCELLED', performedBy: auth.name || auth.employeeId, performedById: auth.userId, role: auth.role, timestamp: now.toISOString() },
          ],
        },
      }
    );
    await logAuditEvent(req, 'WFH_CANCELLED', { employeeId: auth.employeeId, details: { date: request.date } });

    return NextResponse.json({ success: true, message: `Work From Home request for ${request.date} cancelled.` });
  } catch (error: any) {
    console.error('Error in PATCH /api/v1/wfh/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to cancel the request.' }, { status: 500 });
  }
}