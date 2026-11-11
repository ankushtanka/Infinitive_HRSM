import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/assets/licenses/[id]/assign
 * Allocates a software license seat to an employee.
 * Strictly enforces total seat limits and prevents duplicate employee assignments.
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
    const { employeeId, notes = '' } = body;

    if (!employeeId?.trim()) {
      return NextResponse.json({ success: false, message: 'Target Employee ID is required.' }, { status: 400 });
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

    // Verify employee exists in the organization
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
        { success: false, message: `Employee "${cleanEmpId}" was not found in this organization.` },
        { status: 404 }
      );
    }

    const employeeActualId = employee.employeeId || employee._id.toString();
    const employeeFullName = employee.fullName || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.email;
    const employeeEmail = employee.email || '';

    // Check if employee already has an active allocation for this license
    const alreadyAllocated = (license.allocations || []).some(
      (a: any) => a.employeeId === employeeActualId || a.employeeEmail?.toLowerCase() === employeeEmail.toLowerCase()
    );

    if (alreadyAllocated) {
      return NextResponse.json(
        { success: false, message: `${employeeFullName} already has a seat assigned for ${license.name}.` },
        { status: 409 }
      );
    }

    // Check seat capacity limit
    const totalSeats = license.totalSeats || 1;
    const assignedSeats = license.assignedSeats || 0;
    if (assignedSeats >= totalSeats) {
      return NextResponse.json(
        {
          success: false,
          message: `License seat limit reached (${assignedSeats}/${totalSeats} seats used). Increase total seats or revoke unused seats before allocating.`,
        },
        { status: 409 }
      );
    }

    const allocationId = new ObjectId().toString();
    const now = new Date();
    const allocation = {
      allocationId,
      employeeId: employeeActualId,
      employeeName: employeeFullName,
      employeeEmail,
      assignedAt: now,
      assignedBy: auth.email || auth.userId,
      notes: notes ? String(notes).trim() : undefined,
    };

    // Concurrency-safe atomic seat increment with condition
    const updateResult = await db.collection('software_licenses').findOneAndUpdate(
      {
        _id: license._id,
        organizationId: effectiveOrgId,
        $expr: { $lt: ['$assignedSeats', '$totalSeats'] },
      },
      {
        $inc: { assignedSeats: 1 },
        $push: { allocations: allocation as any },
        $set: { updatedAt: now, updatedBy: auth.email || auth.userId },
      },
      { returnDocument: 'after' }
    );

    if (!updateResult) {
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to assign seat. All available seats were claimed by another concurrent request.',
        },
        { status: 409 }
      );
    }

    await logAuditEvent(req, 'LICENSE_SEAT_ASSIGNED', {
      details: {
        licenseId: license._id.toString(),
        licenseName: license.name,
        employeeId: employeeActualId,
        employeeName: employeeFullName,
        assignedSeats: updateResult.assignedSeats,
        totalSeats: updateResult.totalSeats,
      },
      organizationId: effectiveOrgId,
      employeeId: employeeActualId,
    });

    return NextResponse.json({
      success: true,
      message: `Seat for ${license.name} successfully assigned to ${employeeFullName}.`,
      data: updateResult,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/assets/licenses/[id]/assign:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to assign license seat' },
      { status: 500 }
    );
  }
}
