import { NextRequest, NextResponse } from 'next/server';
import {
  performAttendanceAlertsCheck,
  startAttendanceAlertsCronJob,
} from '@/jobs/attendanceAlertsJob';
import { getAuthContext, checkPermissions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/attendance-alerts
 * Scheduled cron trigger or status check.
 * Accessible with Vercel Cron header (CRON_SECRET) or Admin/Manager session.
 */
export async function GET(req: NextRequest) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const cronSecretHeader = req.headers.get('x-cron-secret');

    // Ensure background node-cron is registered
    startAttendanceAlertsCronJob();

    // Check if called with cron secret
    const isSecretAuthorized = Boolean(
      expectedSecret &&
      (authHeader === `Bearer ${expectedSecret}` || cronSecretHeader === expectedSecret)
    );

    if (!isSecretAuthorized) {
      // Fallback: check session
      const auth = await getAuthContext(req);
      const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']);
      if (!perm.isAllowed) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: CRON_SECRET or Admin authorization required.' },
          { status: 401 }
        );
      }
    }

    const { searchParams } = new URL(req.url);
    const targetDate = searchParams.get('targetDate') || undefined;
    const organizationId = searchParams.get('organizationId') || undefined;

    const result = await performAttendanceAlertsCheck({
      targetDate,
      organizationId,
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error('Error in GET /api/cron/attendance-alerts:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Attendance alerts detection job failed.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/attendance-alerts
 * Manual trigger endpoint for Admins/Managers.
 */
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
      // No JSON body provided
    }

    const result = await performAttendanceAlertsCheck({
      targetDate,
      organizationId: auth.organizationId,
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error('Error in POST /api/cron/attendance-alerts:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Attendance alerts trigger failed.' },
      { status: 500 }
    );
  }
}

