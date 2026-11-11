import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { isAssetTagUnique } from '@/lib/assetTag';
import { VALID_CATEGORIES, VALID_STATUSES, VALID_CONDITIONS } from '@/lib/assetConstants';

export const dynamic = 'force-dynamic';

function getFilter(id: string, orgId: string, isSuperAdmin: boolean) {
  const query: any = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { assetTag: id };
  if (!isSuperAdmin) {
    query.organizationId = orgId;
  }
  return query;
}

/**
 * GET /api/v1/assets/[id]
 * Retrieves single asset details along with assignment history.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { id } = await params;
    const { db } = await connectToDatabase();
    const isSuperAdmin = auth.role === 'SUPER_ADMIN';
    const orgId = auth.organizationId || 'org-default';

    const asset = await db.collection('assets').findOne(getFilter(id, orgId, isSuperAdmin));
    if (!asset) {
      return NextResponse.json({ success: false, message: 'Asset not found.' }, { status: 404 });
    }

    // Fetch assignment history for this asset
    const history = await db
      .collection('asset_assignments')
      .find({
        organizationId: asset.organizationId,
        $or: [{ assetId: asset._id.toString() }, { assetTag: asset.assetTag }],
      })
      .sort({ assignedAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      data: {
        ...asset,
        history,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/assets/[id]:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to fetch asset' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/assets/[id]
 * Updates asset metadata, condition, specifications, or location.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { id } = await params;
    const body = await req.json();
    const { db } = await connectToDatabase();
    const isSuperAdmin = auth.role === 'SUPER_ADMIN';
    const orgId = auth.organizationId || 'org-default';

    const existingAsset = await db.collection('assets').findOne(getFilter(id, orgId, isSuperAdmin));
    if (!existingAsset) {
      return NextResponse.json({ success: false, message: 'Asset not found.' }, { status: 404 });
    }

    const updates: any = {};
    const effectiveOrgId = existingAsset.organizationId;

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.brand !== undefined) updates.brand = body.brand.trim();
    if (body.model !== undefined) updates.model = body.model.trim();
    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.includes(body.category.trim())) {
        return NextResponse.json({ success: false, message: 'Invalid category.' }, { status: 400 });
      }
      updates.category = body.category.trim();
    }

    if (body.assetTag !== undefined && body.assetTag.trim().toUpperCase() !== existingAsset.assetTag) {
      const newTag = body.assetTag.trim().toUpperCase();
      const isUnique = await isAssetTagUnique(db, effectiveOrgId, newTag, existingAsset._id.toString());
      if (!isUnique) {
        return NextResponse.json(
          { success: false, message: `Asset Tag "${newTag}" already exists in this organization.` },
          { status: 409 }
        );
      }
      updates.assetTag = newTag;
    }

    if (body.serialNumber !== undefined) updates.serialNumber = body.serialNumber.trim();
    if (body.specifications !== undefined) updates.specifications = { ...existingAsset.specifications, ...body.specifications };
    if (body.purchaseDate !== undefined) updates.purchaseDate = body.purchaseDate;
    if (body.purchaseCost !== undefined) updates.purchaseCost = body.purchaseCost ? Number(body.purchaseCost) : undefined;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.warrantyExpiry !== undefined) updates.warrantyExpiry = body.warrantyExpiry;
    if (body.vendor !== undefined) updates.vendor = body.vendor.trim();
    if (body.invoiceNumber !== undefined) updates.invoiceNumber = body.invoiceNumber.trim();

    if (body.condition !== undefined) {
      if (!VALID_CONDITIONS.includes(body.condition)) {
        return NextResponse.json({ success: false, message: 'Invalid condition.' }, { status: 400 });
      }
      updates.condition = body.condition;
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ success: false, message: 'Invalid status.' }, { status: 400 });
      }
      // If changing status to anything other than ASSIGNED while currently ASSIGNED, alert user to use Return flow
      if (existingAsset.status === 'ASSIGNED' && body.status !== 'ASSIGNED' && !body.forceStatusUpdate) {
        return NextResponse.json(
          { success: false, message: 'This asset is currently assigned. Please use the Return Asset workflow to safely check it in.' },
          { status: 400 }
        );
      }
      updates.status = body.status;
    }

    if (body.location !== undefined) updates.location = body.location.trim();
    if (body.notes !== undefined) updates.notes = body.notes.trim();

    updates.updatedAt = new Date();
    updates.updatedBy = auth.email || auth.userId;

    await db.collection('assets').updateOne(
      { _id: existingAsset._id },
      { $set: updates }
    );

    await logAuditEvent(req, 'ASSET_UPDATED', {
      details: {
        assetId: existingAsset._id.toString(),
        assetTag: updates.assetTag || existingAsset.assetTag,
        changedFields: Object.keys(updates),
      },
      oldValue: {
        name: existingAsset.name,
        condition: existingAsset.condition,
        status: existingAsset.status,
        location: existingAsset.location,
      },
      newValue: updates,
      organizationId: effectiveOrgId,
    });

    const updatedAsset = await db.collection('assets').findOne({ _id: existingAsset._id });

    return NextResponse.json({
      success: true,
      message: 'Asset updated successfully.',
      data: updatedAsset,
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/v1/assets/[id]:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to update asset' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/assets/[id]
 * Safely archives an asset if it is not currently assigned to an employee.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { id } = await params;
    const { db } = await connectToDatabase();
    const isSuperAdmin = auth.role === 'SUPER_ADMIN';
    const orgId = auth.organizationId || 'org-default';

    const asset = await db.collection('assets').findOne(getFilter(id, orgId, isSuperAdmin));
    if (!asset) {
      return NextResponse.json({ success: false, message: 'Asset not found.' }, { status: 404 });
    }

    if (asset.status === 'ASSIGNED') {
      return NextResponse.json(
        { success: false, message: `Cannot archive asset ${asset.assetTag} because it is currently assigned to ${asset.assignedTo?.employeeName || 'an employee'}. Please return the asset first.` },
        { status: 400 }
      );
    }

    const now = new Date();
    await db.collection('assets').updateOne(
      { _id: asset._id },
      {
        $set: {
          isArchived: true,
          status: 'RETIRED',
          archivedAt: now,
          archivedBy: auth.email || auth.userId,
          updatedAt: now,
        },
      }
    );

    await logAuditEvent(req, 'ASSET_ARCHIVED', {
      details: {
        assetId: asset._id.toString(),
        assetTag: asset.assetTag,
        name: asset.name,
      },
      organizationId: asset.organizationId,
    });

    return NextResponse.json({
      success: true,
      message: `Asset ${asset.assetTag} has been archived successfully.`,
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/v1/assets/[id]:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to archive asset' },
      { status: 500 }
    );
  }
}
