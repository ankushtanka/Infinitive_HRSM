import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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
    const { employeeId, employeeIds } = body;

    const targetEmpIds: string[] = [];
    if (Array.isArray(employeeIds) && employeeIds.length > 0) {
      targetEmpIds.push(...employeeIds);
    } else if (employeeId) {
      targetEmpIds.push(employeeId);
    }

    if (targetEmpIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'At least one employeeId is required.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const managerEmpId = auth.employeeId || auth.userId;

    // Prevent manager from assigning themselves
    const filteredTargetIds = targetEmpIds.filter((id) => id !== managerEmpId);
    if (filteredTargetIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Cannot assign yourself to your own team.' },
        { status: 400 }
      );
    }

    const now = new Date();

    // Update employees collection
    const result = await db.collection('employees').updateMany(
      {
        organizationId: orgId,
        $or: [
          { employeeId: { $in: filteredTargetIds } },
          { id: { $in: filteredTargetIds } },
        ],
      },
      {
        $set: {
          managerId: managerEmpId,
          reportingTo: managerEmpId,
          updatedAt: now,
        },
      }
    );

    // Also sync in users collection if exists
    await db.collection('users').updateMany(
      {
        organizationId: orgId,
        employeeId: { $in: filteredTargetIds },
      },
      {
        $set: {
          managerId: managerEmpId,
          reportingTo: managerEmpId,
          updatedAt: now,
        },
      }
    );

    await logAuditEvent(req, 'ASSIGN_TEAM_MEMBER', {
      employeeId: managerEmpId,
      details: {
        managerId: managerEmpId,
        assignedEmployees: filteredTargetIds,
        modifiedCount: result.modifiedCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully added ${result.modifiedCount} employee(s) to your team.`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error: any) {
    console.error('Error assigning team members:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to assign team member.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    let employeeId = searchParams.get('employeeId')?.trim();

    if (!employeeId) {
      try {
        const body = await req.json();
        employeeId = body.employeeId?.trim();
      } catch {
        // empty body ok
      }
    }

    if (!employeeId) {
      return NextResponse.json(
        { success: false, message: 'Employee ID is required to remove from team.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const managerEmpId = auth.employeeId || auth.userId;

    // Verify employee belongs to this manager or caller is HR/Admin
    const filter: any = {
      organizationId: orgId,
      $or: [{ employeeId }, { id: employeeId }],
    };

    if (auth.role === 'MANAGER') {
      filter.$and = [
        {
          $or: [
            { managerId: managerEmpId },
            { reportingTo: managerEmpId },
          ],
        },
      ];
    }

    const now = new Date();

    const emp = await db.collection('employees').findOne(filter);
    if (!emp && auth.role === 'MANAGER') {
      return NextResponse.json(
        { success: false, message: 'Member not found in your team.' },
        { status: 404 }
      );
    }

    const result = await db.collection('employees').updateOne(
      { organizationId: orgId, employeeId: emp?.employeeId || employeeId },
      {
        $set: {
          managerId: null,
          reportingTo: null,
          updatedAt: now,
        },
      }
    );

    // Also update users collection
    await db.collection('users').updateOne(
      { organizationId: orgId, employeeId: emp?.employeeId || employeeId },
      {
        $set: {
          managerId: null,
          reportingTo: null,
          updatedAt: now,
        },
      }
    );

    await logAuditEvent(req, 'UNASSIGN_TEAM_MEMBER', {
      employeeId: managerEmpId,
      details: {
        managerId: managerEmpId,
        removedEmployeeId: employeeId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Employee successfully removed from your team.',
    });
  } catch (error: any) {
    console.error('Error removing team member:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to remove member from team.' },
      { status: 500 }
    );
  }
}

