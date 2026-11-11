import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { hashToken } from '@/lib/cryptoAuth';
import { signSessionToken, verifySessionToken } from '@/lib/auth';
import { normalizeRole } from '@/lib/roleUtils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const refreshToken = body.refreshToken || request.cookies.get('ems_refresh')?.value;
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      return NextResponse.json({ success: false, message: 'Refresh token is required.' }, { status: 400 });
    }

    const payload = verifySessionToken(refreshToken);
    if (!payload || payload.tokenType !== 'refresh') {
      return NextResponse.json({ success: false, message: 'Invalid or expired refresh token. Please log in again.' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const now = new Date();
    const refreshTokenHash = hashToken(refreshToken);
    const session = await db.collection('user_sessions').findOne({
      sessionId: payload.sessionId,
      refreshTokenHash,
      status: 'ACTIVE',
      expiresAt: { $gt: now },
    });

    if (!session || session.userId !== payload.userId || session.organizationId !== payload.organizationId) {
      return NextResponse.json({ success: false, message: 'Invalid or expired refresh token. Please log in again.' }, { status: 401 });
    }

    const organizationScope = session.organizationId === 'org-default'
      ? { $or: [{ organizationId: 'org-default' }, { organizationId: { $exists: false } }, { organizationId: null }] }
      : { organizationId: session.organizationId };
    const userMatchConditions: any[] = [{ id: session.userId }, { userId: session.userId }, { email: session.email }];
    if (ObjectId.isValid(session.userId)) {
      userMatchConditions.push({ _id: new ObjectId(session.userId) });
    }
    if (session.employeeId) {
      userMatchConditions.push({ employeeId: session.employeeId });
    }

    const userQuery = {
      $and: [organizationScope, { $or: userMatchConditions }],
    };
    let user = await db.collection('users').findOne(userQuery);
    let isEmployeePrincipal = false;
    if (!user && session.employeeId) {
      user = await db.collection('employees').findOne({
        ...organizationScope,
        employeeId: session.employeeId,
      });
      isEmployeePrincipal = Boolean(user);
    }
    if (!user || ['INACTIVE', 'SUSPENDED', 'LOCKED', 'TERMINATED'].includes(String(user.status || '').toUpperCase())) {
      await db.collection('user_sessions').updateOne(
        { _id: session._id, status: 'ACTIVE' },
        { $set: { status: 'REVOKED', revokedAt: now, updatedAt: now } }
      );
      return NextResponse.json({ success: false, message: 'Account is inactive or suspended.' }, { status: 403 });
    }

    const principalIdentifiers = [
      user.id,
      user._id?.toString(),
      user.userId,
      user.employeeId,
    ].filter(Boolean);
    const emailMatches = Boolean(user.email && session.email && user.email.toLowerCase() === session.email.toLowerCase());
    const idMatches = principalIdentifiers.includes(session.userId);

    if (!idMatches && !emailMatches) {
      return NextResponse.json({ success: false, message: 'Invalid or expired refresh token. Please log in again.' }, { status: 401 });
    }

    const role = normalizeRole(user.role || session.role);
    const name = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || session.name || 'Authenticated User';
    const email = user.email || session.email;
    const employeeId = user.employeeId || session.employeeId || undefined;
    const sessionExpiresAtMs = new Date(session.expiresAt).getTime();
    const accessExpiresAtMs = Math.min(Date.now() + 24 * 60 * 60 * 1000, sessionExpiresAtMs);
    if (!Number.isFinite(sessionExpiresAtMs) || accessExpiresAtMs <= Date.now()) {
      return NextResponse.json({ success: false, message: 'Invalid or expired refresh token. Please log in again.' }, { status: 401 });
    }

    const tokenPayload = {
      userId: session.userId,
      email,
      name,
      role,
      organizationId: session.organizationId,
      employeeId,
      sessionId: session.sessionId,
    };
    const newAccessToken = signSessionToken({ ...tokenPayload, expiresAt: accessExpiresAtMs, tokenType: 'access' });
    const newRefreshToken = signSessionToken({ ...tokenPayload, expiresAt: sessionExpiresAtMs, tokenType: 'refresh' });

    const rotation = await db.collection('user_sessions').updateOne(
      { _id: session._id, status: 'ACTIVE', refreshTokenHash },
      {
        $set: {
          sessionTokenHash: hashToken(newAccessToken),
          refreshTokenHash: hashToken(newRefreshToken),
          role,
          name,
          email,
          employeeId,
          accessExpiresAt: new Date(accessExpiresAtMs),
          updatedAt: now,
        },
      }
    );

    if (rotation.modifiedCount !== 1) {
      return NextResponse.json({ success: false, message: 'Refresh token was already used. Please log in again.' }, { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      message: 'Token refreshed successfully.',
      session: { expiresAt: accessExpiresAtMs },
    });
    response.cookies.set('ems_session', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor((accessExpiresAtMs - Date.now()) / 1000),
    });
    response.cookies.set('ems_refresh', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor((sessionExpiresAtMs - Date.now()) / 1000),
    });
    return response;
  } catch (error) {
    console.error('Error in POST /api/v1/auth/refresh:', error);
    return NextResponse.json({ success: false, message: 'Token refresh failed.' }, { status: 401 });
  }
}
