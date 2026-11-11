import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

import { VALID_LICENSE_TYPES, VALID_RENEWAL_STATUSES } from '@/lib/assetConstants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/assets/licenses
 * Lists software licenses for the organization.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim();

    const { db } = await connectToDatabase();
    const requestedOrg = searchParams.get('organizationId')?.trim();
    const andConditions: any[] = [{ status: { $ne: 'RETIRED' } }];

    if (auth.role === 'SUPER_ADMIN') {
      if (requestedOrg && requestedOrg !== 'All') {
        andConditions.push({ organizationId: requestedOrg });
      }
    } else {
      andConditions.push({ organizationId: auth.organizationId || 'org-default' });
    }

    if (status && status !== 'All') {
      andConditions.push({ renewalStatus: status });
    }

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safeSearch, 'i');
      andConditions.push({
        $or: [{ name: regex }, { vendor: regex }, { licenseType: regex }],
      });
    }

    const filter = andConditions.length > 1 ? { $and: andConditions } : andConditions[0];

    const licenses = await db
      .collection('software_licenses')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      data: licenses,
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/assets/licenses:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to fetch software licenses' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/assets/licenses
 * Creates a new software license record.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    const {
      name,
      vendor,
      licenseType = 'SUBSCRIPTION',
      licenseKey,
      totalSeats = 1,
      purchaseDate,
      expiryDate,
      renewalStatus = 'ACTIVE',
      cost,
      currency = 'INR',
      notes,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, message: 'Software name is required.' }, { status: 400 });
    }
    if (!vendor?.trim()) {
      return NextResponse.json({ success: false, message: 'Software vendor is required.' }, { status: 400 });
    }

    const seatsNum = parseInt(totalSeats, 10);
    if (isNaN(seatsNum) || seatsNum < 1) {
      return NextResponse.json({ success: false, message: 'Total seats must be at least 1.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.role === 'SUPER_ADMIN' && body.organizationId?.trim()
      ? body.organizationId.trim()
      : auth.organizationId || 'org-default';

    const now = new Date();
    const newLicense: any = {
      organizationId: orgId,
      name: name.trim(),
      vendor: vendor.trim(),
      licenseType: licenseType.toUpperCase(),
      licenseKey: licenseKey ? String(licenseKey).trim() : undefined,
      totalSeats: seatsNum,
      assignedSeats: 0,
      allocations: [],
      purchaseDate: purchaseDate ? String(purchaseDate).trim() : undefined,
      expiryDate: expiryDate ? String(expiryDate).trim() : undefined,
      renewalStatus: renewalStatus.toUpperCase(),
      cost: cost !== undefined ? Number(cost) : undefined,
      currency: currency || 'INR',
      notes: notes ? String(notes).trim() : undefined,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: auth.email || auth.userId,
      updatedBy: auth.email || auth.userId,
    };

    const result = await db.collection('software_licenses').insertOne(newLicense);
    newLicense._id = result.insertedId;

    await logAuditEvent(req, 'SOFTWARE_LICENSE_CREATED', {
      details: {
        licenseId: result.insertedId.toString(),
        name: newLicense.name,
        vendor: newLicense.vendor,
        totalSeats: newLicense.totalSeats,
      },
      organizationId: orgId,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Software license for ${name} added successfully.`,
        data: newLicense,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/assets/licenses:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to create license' },
      { status: 500 }
    );
  }
}
