import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { normalizeRole } from '@/lib/roleUtils';
import { logAuditEvent } from '@/lib/audit';
import { getISTDateString } from '@/lib/dateUtils';
import { TRACKING_COLLECTIONS, loadOrgPolicy, canView, viewerEmployeeQuery, istDayStart, resolveTrackingOrgId } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

const MAX_RANGE_DAYS = 31;
const DEFAULT_POINT_LIMIT = 1000;
const MAX_POINT_LIMIT = 5000;

/**
 * GET /api/v1/tracking/history?employeeId=&date=YYYY-MM-DD | &from=&to=&limit=
 * - An employee can always read their own history.
 * - Others need a role listed in the policy's historyRoles (Super Admin always); a Manager is further
 *   limited to their own team. Every access to someone else's history is written to the audit log.
 * - Only data inside the policy's retention window is returned.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const role = normalizeRole(auth.role);
    const requested = (searchParams.get('employeeId') || '').trim();
    const employeeId = requested || auth.employeeId || '';
    if (!employeeId) {
      return NextResponse.json({ success: false, message: 'employeeId is required.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = resolveTrackingOrgId(auth, req);
    const policy = await loadOrgPolicy(db, orgId);
    const isSelf = employeeId === auth.employeeId;

    if (!isSelf) {
      if (!canView(policy, auth, 'history')) {
        return NextResponse.json(
          { success: false, message: 'Your role is not permitted to view location history.' },
          { status: 403 }
        );
      }
      if (role === 'MANAGER') {
        const inTeam = await db
          .collection('employees')
          .findOne({ ...viewerEmployeeQuery(auth, orgId, false), employeeId }, { projection: { _id: 1 } });
        if (!inTeam) {
          return NextResponse.json({ success: false, message: 'This employee is not in your team.' }, { status: 403 });
        }
      } else {
        const exists = await db.collection('employees').findOne({ organizationId: orgId, employeeId }, { projection: { _id: 1 } });
        if (!exists) {
          return NextResponse.json({ success: false, message: 'Employee not found.' }, { status: 404 });
        }
      }
    }

    // Date window (IST days), clamped to retention and max range
    const today = getISTDateString();
    const single = searchParams.get('date');
    let from = single || searchParams.get('from') || today;
    let to = single || searchParams.get('to') || from;
    const fromStart = istDayStart(from);
    const toStart = istDayStart(to);
    if (!fromStart || !toStart || toStart < fromStart) {
      return NextResponse.json({ success: false, message: 'Use valid dates in YYYY-MM-DD format (from <= to).' }, { status: 400 });
    }
    const rangeDays = Math.round((toStart.getTime() - fromStart.getTime()) / 86400000) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      return NextResponse.json({ success: false, message: `Date range cannot exceed ${MAX_RANGE_DAYS} days.` }, { status: 400 });
    }
    const retentionFloor = new Date(Date.now() - policy.retentionDays * 86400000);
    const rangeStart = fromStart < retentionFloor ? retentionFloor : fromStart;
    const rangeEnd = new Date(toStart.getTime() + 86400000);

    const limitParam = parseInt(searchParams.get('limit') || '', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(MAX_POINT_LIMIT, Math.max(1, limitParam)) : DEFAULT_POINT_LIMIT;

    const timeFilter = { $gte: rangeStart, $lt: rangeEnd };
    const [sessions, points, outsideCount] = await Promise.all([
      db
        .collection(TRACKING_COLLECTIONS.sessions)
        .find({ organizationId: orgId, employeeId, startedAt: timeFilter })
        .project({ date: 1, status: 1, startedAt: 1, endedAt: 1, stopReason: 1, pointCount: 1, consentAt: 1 })
        .sort({ startedAt: 1 })
        .toArray(),
      db
        .collection(TRACKING_COLLECTIONS.locations)
        .find({ organizationId: orgId, employeeId, recordedAt: timeFilter })
        .project({ sessionId: 1, lat: 1, lng: 1, accuracy: 1, withinGeofence: 1, distanceMeters: 1, recordedAt: 1 })
        .sort({ recordedAt: 1 })
        .limit(limit)
        .toArray(),
      db.collection(TRACKING_COLLECTIONS.locations).countDocuments({
        organizationId: orgId,
        employeeId,
        recordedAt: timeFilter,
        withinGeofence: false,
      }),
    ]);

    if (!isSelf) {
      await logAuditEvent(req, 'TRACKING_HISTORY_VIEW', {
        organizationId: orgId,
        employeeId,
        details: { from, to, points: points.length },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        employeeId,
        from,
        to,
        retentionDays: policy.retentionDays,
        clampedToRetention: fromStart < retentionFloor,
        truncated: points.length >= limit,
        summary: { sessions: sessions.length, points: points.length, pointsOutsideGeofence: outsideCount },
        sessions: sessions.map((s: any) => ({ ...s, id: s._id.toString(), _id: undefined })),
        points: points.map((p: any) => ({ ...p, id: p._id.toString(), _id: undefined })),
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/tracking/history:', error);
    return NextResponse.json({ success: false, message: 'Failed to load tracking history.' }, { status: 500 });
  }
}
