import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/assets/licenses/[id]/revoke
 * Revokes a software license seat allocation from an employee.
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
    const { employeeId, allocationId } = body;

    if (!employeeId && !allocationId) {
      return NextResponse.json(
        { success: false, message: 'Either employeeId or allocationId must be specified to revoke a seat.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const isSuperAdmin = auth.role === 'SUPER_ADMIN';
    const orgId = auth.organizationId || 'org-default';

    const licenseQuery: any = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
    if (!isSuperAdmin) {
      licenseQuery.organizationId = orgId;
    }

    const license = await db.collection('software_licenses').findOne(licenseQuery);
    if (!license) {
      return NextResponse.json({ success: false, message: 'Software license not found.' }, { status: 404 });
    }

    const effectiveOrgId = license.organizationId;
    const targetAllocation = (license.allocations || []).find(
      (a: any) =>
        (allocationId && a.allocationId === allocationId) ||
        (employeeId && a.employeeId === employeeId)
    );

    if (!targetAllocation) {
      return NextResponse.json(
        { success: false, message: 'Matching seat allocation was not found on this license.' },
        { status: 404 }
      );
    }

    const now = new Date();
    // Concurrency-safe pull and decrement
    const updateResult = await db.collection('software_licenses').findOneAndUpdate(
      {
        _id: license._id,
        organizationId: effectiveOrgId,
        $expr: { $gt: ['$assignedSeats', 0] },
      },
      {
        $inc: { assignedSeats: -1 },
        $pull: {
          allocations: {
            $or: [
              { allocationId: targetAllocation.allocationId },
              { employeeId: targetAllocation.employeeId },
            ],
          } as any,
        },
        $set: { updatedAt: now, updatedBy: auth.email || auth.userId },
      },
      { returnDocument: 'after' }
    );

    if (!updateResult) {
      return NextResponse.json(
        { success: false, message: 'Failed to revoke seat. The allocation may have already been removed.' },
        { status: 409 }
      );
    }

    await logAuditEvent(req, 'LICENSE_SEAT_REVOKED', {
      details: {
        licenseId: license._id.toString(),
        licenseName: license.name,
        employeeId: targetAllocation.employeeId,
        employeeName: targetAllocation.employeeName,
        newAssignedSeats: updateResult.assignedSeats,
      },
      organizationId: effectiveOrgId,
      employeeId: targetAllocation.employeeId,
    });

    return NextResponse.json({
      success: true,
      message: `Seat for ${license.name} revoked from ${targetAllocation.employeeName}.`,
      data: updateResult,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/assets/licenses/[id]/revoke:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to revoke license seat' },
      { status: 500 }
    );
  }
}
