import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/assets/[id]/assign
 * Assigns an available asset to an active employee.
 * Strictly guarantees concurrency safety and prevents multiple active assignments.
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
    const { employeeId, expectedReturnDate, notes = '', conditionAtAssignment } = body;

    if (!employeeId?.trim()) {
      return NextResponse.json({ success: false, message: 'Target Employee ID is required.' }, { status: 400 });
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

    const effectiveOrgId = asset.organizationId;

    // Check if asset is already assigned or unavailable
    if (asset.status === 'ASSIGNED' || asset.assignedTo) {
      return NextResponse.json(
        {
          success: false,
          message: `Asset "${asset.assetTag}" is already assigned to ${asset.assignedTo?.employeeName || 'another employee'}. It must be returned first.`,
        },
        { status: 409 }
      );
    }

    if (asset.status === 'UNDER_MAINTENANCE' || asset.status === 'LOST' || asset.status === 'RETIRED') {
      return NextResponse.json(
        {
          success: false,
          message: `Asset "${asset.assetTag}" cannot be assigned because its current status is ${asset.status}.`,
        },
        { status: 400 }
      );
    }

    // Verify employee exists in the exact same organization
    const cleanEmpId = employeeId.trim();
    const employee = await db.collection('employees').findOne({
      organizationId: effectiveOrgId,
      $or: [
        { employeeId: cleanEmpId },
        { _id: ObjectId.isValid(cleanEmpId) ? new ObjectId(cleanEmpId) : undefined },
        { email: cleanEmpId.toLowerCase() },
      ].filter(Boolean),
    });

    if (!employee) {
      return NextResponse.json(
        { success: false, message: `Employee with ID "${cleanEmpId}" was not found in this organization.` },
        { status: 404 }
      );
    }

    const employeeFullName = employee.fullName || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.email;
    const employeeActualId = employee.employeeId || employee._id.toString();
    const employeeEmail = employee.email || '';
    const now = new Date();

    const assignmentCondition = conditionAtAssignment || asset.condition || 'GOOD';

    // Atomic compare-and-swap to guarantee no race condition on assignment
    const updateResult = await db.collection('assets').findOneAndUpdate(
      {
        _id: asset._id,
        organizationId: effectiveOrgId,
        status: { $in: ['AVAILABLE', 'GOOD', 'NEW'] },
        assignedTo: null,
      },
      {
        $set: {
          status: 'ASSIGNED',
          condition: assignmentCondition,
          assignedTo: {
            employeeId: employeeActualId,
            employeeName: employeeFullName,
            employeeEmail,
            assignedAt: now,
            expectedReturnDate: expectedReturnDate ? String(expectedReturnDate).trim() : undefined,
            assignmentNotes: notes ? String(notes).trim() : undefined,
          },
          updatedAt: now,
          updatedBy: auth.email || auth.userId,
        },
      },
      { returnDocument: 'after' }
    );

    if (!updateResult) {
      return NextResponse.json(
        {
          success: false,
          message: 'Conflict: This asset was modified or assigned concurrently by another session. Please refresh.',
        },
        { status: 409 }
      );
    }

    // Insert history record in asset_assignments
    const assignmentRecord = {
      organizationId: effectiveOrgId,
      assetId: asset._id.toString(),
      assetTag: asset.assetTag,
      assetName: asset.name,
      category: asset.category,
      employeeId: employeeActualId,
      employeeName: employeeFullName,
      employeeEmail,
      assignedAt: now,
      assignedBy: auth.email || auth.userId,
      assignedByName: auth.name || 'System User',
      expectedReturnDate: expectedReturnDate ? String(expectedReturnDate).trim() : undefined,
      conditionAtAssignment: assignmentCondition,
      assignmentNotes: notes ? String(notes).trim() : undefined,
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
        assetId: asset._id.toString(),
        assetTag: asset.assetTag,
        assetName: asset.name,
        assignedToEmployeeId: employeeActualId,
        assignedToEmployeeName: employeeFullName,
        expectedReturnDate,
      },
      organizationId: effectiveOrgId,
      employeeId: employeeActualId,
    });

    return NextResponse.json({
      success: true,
      message: `Asset ${asset.assetTag} successfully assigned to ${employeeFullName}.`,
      data: updateResult,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/assets/[id]/assign:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to assign asset' },
      { status: 500 }
    );
  }
}
