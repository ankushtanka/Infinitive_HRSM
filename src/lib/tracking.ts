import type { Db } from 'mongodb';
import type { AuthContext } from '@/lib/auth';
import { normalizeRole } from '@/lib/roleUtils';
import { loadAttendanceRules } from '@/lib/geo';

export const TRACKING_COLLECTIONS = {
  permissions: 'tracking_permissions',
  sessions: 'tracking_sessions',
  locations: 'employee_locations',
} as const;

/** Roles that can be granted viewing rights. SUPER_ADMIN always has them. */
export const VIEWER_ROLES = ['MANAGER', 'HR', 'ADMIN'] as const;
export type ViewerRole = (typeof VIEWER_ROLES)[number];

export const MAX_RETENTION_DAYS = 90;
export const MIN_PING_GAP_MS = 5000;
const INACTIVE_EMPLOYEE_STATUSES = ['Terminated', 'Inactive', 'Resigned', 'Offboarded'];

export interface TrackingPolicy {
  /** Master switch for the organization. Tracking is OFF until a Super Admin turns it on. */
  enabled: boolean;
  requireConsent: boolean;
  allowedViewerRoles: ViewerRole[];
  /** Roles that may read location history (live view is governed by allowedViewerRoles). */
  historyRoles: ViewerRole[];
  retentionDays: number;
  pingIntervalSeconds: number;
}

export interface EffectivePolicy extends TrackingPolicy {
  /** True when this specific employee has been exempted by an admin. */
  exempted: boolean;
}

export const DEFAULT_TRACKING_POLICY: Omit<TrackingPolicy, 'pingIntervalSeconds'> = {
  enabled: false,
  requireConsent: true,
  allowedViewerRoles: ['MANAGER', 'HR', 'ADMIN'],
  historyRoles: ['HR', 'ADMIN'],
  retentionDays: 30,
};

export async function loadOrgPolicy(db: Db, orgId: string): Promise<TrackingPolicy> {
  const [doc, rules] = await Promise.all([
    db.collection(TRACKING_COLLECTIONS.permissions).findOne({ organizationId: orgId, scope: 'ORG' }),
    loadAttendanceRules(db, orgId),
  ]);
  const ping = Math.max(15, Number(rules?.livePingIntervalSeconds) || 30);
  return {
    enabled: Boolean(doc?.enabled ?? DEFAULT_TRACKING_POLICY.enabled),
    requireConsent: doc?.requireConsent ?? DEFAULT_TRACKING_POLICY.requireConsent,
    allowedViewerRoles: sanitizeRoles(doc?.allowedViewerRoles, DEFAULT_TRACKING_POLICY.allowedViewerRoles),
    historyRoles: sanitizeRoles(doc?.historyRoles, DEFAULT_TRACKING_POLICY.historyRoles),
    retentionDays: clampRetention(doc?.retentionDays ?? DEFAULT_TRACKING_POLICY.retentionDays),
    pingIntervalSeconds: ping,
  };
}

export async function loadEmployeePolicy(db: Db, orgId: string, employeeId: string): Promise<EffectivePolicy> {
  const [policy, override] = await Promise.all([
    loadOrgPolicy(db, orgId),
    db.collection(TRACKING_COLLECTIONS.permissions).findOne({ organizationId: orgId, scope: 'EMPLOYEE', employeeId }),
  ]);
  const exempted = override?.enabled === false;
  return { ...policy, enabled: policy.enabled && !exempted, exempted };
}

export function sanitizeRoles(input: unknown, fallback: readonly ViewerRole[]): ViewerRole[] {
  if (!Array.isArray(input)) return [...fallback];
  return VIEWER_ROLES.filter((r) => input.includes(r));
}

export function clampRetention(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_TRACKING_POLICY.retentionDays;
  return Math.min(MAX_RETENTION_DAYS, Math.max(1, v));
}

export function canView(policy: TrackingPolicy, auth: AuthContext, kind: 'live' | 'history'): boolean {
  const role = normalizeRole(auth.role);
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'EMPLOYEE') return false;
  const list = kind === 'live' ? policy.allowedViewerRoles : policy.historyRoles;
  return (list as string[]).includes(role);
}

/**
 * Organization a tracking request operates on. Super Admins work across the platform and may pick
 * one with `?organizationId=`; every other role is always pinned to their own organization.
 */
export function resolveTrackingOrgId(auth: AuthContext, req: { url: string }): string {
  if (normalizeRole(auth.role) === 'SUPER_ADMIN') {
    const requested = new URL(req.url).searchParams.get('organizationId')?.trim();
    if (requested && requested !== 'All') return requested;
  }
  return auth.organizationId;
}

/** Employee-collection filter for the people this viewer is allowed to see. */
export function viewerEmployeeQuery(auth: AuthContext, orgId: string, withActiveFilter = true): Record<string, any> {
  const q: Record<string, any> = { organizationId: orgId };
  if (withActiveFilter) q.status = { $nin: INACTIVE_EMPLOYEE_STATUSES };
  if (normalizeRole(auth.role) === 'MANAGER') {
    const managerEmpId = auth.employeeId || auth.userId;
    q.$or = [{ managerId: managerEmpId }, { reportingTo: managerEmpId }, { employeeId: managerEmpId }];
  }
  return q;
}

/** Today's attendance document if the employee is checked in and not yet checked out; otherwise null. */
export async function findOpenAttendance(db: Db, employeeId: string, date: string) {
  const att: any = await db.collection('attendance').findOne({ employeeId, date });
  if (!att) return null;
  const isIn = att.checkIn || att.checkInTime;
  const isOut = att.checkOut || att.checkOutTime;
  return isIn && !isOut ? att : null;
}

export async function stopActiveSessions(
  db: Db,
  orgId: string,
  employeeId: string,
  status: 'STOPPED' | 'AUTO_STOPPED',
  reason: string,
  now: Date = new Date()
): Promise<number> {
  const res = await db.collection(TRACKING_COLLECTIONS.sessions).updateMany(
    { organizationId: orgId, employeeId, status: 'ACTIVE' },
    { $set: { status, stopReason: reason, endedAt: now }, $unset: { outsideSince: '' } }
  );
  return res.modifiedCount;
}

export interface StartedSession {
  sessionId: string;
  startedAt: Date;
  resumed: boolean;
}

/**
 * Creates today's ACTIVE tracking session for an employee, or returns the one already running.
 * Caller is responsible for checking the tracking policy (enabled / consent / exemption) first —
 * this function only handles the database side, so it is safe to call from both the employee's
 * explicit "Start tracking" action and an automatic start right at check-in.
 */
export async function ensureActiveTrackingSession(
  db: Db,
  orgId: string,
  employeeId: string,
  employeeName: string,
  date: string,
  geo: { lat: number; lng: number; accuracy?: number } | null,
  fenceResult: { withinGeofence: boolean; distanceMeters: number } | null,
  now: Date = new Date()
): Promise<StartedSession> {
  const sessions = db.collection(TRACKING_COLLECTIONS.sessions);

  const existing: any = await sessions.findOne({ organizationId: orgId, employeeId, status: 'ACTIVE', date });
  if (existing) {
    return { sessionId: existing._id.toString(), startedAt: existing.startedAt, resumed: true };
  }

  // Close leftovers from earlier days so at most one ACTIVE session exists per employee
  await stopActiveSessions(db, orgId, employeeId, 'AUTO_STOPPED', 'stale_session', now);

  const sessionDoc: Record<string, any> = {
    organizationId: orgId,
    employeeId,
    employeeName,
    date,
    status: 'ACTIVE',
    startedAt: now,
    endedAt: null,
    stopReason: null,
    pointCount: geo ? 1 : 0,
    createdAt: now,
    ...(geo
      ? {
          lastLat: geo.lat,
          lastLng: geo.lng,
          lastAccuracy: geo.accuracy ?? null,
          lastLocationAt: now,
          withinGeofence: fenceResult ? fenceResult.withinGeofence : null,
          distanceMeters: fenceResult ? fenceResult.distanceMeters : null,
          ...(fenceResult && !fenceResult.withinGeofence ? { outsideSince: now } : {}),
        }
      : {}),
  };

  try {
    const ins = await sessions.insertOne(sessionDoc);
    if (geo) {
      await db.collection(TRACKING_COLLECTIONS.locations).insertOne({
        organizationId: orgId,
        employeeId,
        sessionId: ins.insertedId.toString(),
        date,
        lat: geo.lat,
        lng: geo.lng,
        accuracy: geo.accuracy ?? null,
        withinGeofence: fenceResult ? fenceResult.withinGeofence : null,
        distanceMeters: fenceResult ? fenceResult.distanceMeters : null,
        recordedAt: now,
        createdAt: now,
      });
    }
    return { sessionId: ins.insertedId.toString(), startedAt: now, resumed: false };
  } catch (e: any) {
    // Two simultaneous starts (e.g. check-in racing an explicit Start click): the unique
    // partial index rejects the second insert, so fall back to whichever one won.
    if (e?.code === 11000) {
      const winner: any = await sessions.findOne({ organizationId: orgId, employeeId, status: 'ACTIVE' });
      if (winner) return { sessionId: winner._id.toString(), startedAt: winner.startedAt, resumed: true };
    }
    throw e;
  }
}

/** IST calendar date (YYYY-MM-DD) to the UTC instant at that day's start in India. */
export function istDayStart(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  return isNaN(d.getTime()) ? null : d;
}
