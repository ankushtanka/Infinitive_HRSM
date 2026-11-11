import { NextRequest, NextResponse } from 'next/server';
import { performAutoCheckout, startAutoCheckoutCronJob } from '@/jobs/autoCheckoutJob';
import { getAuthContext, checkPermissions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/auto-checkout
 * Automated cron trigger or status check.
 * Accepts Vercel Cron authorization header or admin session.
 */
export async function GET(req: NextRequest) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const cronSecretHeader = req.headers.get('x-cron-secret');

    // Ensure background node-cron is registered
    startAutoCheckoutCronJob();

    // Check if called with cron secret
    const isSecretAuthorized = Boolean(
      expectedSecret &&
      (authHeader === `Bearer ${expectedSecret}` || cronSecretHeader === expectedSecret)
    );

    if (!isSecretAuthorized) {
      // Fallback: check admin / super admin session
      const auth = await getAuthContext(req);
      const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'MANAGER']);
      if (!perm.isAllowed) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: CRON_SECRET or Admin authorization required.' },
          { status: 401 }
        );
      }
    }

    const { searchParams } = new URL(req.url);
    const targetDate = searchParams.get('targetDate') || undefined;

    const result = await performAutoCheckout({ targetDate });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error('Error in GET /api/cron/auto-checkout:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Auto-checkout job execution failed.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/auto-checkout
 * Manual trigger endpoint for Admins/Managers.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'MANAGER']);
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

    const result = await performAutoCheckout({
      targetDate,
      organizationId: auth.organizationId,
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error('Error in POST /api/cron/auto-checkout:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to trigger auto-checkout.' },
      { status: 500 }
    );
  }
}
