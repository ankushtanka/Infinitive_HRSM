'use client';

import React, { useEffect, useState } from 'react';
import { withOrg } from '@/lib/trackingClient';
import { ShieldCheck, Loader2, Save } from 'lucide-react';
import { VIEWER_ROLES, ViewerRole } from '@/lib/tracking';

interface OrgPolicy {
  enabled: boolean;
  requireConsent: boolean;
  allowedViewerRoles: ViewerRole[];
  historyRoles: ViewerRole[];
  retentionDays: number;
  pingIntervalSeconds: number;
}

const ROLE_LABEL: Record<ViewerRole, string> = { MANAGER: 'Manager', HR: 'HR', ADMIN: 'Admin' };

/** Super Admin only: the master switch and rules for live tracking across the whole organization. */
export function OrgTrackingPolicy({ organizationId }: { organizationId?: string } = {}) {
  const [policy, setPolicy] = useState<OrgPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(withOrg('/api/v1/tracking/permissions', organizationId), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) throw new Error(d?.message || 'Failed to load.');
        setPolicy(d.data.orgPolicy);
      })
      .catch((e) => setError(e?.message || 'Failed to load tracking policy.'))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const toggleRole = (list: 'allowedViewerRoles' | 'historyRoles', role: ViewerRole) => {
    if (!policy) return;
    const has = policy[list].includes(role);
    setPolicy({ ...policy, [list]: has ? policy[list].filter((r) => r !== role) : [...policy[list], role] });
  };

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(withOrg('/api/v1/tracking/permissions', organizationId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org: policy }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save.');
      setPolicy(json.data.orgPolicy);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e?.message || 'Failed to save tracking policy.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-xs text-slate-400">Loading…</p>;
  if (!policy) return <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error || 'Could not load policy.'}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">Organization Tracking Policy</h3>
        <p className="text-xs text-slate-500">Live location tracking is off until you turn it on here. This applies to every employee unless individually exempted.</p>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}
      {saved && <div className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Saved.</div>}

      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 cursor-pointer">
        <input type="checkbox" checked={policy.enabled} onChange={(e) => setPolicy({ ...policy, enabled: e.target.checked })} className="h-4 w-4 rounded text-orange-500" />
        <span>
          <span className="block font-bold text-slate-900">Enable live location tracking organization-wide</span>
          <span className="block text-[11px] text-slate-500">Turning this off immediately stops every running session.</span>
        </span>
      </label>

      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={policy.requireConsent}
          onChange={(e) => setPolicy({ ...policy, requireConsent: e.target.checked })}
          className="h-4 w-4 rounded text-orange-500"
        />
        <span>
          <span className="block font-bold text-slate-900">Require employee consent before each tracking session</span>
          <span className="block text-[11px] text-slate-500">Employees must accept a notice before starting tracking.</span>
        </span>
      </label>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="font-bold text-slate-900">Who can see live locations</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VIEWER_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => toggleRole('allowedViewerRoles', role)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold cursor-pointer ${
                policy.allowedViewerRoles.includes(role) ? 'border-orange-400 bg-[#FFF7ED] text-orange-700' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {ROLE_LABEL[role]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-400">Super Admin always has access. Managers only ever see their own team.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="font-bold text-slate-900">Who can view location history / reports</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VIEWER_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => toggleRole('historyRoles', role)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold cursor-pointer ${
                policy.historyRoles.includes(role) ? 'border-orange-400 bg-[#FFF7ED] text-orange-700' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {ROLE_LABEL[role]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <label className="font-bold text-slate-900">Location history retention (days)</label>
          <input
            type="number"
            min={1}
            max={90}
            value={policy.retentionDays}
            onChange={(e) => setPolicy({ ...policy, retentionDays: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border p-2 text-sm font-medium"
          />
          <p className="mt-1 text-[10px] text-slate-400">Between 1 and 90 days. Points are hard-deleted after 90 days regardless of this setting.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <label className="font-bold text-slate-900">Live update interval (seconds)</label>
          <input value={policy.pingIntervalSeconds} disabled className="mt-1 w-full rounded-xl border bg-slate-50 p-2 text-sm font-medium text-slate-500" />
          <p className="mt-1 text-[10px] text-slate-400">Set under Admin → Settings → Attendance Rules.</p>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save policy
      </button>
    </div>
  );
}
