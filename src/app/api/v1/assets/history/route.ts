import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/assets/history
 * Retrieves real chronological asset assignment and return logs across the organization.
 * Accessible to Admin, HR, Super Admin.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '50', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim(); // 'ACTIVE', 'RETURNED', or 'All'
    const assetId = searchParams.get('assetId')?.trim();
    const employeeId = searchParams.get('employeeId')?.trim();

    const { db } = await connectToDatabase();
    const andConditions: any[] = [];

    // Tenant Isolation & Super Admin multi-org support
    if (auth.role === 'SUPER_ADMIN') {
      const requestedOrg = searchParams.get('organizationId')?.trim();
      if (requestedOrg && requestedOrg !== 'All') {
        andConditions.push({ organizationId: requestedOrg });
      }
    } else {
      andConditions.push({ organizationId: auth.organizationId || 'org-default' });
    }

    if (status && status !== 'All') {
      andConditions.push({ status: status.toUpperCase() });
    }
    if (assetId) {
      andConditions.push({ assetId });
    }
    if (employeeId) {
      andConditions.push({ employeeId });
    }

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safeSearch, 'i');
      andConditions.push({
        $or: [
          { assetTag: regex },
          { assetName: regex },
          { category: regex },
          { employeeName: regex },
          { employeeId: regex },
          { employeeEmail: regex },
          { assignedByName: regex },
          { returnedByName: regex },
          { returnNotes: regex },
        ],
      });
    }

    const filter = andConditions.length > 1 ? { $and: andConditions } : andConditions.length === 1 ? andConditions[0] : {};

    const totalCount = await db.collection('asset_assignments').countDocuments(filter);
    const history = await db
      .collection('asset_assignments')
      .find(filter)
      .sort({ assignedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      success: true,
      data: history,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/assets/history:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to fetch assignment history' },
      { status: 500 }
    );
  }
}
