import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { getISTDateString } from '@/lib/dateUtils';
import { parseGeo, loadAttendanceRules, getGeofenceConfig, evaluateGeofence } from '@/lib/geo';
import { loadEmployeePolicy, findOpenAttendance, ensureActiveTrackingSession } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/tracking/start
 * Body: { consent: true, geo?: {lat, lng, accuracy} }
 * Starts (or resumes) today's tracking session for the calling employee.
 * When the organization's policy does not require consent, this also runs automatically
 * right at check-in (see the CLOCK_IN handler in /api/v1/attendance) — an explicit call here
 * simply resumes that same session, so it is safe to call unconditionally from the client.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }
    const employeeId = auth.employeeId;
    if (!employeeId) {
      return NextResponse.json({ success: false, message: 'No employee profile linked to this account.' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();
    const today = getISTDateString(now);

    const policy = await loadEmployeePolicy(db, orgId, employeeId);
    if (!policy.enabled) {
      return NextResponse.json(
        {
          success: false,
          code: 'TRACKING_DISABLED',
          message: policy.exempted
            ? 'You are exempted from live tracking.'
            : 'Live tracking is not enabled for your organization.',
        },
        { status: 403 }
      );
    }
    if (policy.requireConsent && body.consent !== true) {
      return NextResponse.json(
        { success: false, code: 'CONSENT_REQUIRED', message: 'You must accept the location-sharing notice to start tracking.' },
        { status: 400 }
      );
    }

    const attendance = await findOpenAttendance(db, employeeId, today);
    if (!attendance) {
      return NextResponse.json(
        { success: false, code: 'NOT_CHECKED_IN', message: 'Check in first. Tracking runs only while you are checked in.' },
        { status: 409 }
      );
    }

    const geo = parseGeo(body.geo);
    let fenceResult: { withinGeofence: boolean; distanceMeters: number } | null = null;
    if (geo) {
      const fence = getGeofenceConfig(await loadAttendanceRules(db, orgId));
      if (fence) fenceResult = evaluateGeofence(geo, fence);
    }

    const session = await ensureActiveTrackingSession(
      db,
      orgId,
      employeeId,
      attendance.employeeName || auth.name || 'Employee',
      today,
      geo,
      fenceResult,
      now
    );

    if (!session.resumed) {
      await logAuditEvent(req, 'TRACKING_START', { employeeId, details: { sessionId: session.sessionId, consent: policy.requireConsent, auto: false } });
    }

    return NextResponse.json({
      success: true,
      resumed: session.resumed,
      session: { id: session.sessionId, startedAt: session.startedAt },
      pingIntervalSeconds: policy.pingIntervalSeconds,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/tracking/start:', error);
    return NextResponse.json({ success: false, message: 'Failed to start tracking.' }, { status: 500 });
  }
}
