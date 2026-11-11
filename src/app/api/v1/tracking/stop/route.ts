import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { normalizeRole } from '@/lib/roleUtils';
import { logAuditEvent } from '@/lib/audit';
import { stopActiveSessions } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/tracking/stop
 * Body: { employeeId? }
 * - Employees stop their own session (always allowed).
 * - Admin / Super Admin may force-stop another employee's session (audited).
 * Idempotent: succeeds with stopped:false when nothing was running.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const role = normalizeRole(auth.role);
    const requested = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    const target = requested || auth.employeeId;
    if (!target) {
      return NextResponse.json({ success: false, message: 'No employee profile linked to this account.' }, { status: 400 });
    }

    const isForced = target !== auth.employeeId;
    if (isForced && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Only an Admin or Super Admin can stop another employee\'s tracking.' },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();
    const stopped = await stopActiveSessions(
      db,
      auth.organizationId,
      target,
      isForced ? 'AUTO_STOPPED' : 'STOPPED',
      isForced ? `forced_by_${role.toLowerCase()}` : 'employee_stopped'
    );

    if (stopped > 0) {
      await logAuditEvent(req, isForced ? 'TRACKING_FORCE_STOP' : 'TRACKING_STOP', { employeeId: target });
    }

    return NextResponse.json({ success: true, stopped: stopped > 0 });
  } catch (error: any) {
    console.error('Error in POST /api/v1/tracking/stop:', error);
    return NextResponse.json({ success: false, message: 'Failed to stop tracking.' }, { status: 500 });
  }
}
