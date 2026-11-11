import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import {
  detectEmployeeReminders,
  ReminderCategory,
  ReminderStats,
} from '@/lib/employeeReminders';
import { startEmployeeRemindersCronJob } from '@/jobs/remindersJob';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    // Ensure background cron is running
    startEmployeeRemindersCronJob();

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const { searchParams } = new URL(req.url);

    const category = searchParams.get('category')?.trim();
    const status = searchParams.get('status')?.trim();
    const department = searchParams.get('department')?.trim();
    const search = searchParams.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));

    const andConditions: any[] = [];

    // Tenant isolation
    if (auth.role === 'SUPER_ADMIN') {
      const requestedOrg = searchParams.get('organizationId')?.trim();
      if (requestedOrg && requestedOrg !== 'All') {
        andConditions.push({ organizationId: requestedOrg });
      }
    } else {
      andConditions.push({ organizationId: orgId || 'org-default' });
    }

    // RBAC Permissions
    if (auth.role === 'EMPLOYEE' && auth.employeeId) {
      andConditions.push({ employeeId: auth.employeeId });
    } else if (auth.role === 'MANAGER' && auth.employeeId) {
      // Find team members
      const team = await db.collection('employees').find({
        organizationId: orgId,
        $or: [
          { managerId: auth.employeeId },
          { reportingTo: auth.employeeId },
          { employeeId: auth.employeeId },
        ],
      }).toArray();
      const teamEmpIds = team.map((e) => e.employeeId || e._id.toString());
      andConditions.push({
        $or: [
          { employeeId: { $in: teamEmpIds } },
          { managerId: auth.employeeId },
        ],
      });
    }

    // Filters
    if (category && category !== 'All') {
      if (category === 'CELEBRATIONS') {
        andConditions.push({ category: { $in: ['BIRTHDAY', 'ANNIVERSARY'] } });
      } else {
        andConditions.push({ category });
      }
    }
    if (status && status !== 'All') {
      andConditions.push({ status });
    }
    if (department && department !== 'All') {
      andConditions.push({ department });
    }

    // Search
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safeSearch, 'i');
      andConditions.push({
        $or: [
          { employeeName: regex },
          { employeeCode: regex },
          { employeeId: regex },
          { documentTitle: regex },
          { title: regex },
          { message: regex },
          { department: regex },
        ],
      });
    }

    const query = andConditions.length > 1 ? { $and: andConditions } : andConditions.length === 1 ? andConditions[0] : {};

    const totalCount = await db.collection('employee_reminders').countDocuments(query);
    const reminders = await db
      .collection('employee_reminders')
      .find(query)
      .sort({ targetDate: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Compute Tab Statistics over role-authorized scope
    const baseScope: any[] = [];
    if (auth.role !== 'SUPER_ADMIN') {
      baseScope.push({ organizationId: orgId || 'org-default' });
    }
    if (auth.role === 'EMPLOYEE' && auth.employeeId) {
      baseScope.push({ employeeId: auth.employeeId });
    } else if (auth.role === 'MANAGER' && auth.employeeId) {
      const team = await db.collection('employees').find({
        organizationId: orgId,
        $or: [
          { managerId: auth.employeeId },
          { reportingTo: auth.employeeId },
          { employeeId: auth.employeeId },
        ],
      }).toArray();
      const teamEmpIds = team.map((e) => e.employeeId || e._id.toString());
      baseScope.push({
        $or: [
          { employeeId: { $in: teamEmpIds } },
          { managerId: auth.employeeId },
        ],
      });
    }

    const scopeFilter = baseScope.length > 1 ? { $and: baseScope } : baseScope[0] || {};

    const [
      probTotal,
      prob30d,
      prob7d,
      probComp,
      bdayToday,
      bdayUp,
      annToday,
      annUp,
      docTotal,
      docSoon,
      docExp,
      joinToday,
      joinUp,
      onbPending,
    ] = await Promise.all([
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'PROBATION' }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'PROBATION', daysRemaining: { $lte: 30, $gt: 7 } }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'PROBATION', daysRemaining: { $lte: 7 } }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'PROBATION', status: 'COMPLETED' }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'BIRTHDAY', daysRemaining: 0 }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'BIRTHDAY', daysRemaining: { $gt: 0, $lte: 30 } }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'ANNIVERSARY', daysRemaining: 0 }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'ANNIVERSARY', daysRemaining: { $gt: 0, $lte: 30 } }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'DOCUMENT_EXPIRY' }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'DOCUMENT_EXPIRY', status: 'EXPIRING_SOON' }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'DOCUMENT_EXPIRY', status: 'EXPIRED' }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'JOINING', daysRemaining: 0 }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'JOINING', daysRemaining: { $gt: 0 } }),
      db.collection('employee_reminders').countDocuments({ ...scopeFilter, category: 'JOINING', onboardingStatus: { $ne: 'COMPLETED' } }),
    ]);

    const stats: ReminderStats = {
      probation: {
        total: probTotal,
        expiring30d: prob30d,
        expiring7d: prob7d,
        completed: probComp,
      },
      birthday: {
        today: bdayToday,
        upcoming30d: bdayUp,
      },
      anniversary: {
        today: annToday,
        upcoming30d: annUp,
      },
      documentExpiry: {
        total: docTotal,
        expiringSoon: docSoon,
        expired: docExp,
      },
      joining: {
        today: joinToday,
        upcoming: joinUp,
        onboardingPending: onbPending,
      },
    };

    return NextResponse.json({
      success: true,
      data: reminders,
      stats,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/reminders:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch employee reminders' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    let todayDate: string | undefined;
    try {
      const body = await req.json();
      todayDate = body.todayDate;
    } catch {}

    const result = await detectEmployeeReminders({
      organizationId: auth.organizationId,
      todayDate,
    });

    return NextResponse.json({
      success: true,
      message: `Detection complete. Generated ${result.createdCount} new reminders (${result.skippedCount} existing/duplicates skipped).`,
      result,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/reminders:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to trigger reminders check' },
      { status: 500 }
    );
  }
}

