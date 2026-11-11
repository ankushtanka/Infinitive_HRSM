import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { generateSecureToken, hashToken, hashPassword } from '@/lib/cryptoAuth';
import { sendOtpEmail } from '@/lib/email';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// POST /api/v1/super-admin/users/[id]/reset-password
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const userId = params.id;
    const body = await req.json().catch(() => ({}));
    const { mode = 'EMAIL_LINK', customPassword } = body;

    const { db } = await connectToDatabase();
    const now = new Date();

    let query: any = {};
    if (ObjectId.isValid(userId)) {
      query.$or = [{ _id: new ObjectId(userId) }, { id: userId }, { email: userId }];
    } else {
      query.$or = [{ id: userId }, { email: userId }];
    }

    const userDoc = await db.collection('users').findOne(query);

    if (!userDoc) {
      return NextResponse.json({ success: false, message: 'User record not found.' }, { status: 404 });
    }

    const cleanEmail = (userDoc.email || '').trim().toLowerCase();
    const targetUserId = userDoc.id || userDoc._id.toString();

    if (mode === 'TEMP_PASSWORD') {
      // Generate a strong temporary password or use custom
      let tempPass = customPassword?.trim();
      if (!tempPass) {
        const randomChars = generateSecureToken(6);
        tempPass = `Temp#${randomChars}9!`;
      }

      if (tempPass.length < 8) {
        return NextResponse.json(
          { success: false, message: 'Temporary password must be at least 8 characters long.' },
          { status: 400 }
        );
      }

      const { formatted, salt } = hashPassword(tempPass);

      // Invalidate existing sessions so user is logged out immediately
      await db.collection('user_sessions').deleteMany({
        $or: [{ userId: targetUserId }, { email: cleanEmail }],
      });

      // Update password hash and flag must change password
      await db.collection('users').updateOne(
        { _id: userDoc._id },
        {
          $set: {
            passwordHash: formatted,
            salt,
            mustChangePasswordOnNextLogin: true,
            updatedAt: now,
          },
        }
      );

      // Audit log
      await logAuditEvent(req, 'ADMIN_TEMP_PASSWORD_GENERATED', {
        details: {
          targetUserId,
          targetEmail: cleanEmail,
          performedBy: auth.email || auth.userId,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Temporary password generated successfully. User sessions have been revoked.',
        data: {
          tempPassword: tempPass,
          email: cleanEmail,
          mustChangeOnLogin: true,
        },
      });
    }

    // Default: Dispatch Password Reset Email Link
    const resetToken = generateSecureToken(32);
    const tokenHash = hashToken(resetToken);
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour TTL

    // Invalidate prior active password reset tokens
    await db.collection('password_reset_tokens').updateMany(
      { email: cleanEmail, used: false },
      { $set: { used: true, invalidatedAt: now } }
    );

    // Save token
    await db.collection('password_reset_tokens').insertOne({
      userId: targetUserId,
      email: cleanEmail,
      tokenHash,
      used: false,
      createdAt: now,
      expiresAt,
      issuedBy: auth.email || auth.userId,
    });

    // Revoke active sessions
    await db.collection('user_sessions').deleteMany({
      $or: [{ userId: targetUserId }, { email: cleanEmail }],
    });

    // Send email
    const emailResult = await sendOtpEmail({
      to: cleanEmail,
      otp: resetToken,
      purpose: 'PASSWORD_RESET',
      userName: userDoc.name || 'User',
      organizationName: userDoc.organizationId || 'Infinitive Cloud',
    });

    // Audit log
    await logAuditEvent(req, 'ADMIN_PASSWORD_RESET_LINK_SENT', {
      details: {
        targetUserId,
        targetEmail: cleanEmail,
        performedBy: auth.email || auth.userId,
        emailDelivered: emailResult.success,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Password reset instructions have been sent to ${cleanEmail}. Active sessions have been revoked.`,
      data: {
        email: cleanEmail,
        emailDelivered: emailResult.success,
      },
    });
  } catch (error: any) {
    console.error('Error in Super Admin reset password:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to initiate password reset.' },
      { status: 500 }
    );
  }
}
