'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { withOrg } from '@/lib/trackingClient';
import { RefreshCw, ChevronLeft, ChevronRight, FileClock } from 'lucide-react';
import { formatISTTime, formatISTDate } from '@/lib/dateUtils';

interface AuditRow {
  id: string;
  action: string;
  performedBy: string;
  performedByName: string | null;
  role: string | null;
  employeeId: string | null;
  details: any;
  oldValue: any;
  newValue: any;
  timestamp: string;
}

const ACTION_LABEL: Record<string, string> = {
  TRACKING_START: 'Tracking started',
  TRACKING_STOP: 'Tracking stopped',
  TRACKING_FORCE_STOP: 'Tracking force-stopped',
  TRACKING_POLICY_UPDATE: 'Policy updated',
  TRACKING_EXEMPTION_UPDATE: 'Exemption changed',
  TRACKING_HISTORY_VIEW: 'History viewed',
  TRACKING_REPORT_VIEW: 'Report viewed',
};

function summarize(r: AuditRow): string {
  if (r.action === 'TRACKING_EXEMPTION_UPDATE') return r.details?.exempt ? `Exempted ${r.employeeId}` : `Removed exemption for ${r.employeeId}`;
  if (r.action === 'TRACKING_POLICY_UPDATE') {
    const before = r.oldValue?.enabled;
    const after = r.newValue?.enabled;
    if (before !== after) return after ? 'Tracking turned ON organization-wide' : 'Tracking turned OFF organization-wide';
    return 'Tracking settings changed';
  }
  if (r.action === 'TRACKING_HISTORY_VIEW') return `Viewed ${r.employeeId}'s location history (${r.details?.from} to ${r.details?.to})`;
  if (r.action === 'TRACKING_REPORT_VIEW') return `Viewed verification report for ${r.details?.date}`;
  if (r.action === 'TRACKING_FORCE_STOP') return `Force-stopped tracking for ${r.employeeId}`;
  if (r.employeeId) return `Employee ${r.employeeId}`;
  return '';
}

export function TrackingAuditLog({ organizationId }: { organizationId?: string } = {}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(withOrg(`/api/v1/tracking/audit?page=${p}&limit=25`, organizationId), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load audit log.');
      setRows(json.data.logs);
      setTotalPages(json.data.totalPages);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load audit log.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load(page);
  }, [page, load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">Tracking Audit Log</h3>
          <p className="text-xs text-slate-500">Every start, stop, policy change, exemption and history view — immutable and organization-wide.</p>
        </div>
        <button
          onClick={() => load(page)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}

      <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1 rounded-xl border border-slate-200 bg-white" style={{ scrollbarWidth: 'thin' }}>
        {loading ? (
          <p className="p-6 text-center text-xs text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-slate-400">
            <FileClock className="h-8 w-8" />
            <p className="text-xs">No tracking activity recorded yet.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5">When (IST)</th>
                <th className="px-3 py-2.5">Action</th>
                <th className="px-3 py-2.5">Performed by</th>
                <th className="px-3 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                    {formatISTDate(r.timestamp)} {formatISTTime(r.timestamp)}
                  </td>
                  <td className="px-3 py-2 font-sans font-bold text-orange-700">{ACTION_LABEL[r.action] || r.action}</td>
                  <td className="px-3 py-2 font-sans text-slate-700">
                    {r.performedByName || r.performedBy}
                    {r.role && <span className="ml-1 text-[10px] text-slate-400">({r.role})</span>}
                  </td>
                  <td className="px-3 py-2 font-sans text-slate-600">{summarize(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold disabled:opacity-40 cursor-pointer"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
