import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

// GET /api/v1/diag - Protected Diagnostic Endpoint (Super Admin Only)
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json(
        { success: false, message: 'Forbidden. Diagnostic access is restricted.' },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();
    const pingResult = await db.command({ ping: 1 });
    const usersCount = await db.collection('users').countDocuments();

    return NextResponse.json({
      success: true,
      status: 'OPERATIONAL',
      timestamp: new Date().toISOString(),
      diagnostics: {
        databaseName: db.databaseName,
        connectionStatus: 'PASSED',
        pingStatus: pingResult?.ok === 1 ? 'PASSED' : 'FAILED',
        usersCount,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: 'Diagnostic check unavailable.' },
      { status: 500 }
    );
  }
}
