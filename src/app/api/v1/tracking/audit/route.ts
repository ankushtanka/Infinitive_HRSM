import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { resolveTrackingOrgId } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/tracking/audit?page=1&limit=25
 * Super Admin only: every tracking-related audit event for the organization
 * (start/stop, forced stops, policy changes, exemptions, history/report reads).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10) || 25));

    const { db } = await connectToDatabase();
    const query = { organizationId: resolveTrackingOrgId(auth, req), action: { $regex: '^TRACKING_' } };

    const [total, docs] = await Promise.all([
      db.collection('audit_logs').countDocuments(query),
      db
        .collection('audit_logs')
        .find(query)
        .sort({ timestamp: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        logs: docs.map((d: any) => ({
          id: d._id.toString(),
          action: d.action,
          performedBy: d.performedBy,
          performedByName: d.performedByName || null,
          role: d.role,
          employeeId: d.employeeId || null,
          details: d.details || null,
          oldValue: d.oldValue || null,
          newValue: d.newValue || null,
          timestamp: d.timestamp,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/tracking/audit:', error);
    return NextResponse.json({ success: false, message: 'Failed to load tracking audit log.' }, { status: 500 });
  }
}
