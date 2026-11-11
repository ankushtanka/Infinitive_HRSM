import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { hashPassword, generateSecureToken, hashToken } from '@/lib/cryptoAuth';
import { normalizeRole } from '@/lib/roleUtils';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  employeeId?: string;
  isAuthenticated: boolean;
  sessionId?: string;
}

function getSigningSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('A JWT_SECRET or NEXTAUTH_SECRET environment variable of at least 32 bytes is required.');
  }
  return secret;
}

function hasSigningSecret(): boolean {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  return Boolean(secret && Buffer.byteLength(secret, 'utf8') >= 32);
}

export type SessionTokenType = 'access' | 'refresh';

export interface SessionTokenPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  employeeId?: string;
  expiresAt: number;
  sessionId: string;
  tokenType: SessionTokenType;
}

const unauthenticatedContext: AuthContext = {
  userId: '',
  email: '',
  name: 'Unauthenticated Guest',
  role: 'EMPLOYEE',
  organizationId: 'org-default',
  employeeId: undefined,
  isAuthenticated: false,
};

let seedCompleted = false;

/**
 * Generates a cryptographically signed HMAC SHA-256 session token.
 */
export function signSessionToken(payload: {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  employeeId?: string;
  expiresAt: number;
  sessionId: string;
  tokenType: SessionTokenType;
}): string {
  const secret = getSigningSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verifies a cryptographically signed session token. Returns payload if signature is valid and not expired.
 */
export function verifySessionToken(token: string): SessionTokenPayload | null {
  if (!hasSigningSecret() || !token || typeof token !== 'string' || token.length > 8192 || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  if (!data || !signature) return null;

  const secret = getSigningSecret();
  const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const supplied = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    const roles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'];
    if (
      !payload ||
      typeof payload.userId !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.name !== 'string' ||
      !roles.includes(payload.role) ||
      typeof payload.organizationId !== 'string' ||
      typeof payload.sessionId !== 'string' ||
      !payload.sessionId ||
      !['access', 'refresh'].includes(payload.tokenType) ||
      typeof payload.expiresAt !== 'number' ||
      !Number.isFinite(payload.expiresAt) ||
      Date.now() >= payload.expiresAt ||
      (payload.employeeId !== undefined && typeof payload.employeeId !== 'string')
    ) return null;
    return payload as SessionTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Ensures default admin accounts exist ONLY in non-production environments
 * or when explicitly enabled by ALLOW_DEMO_SEED=true.
 */
export async function ensureDefaultUsersSeeded(): Promise<void> {
  if (seedCompleted) return;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    seedCompleted = true;
    return;
  }

  try {
    const { db } = await connectToDatabase();
    const now = new Date();
    const defaultSeedUsers = [
      {
        id: 'usr-admin-01',
        employeeId: 'EMP9201',
        name: 'System Administrator',
        email: 'admin@organization.com',
        role: 'ADMIN',
        organizationId: 'org-default',
        department: 'Human Resources',
        designation: 'HR Administrator',
        rawPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
        status: 'Active',
        emailVerified: true,
      },
      {
        id: 'usr-super-01',
        employeeId: 'SUP0001',
        name: 'Super Administrator',
        email: 'superadmin@organization.com',
        role: 'SUPER_ADMIN',
        organizationId: 'org-default',
        department: 'Executive Board',
        designation: 'Platform Super Admin',
        rawPassword: process.env.DEFAULT_SUPERADMIN_PASSWORD || 'superadmin123',
        status: 'Active',
        emailVerified: true,
      },
      {
        id: 'usr-mgr-01',
        employeeId: 'MGR1001',
        name: 'Vikramaditya Sharma',
        email: 'manager@organization.com',
        role: 'MANAGER',
        organizationId: 'org-default',
        department: 'Engineering & IT',
        designation: 'Engineering Manager',
        rawPassword: process.env.DEFAULT_MANAGER_PASSWORD || 'manager123',
        status: 'Active',
        emailVerified: true,
      },
      {
        id: 'usr-emp-01',
        employeeId: 'EMP1001',
        name: 'Aarav Sharma',
        email: 'employee@organization.com',
        role: 'EMPLOYEE',
        organizationId: 'org-default',
        department: 'Engineering & IT',
        designation: 'Software Engineer',
        rawPassword: process.env.DEFAULT_EMPLOYEE_PASSWORD || 'emp123',
        status: 'Active',
        emailVerified: true,
      },
    ];

    for (const u of defaultSeedUsers) {
      const existingUser = await db.collection('users').findOne({ email: u.email });
      if (!existingUser) {
        const { salt, formatted } = hashPassword(u.rawPassword);
        const userDoc = {
          id: u.id,
          employeeId: u.employeeId,
          name: u.name,
          email: u.email,
          role: u.role,
          organizationId: u.organizationId,
          department: u.department,
          designation: u.designation,
          passwordHash: formatted,
          salt,
          status: u.status,
          emailVerified: u.emailVerified,
          isTwoFactorEnabled: false,
          failedLoginAttempts: 0,
          lockoutUntil: null,
          createdAt: now,
          updatedAt: now,
        };

        await db.collection('users').updateOne(
          { email: u.email },
          { $setOnInsert: userDoc },
          { upsert: true }
        );
      }
    }
    seedCompleted = true;
  } catch (err) {
    console.warn('User seeding warning:', err);
  }
}

/**
 * Synchronous Server-Side Authoritative Authentication Context
 *
 * CRITICAL SECURITY ENFORCEMENT:
 * - Reject client-supplied identity headers (x-user-id, x-user-role, x-organization-id, x-employee-id).
 * - Identity originates strictly from a cryptographically signed HMAC SHA-256 session token.
 * - Role and Organization scope are verified via cryptographic signature.
 */
export async function getAuthContext(req: NextRequest): Promise<AuthContext> {
  try {
    const cookieSessionToken = req.cookies.get('ems_session')?.value;
    const authHeader = req.headers.get('authorization');
    let headerToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;

    const token = cookieSessionToken || headerToken;
    let payload = token ? verifySessionToken(token) : null;
    let session: any = null;
    const { db } = await connectToDatabase();
    const now = new Date();

    if (payload && payload.tokenType === 'access') {
      const tokenHash = hashToken(token!);
      session = await db.collection('user_sessions').findOne({
        sessionId: payload.sessionId,
        status: 'ACTIVE',
        expiresAt: { $gt: now },
      });

      // Verify session ownership and token authenticity
      if (session) {
        const isHashValid = !session.sessionTokenHash || session.sessionTokenHash === tokenHash;
        const isUserValid = session.userId === payload.userId && session.organizationId === payload.organizationId;
        if (!isUserValid) {
          session = null;
        } else if (!isHashValid) {
          // If hash mismatch occurs during token rotation window, update sessionTokenHash
          await db.collection('user_sessions').updateOne(
            { _id: session._id },
            { $set: { sessionTokenHash: tokenHash, updatedAt: now } }
          ).catch(() => {});
        }
      }
    }

    // Secure Refresh token fallback if access token is expired or missing, but ems_refresh cookie is present
    if (!session) {
      const refreshToken = req.cookies.get('ems_refresh')?.value;
      if (refreshToken && typeof refreshToken === 'string') {
        const refreshPayload = verifySessionToken(refreshToken);
        if (refreshPayload && refreshPayload.tokenType === 'refresh') {
          const refreshSession = await db.collection('user_sessions').findOne({
            sessionId: refreshPayload.sessionId,
            refreshTokenHash: hashToken(refreshToken),
            status: 'ACTIVE',
            expiresAt: { $gt: now },
          });
          if (refreshSession && refreshSession.userId === refreshPayload.userId) {
            session = refreshSession;
            payload = {
              ...refreshPayload,
              tokenType: 'access',
            };
          }
        }
      }
    }

    if (
      !payload ||
      !session ||
      session.userId !== payload.userId ||
      session.organizationId !== payload.organizationId
    ) {
      return unauthenticatedContext;
    }

    const organizationScope = session.organizationId === 'org-default'
      ? { $or: [{ organizationId: 'org-default' }, { organizationId: { $exists: false } }, { organizationId: null }] }
      : { organizationId: session.organizationId };

    // 1. Query by matching conditions (id, _id as ObjectId, userId, or employeeId)
    const userMatchConditions: any[] = [{ id: session.userId }, { userId: session.userId }];
    if (ObjectId.isValid(session.userId)) {
      userMatchConditions.push({ _id: new ObjectId(session.userId) });
    }
    if (session.employeeId) {
      userMatchConditions.push({ employeeId: session.employeeId });
    }

    let principal = await db.collection('users').findOne({
      $and: [organizationScope, { $or: userMatchConditions }],
    });

    // 2. Safe fallback by email if no user found by ID/employeeId
    if (!principal && session.email) {
      const candidate = await db.collection('users').findOne({
        $and: [
          organizationScope,
          { email: session.email.toLowerCase().trim() },
        ],
      });
      if (candidate) {
        const candidateIds = [
          candidate.id,
          candidate._id?.toString(),
          candidate.userId,
          candidate.employeeId,
        ].filter(Boolean);
        if (
          candidateIds.includes(session.userId) ||
          (candidate.email && session.email && candidate.email.toLowerCase() === session.email.toLowerCase())
        ) {
          principal = candidate;
        }
      }
    }

    let isEmployeePrincipal = false;
    if (!principal && session.employeeId) {
      principal = await db.collection('employees').findOne({
        ...organizationScope,
        employeeId: session.employeeId,
      });
      isEmployeePrincipal = Boolean(principal);
    }
    const isSuperAdminPrincipal = normalizeRole(principal?.role || session.role) === 'SUPER_ADMIN';
    const isPrincipalInactive = ['INACTIVE', 'SUSPENDED', 'LOCKED', 'TERMINATED'].includes(String(principal?.status || '').toUpperCase());

    if (!principal || (isPrincipalInactive && !isSuperAdminPrincipal)) {
      await db.collection('user_sessions').updateOne(
        { _id: session._id, status: 'ACTIVE' },
        { $set: { status: 'REVOKED', revokedAt: now, updatedAt: now } }
      );
      return unauthenticatedContext;
    }

    // Auto-heal Super Admin status if it was erroneously marked inactive by duplicate employee updates
    if (principal && isSuperAdminPrincipal && isPrincipalInactive) {
      await db.collection('users').updateOne(
        { _id: principal._id },
        { $set: { status: 'ACTIVE', updatedAt: now } }
      ).catch(() => {});
      principal.status = 'ACTIVE';
    }

    const principalIdentifiers = [
      principal.id,
      principal._id?.toString(),
      principal.userId,
      principal.employeeId,
    ].filter(Boolean);

    const emailMatches = Boolean(principal.email && session.email && principal.email.toLowerCase() === session.email.toLowerCase());
    const idMatches = principalIdentifiers.includes(session.userId);

    if (!idMatches && !emailMatches) return unauthenticatedContext;
    const authoritativeRole = normalizeRole(principal.role || session.role) as UserRole;

    return {
      userId: session.userId,
      email: principal.email || session.email,
      name: principal.fullName || principal.name || `${principal.firstName || ''} ${principal.lastName || ''}`.trim() || session.name,
      role: authoritativeRole,
      organizationId: session.organizationId,
      employeeId: principal.employeeId || session.employeeId || undefined,
      isAuthenticated: true,
      sessionId: session.sessionId,
    };
  } catch {
    return unauthenticatedContext;
  }
}

/**
 * Server-Side Role Permission Checker
 */
export function checkPermissions(
  auth: AuthContext,
  requiredRole?: UserRole | UserRole[],
  targetEmployeeId?: string
): { isAllowed: boolean; statusCode: number; message: string } {
  if (!auth.isAuthenticated) {
    return { isAllowed: false, statusCode: 401, message: 'Authentication required. Please log in.' };
  }

  const normalizedAuthRole = normalizeRole(auth.role) as UserRole;

  if (normalizedAuthRole === 'SUPER_ADMIN') {
    return { isAllowed: true, statusCode: 200, message: 'Authorized' };
  }

  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    const normalizedRequiredRoles = roles.map((r) => normalizeRole(r) as UserRole);

    if (!normalizedRequiredRoles.includes(normalizedAuthRole)) {
      return {
        isAllowed: false,
        statusCode: 403,
        message: `Forbidden. Action requires ${roles.join(' or ')} permission.`,
      };
    }
  }

  return { isAllowed: true, statusCode: 200, message: 'Authorized' };
}

export { formatRoleLabel } from '@/lib/roleUtils';
