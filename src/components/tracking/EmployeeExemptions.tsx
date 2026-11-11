'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { withOrg } from '@/lib/trackingClient';
import { UserMinus, UserCheck, Loader2 } from 'lucide-react';

interface Exemption {
  employeeId: string;
  enabled: false;
  updatedBy?: string;
  updatedAt?: string;
}

/** Admin / Super Admin only: exempt specific employees from live tracking regardless of org policy. */
export function EmployeeExemptions({ organizationId }: { organizationId?: string } = {}) {
  const [exemptions, setExemptions] = useState<Exemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newId, setNewId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(withOrg('/api/v1/tracking/permissions', organizationId), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load.');
      setExemptions(json.data.exemptions || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load exemptions.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const setExempt = async (employeeId: string, exempt: boolean) => {
    if (!employeeId.trim()) return;
    setBusyId(employeeId);
    try {
      const res = await fetch(withOrg('/api/v1/tracking/permissions', organizationId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee: { employeeId: employeeId.trim(), exempt } }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update.');
      if (exempt) setNewId('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to update exemption.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">Employee Exemptions</h3>
        <p className="text-xs text-slate-500">
          Exempt a specific employee from live location tracking even while the organization policy is on (e.g. field staff with a separate agreement, medical exceptions).
        </p>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setExempt(newId, true);
        }}
        className="flex gap-2"
      >
        <input
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          placeholder="Employee ID (e.g. EMP1001)"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
        />
        <button
          type="submit"
          disabled={!newId.trim() || busyId === newId.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
        >
          {busyId === newId.trim() ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />} Exempt
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-center text-xs text-slate-400">Loading…</p>
        ) : exemptions.length === 0 ? (
          <p className="p-4 text-center text-xs text-slate-400">No employees are exempted. Everyone follows the organization policy.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {exemptions.map((ex) => (
              <li key={ex.employeeId} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="font-bold text-slate-800">{ex.employeeId}</span>
                <button
                  onClick={() => setExempt(ex.employeeId, false)}
                  disabled={busyId === ex.employeeId}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 cursor-pointer"
                >
                  {busyId === ex.employeeId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} Remove exemption
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
