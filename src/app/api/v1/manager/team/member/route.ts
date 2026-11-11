import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    if (auth.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, message: 'Access Denied: Manager authorization required.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { employeeId, phone, department, designation, status } = body;

    if (!employeeId) {
      return NextResponse.json(
        { success: false, message: 'Employee ID is required.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const managerEmpId = auth.employeeId || auth.userId;

    const query: any = {
      organizationId: orgId,
      $or: [{ employeeId }, { id: employeeId }],
    };

    if (auth.role === 'MANAGER') {
      query.$and = [
        {
          $or: [
            { managerId: managerEmpId },
            { reportingTo: managerEmpId },
          ],
        },
      ];
    }

    const emp = await db.collection('employees').findOne(query);
    if (!emp) {
      return NextResponse.json(
        { success: false, message: 'Team member not found or not in your reporting line.' },
        { status: 404 }
      );
    }

    const updateFields: any = { updatedAt: new Date() };
    if (phone !== undefined) updateFields.phone = phone.trim();
    if (department !== undefined && department.trim()) updateFields.department = department.trim();
    if (designation !== undefined && designation.trim()) updateFields.designation = designation.trim();
    if (status !== undefined && status.trim()) updateFields.status = status.trim();

    await db.collection('employees').updateOne(
      { organizationId: orgId, employeeId: emp.employeeId || employeeId },
      { $set: updateFields }
    );

    // Sync status or designation in users collection if relevant
    const userUpdates: any = { updatedAt: new Date() };
    if (department !== undefined && department.trim()) userUpdates.department = department.trim();
    if (designation !== undefined && designation.trim()) userUpdates.designation = designation.trim();
    if (status !== undefined && status.trim()) userUpdates.status = status.trim();

    await db.collection('users').updateOne(
      { organizationId: orgId, employeeId: emp.employeeId || employeeId },
      { $set: userUpdates }
    );

    await logAuditEvent(req, 'UPDATE_TEAM_MEMBER', {
      employeeId: managerEmpId,
      details: {
        managerId: managerEmpId,
        targetEmployeeId: employeeId,
        updatedFields: updateFields,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Team member details updated successfully.',
      data: { employeeId, ...updateFields },
    });
  } catch (error: any) {
    console.error('Error updating team member:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update team member.' },
      { status: 500 }
    );
  }
}

