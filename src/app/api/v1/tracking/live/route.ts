import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { getISTDateString, formatISTDate } from '@/lib/dateUtils';
import { loadAttendanceRules, getGeofenceConfig } from '@/lib/geo';
import { TRACKING_COLLECTIONS, loadOrgPolicy, canView, viewerEmployeeQuery, resolveTrackingOrgId } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/tracking/live
 * Live presence + location board for today.
 * - Manager: own team only. HR / Admin: whole organization. Super Admin: whole organization.
 * - Roles must be allowed by the organization's tracking policy; otherwise 403.
 * - Location is returned only for employees with an ACTIVE tracking session and no exemption.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const orgId = resolveTrackingOrgId(auth, req);
    const now = new Date();
    const today = getISTDateString(now);

    const policy = await loadOrgPolicy(db, orgId);
    if (!canView(policy, auth, 'live')) {
      return NextResponse.json(
        { success: false, message: 'Your role is not permitted to view live employee locations.' },
        { status: 403 }
      );
    }

    const fence = policy.enabled ? getGeofenceConfig(await loadAttendanceRules(db, orgId)) : null;
    const staleAfterMs = Math.max(90, policy.pingIntervalSeconds * 3) * 1000;

    const employees = await db
      .collection('employees')
      .find(viewerEmployeeQuery(auth, orgId), {
        projection: { employeeId: 1, firstName: 1, lastName: 1, name: 1, department: 1, designation: 1, photoUrl: 1, avatar: 1 },
      })
      .toArray();
    const empIds = employees.map((e: any) => e.employeeId || e._id.toString());

    const emptyKpis = { total: 0, working: 0, checkedOut: 0, onLeave: 0, notMarked: 0, late: 0, outsideOffice: 0, staleSignal: 0, trackingActive: 0 };
    const base = {
      success: true,
      serverTime: now.toISOString(),
      date: formatISTDate(today),
      trackingEnabled: policy.enabled,
      pingIntervalSeconds: policy.pingIntervalSeconds,
      geofence: fence ? { lat: fence.lat, lng: fence.lng, radiusMeters: fence.radiusMeters, enforce: fence.enforce } : null,
    };
    if (empIds.length === 0) return NextResponse.json({ ...base, kpis: emptyKpis, rows: [] });

    const [attendanceDocs, sessionDocs, latestSessionDocs, exemptionDocs, leaveDocs] = await Promise.all([
      db.collection('attendance').find({ employeeId: { $in: empIds }, date: today }).toArray(),
      policy.enabled
        ? db.collection(TRACKING_COLLECTIONS.sessions).find({ organizationId: orgId, employeeId: { $in: empIds }, date: today, status: 'ACTIVE' }).toArray()
        : Promise.resolve([] as any[]),
      // Most recent session per employee today, active or not, to detect "turned tracking off mid-shift"
      policy.enabled
        ? db
            .collection(TRACKING_COLLECTIONS.sessions)
            .aggregate([
              { $match: { organizationId: orgId, employeeId: { $in: empIds }, date: today } },
              { $sort: { startedAt: -1 } },
              { $group: { _id: '$employeeId', doc: { $first: '$$ROOT' } } },
            ])
            .toArray()
        : Promise.resolve([] as any[]),
      db.collection(TRACKING_COLLECTIONS.permissions).find({ organizationId: orgId, scope: 'EMPLOYEE', enabled: false, employeeId: { $in: empIds } }).toArray(),
      db.collection('leaves').find({ organizationId: orgId, employeeId: { $in: empIds }, status: { $in: ['Approved', 'approved'] } }).toArray(),
    ]);

    const attMap = new Map<string, any>(attendanceDocs.map((a: any) => [a.employeeId, a]));
    const sessionMap = new Map<string, any>(sessionDocs.map((s: any) => [s.employeeId, s]));
    const latestSessionMap = new Map<string, any>(latestSessionDocs.map((d: any) => [d._id, d.doc]));
    const exempt = new Set<string>(exemptionDocs.map((x: any) => x.employeeId));
    const onLeave = new Set<string>();
    leaveDocs.forEach((lv: any) => {
      const start = lv.startDate ? getISTDateString(new Date(lv.startDate)) : '';
      const end = lv.endDate ? getISTDateString(new Date(lv.endDate)) : start;
      if (start && today >= start && today <= end) onLeave.add(lv.employeeId);
    });

    const kpis = { ...emptyKpis, total: employees.length };
    const alerts: { employeeId: string; name: string; stoppedAt: string | null }[] = [];

    const rows = employees.map((emp: any) => {
      const empId = emp.employeeId || emp._id.toString();
      const att = attMap.get(empId);
      const session = sessionMap.get(empId);
      const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || empId;

      const checkedIn = att && (att.checkIn || att.checkInTime);
      const checkedOut = att && (att.checkOut || att.checkOutTime);
      let state: 'WORKING' | 'CHECKED_OUT' | 'ON_LEAVE' | 'NOT_MARKED' = 'NOT_MARKED';
      if (checkedIn && !checkedOut) state = 'WORKING';
      else if (checkedIn && checkedOut) state = 'CHECKED_OUT';
      else if (onLeave.has(empId)) state = 'ON_LEAVE';

      let trackingStatus: 'ACTIVE' | 'NOT_STARTED' | 'EXEMPT' | 'DISABLED' | 'TURNED_OFF' = 'NOT_STARTED';
      const latest = latestSessionMap.get(empId);
      if (!policy.enabled) trackingStatus = 'DISABLED';
      else if (exempt.has(empId)) trackingStatus = 'EXEMPT';
      else if (session) trackingStatus = 'ACTIVE';
      else if (state === 'WORKING' && latest?.status === 'AUTO_STOPPED' && latest?.stopReason === 'employee_stopped') {
        // Defensive: 'employee_stopped' is currently only set by the employee's own Stop action,
        // never by an auto-stop path, but check the reason text rather than assume that stays true.
        trackingStatus = 'TURNED_OFF';
      }
      if (state === 'WORKING' && trackingStatus === 'TURNED_OFF') {
        alerts.push({ employeeId: empId, name: '', stoppedAt: latest?.endedAt ? new Date(latest.endedAt).toISOString() : null });
      }

      let location: any = null;
      if (state === 'WORKING' && trackingStatus === 'ACTIVE' && session.lastLat != null && session.lastLng != null) {
        const lastPing = session.lastLocationAt ? new Date(session.lastLocationAt) : null;
        const stale = !lastPing || now.getTime() - lastPing.getTime() > staleAfterMs;
        location = {
          lat: session.lastLat,
          lng: session.lastLng,
          accuracy: session.lastAccuracy ?? null,
          lastPingAt: lastPing ? lastPing.toISOString() : null,
          withinGeofence: session.withinGeofence ?? null,
          distanceMeters: session.distanceMeters ?? null,
          outsideMinutes: session.outsideSince ? Math.floor((now.getTime() - new Date(session.outsideSince).getTime()) / 60000) : 0,
          stale,
        };
        if (stale) kpis.staleSignal += 1;
        if (session.withinGeofence === false && !stale) kpis.outsideOffice += 1;
      }
      if (state === 'WORKING' && trackingStatus === 'ACTIVE') kpis.trackingActive += 1;

      if (state === 'WORKING') kpis.working += 1;
      else if (state === 'CHECKED_OUT') kpis.checkedOut += 1;
      else if (state === 'ON_LEAVE') kpis.onLeave += 1;
      else kpis.notMarked += 1;
      if (att?.status === 'Late') kpis.late += 1;

      if (alerts.length && alerts[alerts.length - 1].employeeId === empId && !alerts[alerts.length - 1].name) {
        alerts[alerts.length - 1].name = name;
      }

      return {
        employeeId: empId,
        name,
        department: emp.department || 'General',
        designation: emp.designation || '',
        photoUrl: emp.photoUrl || emp.avatar || null,
        state,
        trackingStatus,
        attendanceStatus: att?.status || null,
        checkInAt: att?.checkInTime ? new Date(att.checkInTime).toISOString() : null,
        checkOutAt: att?.checkOutTime ? new Date(att.checkOutTime).toISOString() : null,
        workingHours: typeof att?.workingHours === 'number' ? att.workingHours : null,
        method: att?.method || null,
        location,
      };
    });

    const order = { WORKING: 0, CHECKED_OUT: 1, ON_LEAVE: 2, NOT_MARKED: 3 } as const;
    rows.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));

    return NextResponse.json({ ...base, kpis, rows, alerts });
  } catch (error: any) {
    console.error('Error in GET /api/v1/tracking/live:', error);
    return NextResponse.json({ success: false, message: 'Failed to load live tracking.' }, { status: 500 });
  }
}
