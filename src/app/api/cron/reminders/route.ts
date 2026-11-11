import { NextRequest, NextResponse } from 'next/server';
import {
  performEmployeeRemindersCheck,
  startEmployeeRemindersCronJob,
} from '@/jobs/remindersJob';
import { getAuthContext, checkPermissions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/reminders
 * Automated cron trigger or status check.
 * Accessible with Vercel Cron authorization header (CRON_SECRET) or Admin/HR session.
 */
export async function GET(req: NextRequest) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const cronSecretHeader = req.headers.get('x-cron-secret');

    // Register background node-cron
    startEmployeeRemindersCronJob();

    const isSecretAuthorized = Boolean(
      expectedSecret &&
      (authHeader === `Bearer ${expectedSecret}` || cronSecretHeader === expectedSecret)
    );

    if (!isSecretAuthorized) {
      const auth = await getAuthContext(req);
      const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
      if (!perm.isAllowed) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: CRON_SECRET or Admin authorization required.' },
          { status: 401 }
        );
      }
    }

    const { searchParams } = new URL(req.url);
    const todayDate = searchParams.get('todayDate') || undefined;
    const organizationId = searchParams.get('organizationId') || undefined;

    const result = await performEmployeeRemindersCheck({
      todayDate,
      organizationId,
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error('Error in GET /api/cron/reminders:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Reminders check failed.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/reminders
 * Manual trigger endpoint for Admins/HR.
 */
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

    const result = await performEmployeeRemindersCheck({
      todayDate,
      organizationId: auth.organizationId,
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error('Error in POST /api/cron/reminders:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Reminders check trigger failed.' },
      { status: 500 }
    );
  }
}

