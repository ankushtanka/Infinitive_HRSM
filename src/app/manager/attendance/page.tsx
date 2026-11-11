'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  Clock,
  RefreshCw,
  AlertCircle,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  CalendarDays,
  MapPin,
  Download,
  X,
  Plus,
  Radio,
  Map as MapIcon, // renamed: avoids shadowing the global JS `Map`
} from 'lucide-react';
import { LiveMap } from '@/components/attendance/LiveMap';
import { MarkAttendanceModal } from '@/components/modals/MarkAttendanceModal';
import { OfficeMapModal, OfficeLocationData } from '@/components/modals/OfficeMapModal';
import { useLiveAttendance } from '@/lib/useLiveAttendance';

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  department: string;
  designation: string;
  employmentStatus: string;
  photoUrl?: string | null;
  date: string;
  formattedDate: string;
  clockIn: string | null;
  clockOut: string | null;
  workingHours: string;
  status: 'Present' | 'Late' | 'Half Day' | 'Absent' | 'On Leave' | 'Not Marked' | string;
  method?: string;
  location?: string;
  remarks?: string | null;
}

interface AttendanceKPIs {
  totalTeamMembers: number;
  presentCount: number;
  lateCount: number;
  onLeaveCount: number;
  absentNotMarkedCount: number;
  attendanceRate: number;
}

interface AvailableFilters {
  departments: string[];
  designations: string[];
  statuses: string[];
}

interface AttendanceException {
  id: string;
  employeeId: string;
  employeeName: string;
  photoUrl?: string | null;
  type: string;
  timestamp: string;
  detail: string;
  severity: 'error' | 'warning' | 'info';
}

const PAGE_SIZE = 10;
const DEFAULT_OFFICE = { lat: 24.5845267, lng: 73.7314268, radius: 200, name: 'Head Office HQ' };

// Module-level: no need to re-create on every render.
const getTodayISTString = () => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // fall through
  }
  return new Date().toISOString().split('T')[0];
};

const getInitials = (name?: string) => (name || '?').trim().slice(0, 2).toUpperCase();

// Proper CSV escaping + protection against spreadsheet formula injection.
const csvCell = (value: unknown) => {
  let s = String(value ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

function useDebouncedValue<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ManagerAttendancePage() {
  const [todayIST] = useState(getTodayISTString);

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [exceptions, setExceptions] = useState<AttendanceException[]>([]);
  const [kpis, setKpis] = useState<AttendanceKPIs>({
    totalTeamMembers: 0,
    presentCount: 0,
    lateCount: 0,
    onLeaveCount: 0,
    absentNotMarkedCount: 0,
    attendanceRate: 0,
  });
  const [filters, setFilters] = useState<AvailableFilters>({
    departments: [],
    designations: [],
    statuses: [],
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: PAGE_SIZE,
    totalPages: 1,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // View toggles
  const [showLiveMap, setShowLiveMap] = useState(false);
  const [isOfficeModalOpen, setIsOfficeModalOpen] = useState(false);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [officeLocation, setOfficeLocation] = useState<OfficeLocationData | null>(null);
  const [isMarkModalOpen, setIsMarkModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

  // Application-wide background scroll lock while manager attendance detail modal is open
  useBodyScrollLock(Boolean(selectedRecord));

  // Filters
  const [date, setDate] = useState(todayIST);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [designationFilter, setDesignationFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search.trim(), 400);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Live tracking snapshot
  const { data: liveData } = useLiveAttendance(15000, showLiveMap);

  const abortRef = useRef<AbortController | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  // Authoritative office location from organization attendance settings
  const fetchOfficeLocation = useCallback(async () => {
    try {
      setIsRefreshingLocation(true);
      const res = await fetch('/api/v1/settings/attendance', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setOfficeLocation({
            lat: Number(json.data.officeLat) || DEFAULT_OFFICE.lat,
            lng: Number(json.data.officeLng) || DEFAULT_OFFICE.lng,
            radiusMeters: Number(json.data.geofenceRadiusMeters) || DEFAULT_OFFICE.radius,
            name: json.data.officeName || DEFAULT_OFFICE.name,
            geofenceEnabled: json.data.geofenceEnabled !== false,
            geofenceEnforce: Boolean(json.data.geofenceEnforce),
          });
        }
      }
    } catch (err) {
      console.warn('Could not refresh office location:', err);
    } finally {
      setIsRefreshingLocation(false);
    }
  }, []);

  const fetchAttendanceData = useCallback(
    async (showRefreshing = false) => {
      // Cancel any in-flight request so stale responses can't overwrite newer ones.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (showRefreshing) setIsRefreshing(true);
      else setIsLoading(true);
      setErrorMsg(null);

      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: String(PAGE_SIZE),
          search: debouncedSearch,
          date,
          department: departmentFilter,
          designation: designationFilter,
          attendanceStatus: statusFilter,
        });

        const res = await fetch(`/api/v1/manager/attendance?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Access Denied: You do not have permission to view team attendance.');
          }
          throw new Error(`Failed to load attendance (HTTP ${res.status}).`);
        }

        const json = await res.json();
        if (json.success && json.data) {
          setRecords(json.data.records || []);
          setSelectedIds([]);

          if (json.data.kpis) setKpis(json.data.kpis);
          if (json.data.filters) setFilters(json.data.filters);
          if (json.data.pagination) {
            setPagination(json.data.pagination);
            // If the data shrank, don't stay stranded on a page that no longer exists.
            const tp = json.data.pagination.totalPages;
            if (tp >= 1 && currentPage > tp) setCurrentPage(tp);
          }
          if (Array.isArray(json.data.exceptions)) setExceptions(json.data.exceptions);
          // Settings fetch is authoritative; only use this as a fallback.
          if (json.data.officeLocation) {
            setOfficeLocation((prev) => prev ?? json.data.officeLocation);
          }
        } else {
          throw new Error(json.message || 'Failed to parse attendance records.');
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('Error fetching manager attendance:', err);
        setErrorMsg(err.message || 'Unable to connect to server.');
      } finally {
        if (abortRef.current === controller) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [currentPage, debouncedSearch, date, departmentFilter, designationFilter, statusFilter]
  );

  useEffect(() => {
    fetchOfficeLocation();
  }, [fetchOfficeLocation]);

  useEffect(() => {
    fetchAttendanceData();
  }, [fetchAttendanceData]);

  // Abort on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  // Close details modal with Escape
  useEffect(() => {
    if (!selectedRecord) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedRecord(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedRecord]);

  // Indeterminate state for the "select all" checkbox
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedIds.length > 0 && selectedIds.length < records.length;
    }
  }, [selectedIds, records]);

  // Any filter change goes back to page 1
  const changeFilter = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setDate(todayIST);
    setSearch('');
    setDepartmentFilter('All');
    setDesignationFilter('All');
    setStatusFilter('All');
    setCurrentPage(1);
  };

  const filtersActive =
    date !== todayIST ||
    search !== '' ||
    departmentFilter !== 'All' ||
    designationFilter !== 'All' ||
    statusFilter !== 'All';

  const rowKey = (r: AttendanceRecord) => r.id || r.employeeId;

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? records.map(rowKey) : []);
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((i) => i !== id)));
  };

  const handleExportCSV = () => {
    if (records.length === 0) return;
    const headers = ['Date', 'Employee ID', 'Name', 'Department', 'Designation', 'Status', 'Clock In', 'Clock Out', 'Working Hours', 'Location'];
    const rows = records.map((r) =>
      [r.date, r.employeeId, r.employeeName, r.department, r.designation, r.status, r.clockIn || '', r.clockOut || '', r.workingHours || '', r.location || 'Office HQ']
        .map(csvCell)
        .join(',')
    );
    // Blob avoids the data-URI bug where '#' or other characters truncate the file.
    const blob = new Blob(['\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Team_Attendance_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveAttendance = async (rec: unknown) => {
    try {
      const res = await fetch('/api/v1/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rec),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message || `Failed to save attendance (HTTP ${res.status}).`);
      }
      fetchAttendanceData(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save attendance.');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'present':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'late':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'half day':
      case 'half_day':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'on leave':
      case 'leave':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'absent':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const officeName = officeLocation?.name || DEFAULT_OFFICE.name;
  const periodLabel = date === todayIST ? 'Today' : 'on Date';
  const selectClass =
    'px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer';

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Team Attendance</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time daily shifts, clock-ins, overdue tracking, and team attendance records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              if (!showLiveMap) fetchOfficeLocation();
              setShowLiveMap((v) => !v);
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
              showLiveMap
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <MapIcon className="h-4 w-4 text-slate-500" />
            <span>{showLiveMap ? 'Hide Live Map' : 'Show Live Map'}</span>
          </button>

          <button
            onClick={() => setIsMarkModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Mark Attendance</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={records.length === 0}
            title="Exports the records currently shown"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export Log</span>
          </button>

          <button
            onClick={() => fetchAttendanceData(true)}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh Attendance"
            aria-label="Refresh attendance"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing || isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => fetchAttendanceData()}
            className="rounded-lg bg-rose-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-rose-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {date === todayIST ? 'Present Today' : 'Present'}
            </span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 border border-emerald-100">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 tracking-tight">{isLoading ? '...' : kpis.presentCount}</p>
            <p className="text-xs font-medium text-emerald-600 mt-0.5">{kpis.attendanceRate}% attendance rate</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Late Arrivals</span>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600 border border-amber-100">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 tracking-tight">{isLoading ? '...' : kpis.lateCount}</p>
            <p className="text-xs font-medium text-amber-600 mt-0.5">Past scheduled grace period</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">On Leave</span>
            <div className="rounded-xl bg-purple-50 p-2 text-purple-600 border border-purple-100">
              <CalendarDays className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 tracking-tight">{isLoading ? '...' : kpis.onLeaveCount}</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Approved leave days</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Absent / Unmarked</span>
            <div className="rounded-xl bg-rose-50 p-2 text-rose-600 border border-rose-100">
              <UserX className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 tracking-tight">{isLoading ? '...' : kpis.absentNotMarkedCount}</p>
            <p className="text-xs font-medium text-rose-600 mt-0.5">No punch recorded</p>
          </div>
        </div>
      </div>

      {/* 3. Collapsible Live Map */}
      {showLiveMap && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600 border border-indigo-100">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    {officeName} · Live Geofence &amp; Team Map
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live GPS
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Office GPS coordinates fetched dynamically from organization attendance rules.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-mono font-medium text-slate-700">
                Lat: {(officeLocation?.lat ?? DEFAULT_OFFICE.lat).toFixed(5)}, Lng: {(officeLocation?.lng ?? DEFAULT_OFFICE.lng).toFixed(5)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 border border-indigo-100">
                <Radio className="h-3 w-3 text-indigo-500" />
                Radius: {officeLocation?.radiusMeters || DEFAULT_OFFICE.radius}m
              </span>
              <button
                type="button"
                onClick={fetchOfficeLocation}
                disabled={isRefreshingLocation}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                title="Sync Coordinates with Admin Settings"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshingLocation ? 'animate-spin text-indigo-600' : ''}`} />
                <span>Sync</span>
              </button>
              <button
                type="button"
                onClick={() => setIsOfficeModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1 text-[11px] font-bold text-white shadow-xs transition-colors cursor-pointer"
              >
                <Eye className="h-3 w-3" />
                <span>Enlarge</span>
              </button>
            </div>
          </div>

          <div className="h-80 w-full rounded-xl overflow-hidden border border-slate-200">
            <LiveMap
              rows={liveData?.rows || []}
              geofence={{
                lat: officeLocation?.lat ?? liveData?.geofence?.lat ?? DEFAULT_OFFICE.lat,
                lng: officeLocation?.lng ?? liveData?.geofence?.lng ?? DEFAULT_OFFICE.lng,
                radiusMeters: officeLocation?.radiusMeters ?? liveData?.geofence?.radiusMeters ?? DEFAULT_OFFICE.radius,
                enforce: officeLocation?.geofenceEnforce ?? liveData?.geofence?.enforce ?? false,
              }}
              height={320}
              officeTitle={officeName}
            />
          </div>
        </div>
      )}

      {/* 4. Exceptions */}
      {exceptions.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Attendance Exceptions Requiring Attention ({exceptions.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {exceptions.map((ex) => (
              <div key={ex.id} className="rounded-xl border border-amber-200/80 bg-white/90 p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{ex.employeeName}</p>
                  <p className="text-[10px] text-slate-500 font-medium">{ex.type} • {ex.detail}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                  {ex.timestamp}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Filter Toolbar (filters apply automatically; search is debounced) */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search team member..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && changeFilter(setDate)(e.target.value)}
            className={selectClass}
          />

          <select value={statusFilter} onChange={(e) => changeFilter(setStatusFilter)(e.target.value)} className={`${selectClass} min-w-[130px]`}>
            <option value="All">All Statuses</option>
            <option value="Present">Present</option>
            <option value="Late">Late</option>
            <option value="Half Day">Half Day</option>
            <option value="On Leave">On Leave</option>
            <option value="Absent">Absent</option>
            <option value="Not Marked">Not Marked</option>
          </select>

          <select value={departmentFilter} onChange={(e) => changeFilter(setDepartmentFilter)(e.target.value)} className={`${selectClass} min-w-[140px]`}>
            <option value="All">All Departments</option>
            {filters.departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {filters.designations.length > 0 && (
            <select value={designationFilter} onChange={(e) => changeFilter(setDesignationFilter)(e.target.value)} className={`${selectClass} min-w-[140px]`}>
              <option value="All">All Designations</option>
              {filters.designations.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}

          <button
            onClick={handleResetFilters}
            disabled={!filtersActive}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      {/* 6. Attendance Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 pl-4 pr-2 w-10">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={records.length > 0 && selectedIds.length === records.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">EMPLOYEE</th>
                <th className="py-3 px-4">ROLE &amp; DEPT</th>
                <th className="py-3 px-4">STATUS</th>
                <th className="py-3 px-4">CLOCK IN</th>
                <th className="py-3 px-4">CLOCK OUT</th>
                <th className="py-3 px-4">WORK HOURS</th>
                <th className="py-3 px-4">LOCATION</th>
                <th className="py-3 pr-4 pl-2 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="py-4 px-4 text-center">
                      <div className="h-6 bg-slate-100 rounded-lg w-full" />
                    </td>
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No attendance records found</p>
                    <p className="text-xs text-slate-400 mt-1">Try selecting a different date or clearing filters.</p>
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const key = rowKey(r);
                  const isSelected = selectedIds.includes(key);

                  return (
                    <tr key={key} className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                      <td className="py-3.5 pl-4 pr-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.employeeName}`}
                          checked={isSelected}
                          onChange={(e) => handleSelectRow(key, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {r.photoUrl ? (
                            <img
                              src={r.photoUrl}
                              alt={r.employeeName}
                              className="h-8 w-8 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs border border-indigo-100">
                              {getInitials(r.employeeName)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 leading-tight truncate">{r.employeeName}</p>
                            <p className="font-mono text-[10px] text-slate-400 truncate mt-0.5">{r.employeeId}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-800 leading-tight">{r.designation}</p>
                        <p className="text-[11px] text-slate-500">{r.department}</p>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${getStatusBadge(r.status)}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {r.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-slate-700">{r.clockIn || '--:--'}</td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-700">{r.clockOut || '--:--'}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-700">{r.workingHours || '--'}</td>

                      <td className="py-3.5 px-4 text-slate-500">
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          <span>{r.location || 'Office HQ'}</span>
                        </span>
                      </td>

                      <td className="py-3.5 pr-4 pl-2 text-right">
                        <button
                          onClick={() => setSelectedRecord(r)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 text-xs">
            <span className="text-slate-500">
              Showing{' '}
              <span className="font-semibold text-slate-700">{(currentPage - 1) * pagination.limit + 1}</span> to{' '}
              <span className="font-semibold text-slate-700">{Math.min(currentPage * pagination.limit, pagination.total)}</span> of{' '}
              <span className="font-semibold text-slate-700">{pagination.total}</span> records
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1 || isLoading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Prev</span>
              </button>
              <span className="text-xs font-bold text-slate-700 px-2">
                {currentPage} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={currentPage === pagination.totalPages || isLoading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Record Details Modal */}
      {selectedRecord && (
        <Portal>
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Attendance verification details"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Attendance Verification Details</h3>
              <button
                onClick={() => setSelectedRecord(null)}
                aria-label="Close"
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl">
                {selectedRecord.photoUrl ? (
                  <img src={selectedRecord.photoUrl} alt={selectedRecord.employeeName} className="h-9 w-9 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    {getInitials(selectedRecord.employeeName)}
                  </div>
                )}
                <div>
                  <p className="font-bold text-slate-900">{selectedRecord.employeeName}</p>
                  <p className="text-[11px] text-slate-500">
                    {selectedRecord.employeeId} • {selectedRecord.designation} • {selectedRecord.department}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-600">
                {[
                  ['Status', selectedRecord.status, false],
                  ['Date', selectedRecord.formattedDate || selectedRecord.date, false],
                  ['Clock In', selectedRecord.clockIn || '--:--', true],
                  ['Clock Out', selectedRecord.clockOut || '--:--', true],
                  ['Work Hours', selectedRecord.workingHours || '--', true],
                  ['Method', selectedRecord.method || '—', false],
                ].map(([label, value, mono]) => (
                  <div key={label as string} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">{label as string}</span>
                    <span className={`font-bold text-slate-800 ${mono ? 'font-mono' : ''}`}>{value as string}</span>
                  </div>
                ))}
                <div className="col-span-2 p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Location</span>
                  <span className="font-bold text-slate-800">{selectedRecord.location || 'Office HQ'}</span>
                </div>
              </div>

              {selectedRecord.remarks && (
                <div className="p-3 rounded-xl bg-slate-50 text-slate-600 border border-slate-100">
                  <span className="font-bold text-slate-700 block mb-1">Remarks:</span>
                  <p className="italic">&quot;{selectedRecord.remarks}&quot;</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedRecord(null)}
                className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Mark Attendance Modal */}
      <MarkAttendanceModal
        isOpen={isMarkModalOpen}
        onClose={() => setIsMarkModalOpen(false)}
        employees={records.map((r) => ({
          id: rowKey(r),
          firstName: r.firstName || r.employeeName?.split(' ')[0] || '',
          lastName: r.lastName || r.employeeName?.split(' ').slice(1).join(' ') || '',
          employeeId: r.employeeId,
          avatar: r.photoUrl || undefined,
        }))}
        onSave={handleSaveAttendance}
      />

      {/* Office HQ Location & Geofence Modal */}
      <OfficeMapModal
        isOpen={isOfficeModalOpen}
        onClose={() => setIsOfficeModalOpen(false)}
        officeLocation={officeLocation}
        rows={liveData?.rows || []}
        title={`${officeName} · Geofence & Team Map`}
        onRefresh={fetchOfficeLocation}
        isRefreshing={isRefreshingLocation}
      />
    </div>
  );
}