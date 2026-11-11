import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext } from '@/lib/auth';
import { verifyPassword, hashPassword } from '@/lib/cryptoAuth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if (!auth.isAuthenticated || !auth.userId) {
      return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, message: 'Current password and new password are required.' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, message: 'New password must be at least 6 characters.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const userDoc = await db.collection('users').findOne({
      organizationId: auth.organizationId,
      email: auth.email.toLowerCase(),
    });

    if (!userDoc) {
      return NextResponse.json({ success: false, message: 'User account not found.' }, { status: 404 });
    }

    // Verify current password match
    const isPasswordValid = verifyPassword(currentPassword, userDoc.passwordHash || userDoc.password, userDoc.salt);
    if (!isPasswordValid) {
      return NextResponse.json({ success: false, message: 'Current password entered is incorrect.' }, { status: 400 });
    }

    const { formatted: newPasswordHash, salt } = hashPassword(newPassword);

    // Update password in users collection
    await db.collection('users').updateOne(
      { organizationId: auth.organizationId, email: auth.email.toLowerCase() },
      {
        $set: {
          passwordHash: newPasswordHash,
          salt,
          updatedAt: new Date(),
        },
        $unset: { password: '' },
      }
    );

    await logAuditEvent(req, 'CHANGE_PASSWORD', { details: { email: auth.email, userId: auth.userId } });
    await db.collection('user_sessions').deleteMany({
      userId: auth.userId,
      organizationId: auth.organizationId,
    });

    return NextResponse.json({
      success: true,
      message: 'Your password has been changed successfully.',
    });
  } catch (error: any) {
    console.error('Error changing password:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to change password' }, { status: 500 });
  }
}
