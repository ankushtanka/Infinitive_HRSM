import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

// GET /api/cron/notifications-cleanup - Automated Vercel Cron retention cleanup (Fail-Closed)
export async function GET(req: NextRequest) {
  try {
    const expectedSecret = process.env.CRON_SECRET;

    // Fail-Closed: If CRON_SECRET is not configured in environment, reject request immediately
    if (!expectedSecret || expectedSecret.trim().length === 0) {
      console.error('CRON_SECRET environment variable is missing. Rejecting automated cron execution.');
      return NextResponse.json(
        { success: false, message: 'Server configuration error: CRON_SECRET is not configured.' },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get('authorization');
    const cronSecretHeader = req.headers.get('x-cron-secret');

    if (authHeader !== `Bearer ${expectedSecret}` && cronSecretHeader !== expectedSecret) {
      return NextResponse.json({ success: false, message: 'Unauthorized cron request' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const now = new Date();
    const nowISO = now.toISOString();

    // Fetch all organization settings to evaluate retention policies
    const orgSettings = await db.collection('organization_settings').find({}).toArray();

    let totalSoftDeleted = 0;

    for (const org of orgSettings) {
      const orgId = org.organizationId;
      if (!orgId) continue;

      const retentionSetting = org.notifications?.retentionDays || '90';
      if (retentionSetting === 'INDEFINITE') continue;

      const retentionDaysNum = parseInt(retentionSetting, 10);
      if (isNaN(retentionDaysNum) || retentionDaysNum <= 0) continue;

      const cutoffDate = new Date(now.getTime() - retentionDaysNum * 24 * 60 * 60 * 1000);
      const cutoffISO = cutoffDate.toISOString();

      // Soft delete expired notifications for this specific organization only
      const result = await db.collection('notifications').updateMany(
        {
          organizationId: orgId,
          createdAt: { $lt: cutoffISO },
          deletedAt: { $in: [null, undefined] },
        },
        {
          $set: {
            deletedAt: nowISO,
            updatedAt: nowISO,
          },
        }
      );

      totalSoftDeleted += result.modifiedCount;
    }

    return NextResponse.json({
      success: true,
      message: `Automated retention cleanup executed. Soft-deleted ${totalSoftDeleted} expired notification(s).`,
      totalSoftDeleted,
      timestamp: nowISO,
    });
  } catch (error: any) {
    console.error('Error in Vercel Cron notification cleanup:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to execute retention cleanup' },
      { status: 500 }
    );
  }
}
