import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
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
    const search = searchParams.get('search')?.trim() || '';

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const managerEmpId = auth.employeeId || auth.userId;

    // Exclude the manager themselves and employees already assigned to this manager
    const query: any = {
      organizationId: orgId,
      employeeId: { $ne: managerEmpId },
      managerId: { $ne: managerEmpId },
      reportingTo: { $ne: managerEmpId },
    };

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { name: regex },
        { email: regex },
        { employeeId: regex },
        { department: regex },
        { designation: regex },
      ];
    }

    const employees = await db
      .collection('employees')
      .find(query, {
        projection: {
          _id: 1,
          employeeId: 1,
          firstName: 1,
          lastName: 1,
          name: 1,
          email: 1,
          department: 1,
          designation: 1,
          status: 1,
          photoUrl: 1,
          avatar: 1,
          managerId: 1,
          reportingTo: 1,
        },
      })
      .limit(50)
      .toArray();

    const formatted = employees.map((emp) => ({
      id: emp._id.toString(),
      employeeId: emp.employeeId || emp._id.toString(),
      name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Employee',
      email: emp.email || '',
      department: emp.department || 'General',
      designation: emp.designation || 'Staff',
      status: emp.status || 'Active',
      photoUrl: emp.photoUrl || emp.avatar || null,
      currentManagerId: emp.managerId || emp.reportingTo || null,
    }));

    return NextResponse.json({
      success: true,
      data: formatted,
    });
  } catch (error: any) {
    console.error('Error fetching unassigned employees:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load eligible team candidates.' },
      { status: 500 }
    );
  }
}

