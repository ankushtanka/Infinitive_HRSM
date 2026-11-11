import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { generateNextAssetTag, isAssetTagUnique } from '@/lib/assetTag';
import { VALID_CATEGORIES, VALID_STATUSES, VALID_CONDITIONS } from '@/lib/assetConstants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/assets
 * Lists assets with filters, pagination, and dashboard summary metrics.
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
    const limit = Math.max(1, Math.min(500, parseInt(searchParams.get('limit') || '50', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const category = searchParams.get('category')?.trim();
    const status = searchParams.get('status')?.trim();
    const location = searchParams.get('location')?.trim();
    const employeeId = searchParams.get('employeeId')?.trim();

    const { db } = await connectToDatabase();
    const requestedOrg = searchParams.get('organizationId')?.trim();
    const andConditions: any[] = [{ isArchived: { $ne: true } }];

    if (auth.role === 'SUPER_ADMIN') {
      if (requestedOrg && requestedOrg !== 'All') {
        andConditions.push({ organizationId: requestedOrg });
      }
    } else {
      andConditions.push({ organizationId: auth.organizationId || 'org-default' });
    }

    if (category && category !== 'All') {
      andConditions.push({ category });
    }
    if (status && status !== 'All') {
      andConditions.push({ status });
    }
    if (location && location !== 'All') {
      andConditions.push({ location: { $regex: new RegExp(location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } });
    }
    if (employeeId) {
      andConditions.push({ 'assignedTo.employeeId': employeeId });
    }

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safeSearch, 'i');
      andConditions.push({
        $or: [
          { assetTag: regex },
          { name: regex },
          { brand: regex },
          { model: regex },
          { serialNumber: regex },
          { 'specifications.imei': regex },
          { 'specifications.simNumber': regex },
          { 'specifications.phoneNumber': regex },
          { 'specifications.cardIdentifier': regex },
          { 'assignedTo.employeeName': regex },
          { 'assignedTo.employeeId': regex },
        ],
      });
    }

    const filter = andConditions.length > 1 ? { $and: andConditions } : andConditions[0];

    const totalCount = await db.collection('assets').countDocuments(filter);
    const assets = await db
      .collection('assets')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Compute metrics scoped to organization
    const orgBaseFilter: any = { isArchived: { $ne: true } };
    if (auth.role === 'SUPER_ADMIN') {
      if (requestedOrg && requestedOrg !== 'All') {
        orgBaseFilter.organizationId = requestedOrg;
      }
    } else {
      orgBaseFilter.organizationId = auth.organizationId || 'org-default';
    }

    const licenseBaseFilter: any = { status: { $ne: 'RETIRED' } };
    if (auth.role === 'SUPER_ADMIN') {
      if (requestedOrg && requestedOrg !== 'All') {
        licenseBaseFilter.organizationId = requestedOrg;
      }
    } else {
      licenseBaseFilter.organizationId = auth.organizationId || 'org-default';
    }

    const [
      totalAssets,
      assignedAssets,
      availableAssets,
      maintenanceAssets,
      lostAssets,
      retiredAssets,
      categoriesBreakdown,
    ] = await Promise.all([
      db.collection('assets').countDocuments(orgBaseFilter),
      db.collection('assets').countDocuments({ ...orgBaseFilter, status: 'ASSIGNED' }),
      db.collection('assets').countDocuments({ ...orgBaseFilter, status: 'AVAILABLE' }),
      db.collection('assets').countDocuments({ ...orgBaseFilter, status: 'UNDER_MAINTENANCE' }),
      db.collection('assets').countDocuments({ ...orgBaseFilter, status: 'LOST' }),
      db.collection('assets').countDocuments({ ...orgBaseFilter, status: 'RETIRED' }),
      db.collection('assets').aggregate([
        { $match: orgBaseFilter },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]).toArray(),
    ]);

    // Warranties expiring within 30 days
    const now = new Date();
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringWarranties = await db.collection('assets').countDocuments({
      ...orgBaseFilter,
      warrantyExpiry: {
        $gte: now.toISOString().split('T')[0],
        $lte: thirtyDaysAhead.toISOString().split('T')[0],
      },
    });

    // Expiring software licenses within 30 days
    const expiringLicenses = await db.collection('software_licenses').countDocuments({
      ...licenseBaseFilter,
      expiryDate: {
        $gte: now.toISOString().split('T')[0],
        $lte: thirtyDaysAhead.toISOString().split('T')[0],
      },
    });

    return NextResponse.json({
      success: true,
      data: assets,
      metrics: {
        totalAssets,
        assignedAssets,
        availableAssets,
        maintenanceAssets,
        lostAssets,
        retiredAssets,
        expiringWarranties,
        expiringLicenses,
        categoriesBreakdown: categoriesBreakdown.reduce((acc: any, curr: any) => {
          acc[curr._id || 'Other'] = curr.count;
          return acc;
        }, {}),
      },
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/assets:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to fetch assets' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/assets
 * Creates a new asset with automatic or verified unique asset tag.
 * Accessible to Admin, HR, Super Admin.
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
      category,
      brand,
      model,
      serialNumber,
      specifications = {},
      purchaseDate,
      purchaseCost,
      currency = 'INR',
      warrantyExpiry,
      vendor,
      invoiceNumber,
      condition = 'GOOD',
      status = 'AVAILABLE',
      location = 'Headquarters',
      notes,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, message: 'Asset name is required.' }, { status: 400 });
    }
    if (!category?.trim() || !VALID_CATEGORIES.includes(category.trim())) {
      return NextResponse.json(
        { success: false, message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    if (!VALID_CONDITIONS.includes(condition)) {
      return NextResponse.json(
        { success: false, message: `Invalid condition. Must be one of: ${VALID_CONDITIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.role === 'SUPER_ADMIN' && body.organizationId?.trim()
      ? body.organizationId.trim()
      : auth.organizationId || 'org-default';

    // Verify optional employee assignment if provided during creation
    const targetEmployeeId = (body.assignedToEmployeeId || body.assignedEmployeeId || '').trim();
    let assignedEmployeeRecord: any = null;

    if (targetEmployeeId && targetEmployeeId !== 'UNASSIGNED') {
      assignedEmployeeRecord = await db.collection('employees').findOne({
        organizationId: orgId,
        $or: [
          { employeeId: targetEmployeeId },
          { _id: ObjectId.isValid(targetEmployeeId) ? new ObjectId(targetEmployeeId) : undefined },
          { email: targetEmployeeId.toLowerCase() },
        ].filter(Boolean),
      });

      if (!assignedEmployeeRecord) {
        return NextResponse.json(
          { success: false, message: `Target employee "${targetEmployeeId}" was not found in this organization.` },
          { status: 404 }
        );
      }
    }

    // Handle Asset Tag (server generation or user specified with uniqueness check)
    let finalAssetTag = body.assetTag?.trim()?.toUpperCase();
    if (!finalAssetTag) {
      finalAssetTag = await generateNextAssetTag(db, orgId, category.trim());
    } else {
      const isUnique = await isAssetTagUnique(db, orgId, finalAssetTag);
      if (!isUnique) {
        return NextResponse.json(
          { success: false, message: `Asset Tag "${finalAssetTag}" already exists in this organization.` },
          { status: 409 }
        );
      }
    }

    // Optional serialNumber uniqueness check if provided
    if (serialNumber?.trim()) {
      const existingSerial = await db.collection('assets').findOne({
        organizationId: orgId,
        serialNumber: serialNumber.trim(),
        isArchived: { $ne: true },
      });
      if (existingSerial) {
        return NextResponse.json(
          { success: false, message: `Serial Number "${serialNumber.trim()}" is already registered for another asset (${existingSerial.assetTag}).` },
          { status: 409 }
        );
      }
    }

    const now = new Date();
    let effectiveStatus = status.trim();
    let initialAssignedTo: any = null;

    if (assignedEmployeeRecord) {
      const empFullName = assignedEmployeeRecord.fullName || `${assignedEmployeeRecord.firstName || ''} ${assignedEmployeeRecord.lastName || ''}`.trim() || assignedEmployeeRecord.email;
      const empActualId = assignedEmployeeRecord.employeeId || assignedEmployeeRecord._id.toString();
      const empEmail = assignedEmployeeRecord.email || '';
      const assignDate = body.assignedAt ? new Date(body.assignedAt) : now;

      effectiveStatus = 'ASSIGNED';
      initialAssignedTo = {
        employeeId: empActualId,
        employeeName: empFullName,
        employeeEmail: empEmail,
        assignedAt: assignDate,
        expectedReturnDate: body.expectedReturnDate ? String(body.expectedReturnDate).trim() : undefined,
        assignmentNotes: body.assignmentNotes ? String(body.assignmentNotes).trim() : undefined,
      };
    }

    const newAsset: any = {
      organizationId: orgId,
      assetTag: finalAssetTag,
      name: name.trim(),
      category: category.trim(),
      brand: (brand || '').trim(),
      model: (model || '').trim(),
      serialNumber: (serialNumber || '').trim(),
      specifications: specifications || {},
      purchaseDate: purchaseDate ? String(purchaseDate).trim() : undefined,
      purchaseCost: purchaseCost ? Number(purchaseCost) : undefined,
      currency: currency ? String(currency).trim() : 'INR',
      warrantyExpiry: warrantyExpiry ? String(warrantyExpiry).trim() : undefined,
      vendor: (vendor || '').trim(),
      invoiceNumber: (invoiceNumber || '').trim(),
      condition: condition.trim(),
      status: effectiveStatus,
      location: (location || 'Headquarters').trim(),
      notes: (notes || '').trim(),
      assignedTo: initialAssignedTo,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.email || auth.userId,
      updatedBy: auth.email || auth.userId,
    };

    const result = await db.collection('assets').insertOne(newAsset);
    newAsset._id = result.insertedId;

    if (assignedEmployeeRecord && initialAssignedTo) {
      const assignmentRecord = {
        organizationId: orgId,
        assetId: result.insertedId.toString(),
        assetTag: finalAssetTag,
        assetName: newAsset.name,
        category: newAsset.category,
        employeeId: initialAssignedTo.employeeId,
        employeeName: initialAssignedTo.employeeName,
        employeeEmail: initialAssignedTo.employeeEmail,
        assignedAt: initialAssignedTo.assignedAt,
        assignedBy: auth.email || auth.userId,
        assignedByName: auth.name || 'System User',
        expectedReturnDate: initialAssignedTo.expectedReturnDate,
        conditionAtAssignment: newAsset.condition || 'GOOD',
        assignmentNotes: initialAssignedTo.assignmentNotes,
        returnedAt: null,
        returnedBy: null,
        returnedByName: null,
        conditionAtReturn: null,
        returnNotes: null,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };

      await db.collection('asset_assignments').insertOne(assignmentRecord);

      await logAuditEvent(req, 'ASSET_ASSIGNED', {
        details: {
          assetId: result.insertedId.toString(),
          assetTag: finalAssetTag,
          assetName: newAsset.name,
          assignedToEmployeeId: initialAssignedTo.employeeId,
          assignedToEmployeeName: initialAssignedTo.employeeName,
          expectedReturnDate: initialAssignedTo.expectedReturnDate,
        },
        organizationId: orgId,
        employeeId: initialAssignedTo.employeeId,
      });
    }

    await logAuditEvent(req, 'ASSET_CREATED', {
      details: {
        assetId: result.insertedId.toString(),
        assetTag: finalAssetTag,
        name: newAsset.name,
        category: newAsset.category,
        brand: newAsset.brand,
        model: newAsset.model,
        serialNumber: newAsset.serialNumber,
        status: newAsset.status,
      },
      organizationId: orgId,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Asset ${finalAssetTag} created successfully.`,
        data: newAsset,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/assets:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to create asset' },
      { status: 500 }
    );
  }
}
