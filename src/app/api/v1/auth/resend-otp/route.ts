import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { hashToken, generateSecureToken, generateNumericOTP } from '@/lib/cryptoAuth';
import { sendOtpEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications/notificationService';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { twoFactorToken, email } = body;
    const cleanEmail = email ? email.trim().toLowerCase() : null;

    if (!twoFactorToken && !cleanEmail) {
      return NextResponse.json(
        { success: false, message: 'Verification token or email address is required.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const now = new Date();
    let existingDoc: any = null;

    // 1. Search existing 2FA token by twoFactorToken in auth_otp_tokens
    if (twoFactorToken) {
      existingDoc = await db.collection('auth_otp_tokens').findOne({
        twoFactorToken,
      });

      // Backwards compatibility with legacy auth_tokens
      if (!existingDoc) {
        existingDoc = await db.collection('auth_tokens').findOne({
          twoFactorToken,
          type: '2FA_OTP',
        });
      }
    }

    // 2. Search existing token by cleanEmail in auth_otp_tokens if not found by twoFactorToken
    if (!existingDoc && cleanEmail) {
      existingDoc = await db.collection('auth_otp_tokens')
        .find({ email: cleanEmail })
        .sort({ createdAt: -1 })
        .limit(1)
        .next();
    }

    // 3. Resolve user details
    const targetEmail = (cleanEmail || existingDoc?.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired verification session. Please log in again.' },
        { status: 400 }
      );
    }

    const regex = new RegExp(`^${targetEmail}$`, 'i');
    let userDoc: any = await db.collection('users').findOne({ email: regex });
    if (!userDoc) {
      userDoc = await db.collection('employees').findOne({ email: regex });
    }

    if (!userDoc && !existingDoc) {
      return NextResponse.json(
        { success: false, message: 'User account not found. Please log in again.' },
        { status: 404 }
      );
    }

    const targetUserId = existingDoc?.userId || userDoc?.id || userDoc?._id?.toString() || '';
    const targetUserName = userDoc?.name || `${userDoc?.firstName || ''} ${userDoc?.lastName || ''}`.trim() || 'User';

    // 4. Rate Limiting: 60-second cooldown check
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
    const recentOtp = await db.collection('auth_otp_tokens').findOne({
      email: targetEmail,
      createdAt: { $gte: sixtySecondsAgo },
    });

    if (recentOtp) {
      await logAuditEvent(req, 'OTP_RATE_LIMITED', {
        details: { email: targetEmail, reason: 'COOLDOWN_ACTIVE' },
      });
      return NextResponse.json(
        {
          success: false,
          message: 'A verification code was recently sent. Please wait 60 seconds before requesting another code.',
        },
        { status: 429 }
      );
    }

    // 5. Generate fresh 6-digit numeric OTP and hash it
    const newOtp = generateNumericOTP(6);
    const otpHash = hashToken(newOtp);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes TTL
    const activeTwoFactorToken = twoFactorToken || existingDoc?.twoFactorToken || `2fa-tok-${Date.now()}-${generateSecureToken(16)}`;

    // 6. Invalidate previous tokens for this email and purpose to prevent collisions
    await db.collection('auth_otp_tokens').deleteMany({
      email: targetEmail,
      purpose: { $in: ['2FA', 'LOGIN'] },
    });
    await db.collection('auth_tokens').deleteMany({
      email: targetEmail,
      type: '2FA_OTP',
    });

    // 7. Store fresh hashed OTP in auth_otp_tokens
    await db.collection('auth_otp_tokens').insertOne({
      purpose: '2FA',
      userId: targetUserId,
      email: targetEmail,
      twoFactorToken: activeTwoFactorToken,
      otpHash,
      expiresAt,
      attempts: 0,
      createdAt: now,
    });

    // 8. Dispatch real email via Gmail SMTP
    try {
      await sendOtpEmail({
        to: targetEmail,
        otp: newOtp,
        purpose: '2FA',
        userName: targetUserName,
      });
    } catch (emailErr) {
      console.warn('2FA Resend email dispatch warning:', emailErr);
    }

    // 9. Create in-app notification backup
    try {
      await createNotification({
        organizationId: userDoc?.organizationId || 'org-default',
        recipientType: 'EMPLOYEE',
        recipientId: targetEmail,
        eventType: '2fa_otp',
        category: 'SECURITY',
        title: 'EMS Security Code',
        message: `Your new 2FA authentication code is: ${newOtp}. Code expires in 10 minutes.`,
        priority: 'HIGH',
        recipientEmail: targetEmail,
      });
    } catch (notifErr) {
      console.warn('Could not create in-app notification:', notifErr);
    }

    await logAuditEvent(req, 'OTP_RESENT', { details: { email: targetEmail } });

    return NextResponse.json({
      success: true,
      message: 'A new 2FA verification code has been dispatched to your email.',
      twoFactorToken: activeTwoFactorToken,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/auth/resend-otp:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to resend verification code.' },
      { status: 500 }
    );
  }
}
