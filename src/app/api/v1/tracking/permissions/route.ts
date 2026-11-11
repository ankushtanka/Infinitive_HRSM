import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { normalizeRole } from '@/lib/roleUtils';
import { logAuditEvent } from '@/lib/audit';
import { getISTDateString } from '@/lib/dateUtils';
import {
  TRACKING_COLLECTIONS,
  loadOrgPolicy,
  loadEmployeePolicy,
  sanitizeRoles,
  clampRetention,
  DEFAULT_TRACKING_POLICY,
  resolveTrackingOrgId,
} from '@/lib/tracking';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/tracking/permissions
 * Everyone: the effective policy for the caller plus their own active session (used by the Employee panel).
 * Admin / Super Admin additionally get the org policy and the per-employee exemptions.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const orgId = resolveTrackingOrgId(auth, req);
    const role = normalizeRole(auth.role);

    const effective = auth.employeeId
      ? await loadEmployeePolicy(db, orgId, auth.employeeId)
      : { ...(await loadOrgPolicy(db, orgId)), exempted: false };

    let activeSession: any = null;
    if (auth.employeeId) {
      const s: any = await db.collection(TRACKING_COLLECTIONS.sessions).findOne({
        organizationId: orgId,
        employeeId: auth.employeeId,
        status: 'ACTIVE',
        date: getISTDateString(),
      });
      if (s) {
        activeSession = {
          id: s._id.toString(),
          startedAt: s.startedAt,
          lastLocationAt: s.lastLocationAt || null,
          pointCount: s.pointCount || 0,
          withinGeofence: s.withinGeofence ?? null,
          distanceMeters: s.distanceMeters ?? null,
        };
      }
    }

    const data: Record<string, any> = {
      policy: effective,
      activeSession,
      canManage: role === 'ADMIN' || role === 'SUPER_ADMIN',
      canEditOrgPolicy: role === 'SUPER_ADMIN',
    };

    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      data.orgPolicy = await loadOrgPolicy(db, orgId);
      const overrides = await db
        .collection(TRACKING_COLLECTIONS.permissions)
        .find({ organizationId: orgId, scope: 'EMPLOYEE' })
        .project({ employeeId: 1, enabled: 1, updatedBy: 1, updatedAt: 1 })
        .toArray();
      data.exemptions = overrides.filter((o: any) => o.enabled === false);
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in GET /api/v1/tracking/permissions:', error);
    return NextResponse.json({ success: false, message: 'Failed to load tracking permissions.' }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/tracking/permissions
 * Body: { org?: {enabled, requireConsent, allowedViewerRoles, historyRoles, retentionDays}, employee?: {employeeId, exempt} }
 * - Organization-wide policy: SUPER_ADMIN only.
 * - Per-employee exemption: ADMIN or SUPER_ADMIN.
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }
    const role = normalizeRole(auth.role);
    const body = await req.json().catch(() => ({}));
    const { db } = await connectToDatabase();
    const orgId = resolveTrackingOrgId(auth, req);
    const now = new Date();
    const actor = auth.email || auth.userId;

    if (body.org) {
      if (role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          { success: false, message: 'Only a Super Admin can change the organization-wide tracking policy.' },
          { status: 403 }
        );
      }
      const before = await loadOrgPolicy(db, orgId);
      const o = body.org;
      const next = {
        enabled: o.enabled !== undefined ? Boolean(o.enabled) : before.enabled,
        requireConsent: o.requireConsent !== undefined ? Boolean(o.requireConsent) : before.requireConsent,
        allowedViewerRoles:
          o.allowedViewerRoles !== undefined
            ? sanitizeRoles(o.allowedViewerRoles, DEFAULT_TRACKING_POLICY.allowedViewerRoles)
            : before.allowedViewerRoles,
        historyRoles:
          o.historyRoles !== undefined
            ? sanitizeRoles(o.historyRoles, DEFAULT_TRACKING_POLICY.historyRoles)
            : before.historyRoles,
        retentionDays: o.retentionDays !== undefined ? clampRetention(o.retentionDays) : before.retentionDays,
      };
      await db.collection(TRACKING_COLLECTIONS.permissions).updateOne(
        { organizationId: orgId, scope: 'ORG' },
        { $set: { ...next, updatedBy: actor, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
      // Turning tracking off ends every live session immediately
      if (before.enabled && !next.enabled) {
        await db.collection(TRACKING_COLLECTIONS.sessions).updateMany(
          { organizationId: orgId, status: 'ACTIVE' },
          { $set: { status: 'AUTO_STOPPED', stopReason: 'policy_disabled', endedAt: now } }
        );
      }
      await logAuditEvent(req, 'TRACKING_POLICY_UPDATE', { organizationId: orgId, oldValue: { ...before }, newValue: { ...next } });
      return NextResponse.json({
        success: true,
        message: 'Organization tracking policy updated.',
        data: { orgPolicy: { ...before, ...next } },
      });
    }

    if (body.employee) {
      const employeeId = String(body.employee.employeeId || '').trim();
      if (!employeeId) {
        return NextResponse.json({ success: false, message: 'employeeId is required.' }, { status: 400 });
      }
      const emp = await db.collection('employees').findOne({ organizationId: orgId, employeeId }, { projection: { _id: 1 } });
      if (!emp) {
        return NextResponse.json({ success: false, message: 'Employee not found in this organization.' }, { status: 404 });
      }
      const exempt = Boolean(body.employee.exempt);
      if (exempt) {
        await db.collection(TRACKING_COLLECTIONS.permissions).updateOne(
          { organizationId: orgId, scope: 'EMPLOYEE', employeeId },
          { $set: { enabled: false, updatedBy: actor, updatedAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true }
        );
        await db.collection(TRACKING_COLLECTIONS.sessions).updateMany(
          { organizationId: orgId, employeeId, status: 'ACTIVE' },
          { $set: { status: 'AUTO_STOPPED', stopReason: 'employee_exempted', endedAt: now } }
        );
      } else {
        await db.collection(TRACKING_COLLECTIONS.permissions).deleteOne({ organizationId: orgId, scope: 'EMPLOYEE', employeeId });
      }
      await logAuditEvent(req, 'TRACKING_EXEMPTION_UPDATE', { organizationId: orgId, employeeId, details: { exempt } });
      return NextResponse.json({
        success: true,
        message: exempt ? 'Employee exempted from tracking.' : 'Employee exemption removed.',
      });
    }

    return NextResponse.json({ success: false, message: 'Provide either "org" or "employee" in the request body.' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in PATCH /api/v1/tracking/permissions:', error);
    return NextResponse.json({ success: false, message: 'Failed to update tracking permissions.' }, { status: 500 });
  }
}
