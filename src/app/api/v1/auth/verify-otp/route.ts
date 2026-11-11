import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { generateSecureToken, hashToken } from '@/lib/cryptoAuth';
import { logAuditEvent } from '@/lib/audit';
import { signSessionToken } from '@/lib/auth';
import { normalizeRole } from '@/lib/roleUtils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, otp, otpCode, twoFactorToken, purpose } = body;
    const inputCode = (otp || otpCode || '').trim();
    const cleanEmail = email ? email.trim().toLowerCase() : null;

    if (!inputCode) {
      return NextResponse.json(
        { success: false, message: 'Verification code is required.' },
        { status: 400 }
      );
    }

    if (!cleanEmail && !twoFactorToken) {
      return NextResponse.json(
        { success: false, message: 'Email address or verification token is required.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const now = new Date();
    let userDoc: any = null;
    let otpDoc: any = null;
    let tokenCollectionName = 'auth_otp_tokens';

    // Priority 1: Match by twoFactorToken in auth_otp_tokens
    if (twoFactorToken) {
      otpDoc = await db.collection('auth_otp_tokens').findOne({
        twoFactorToken,
        expiresAt: { $gt: now },
      });

      // Backwards-compatibility check for in-flight legacy auth_tokens
      if (!otpDoc) {
        otpDoc = await db.collection('auth_tokens').findOne({
          twoFactorToken,
          type: '2FA_OTP',
          expiresAt: { $gt: now },
        });
        if (otpDoc) {
          tokenCollectionName = 'auth_tokens';
        }
      }
    }

    // Priority 2: Match by cleanEmail in auth_otp_tokens (Direct OTP, email verification, or resend)
    if (!otpDoc && cleanEmail) {
      const queryFilter: any = {
        email: cleanEmail,
        expiresAt: { $gt: now },
      };

      if (purpose) {
        queryFilter.purpose = purpose;
      } else {
        queryFilter.purpose = { $ne: 'ACCOUNT_INVITATION' };
      }

      otpDoc = await db.collection('auth_otp_tokens')
        .find(queryFilter)
        .sort({ createdAt: -1 })
        .limit(1)
        .next();
      tokenCollectionName = 'auth_otp_tokens';
    }

    if (!otpDoc) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired verification code. Please request a new code.' },
        { status: 401 }
      );
    }

    // Check maximum attempts (max 5)
    if ((otpDoc.attempts || 0) >= 5) {
      await db.collection(tokenCollectionName).deleteOne({ _id: otpDoc._id });
      return NextResponse.json(
        { success: false, message: 'Too many failed verification attempts. Please request a new verification code.' },
        { status: 429 }
      );
    }

    const hashedInput = hashToken(inputCode);
    const expectedHash = otpDoc.otpHash || otpDoc.hashedOtp;

    if (expectedHash !== hashedInput) {
      await db.collection(tokenCollectionName).updateOne(
        { _id: otpDoc._id },
        { $inc: { attempts: 1 } }
      );
      await logAuditEvent(req, 'OTP_VERIFICATION_FAILED', {
        details: { email: cleanEmail || otpDoc.email, purpose: otpDoc.purpose || otpDoc.type },
      });
      return NextResponse.json(
        { success: false, message: 'Invalid verification code entered. Please check and try again.' },
        { status: 401 }
      );
    }

    // Valid OTP code matching - delete token immediately (atomic single-use consumption)
    await db.collection(tokenCollectionName).deleteOne({ _id: otpDoc._id });

    const targetEmail = (cleanEmail || otpDoc.email || '').trim().toLowerCase();

    // Mark email verified in users & employees collections if email is available
    if (targetEmail) {
      await db.collection('users').updateOne(
        { email: targetEmail },
        { $set: { emailVerified: true, emailVerificationStatus: 'VERIFIED', updatedAt: now } }
      );
      await db.collection('employees').updateOne(
        { email: targetEmail },
        { $set: { emailVerified: true, emailVerificationStatus: 'VERIFIED', updatedAt: now } }
      );
      await logAuditEvent(req, 'EMAIL_VERIFIED', {
        details: { email: targetEmail, purpose: otpDoc.purpose || otpDoc.type },
      });
    }

    // If purpose was specifically EMAIL_VERIFICATION, return confirmation without logging in
    if (otpDoc.purpose === 'EMAIL_VERIFICATION' || purpose === 'EMAIL_VERIFICATION') {
      return NextResponse.json({
        success: true,
        message: 'Your email address has been confirmed successfully. You may now sign in.',
        isEmailVerified: true,
      });
    }

    // Lookup user in users collection or employees fallback
    if (targetEmail) {
      const regex = new RegExp(`^${targetEmail}$`, 'i');
      userDoc = await db.collection('users').findOne({ email: regex });
    }

    if (!userDoc && otpDoc.userId) {
      try {
        const { ObjectId } = await import('mongodb');
        userDoc = await db.collection('users').findOne({
          $or: [
            { _id: new ObjectId(otpDoc.userId) },
            { id: otpDoc.userId },
            { employeeId: otpDoc.userId },
          ],
        });
      } catch {
        userDoc = await db.collection('users').findOne({
          $or: [
            { id: otpDoc.userId },
            { employeeId: otpDoc.userId },
          ],
        });
      }
    }

    if (!userDoc && targetEmail) {
      const regex = new RegExp(`^${targetEmail}$`, 'i');
      const empDoc = await db.collection('employees').findOne({ email: regex });
      if (empDoc) {
        userDoc = {
          _id: empDoc._id,
          id: empDoc.id || empDoc.employeeId,
          employeeId: empDoc.employeeId,
          name: `${empDoc.firstName || ''} ${empDoc.lastName || ''}`.trim() || 'Employee',
          email: empDoc.email,
          role: empDoc.role || 'EMPLOYEE',
          organizationId: empDoc.organizationId || 'org-default',
          status: empDoc.status || 'Active',
        };
      }
    }

    if (!userDoc) {
      return NextResponse.json(
        { success: false, message: 'Authenticated user record not found.' },
        { status: 404 }
      );
    }

    const normalizedRole = normalizeRole(userDoc.role || 'EMPLOYEE');
    const isSuperAdmin = normalizedRole === 'SUPER_ADMIN';
    const userStatus = String(userDoc.status || '').toUpperCase();

    if (['INACTIVE', 'SUSPENDED', 'LOCKED', 'TERMINATED'].includes(userStatus)) {
      if (isSuperAdmin) {
        await db.collection('users').updateOne(
          { _id: userDoc._id },
          { $set: { status: 'ACTIVE', updatedAt: now } }
        );
        userDoc.status = 'ACTIVE';
      } else {
        return NextResponse.json(
          { success: false, message: 'Your account is inactive or suspended. Please contact your administrator.' },
          { status: 403 }
        );
      }
    }

    if (isSuperAdmin && String(userDoc.status || '').toUpperCase() !== 'ACTIVE') {
      await db.collection('users').updateOne(
        { _id: userDoc._id },
        { $set: { status: 'ACTIVE', updatedAt: now } }
      );
      userDoc.status = 'ACTIVE';
    }

    const empId = userDoc.employeeId || (
      isSuperAdmin ? 'SUP0001' :
      normalizedRole === 'ADMIN' ? 'EMP9201' :
      normalizedRole === 'MANAGER' ? 'MGR1001' :
      'EMP1001'
    );
    const orgId = userDoc.organizationId || 'org-default';
    const userIdStr = userDoc.id || userDoc._id.toString();

    const nowMs = Date.now();
    const expiresAtMs = nowMs + 24 * 60 * 60 * 1000;
    const refreshExpiresAtMs = nowMs + 30 * 24 * 60 * 60 * 1000;
    const sessionId = generateSecureToken(32);
    const sessionPayload = {
      userId: userIdStr,
      email: userDoc.email,
      name: userDoc.name || `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() || 'Authenticated User',
      role: normalizedRole,
      organizationId: orgId,
      employeeId: empId,
      sessionId,
    };
    const accessToken = signSessionToken({ ...sessionPayload, expiresAt: expiresAtMs, tokenType: 'access' });
    const refreshToken = signSessionToken({ ...sessionPayload, expiresAt: refreshExpiresAtMs, tokenType: 'refresh' });

    // Store active session in user_sessions collection
    await db.collection('user_sessions').insertOne({
      sessionId,
      sessionTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      userId: userIdStr,
      email: userDoc.email,
      name: userDoc.name || 'Authenticated User',
      role: normalizedRole,
      organizationId: orgId,
      employeeId: empId,
      userAgent: req.headers.get('user-agent') || 'Browser',
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      accessExpiresAt: new Date(expiresAtMs),
      expiresAt: new Date(refreshExpiresAtMs),
    });

    await logAuditEvent(req, 'OTP_VERIFICATION_SUCCESS', {
      details: { email: userDoc.email, role: normalizedRole },
    });

    const userData = {
      id: userIdStr,
      employeeId: empId,
      name: userDoc.name || `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() || 'User',
      email: userDoc.email,
      avatar: userDoc.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80',
      role: userDoc.role || normalizedRole,
      department: userDoc.department || 'General',
      designation: userDoc.designation || 'Staff',
      isTwoFactorEnabled: true,
    };

    const response = NextResponse.json({
      success: true,
      message: 'OTP verification successful. Welcome back!',
      session: {
        user: userData,
        expiresAt: expiresAtMs,
      },
    });

    // Set secure HTTP-only cookie
    response.cookies.set('ems_session', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });
    response.cookies.set('ems_refresh', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    console.error('Error in POST /api/v1/auth/verify-otp:', error);
    return NextResponse.json(
      { success: false, message: 'OTP verification failed due to a server error.' },
      { status: 500 }
    );
  }
}
