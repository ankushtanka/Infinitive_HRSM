import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { VALID_CONDITIONS } from '@/lib/assetConstants';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/assets/[id]/reassign
 * Safely reassigns an active asset from one employee to another.
 * Automatically closes previous active assignment with return details
 * and opens a new active assignment history record.
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
    const {
      newEmployeeId,
      assignmentDate,
      expectedReturnDate,
      conditionAtAssignment,
      notes = '',
      previousReturnCondition = 'GOOD',
      previousReturnNotes = '',
    } = body;

    if (!newEmployeeId?.trim()) {
      return NextResponse.json({ success: false, message: 'New target Employee ID is required.' }, { status: 400 });
    }

    if (conditionAtAssignment && !VALID_CONDITIONS.includes(conditionAtAssignment)) {
      return NextResponse.json(
        { success: false, message: `Invalid assignment condition. Must be one of: ${VALID_CONDITIONS.join(', ')}` },
        { status: 400 }
      );
    }

    if (previousReturnCondition && !VALID_CONDITIONS.includes(previousReturnCondition)) {
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

    const effectiveOrgId = asset.organizationId;

    if (asset.status !== 'ASSIGNED' || !asset.assignedTo) {
      return NextResponse.json(
        {
          success: false,
          message: `Asset "${asset.assetTag}" is not currently assigned. Please use the Assign workflow instead.`,
        },
        { status: 400 }
      );
    }

    const currentAssignee = asset.assignedTo;
    const cleanNewEmpId = newEmployeeId.trim();

    // Verify target new employee exists in the exact same organization
    const newEmployee = await db.collection('employees').findOne({
      organizationId: effectiveOrgId,
      $or: [
        { employeeId: cleanNewEmpId },
        { _id: ObjectId.isValid(cleanNewEmpId) ? new ObjectId(cleanNewEmpId) : undefined },
        { email: cleanNewEmpId.toLowerCase() },
      ].filter(Boolean),
    });

    if (!newEmployee) {
      return NextResponse.json(
        { success: false, message: `Employee with ID "${cleanNewEmpId}" was not found in this organization.` },
        { status: 404 }
      );
    }

    const newEmployeeFullName =
      newEmployee.fullName ||
      `${newEmployee.firstName || ''} ${newEmployee.lastName || ''}`.trim() ||
      newEmployee.email;
    const newEmployeeActualId = newEmployee.employeeId || newEmployee._id.toString();
    const newEmployeeEmail = newEmployee.email || '';

    // Prevent reassigning to the exact same employee
    if (
      currentAssignee.employeeId === newEmployeeActualId ||
      currentAssignee.employeeEmail?.toLowerCase() === newEmployeeEmail.toLowerCase()
    ) {
      return NextResponse.json(
        {
          success: false,
          message: `Asset is already assigned to ${currentAssignee.employeeName} (${currentAssignee.employeeId}). Please select a different employee.`,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const effectiveAssignDate = assignmentDate ? new Date(assignmentDate) : now;
    const effectiveCondition = conditionAtAssignment || asset.condition || 'GOOD';

    // 1. Close out previous active assignment in history
    await db.collection('asset_assignments').updateMany(
      {
        organizationId: effectiveOrgId,
        assetId: asset._id.toString(),
        status: 'ACTIVE',
      },
      {
        $set: {
          returnedAt: effectiveAssignDate,
          returnedBy: auth.email || auth.userId,
          returnedByName: auth.name || 'System User',
          conditionAtReturn: previousReturnCondition || asset.condition || 'GOOD',
          returnNotes:
            previousReturnNotes || `Reassigned to ${newEmployeeFullName} (${newEmployeeActualId})`,
          status: 'RETURNED',
          updatedAt: now,
        },
      }
    );

    // 2. Insert new assignment history record
    const newAssignmentRecord = {
      organizationId: effectiveOrgId,
      assetId: asset._id.toString(),
      assetTag: asset.assetTag,
      assetName: asset.name,
      category: asset.category,
      employeeId: newEmployeeActualId,
      employeeName: newEmployeeFullName,
      employeeEmail: newEmployeeEmail,
      assignedAt: effectiveAssignDate,
      assignedBy: auth.email || auth.userId,
      assignedByName: auth.name || 'System User',
      expectedReturnDate: expectedReturnDate ? String(expectedReturnDate).trim() : undefined,
      conditionAtAssignment: effectiveCondition,
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

    await db.collection('asset_assignments').insertOne(newAssignmentRecord);

    // 3. Atomically update the asset document
    const updatedAsset = await db.collection('assets').findOneAndUpdate(
      {
        _id: asset._id,
        organizationId: effectiveOrgId,
      },
      {
        $set: {
          status: 'ASSIGNED',
          condition: effectiveCondition,
          assignedTo: {
            employeeId: newEmployeeActualId,
            employeeName: newEmployeeFullName,
            employeeEmail: newEmployeeEmail,
            assignedAt: effectiveAssignDate,
            expectedReturnDate: expectedReturnDate ? String(expectedReturnDate).trim() : undefined,
            assignmentNotes: notes ? String(notes).trim() : undefined,
          },
          updatedAt: now,
          updatedBy: auth.email || auth.userId,
        },
      },
      { returnDocument: 'after' }
    );

    await logAuditEvent(req, 'ASSET_REASSIGNED', {
      details: {
        assetId: asset._id.toString(),
        assetTag: asset.assetTag,
        assetName: asset.name,
        previousEmployeeId: currentAssignee.employeeId,
        previousEmployeeName: currentAssignee.employeeName,
        newEmployeeId: newEmployeeActualId,
        newEmployeeName: newEmployeeFullName,
        reassignmentDate: effectiveAssignDate,
      },
      organizationId: effectiveOrgId,
      employeeId: newEmployeeActualId,
    });

    return NextResponse.json({
      success: true,
      message: `Asset ${asset.assetTag} successfully reassigned from ${currentAssignee.employeeName} to ${newEmployeeFullName}.`,
      data: updatedAsset,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/assets/[id]/reassign:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to reassign asset' },
      { status: 500 }
    );
  }
}
