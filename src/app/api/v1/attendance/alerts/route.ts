import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { detectAttendanceAlerts, AttendanceAlertStats } from '@/lib/attendanceAlerts';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const alertType = searchParams.get('alertType')?.trim();
    const status = searchParams.get('status')?.trim();
    const date = searchParams.get('date')?.trim();
    const fromDate = searchParams.get('fromDate')?.trim();
    const toDate = searchParams.get('toDate')?.trim();
    const department = searchParams.get('department')?.trim();
    const employeeId = searchParams.get('employeeId')?.trim();

    const andConditions: any[] = [];

    // Organization Tenant isolation
    if (auth.role === 'SUPER_ADMIN') {
      const requestedOrg = searchParams.get('organizationId')?.trim();
      if (requestedOrg && requestedOrg !== 'All') {
        andConditions.push({ organizationId: requestedOrg });
      }
    } else {
      andConditions.push({ organizationId: orgId || 'org-default' });
    }

    // Role-based Access Control (RBAC)
    if (auth.role === 'EMPLOYEE' && auth.employeeId) {
      andConditions.push({ employeeId: auth.employeeId });
    } else if (auth.role === 'MANAGER' && auth.employeeId) {
      // Find all employees reporting to this manager
      const teamEmployees = await db.collection('employees').find({
        organizationId: orgId,
        $or: [
          { managerId: auth.employeeId },
          { reportingTo: auth.employeeId },
          { employeeId: auth.employeeId },
        ],
      }).toArray();
      const teamEmpIds = teamEmployees.map((e) => e.employeeId || e._id.toString());
      andConditions.push({
        $or: [
          { employeeId: { $in: teamEmpIds } },
          { managerId: auth.employeeId },
        ],
      });
    }

    // Filters
    if (employeeId && employeeId !== 'All') {
      andConditions.push({ employeeId });
    }
    if (alertType && alertType !== 'All') {
      andConditions.push({ alertType });
    }
    if (status && status !== 'All') {
      andConditions.push({ status });
    }
    if (department && department !== 'All') {
      andConditions.push({ department });
    }
    if (date) {
      andConditions.push({ date });
    } else {
      if (fromDate) {
        andConditions.push({ date: { $gte: fromDate } });
      }
      if (toDate) {
        andConditions.push({ date: { $lte: toDate } });
      }
    }

    // Search query
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safeSearch, 'i');
      andConditions.push({
        $or: [
          { employeeName: regex },
          { employeeCode: regex },
          { employeeId: regex },
          { message: regex },
          { department: regex },
        ],
      });
    }

    const query = andConditions.length > 1 ? { $and: andConditions } : andConditions.length === 1 ? andConditions[0] : {};

    // 1. Fetch Paginated Records
    const totalCount = await db.collection('attendance_alerts').countDocuments(query);
    const alerts = await db
      .collection('attendance_alerts')
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // 2. Compute KPI Summary Stats over the role-authorized scope
    const baseStatsQuery: any[] = [];
    if (auth.role !== 'SUPER_ADMIN') {
      baseStatsQuery.push({ organizationId: orgId || 'org-default' });
    }
    if (auth.role === 'EMPLOYEE' && auth.employeeId) {
      baseStatsQuery.push({ employeeId: auth.employeeId });
    } else if (auth.role === 'MANAGER' && auth.employeeId) {
      const teamEmployees = await db.collection('employees').find({
        organizationId: orgId,
        $or: [
          { managerId: auth.employeeId },
          { reportingTo: auth.employeeId },
          { employeeId: auth.employeeId },
        ],
      }).toArray();
      const teamEmpIds = teamEmployees.map((e) => e.employeeId || e._id.toString());
      baseStatsQuery.push({
        $or: [
          { employeeId: { $in: teamEmpIds } },
          { managerId: auth.employeeId },
        ],
      });
    }
    // Date filter on stats if specific date is applied
    if (date) {
      baseStatsQuery.push({ date });
    }

    const statsFilter = baseStatsQuery.length > 1 ? { $and: baseStatsQuery } : baseStatsQuery[0] || {};

    const [
      totalStat,
      lateStat,
      absentStat,
      missedStat,
      earlyStat,
      pendingStat,
      resolvedStat,
    ] = await Promise.all([
      db.collection('attendance_alerts').countDocuments(statsFilter),
      db.collection('attendance_alerts').countDocuments({ ...statsFilter, alertType: 'LATE_ARRIVAL' }),
      db.collection('attendance_alerts').countDocuments({ ...statsFilter, alertType: 'ABSENT' }),
      db.collection('attendance_alerts').countDocuments({ ...statsFilter, alertType: 'MISSED_CHECKOUT' }),
      db.collection('attendance_alerts').countDocuments({ ...statsFilter, alertType: 'EARLY_DEPARTURE' }),
      db.collection('attendance_alerts').countDocuments({ ...statsFilter, status: { $in: ['PENDING', 'SENT'] } }),
      db.collection('attendance_alerts').countDocuments({ ...statsFilter, status: 'RESOLVED' }),
    ]);

    const stats: AttendanceAlertStats = {
      total: totalStat,
      lateArrivals: lateStat,
      absentEmployees: absentStat,
      missedCheckouts: missedStat,
      earlyDepartures: earlyStat,
      pending: pendingStat,
      resolved: resolvedStat,
    };

    return NextResponse.json({
      success: true,
      data: alerts,
      stats,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/attendance/alerts:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch attendance alerts' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    let targetDate: string | undefined;
    try {
      const body = await req.json();
      targetDate = body.targetDate;
    } catch {
      // Body is optional
    }

    const result = await detectAttendanceAlerts({
      organizationId: auth.organizationId,
      targetDate,
    });

    return NextResponse.json({
      success: true,
      message: `Detection complete. Processed ${result.processedEmployees} employees, generated ${result.createdAlerts} alerts (${result.skippedAlerts} existing/duplicates skipped).`,
      result,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/attendance/alerts:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to trigger attendance alerts detection' },
      { status: 500 }
    );
  }
}

