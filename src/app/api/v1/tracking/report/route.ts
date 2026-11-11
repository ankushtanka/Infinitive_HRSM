import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { getISTDateString, calculateWorkingHours } from '@/lib/dateUtils';
import type { Db } from 'mongodb';
import { TRACKING_COLLECTIONS, loadOrgPolicy, canView, viewerEmployeeQuery, resolveTrackingOrgId } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

type Verdict = 'NO_ATTENDANCE' | 'VERIFIED' | 'OUTSIDE_OFFICE' | 'GPS_ONLY' | 'NO_GPS';

/** Hours worked for an attendance record, or null while still checked in. */
function attendanceHours(att: any): number | null {
  const stored = Number(att?.workingHours ?? att?.totalHours);
  if (Number.isFinite(stored) && stored > 0) return Math.round(stored * 10) / 10;
  if (!(att?.checkOut || att?.checkOutTime)) return null;
  const computed = calculateWorkingHours(att.checkInTime, att.checkOutTime, att.checkIn, att.checkOut);
  return computed > 0 ? computed : null;
}

const employeeName = (emp: any, empId: string) => `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || empId;

/** Per-employee totals for one month: days present, late days, hours, check-in verification and tracking coverage. */
async function buildMonthlySummary(
  db: Db,
  req: NextRequest,
  orgId: string,
  month: string,
  employees: any[],
  empIds: string[],
  trackingEnabled: boolean
) {
  const datePrefix = { $regex: `^${month}-` };
  const [attendanceDocs, trackedDays] = await Promise.all([
    db.collection('attendance').find({ employeeId: { $in: empIds }, date: datePrefix }).toArray(),
    db
      .collection(TRACKING_COLLECTIONS.locations)
      .aggregate([
        { $match: { organizationId: orgId, employeeId: { $in: empIds }, date: datePrefix } },
        {
          $group: {
            _id: '$employeeId',
            points: { $sum: 1 },
            outside: { $sum: { $cond: [{ $eq: ['$withinGeofence', false] }, 1, 0] } },
            days: { $addToSet: '$date' },
          },
        },
      ])
      .toArray(),
  ]);

  const trackMap = new Map<string, any>(trackedDays.map((t: any) => [t._id, t]));
  const attByEmp = new Map<string, any[]>();
  attendanceDocs.forEach((a: any) => {
    if (!(a.checkIn || a.checkInTime)) return;
    const list = attByEmp.get(a.employeeId) || [];
    list.push(a);
    attByEmp.set(a.employeeId, list);
  });

  const rows = employees.map((emp: any) => {
    const empId = emp.employeeId || emp._id.toString();
    const days = attByEmp.get(empId) || [];
    const track = trackMap.get(empId);
    const totalHours = days.reduce((sum, a) => sum + (attendanceHours(a) || 0), 0);
    return {
      employeeId: empId,
      name: employeeName(emp, empId),
      department: emp.department || 'General',
      designation: emp.designation || '',
      daysPresent: days.length,
      lateDays: days.filter((a) => String(a.status || '').toLowerCase() === 'late').length,
      totalHours: Math.round(totalHours * 10) / 10,
      avgHours: days.length ? Math.round((totalHours / days.length) * 10) / 10 : 0,
      verifiedDays: days.filter((a) => a.geo?.withinGeofence === true).length,
      outsideDays: days.filter((a) => a.geo?.withinGeofence === false).length,
      noGpsDays: days.filter((a) => !a.geo).length,
      trackedDays: track?.days?.length || 0,
      trackingPoints: track?.points || 0,
      pointsOutside: track?.outside || 0,
    };
  });
  rows.sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));

  await logAuditEvent(req, 'TRACKING_REPORT_VIEW', { organizationId: orgId, details: { month, employees: rows.length } });
  return { mode: 'month', month, trackingEnabled, rows };
}

/**
 * GET /api/v1/tracking/report?date=YYYY-MM-DD
 * Attendance verification for one day: was each employee's check-in made from the office (GPS),
 * plus a summary of their tracking (points, time outside the geofence). For HR / Admin / Super Admin
 * (and Managers if the policy grants them history access). Access is audited.
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
    const policy = await loadOrgPolicy(db, orgId);
    if (!canView(policy, auth, 'history')) {
      return NextResponse.json(
        { success: false, message: 'Your role is not permitted to view tracking reports.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month')?.trim() || '';
    const date = searchParams.get('date') || getISTDateString();
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, message: 'Use month in YYYY-MM format.' }, { status: 400 });
    }
    if (!month && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, message: 'Use date in YYYY-MM-DD format.' }, { status: 400 });
    }

    const employees = await db
      .collection('employees')
      .find(viewerEmployeeQuery(auth, orgId), {
        projection: { employeeId: 1, firstName: 1, lastName: 1, name: 1, department: 1, designation: 1 },
      })
      .toArray();
    const empIds = employees.map((e: any) => e.employeeId || e._id.toString());
    if (empIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: month
          ? { mode: 'month', month, trackingEnabled: policy.enabled, rows: [] }
          : { mode: 'day', date, trackingEnabled: policy.enabled, counts: {}, rows: [] },
      });
    }

    if (month) {
      return NextResponse.json({
        success: true,
        data: await buildMonthlySummary(db, req, orgId, month, employees, empIds, policy.enabled),
      });
    }

    const [attendanceDocs, locationAgg, sessionAgg] = await Promise.all([
      db.collection('attendance').find({ employeeId: { $in: empIds }, date }).toArray(),
      db
        .collection(TRACKING_COLLECTIONS.locations)
        .aggregate([
          { $match: { organizationId: orgId, employeeId: { $in: empIds }, date } },
          {
            $group: {
              _id: '$employeeId',
              points: { $sum: 1 },
              outside: { $sum: { $cond: [{ $eq: ['$withinGeofence', false] }, 1, 0] } },
              first: { $min: '$recordedAt' },
              last: { $max: '$recordedAt' },
            },
          },
        ])
        .toArray(),
      db
        .collection(TRACKING_COLLECTIONS.sessions)
        .aggregate([
          { $match: { organizationId: orgId, employeeId: { $in: empIds }, date } },
          { $group: { _id: '$employeeId', sessions: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const attMap = new Map<string, any>(attendanceDocs.map((a: any) => [a.employeeId, a]));
    const locMap = new Map<string, any>(locationAgg.map((l: any) => [l._id, l]));
    const sesMap = new Map<string, any>(sessionAgg.map((s: any) => [s._id, s]));

    const counts: Record<Verdict, number> = { NO_ATTENDANCE: 0, VERIFIED: 0, OUTSIDE_OFFICE: 0, GPS_ONLY: 0, NO_GPS: 0 };

    const rows = employees.map((emp: any) => {
      const empId = emp.employeeId || emp._id.toString();
      const att = attMap.get(empId);
      const loc = locMap.get(empId);
      const ses = sesMap.get(empId);
      const checkedIn = att && (att.checkIn || att.checkInTime);

      let verdict: Verdict;
      if (!checkedIn) verdict = 'NO_ATTENDANCE';
      else if (att.geo?.withinGeofence === true) verdict = 'VERIFIED';
      else if (att.geo?.withinGeofence === false) verdict = 'OUTSIDE_OFFICE';
      else if (att.geo) verdict = 'GPS_ONLY';
      else verdict = 'NO_GPS';
      counts[verdict] += 1;

      return {
        employeeId: empId,
        name: employeeName(emp, empId),
        department: emp.department || 'General',
        designation: emp.designation || '',
        attendanceStatus: att?.status || null,
        method: att?.method || null,
        workingHours: checkedIn ? attendanceHours(att) : null,
        checkInAt: att?.checkInTime ? new Date(att.checkInTime).toISOString() : null,
        checkOutAt: att?.checkOutTime ? new Date(att.checkOutTime).toISOString() : null,
        checkInGeo: att?.geo
          ? {
              withinGeofence: att.geo.withinGeofence ?? null,
              distanceMeters: att.geo.distanceMeters ?? null,
              accuracy: att.geo.accuracy ?? null,
            }
          : null,
        verdict,
        tracking: {
          sessions: ses?.sessions || 0,
          points: loc?.points || 0,
          pointsOutside: loc?.outside || 0,
          firstAt: loc?.first ? new Date(loc.first).toISOString() : null,
          lastAt: loc?.last ? new Date(loc.last).toISOString() : null,
        },
      };
    });

    const order: Record<Verdict, number> = { OUTSIDE_OFFICE: 0, NO_GPS: 1, GPS_ONLY: 2, VERIFIED: 3, NO_ATTENDANCE: 4 };
    rows.sort((a, b) => order[a.verdict] - order[b.verdict] || a.name.localeCompare(b.name));

    await logAuditEvent(req, 'TRACKING_REPORT_VIEW', { organizationId: orgId, details: { date, employees: rows.length } });

    return NextResponse.json({
      success: true,
      data: { mode: 'day', date, trackingEnabled: policy.enabled, retentionDays: policy.retentionDays, counts, rows },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/tracking/report:', error);
    return NextResponse.json({ success: false, message: 'Failed to build tracking report.' }, { status: 500 });
  }
}
