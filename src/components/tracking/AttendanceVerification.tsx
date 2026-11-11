'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, ShieldAlert, ShieldQuestion, MapPinOff, UserX, Route, Download, Search } from 'lucide-react';
import { formatISTTime } from '@/lib/dateUtils';
import { withOrg } from '@/lib/trackingClient';

type Verdict = 'NO_ATTENDANCE' | 'VERIFIED' | 'OUTSIDE_OFFICE' | 'GPS_ONLY' | 'NO_GPS';
type Mode = 'day' | 'month';

interface ReportRow {
  employeeId: string;
  name: string;
  department: string;
  designation: string;
  attendanceStatus: string | null;
  method: string | null;
  workingHours: number | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInGeo: { withinGeofence: boolean | null; distanceMeters: number | null; accuracy: number | null } | null;
  verdict: Verdict;
  tracking: { sessions: number; points: number; pointsOutside: number; firstAt: string | null; lastAt: string | null };
}

interface Report {
  date: string;
  trackingEnabled: boolean;
  counts: Record<Verdict, number>;
  rows: ReportRow[];
}

interface MonthRow {
  employeeId: string;
  name: string;
  department: string;
  designation: string;
  daysPresent: number;
  lateDays: number;
  totalHours: number;
  avgHours: number;
  verifiedDays: number;
  outsideDays: number;
  noGpsDays: number;
  trackedDays: number;
  trackingPoints: number;
  pointsOutside: number;
}

interface MonthReport {
  month: string;
  trackingEnabled: boolean;
  rows: MonthRow[];
}

const VERDICT_META: Record<Verdict, { label: string; style: string; icon: React.ReactNode }> = {
  VERIFIED: { label: 'Verified at office', style: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  OUTSIDE_OFFICE: { label: 'Outside office', style: 'bg-rose-50 text-rose-700 border-rose-200', icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  GPS_ONLY: { label: 'GPS, no geofence', style: 'bg-slate-100 text-slate-600 border-slate-200', icon: <ShieldQuestion className="h-3.5 w-3.5" /> },
  NO_GPS: { label: 'No GPS', style: 'bg-amber-50 text-amber-700 border-amber-200', icon: <MapPinOff className="h-3.5 w-3.5" /> },
  NO_ATTENDANCE: { label: 'No check-in', style: 'bg-slate-50 text-slate-400 border-slate-200', icon: <UserX className="h-3.5 w-3.5" /> },
};

function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function AttendanceVerification({
  onViewTrail,
  organizationId,
}: {
  onViewTrail: (employeeId: string, date: string) => void;
  organizationId?: string;
}) {
  const [mode, setMode] = useState<Mode>('day');
  const [date, setDate] = useState(todayIST());
  const [month, setMonth] = useState(todayIST().slice(0, 7));
  const [dayData, setDayData] = useState<Report | null>(null);
  const [monthData, setMonthData] = useState<MonthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Verdict | 'ALL'>('ALL');
  const [department, setDepartment] = useState('All');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = mode === 'day' ? `date=${encodeURIComponent(date)}` : `month=${encodeURIComponent(month)}`;
      const res = await fetch(withOrg(`/api/v1/tracking/report?${qs}`, organizationId), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load report.');
      if (mode === 'day') setDayData(json.data);
      else setMonthData(json.data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }, [mode, date, month, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const departments = useMemo(() => {
    const rows: { department: string }[] = (mode === 'day' ? dayData?.rows : monthData?.rows) ?? [];
    return Array.from(new Set(rows.map((r) => r.department).filter(Boolean))).sort();
  }, [mode, dayData, monthData]);

  const matches = (r: { department: string; name: string; employeeId: string }) => {
    const q = search.trim().toLowerCase();
    return (department === 'All' || r.department === department) && (!q || r.name.toLowerCase().includes(q) || r.employeeId.toLowerCase().includes(q));
  };
  const dayRows = (dayData?.rows ?? []).filter((r) => matches(r) && (filter === 'ALL' || r.verdict === filter));
  const monthRows = (monthData?.rows ?? []).filter(matches);
  const order: Verdict[] = ['VERIFIED', 'OUTSIDE_OFFICE', 'NO_GPS', 'GPS_ONLY', 'NO_ATTENDANCE'];

  const exportCsv = () => {
    if (mode === 'day') {
      downloadCsv(
        `attendance-${dayData?.date || date}.csv`,
        ['Employee ID', 'Name', 'Department', 'Designation', 'Status', 'Check-in (IST)', 'Check-out (IST)', 'Working hours', 'Check-in location', 'Distance from office (m)', 'Tracking points', 'Points outside'],
        dayRows.map((r) => [
          r.employeeId, r.name, r.department, r.designation, r.attendanceStatus || '',
          r.checkInAt ? formatISTTime(r.checkInAt) : '', r.checkOutAt ? formatISTTime(r.checkOutAt) : '',
          r.workingHours ?? '', VERDICT_META[r.verdict].label, r.checkInGeo?.distanceMeters ?? '',
          r.tracking.points, r.tracking.pointsOutside,
        ])
      );
    } else {
      downloadCsv(
        `attendance-${monthData?.month || month}.csv`,
        ['Employee ID', 'Name', 'Department', 'Designation', 'Days present', 'Late days', 'Total hours', 'Avg hours/day', 'Verified at office', 'Outside office', 'No GPS', 'Days tracked', 'Tracking points', 'Points outside'],
        monthRows.map((r) => [
          r.employeeId, r.name, r.department, r.designation, r.daysPresent, r.lateDays, r.totalHours, r.avgHours,
          r.verifiedDays, r.outsideDays, r.noGpsDays, r.trackedDays, r.trackingPoints, r.pointsOutside,
        ])
      );
    }
  };

  const visibleCount = mode === 'day' ? dayRows.length : monthRows.length;
  const trackingEnabled = mode === 'day' ? dayData?.trackingEnabled : monthData?.trackingEnabled;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">Attendance Monitoring</h3>
          <p className="text-xs text-slate-500">
            Check-in / check-out, working hours, late arrivals, and whether each check-in was made from the office.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
            {(['day', 'month'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${mode === m ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {m === 'day' ? 'Daily' : 'Monthly'}
              </button>
            ))}
          </div>
          {mode === 'day' ? (
            <input
              type="date"
              value={date}
              max={todayIST()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            />
          ) : (
            <input
              type="month"
              value={month}
              max={todayIST().slice(0, 7)}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            />
          )}
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={loading || visibleCount === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee name or ID"
            className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs font-medium text-slate-700"
          />
        </div>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
        >
          <option value="All">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}

      {mode === 'day' ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {order.map((v) => (
              <button
                key={v}
                onClick={() => setFilter(filter === v ? 'ALL' : v)}
                className={`rounded-xl border p-3 text-left cursor-pointer ${
                  filter === v ? 'border-orange-400 bg-[#FFF7ED]/50 ring-1 ring-orange-300' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <span>{VERDICT_META[v].label}</span>
                  {VERDICT_META[v].icon}
                </div>
                <p className="mt-1.5 text-xl font-black text-slate-900">{loading ? '–' : dayData?.counts?.[v] ?? 0}</p>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1 rounded-xl border border-slate-200 bg-white" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Check-in / out (IST)</th>
                  <th className="px-3 py-2.5">Hours</th>
                  <th className="px-3 py-2.5">Check-in location</th>
                  <th className="px-3 py-2.5">Tracking that day</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
                )}
                {!loading && dayRows.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No employees in this view.</td></tr>
                )}
                {!loading && dayRows.map((r) => {
                  const m = VERDICT_META[r.verdict];
                  return (
                    <tr key={r.employeeId} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900">{r.name}</div>
                        <div className="text-[10px] text-slate-400">{r.department} · {r.employeeId}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">
                        {r.checkInAt ? formatISTTime(r.checkInAt) : '--:--'} → {r.checkOutAt ? formatISTTime(r.checkOutAt) : '--:--'}
                        {r.attendanceStatus === 'Late' && <span className="ml-1.5 font-sans text-[10px] font-bold text-amber-600">Late</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-slate-700">
                        {r.workingHours != null ? `${r.workingHours.toFixed(1)} h` : r.checkInAt ? <span className="font-sans text-[10px] text-emerald-600">On shift</span> : '--'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${m.style}`}>
                          {m.icon} {m.label}
                        </span>
                        {r.checkInGeo?.distanceMeters != null && (
                          <span className="ml-1.5 text-[10px] text-slate-400">{r.checkInGeo.distanceMeters} m from office</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {r.tracking.points > 0 ? (
                          <>
                            {r.tracking.points} points · {r.tracking.sessions} session{r.tracking.sessions === 1 ? '' : 's'}
                            {r.tracking.pointsOutside > 0 && (
                              <span className="ml-1.5 font-bold text-rose-600">{r.tracking.pointsOutside} outside</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.tracking.points > 0 && (
                          <button
                            onClick={() => onViewTrail(r.employeeId, dayData!.date)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-orange-700 hover:bg-[#FFF7ED] cursor-pointer"
                          >
                            <Route className="h-3.5 w-3.5" /> View trail
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1 rounded-xl border border-slate-200 bg-white" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-3 py-2.5 text-right">Days present</th>
                <th className="px-3 py-2.5 text-right">Late</th>
                <th className="px-3 py-2.5 text-right">Total hours</th>
                <th className="px-3 py-2.5 text-right">Avg / day</th>
                <th className="px-3 py-2.5">Check-in verification</th>
                <th className="px-3 py-2.5 text-right">Days tracked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
              )}
              {!loading && monthRows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No employees in this view.</td></tr>
              )}
              {!loading && monthRows.map((r) => (
                <tr key={r.employeeId} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2.5">
                    <div className="font-bold text-slate-900">{r.name}</div>
                    <div className="text-[10px] text-slate-400">{r.department} · {r.employeeId}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-900">{r.daysPresent}</td>
                  <td className={`px-3 py-2.5 text-right font-bold ${r.lateDays > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{r.lateDays}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700">{r.totalHours.toFixed(1)} h</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500">{r.avgHours.toFixed(1)} h</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex flex-wrap gap-1 text-[10px] font-bold">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">{r.verifiedDays} office</span>
                      {r.outsideDays > 0 && <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">{r.outsideDays} outside</span>}
                      {r.noGpsDays > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">{r.noGpsDays} no GPS</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">
                    {r.trackedDays}
                    {r.pointsOutside > 0 && <span className="ml-1.5 text-[10px] font-bold text-rose-600">{r.pointsOutside} pts outside</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {trackingEnabled === false && (
        <p className="text-[11px] text-slate-400">Live tracking is switched off, so only check-in GPS is available for verification.</p>
      )}
    </div>
  );
}
