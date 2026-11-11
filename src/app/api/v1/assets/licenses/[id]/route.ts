import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function getFilter(id: string, orgId: string, isSuperAdmin: boolean) {
  const query: any = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
  if (!isSuperAdmin) {
    query.organizationId = orgId;
  }
  return query;
}

/**
 * PATCH /api/v1/assets/licenses/[id]
 * Updates a software license. Enforces that totalSeats >= current assignedSeats.
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

    const existing = await db.collection('software_licenses').findOne(getFilter(id, orgId, isSuperAdmin));
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Software license not found.' }, { status: 404 });
    }

    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.vendor !== undefined) updates.vendor = body.vendor.trim();
    if (body.licenseType !== undefined) updates.licenseType = body.licenseType.toUpperCase();
    if (body.licenseKey !== undefined) updates.licenseKey = body.licenseKey.trim();
    if (body.purchaseDate !== undefined) updates.purchaseDate = body.purchaseDate;
    if (body.expiryDate !== undefined) updates.expiryDate = body.expiryDate;
    if (body.renewalStatus !== undefined) updates.renewalStatus = body.renewalStatus.toUpperCase();
    if (body.cost !== undefined) updates.cost = body.cost !== '' ? Number(body.cost) : undefined;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.notes !== undefined) updates.notes = body.notes.trim();

    if (body.totalSeats !== undefined) {
      const seats = parseInt(body.totalSeats, 10);
      if (isNaN(seats) || seats < 1) {
        return NextResponse.json({ success: false, message: 'Total seats must be a positive number.' }, { status: 400 });
      }
      if (seats < (existing.assignedSeats || 0)) {
        return NextResponse.json(
          {
            success: false,
            message: `Cannot decrease total seats to ${seats}. There are currently ${existing.assignedSeats} active employee allocations. Revoke allocations first.`,
          },
          { status: 400 }
        );
      }
      updates.totalSeats = seats;
    }

    updates.updatedAt = new Date();
    updates.updatedBy = auth.email || auth.userId;

    await db.collection('software_licenses').updateOne(
      { _id: existing._id },
      { $set: updates }
    );

    await logAuditEvent(req, 'SOFTWARE_LICENSE_UPDATED', {
      details: {
        licenseId: existing._id.toString(),
        name: updates.name || existing.name,
        changedFields: Object.keys(updates),
      },
      organizationId: existing.organizationId,
    });

    const updated = await db.collection('software_licenses').findOne({ _id: existing._id });
    return NextResponse.json({
      success: true,
      message: 'Software license updated successfully.',
      data: updated,
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/v1/assets/licenses/[id]:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to update license' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/assets/licenses/[id]
 * Deletes / retires a software license.
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

    const existing = await db.collection('software_licenses').findOne(getFilter(id, orgId, isSuperAdmin));
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Software license not found.' }, { status: 404 });
    }

    if ((existing.assignedSeats || 0) > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete license "${existing.name}" because it still has ${existing.assignedSeats} assigned seats. Revoke seats first.`,
        },
        { status: 400 }
      );
    }

    await db.collection('software_licenses').updateOne(
      { _id: existing._id },
      {
        $set: {
          status: 'RETIRED',
          updatedAt: new Date(),
          updatedBy: auth.email || auth.userId,
        },
      }
    );

    await logAuditEvent(req, 'SOFTWARE_LICENSE_RETIRED', {
      details: {
        licenseId: existing._id.toString(),
        name: existing.name,
      },
      organizationId: existing.organizationId,
    });

    return NextResponse.json({
      success: true,
      message: `Software license "${existing.name}" has been retired successfully.`,
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/v1/assets/licenses/[id]:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to retire license' },
      { status: 500 }
    );
  }
}
