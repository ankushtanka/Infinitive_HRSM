import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { VALID_CONDITIONS, VALID_STATUSES } from '@/lib/assetConstants';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/assets/[id]/return
 * Checks in an assigned asset, records return condition and notes, and updates assignment history.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { id } = await params;
    const body = await req.json();
    const { returnCondition = 'GOOD', returnNotes = '', newStatus, returnDate } = body;

    if (!VALID_CONDITIONS.includes(returnCondition)) {
      return NextResponse.json(
        { success: false, message: `Invalid return condition. Must be one of: ${VALID_CONDITIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const isSuperAdmin = auth.role === 'SUPER_ADMIN';
    const orgId = auth.organizationId || 'org-default';

    const assetQuery: any = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { assetTag: id };
    if (!isSuperAdmin) {
      assetQuery.organizationId = orgId;
    }

    const asset = await db.collection('assets').findOne(assetQuery);
    if (!asset) {
      return NextResponse.json({ success: false, message: 'Asset not found.' }, { status: 404 });
    }

    if (asset.status !== 'ASSIGNED' || !asset.assignedTo) {
      return NextResponse.json(
        { success: false, message: `Asset "${asset.assetTag}" is not currently assigned. Current status: ${asset.status}.` },
        { status: 400 }
      );
    }

    const effectiveOrgId = asset.organizationId;
    const previousAssignee = asset.assignedTo;
    const now = new Date();

    // Determine target asset status after return
    let targetStatus = newStatus || 'AVAILABLE';
    if (['DAMAGED', 'DEFECTIVE'].includes(returnCondition) && !newStatus) {
      targetStatus = 'UNDER_MAINTENANCE';
    }
    if (!VALID_STATUSES.includes(targetStatus)) {
      targetStatus = 'AVAILABLE';
    }

    // Atomically update asset
    const updateResult = await db.collection('assets').findOneAndUpdate(
      {
        _id: asset._id,
        organizationId: effectiveOrgId,
        status: 'ASSIGNED',
      },
      {
        $set: {
          status: targetStatus,
          condition: returnCondition,
          assignedTo: null,
          updatedAt: now,
          updatedBy: auth.email || auth.userId,
        },
      },
      { returnDocument: 'after' }
    );

    if (!updateResult) {
      return NextResponse.json(
        { success: false, message: 'Asset return conflict. The asset status was changed concurrently.' },
        { status: 409 }
      );
    }

    // Close out active assignment in history
    const effectiveReturnDate = returnDate ? new Date(returnDate) : now;
    await db.collection('asset_assignments').updateMany(
      {
        organizationId: effectiveOrgId,
        assetId: asset._id.toString(),
        status: 'ACTIVE',
      },
      {
        $set: {
          returnedAt: effectiveReturnDate,
          returnedBy: auth.email || auth.userId,
          returnedByName: auth.name || 'System User',
          conditionAtReturn: returnCondition,
          returnNotes: returnNotes ? String(returnNotes).trim() : undefined,
          status: 'RETURNED',
          updatedAt: now,
        },
      }
    );

    await logAuditEvent(req, 'ASSET_RETURNED', {
      details: {
        assetId: asset._id.toString(),
        assetTag: asset.assetTag,
        assetName: asset.name,
        returnedFromEmployeeId: previousAssignee?.employeeId,
        returnedFromEmployeeName: previousAssignee?.employeeName,
        returnCondition,
        targetStatus,
        returnNotes,
      },
      organizationId: effectiveOrgId,
      employeeId: previousAssignee?.employeeId,
    });

    return NextResponse.json({
      success: true,
      message: `Asset ${asset.assetTag} successfully returned and marked as ${targetStatus}.`,
      data: updateResult,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/assets/[id]/return:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to return asset' },
      { status: 500 }
    );
  }
}
