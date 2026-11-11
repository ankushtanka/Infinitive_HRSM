import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { peekNextEmployeeId, peekNextSuperAdminId } from '@/lib/employeeId';

export const dynamic = 'force-dynamic';

// GET /api/v1/employees/next-id - Return the next available standardized Employee ID preview
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const requestedRole = searchParams.get('role')?.trim()?.toUpperCase();
    const requestedOrg = searchParams.get('organizationId')?.trim();
    const orgId = auth.role === 'SUPER_ADMIN' && requestedOrg ? requestedOrg : (auth.organizationId || 'org-default');

    if (requestedRole === 'SUPER_ADMIN') {
      const nextId = await peekNextSuperAdminId(db);
      return NextResponse.json({
        success: true,
        data: {
          employeeId: nextId,
          organizationId: orgId,
          role: 'SUPER_ADMIN',
        },
      });
    }

    const nextId = await peekNextEmployeeId(db, orgId);

    return NextResponse.json({
      success: true,
      data: {
        employeeId: nextId,
        organizationId: orgId,
      },
    });
  } catch (error: any) {
    console.error('Error calculating next employee ID preview:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to generate next Employee ID' },
      { status: 500 }
    );
  }
}
