import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext } from '@/lib/auth';
import { normalizeRole } from '@/lib/roleUtils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authCtx = await getAuthContext(request);
    if (!authCtx.isAuthenticated) {
      return NextResponse.json(
        { success: false, message: 'Invalid, expired, or revoked session token. Please log in.' },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();
    const userOrConditions: any[] = [
      { email: authCtx.email },
      { id: authCtx.userId },
      { userId: authCtx.userId },
    ];
    if (ObjectId.isValid(authCtx.userId)) {
      userOrConditions.push({ _id: new ObjectId(authCtx.userId) });
    }
    if (authCtx.employeeId) {
      userOrConditions.push({ employeeId: authCtx.employeeId });
    }

    const userDoc = await db.collection('users').findOne({
      $or: userOrConditions,
    });

    const empOrConditions: any[] = [{ email: authCtx.email }];
    if (authCtx.employeeId) {
      empOrConditions.push({ employeeId: authCtx.employeeId });
    }
    if (userDoc?.employeeId) {
      empOrConditions.push({ employeeId: userDoc.employeeId });
    }
    const empDoc = await db.collection('employees').findOne({
      $or: empOrConditions,
    });

    const userEmail = userDoc?.email || empDoc?.email || authCtx.email;
    const userId = userDoc?.id || userDoc?._id?.toString() || authCtx.userId;
    const userRole = userDoc?.role || empDoc?.role || authCtx.role;
    const empId = userDoc?.employeeId || empDoc?.employeeId || authCtx.employeeId;
    const empFullName = empDoc ? `${empDoc.firstName || ''} ${empDoc.lastName || ''}`.trim() : '';
    const name = userDoc?.fullName || userDoc?.name || empDoc?.name || empFullName || authCtx.name;

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        employeeId: empId,
        name,
        fullName: name,
        email: userEmail,
        avatar:
          userDoc?.avatar ||
          empDoc?.photoUrl ||
          empDoc?.avatar ||
          'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80',
        role: userRole,
        roleTitle: userDoc?.roleTitle || userDoc?.designation || empDoc?.designation || 'Staff',
        organizationId: userDoc?.organizationId || empDoc?.organizationId || authCtx.organizationId,
        department: userDoc?.department || empDoc?.department || 'General',
        designation: userDoc?.roleTitle || userDoc?.designation || empDoc?.designation || 'Staff',
        phone: userDoc?.phone || empDoc?.phone || empDoc?.mobile || '',
        personalEmail: userDoc?.personalEmail || empDoc?.personalEmail || '',
        dob: userDoc?.dob || userDoc?.dateOfBirth || empDoc?.dob || empDoc?.dateOfBirth || '',
        address: userDoc?.address || empDoc?.address || '',
        city: userDoc?.city || empDoc?.city || '',
        state: userDoc?.state || empDoc?.state || '',
        postalCode: userDoc?.postalCode || empDoc?.postalCode || '',
        emergencyContact: userDoc?.emergencyContact || empDoc?.emergencyContact || '',
        status: userDoc?.status || empDoc?.status || 'Active',
        managerName: empDoc?.managerName || empDoc?.reportingToName || '',
        joiningDate: empDoc?.joiningDate || empDoc?.dateOfJoining || '',
        employmentType: empDoc?.employmentType || 'Full-Time',
        workLocation: empDoc?.workLocation || 'Headquarters',
      },
    });

    if (authCtx.sessionId && authCtx.userId) {
      try {
        const { signSessionToken } = await import('@/lib/auth');
        const { hashToken } = await import('@/lib/cryptoAuth');
        const nowMs = Date.now();
        const expiresAtMs = nowMs + 24 * 60 * 60 * 1000;
        const refreshedAccessToken = signSessionToken({
          userId: authCtx.userId,
          email: userEmail,
          name,
          // Token carries the permission level (INTERN -> EMPLOYEE); the response above keeps the stored role
          role: normalizeRole(userRole),
          organizationId: authCtx.organizationId,
          employeeId: empId,
          expiresAt: expiresAtMs,
          sessionId: authCtx.sessionId,
          tokenType: 'access',
        });

        // Authoritatively update sessionTokenHash in user_sessions collection
        await db.collection('user_sessions').updateOne(
          { sessionId: authCtx.sessionId, status: 'ACTIVE' },
          {
            $set: {
              sessionTokenHash: hashToken(refreshedAccessToken),
              accessExpiresAt: new Date(expiresAtMs),
              updatedAt: new Date(),
            },
          }
        );

        response.cookies.set('ems_session', refreshedAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 24 * 60 * 60,
        });
      } catch (cookieErr) {
        console.warn('Could not re-issue ems_session cookie:', cookieErr);
      }
    }

    return response;
  } catch (error) {
    console.error('Error in GET /api/v1/auth/me:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch user session.' },
      { status: 500 }
    );
  }
}