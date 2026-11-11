'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Radio, RefreshCw, MapPin, MapPinOff, Users, LogOut, CalendarOff, UserX, AlertTriangle, WifiOff, Pause, Play, Search, X, PowerOff } from 'lucide-react';
import { useLiveAttendance, LiveRow } from '@/lib/useLiveAttendance';
import { formatISTTime } from '@/lib/dateUtils';
import { LiveMap } from './LiveMap';

type Filter = 'ALL' | LiveRow['state'];

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

const STATE_LABEL: Record<LiveRow['state'], string> = {
  WORKING: 'Working',
  CHECKED_OUT: 'Checked out',
  ON_LEAVE: 'On leave',
  NOT_MARKED: 'Not marked',
};

const STATE_STYLE: Record<LiveRow['state'], string> = {
  WORKING: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CHECKED_OUT: 'bg-slate-100 text-slate-600 border-slate-200',
  ON_LEAVE: 'bg-[#FFF7ED] text-orange-700 border-[#FED7AA]',
  NOT_MARKED: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function LiveAttendanceBoard({ pollMs = 10000, organizationId }: { pollMs?: number; organizationId?: string }) {
  const [paused, setPaused] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const { data, error, isLoading, lastUpdated, refresh } = useLiveAttendance(pollMs, !paused, organizationId);

  // 1-second tick drives running timers and "x s ago" labels without hitting the server.
  // Runs even when nobody is working so the "Updated x ago" label doesn't freeze.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [paused]);

  // Correct for client/server clock differences so timers are accurate
  const clockOffset = useMemo(() => {
    if (!data?.serverTime) return 0;
    return new Date(data.serverTime).getTime() - (lastUpdated?.getTime() ?? Date.now());
  }, [data?.serverTime, lastUpdated]);
  const nowMs = Date.now() + clockOffset;

  const rows = data?.rows ?? [];
  const departments = Array.from(new Set(rows.map((r) => r.department).filter(Boolean))).sort();
  const query = search.trim().toLowerCase();
  const searched = rows.filter(
    (r) =>
      (department === 'All' || r.department === department) &&
      (!query || r.name.toLowerCase().includes(query) || r.employeeId.toLowerCase().includes(query) || r.department?.toLowerCase().includes(query))
  );
  // Surface people who need attention first: outside geofence, lost signal, then everyone else by state
  const rowPriority = (r: LiveRow) => {
    if (r.state === 'WORKING' && r.location?.withinGeofence === false && !r.location.stale) return 0;
    if (r.state === 'WORKING' && r.location?.stale) return 1;
    return { WORKING: 2, NOT_MARKED: 3, ON_LEAVE: 4, CHECKED_OUT: 5 }[r.state];
  };
  const visibleRows = (filter === 'ALL' ? searched : searched.filter((r) => r.state === filter))
    .slice()
    .sort((a, b) => rowPriority(a) - rowPriority(b) || a.name.localeCompare(b.name));
  const selectedRow = selectedId ? rows.find((r) => r.employeeId === selectedId) ?? null : null;
  const toggleSelected = (employeeId: string) => setSelectedId((prev) => (prev === employeeId ? null : employeeId));
  const k = data?.kpis;
  const activeAlerts = (data?.alerts ?? []).filter((a) => !dismissedAlerts.has(`${a.employeeId}-${a.stoppedAt}`));

  const tiles: { key: Filter; label: string; value: number | undefined; icon: React.ReactNode; tone: string }[] = [
    { key: 'WORKING', label: 'Working now', value: k?.working, icon: <Users className="h-4 w-4" />, tone: 'text-emerald-600' },
    { key: 'CHECKED_OUT', label: 'Checked out', value: k?.checkedOut, icon: <LogOut className="h-4 w-4" />, tone: 'text-slate-600' },
    { key: 'ON_LEAVE', label: 'On leave', value: k?.onLeave, icon: <CalendarOff className="h-4 w-4" />, tone: 'text-orange-600' },
    { key: 'NOT_MARKED', label: 'Not marked', value: k?.notMarked, icon: <UserX className="h-4 w-4" />, tone: 'text-amber-600' },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {!paused && !error && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${error ? 'bg-rose-500' : paused ? 'bg-slate-400' : 'bg-emerald-500'}`} />
          </span>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <Radio className="h-4 w-4 text-orange-500" />
            Live Attendance
          </h3>
          <span className="text-[10px] font-medium text-slate-400">
            {paused ? 'Paused' : lastUpdated ? `Updated ${formatAgo(Date.now() - lastUpdated.getTime())}` : 'Connecting…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMap((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {showMap ? <MapPinOff className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
            {showMap ? 'Hide map' : 'Show map'}
          </button>
          <button
            onClick={() => setPaused((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error} Showing the last known data.</span>
          </div>
        )}

        {activeAlerts.length > 0 && (
          <div className="space-y-1.5">
            {activeAlerts.map((a) => (
              <div
                key={`${a.employeeId}-${a.stoppedAt}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <PowerOff className="h-4 w-4 shrink-0" />
                  {a.name || a.employeeId} turned off location tracking while still checked in
                  {a.stoppedAt && <span className="font-normal text-amber-600">· {formatISTTime(a.stoppedAt)}</span>}
                </span>
                <button
                  onClick={() => setDismissedAlerts((prev) => new Set(prev).add(`${a.employeeId}-${a.stoppedAt}`))}
                  className="shrink-0 rounded-md p-0.5 hover:bg-amber-100 cursor-pointer"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* KPI tiles double as filters */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(filter === t.key ? 'ALL' : t.key)}
              className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                filter === t.key ? 'border-orange-400 bg-[#FFF7ED]/50 ring-1 ring-orange-300' : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className={`flex items-center justify-between ${t.tone}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t.label}</span>
                {t.icon}
              </div>
              <p className={`mt-1.5 text-xl font-black ${t.tone}`}>{isLoading ? '–' : t.value ?? 0}</p>
            </button>
          ))}
        </div>

        {/* Alerts */}
        {k && (k.outsideOffice > 0 || k.staleSignal > 0) && (
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
            {k.outsideOffice > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">
                <MapPin className="h-3.5 w-3.5" /> {k.outsideOffice} working outside the office geofence
              </span>
            )}
            {k.staleSignal > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                <WifiOff className="h-3.5 w-3.5" /> {k.staleSignal} with no recent location signal
              </span>
            )}
          </div>
        )}

        {data && !data.trackingEnabled && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Live location tracking is switched off for this organization. Attendance presence is still shown below.
          </div>
        )}

        {/* Search filters both the map and the table */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID or department"
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs font-medium text-slate-700"
            />
          </div>
          {departments.length > 1 && (
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
          )}
          {selectedRow && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-2.5 py-1 text-[11px] font-semibold text-orange-700">
              <MapPin className="h-3 w-3" />
              Focused: {selectedRow.name}
              <button onClick={() => setSelectedId(null)} className="rounded-full p-0.5 hover:bg-[#FFEDD5] cursor-pointer" aria-label="Clear focus">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>

        {showMap && data && data.trackingEnabled && (
          <LiveMap rows={searched} geofence={data.geofence} focusId={selectedId} onSelect={toggleSelected} />
        )}
        {showMap && data && data.trackingEnabled && !data.geofence && (
          <p className="text-[10px] text-slate-400">
            No office geofence set. Add the office location in Settings → Attendance Rules to see the boundary and inside/outside status.
          </p>
        )}

        {/* Table */}
        <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1 rounded-xl border border-slate-200" style={{ scrollbarWidth: 'thin' }}>
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Check-in (IST)</th>
                <th className="px-3 py-2.5">Time on shift</th>
                <th className="px-3 py-2.5">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">Loading live data…</td>
                </tr>
              )}
              {!isLoading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">No employees in this view.</td>
                </tr>
              )}
              {visibleRows.map((r) => {
                const loc = r.location;
                const elapsed =
                  r.state === 'WORKING' && r.checkInAt
                    ? formatElapsed(nowMs - new Date(r.checkInAt).getTime())
                    : r.state === 'CHECKED_OUT' && r.workingHours != null
                    ? `${r.workingHours.toFixed(1)} h`
                    : '--';
                const canFocus = showMap && !!loc && !!data?.trackingEnabled;
                return (
                  <tr
                    key={r.employeeId}
                    onClick={canFocus ? () => toggleSelected(r.employeeId) : undefined}
                    title={canFocus ? 'Show on map' : undefined}
                    className={`${selectedId === r.employeeId ? 'bg-[#FFF7ED]/70' : 'hover:bg-slate-50/60'} ${canFocus ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900">{r.name}</div>
                      <div className="text-[10px] text-slate-400">{r.department}{r.designation ? ` · ${r.designation}` : ''}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${STATE_STYLE[r.state]}`}>
                        {STATE_LABEL[r.state]}
                      </span>
                      {r.attendanceStatus === 'Late' && r.state !== 'NOT_MARKED' && (
                        <span className="ml-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Late</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700">{r.checkInAt ? formatISTTime(r.checkInAt) : '--:--'}</td>
                    <td className={`px-3 py-2.5 font-mono font-bold ${r.state === 'WORKING' ? 'text-orange-600' : 'text-slate-600'}`}>{elapsed}</td>
                    <td className="px-3 py-2.5">
                      {r.state !== 'WORKING' ? (
                        <span className="text-slate-300">--</span>
                      ) : !loc ? (
                        <span className="text-[11px] text-slate-400">
                          {r.trackingStatus === 'EXEMPT'
                            ? 'Exempted from tracking'
                            : r.trackingStatus === 'DISABLED'
                            ? 'Tracking is off'
                            : r.trackingStatus === 'ACTIVE'
                            ? 'Waiting for GPS…'
                            : 'Tracking not started'}
                        </span>
                      ) : loc.stale ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                          <WifiOff className="h-3.5 w-3.5" /> Signal lost
                          {loc.lastPingAt && <span className="font-normal text-slate-400">· {formatAgo(nowMs - new Date(loc.lastPingAt).getTime())}</span>}
                        </span>
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px]">
                          {loc.withinGeofence === false ? (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-bold text-rose-700">
                              Outside{loc.distanceMeters != null ? ` · ${formatDistance(loc.distanceMeters)}` : ''}
                              {loc.outsideMinutes > 0 ? ` · ${loc.outsideMinutes}m` : ''}
                            </span>
                          ) : loc.withinGeofence === true ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                              At office{loc.distanceMeters != null ? ` · ${formatDistance(loc.distanceMeters)}` : ''}
                            </span>
                          ) : (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-bold text-slate-600">Live</span>
                          )}
                          {loc.lastPingAt && <span className="text-slate-400">{formatAgo(nowMs - new Date(loc.lastPingAt).getTime())}</span>}
                          <a
                            href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-orange-600 hover:underline"
                          >
                            Map
                          </a>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400">
          Location is shared by employees only while they are checked in and stops automatically at check-out. Refreshes every {Math.round(pollMs / 1000)} seconds.
        </p>
      </div>
    </section>
  );
}
