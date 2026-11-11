'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { withOrg } from '@/lib/trackingClient';
import { Search, Loader2 } from 'lucide-react';
import { TrackingTrailMap, TrailPoint } from './TrackingTrailMap';
import { formatISTTime } from '@/lib/dateUtils';

function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

interface HistoryData {
  employeeId: string;
  from: string;
  to: string;
  retentionDays: number;
  clampedToRetention: boolean;
  truncated: boolean;
  summary: { sessions: number; points: number; pointsOutsideGeofence: number };
  sessions: { id: string; date: string; status: string; startedAt: string; endedAt: string | null; stopReason: string | null; pointCount: number }[];
  points: TrailPoint[];
}

const REASON_LABEL: Record<string, string> = {
  employee_stopped: 'Stopped by employee',
  checked_out: 'Ended at check-out',
  not_checked_in: 'Ended: not checked in',
  policy_disabled: 'Tracking switched off',
  employee_exempted: 'Employee exempted',
  stale_session: 'Old session closed',
};

export function TrackingReports({
  initialEmployeeId = '',
  initialDate,
  geofence,
  organizationId,
}: {
  initialEmployeeId?: string;
  initialDate?: string;
  geofence?: { lat: number; lng: number; radiusMeters: number } | null;
  organizationId?: string;
}) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId);
  const [date, setDate] = useState(initialDate || todayIST());
  const [data, setData] = useState<HistoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (empId: string, d: string) => {
    if (!empId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ employeeId: empId.trim(), date: d });
      const res = await fetch(withOrg(`/api/v1/tracking/history?${qs.toString()}`, organizationId), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load history.');
      setData(json.data);
    } catch (e: any) {
      setData(null);
      setError(e?.message || 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // Jump straight to a trail when opened from the verification table
  useEffect(() => {
    if (initialEmployeeId) {
      setEmployeeId(initialEmployeeId);
      if (initialDate) setDate(initialDate);
      load(initialEmployeeId, initialDate || todayIST());
    }
  }, [initialEmployeeId, initialDate, load]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">Tracking Reports</h3>
        <p className="text-xs text-slate-500">
          Movement trail for one employee and day. Each view of another person&apos;s history is recorded in the audit log.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(employeeId, date);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          placeholder="Employee ID (e.g. EMP1001)"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
        />
        <input
          type="date"
          value={date}
          max={todayIST()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
        />
        <button
          type="submit"
          disabled={loading || !employeeId.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Load trail
        </button>
      </form>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Sessions', data.summary.sessions, 'text-slate-900'],
              ['Location points', data.summary.points, 'text-orange-500'],
              ['Points outside office', data.summary.pointsOutsideGeofence, data.summary.pointsOutsideGeofence > 0 ? 'text-rose-600' : 'text-slate-900'],
            ].map(([label, value, tone]) => (
              <div key={label as string} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                <p className={`mt-1 text-xl font-black ${tone}`}>{value}</p>
              </div>
            ))}
          </div>

          {(data.clampedToRetention || data.truncated) && (
            <p className="text-[11px] text-amber-700">
              {data.clampedToRetention && `Only the last ${data.retentionDays} days are kept, so older data is not shown. `}
              {data.truncated && 'Showing the first points only; narrow the date range to see the rest.'}
            </p>
          )}

          {data.points.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
              No location points were recorded for this employee on {data.from}.
            </div>
          ) : (
            <TrackingTrailMap points={data.points} geofence={geofence} />
          )}

          {data.sessions.length > 0 && (
            <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1 rounded-xl border border-slate-200 bg-white" style={{ scrollbarWidth: 'thin' }}>
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Started (IST)</th>
                    <th className="px-3 py-2.5">Ended (IST)</th>
                    <th className="px-3 py-2.5">How it ended</th>
                    <th className="px-3 py-2.5">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2 font-mono">{formatISTTime(s.startedAt)}</td>
                      <td className="px-3 py-2 font-mono">{s.endedAt ? formatISTTime(s.endedAt) : 'Running'}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {s.status === 'ACTIVE' ? 'Running' : REASON_LABEL[s.stopReason || ''] || s.stopReason || s.status}
                      </td>
                      <td className="px-3 py-2">{s.pointCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
