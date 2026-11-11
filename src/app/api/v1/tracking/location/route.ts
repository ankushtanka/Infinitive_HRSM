import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { getISTDateString } from '@/lib/dateUtils';
import { parseGeo, loadAttendanceRules, getGeofenceConfig, evaluateGeofence } from '@/lib/geo';
import {
  TRACKING_COLLECTIONS,
  MIN_PING_GAP_MS,
  loadEmployeePolicy,
  findOpenAttendance,
  stopActiveSessions,
} from '@/lib/tracking';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/tracking/location
 * Body: { lat, lng, accuracy? }
 * Stores one location point for the caller's ACTIVE session. Refuses (and closes the session) if the
 * employee has checked out or tracking has since been disabled.
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
    const geo = parseGeo(body);
    if (!geo) {
      return NextResponse.json({ success: false, message: 'A valid lat/lng is required.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();
    const today = getISTDateString(now);

    const sessions = db.collection(TRACKING_COLLECTIONS.sessions);
    const session: any = await sessions.findOne({ organizationId: orgId, employeeId, status: 'ACTIVE' });
    if (!session) {
      return NextResponse.json(
        { success: false, code: 'NO_ACTIVE_SESSION', message: 'Tracking is not running. Start tracking first.' },
        { status: 409 }
      );
    }

    const policy = await loadEmployeePolicy(db, orgId, employeeId);
    if (!policy.enabled) {
      await stopActiveSessions(db, orgId, employeeId, 'AUTO_STOPPED', 'policy_disabled', now);
      return NextResponse.json(
        { success: false, code: 'TRACKING_DISABLED', message: 'Live tracking has been turned off.' },
        { status: 409 }
      );
    }

    const attendance = await findOpenAttendance(db, employeeId, today);
    if (!attendance || session.date !== today) {
      await stopActiveSessions(db, orgId, employeeId, 'AUTO_STOPPED', 'not_checked_in', now);
      return NextResponse.json(
        { success: false, code: 'NOT_CHECKED_IN', message: 'You are not checked in, so tracking has stopped.' },
        { status: 409 }
      );
    }

    if (session.lastLocationAt && now.getTime() - new Date(session.lastLocationAt).getTime() < MIN_PING_GAP_MS) {
      return NextResponse.json({ success: true, throttled: true });
    }

    const fence = getGeofenceConfig(await loadAttendanceRules(db, orgId));
    const fenceResult = fence ? evaluateGeofence(geo, fence) : null;

    await db.collection(TRACKING_COLLECTIONS.locations).insertOne({
      organizationId: orgId,
      employeeId,
      sessionId: session._id.toString(),
      date: today,
      lat: geo.lat,
      lng: geo.lng,
      accuracy: geo.accuracy ?? null,
      withinGeofence: fenceResult ? fenceResult.withinGeofence : null,
      distanceMeters: fenceResult ? fenceResult.distanceMeters : null,
      recordedAt: now, // server clock is the source of truth
      createdAt: now,
    });

    const set: Record<string, any> = {
      lastLat: geo.lat,
      lastLng: geo.lng,
      lastAccuracy: geo.accuracy ?? null,
      lastLocationAt: now,
      withinGeofence: fenceResult ? fenceResult.withinGeofence : null,
      distanceMeters: fenceResult ? fenceResult.distanceMeters : null,
    };
    const update: Record<string, any> = { $set: set, $inc: { pointCount: 1 } };
    if (fenceResult && !fenceResult.withinGeofence) {
      if (!session.outsideSince) set.outsideSince = now;
    } else {
      update.$unset = { outsideSince: '' };
    }
    await sessions.updateOne({ _id: session._id, status: 'ACTIVE' }, update);

    return NextResponse.json({
      success: true,
      withinGeofence: fenceResult ? fenceResult.withinGeofence : null,
      distanceMeters: fenceResult ? fenceResult.distanceMeters : null,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/tracking/location:', error);
    return NextResponse.json({ success: false, message: 'Failed to record location.' }, { status: 500 });
  }
}
