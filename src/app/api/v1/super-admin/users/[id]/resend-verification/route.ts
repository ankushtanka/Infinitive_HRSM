import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { generateNumericOTP, hashToken } from '@/lib/cryptoAuth';
import { sendOtpEmail } from '@/lib/email';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

const RESEND_COOLDOWN_SECONDS = 60;

// POST /api/v1/super-admin/users/[id]/resend-verification - Resend invitation OTP & activation link
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const userId = params.id;
    const { db } = await connectToDatabase();

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
    if (!cleanEmail) {
      return NextResponse.json({ success: false, message: 'User does not have a valid email address configured.' }, { status: 400 });
    }

    // 1. Prevent resending if already verified and active
    if (userDoc.emailVerified === true || userDoc.emailVerificationStatus === 'VERIFIED') {
      return NextResponse.json(
        { success: false, message: 'This account email is already verified and activated.' },
        { status: 400 }
      );
    }

    const now = new Date();

    // 2. Cooldown check: Check if an invitation OTP was created recently
    const recentOtp = await db.collection('auth_otp_tokens').findOne(
      { email: cleanEmail, purpose: 'ACCOUNT_INVITATION' },
      { sort: { createdAt: -1 } }
    );

    if (recentOtp && recentOtp.createdAt) {
      const elapsedSeconds = Math.floor((now.getTime() - new Date(recentOtp.createdAt).getTime()) / 1000);
      if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = RESEND_COOLDOWN_SECONDS - elapsedSeconds;
        return NextResponse.json(
          {
            success: false,
            message: `Please wait ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} before requesting another invitation code.`,
          },
          { status: 429 }
        );
      }
    }

    // 3. Generate secure, time-limited, single-use invitation OTP
    const rawOtp = generateNumericOTP(6);
    const otpHash = hashToken(rawOtp);
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour invitation TTL

    // Invalidate previous invitation OTP tokens for this email
    await db.collection('auth_otp_tokens').deleteMany({
      email: cleanEmail,
      purpose: 'ACCOUNT_INVITATION',
    });

    // Store hashed OTP
    await db.collection('auth_otp_tokens').insertOne({
      userId: userDoc.employeeId || userDoc.id || userId,
      email: cleanEmail,
      organizationId: userDoc.organizationId || 'org-default',
      otpHash,
      purpose: 'ACCOUNT_INVITATION',
      expiresAt,
      attempts: 0,
      createdAt: now,
    });

    // 4. Fetch organization name for email branding
    const orgDoc = await db.collection('organization_settings').findOne({
      $or: [{ organizationId: userDoc.organizationId }, { 'organization.code': userDoc.organizationId }],
    });
    const organizationName = orgDoc?.organization?.name || orgDoc?.name || userDoc.organizationId || 'Infinitive Cloud';

    // 5. Send invitation email via Gmail SMTP
    const emailResult = await sendOtpEmail({
      to: cleanEmail,
      otp: rawOtp,
      purpose: 'ACCOUNT_INVITATION',
      userName: userDoc.name || 'Valued User',
      organizationName,
      role: userDoc.role || 'EMPLOYEE',
    });

    // 6. Audit log
    await logAuditEvent(req, 'ACCOUNT_INVITATION_RESENT', {
      employeeId: userDoc.employeeId,
      details: {
        actorId: auth.userId,
        actorRole: auth.role,
        targetUserId: userDoc.id || userDoc._id.toString(),
        targetEmail: cleanEmail,
        role: userDoc.role,
        organizationId: userDoc.organizationId,
        emailDelivered: emailResult.success,
      },
    });

    if (!emailResult.success) {
      return NextResponse.json(
        {
          success: true,
          message: `New invitation code generated, but email delivery failed (${emailResult.error || 'SMTP issue'}). Please verify SMTP settings.`,
          emailDelivered: false,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Invitation code resent successfully to ${cleanEmail}.`,
      emailDelivered: true,
    });
  } catch (error: any) {
    console.error('Error resending invitation:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to resend invitation.' }, { status: 500 });
  }
}
