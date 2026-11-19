'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Eye,
  GraduationCap,
  Hourglass,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AddInternModal, MentorOption } from '@/components/interns/AddInternModal';
import { InternProfileModal } from '@/components/interns/InternProfileModal';
import { EditInternModal } from '@/components/interns/EditInternModal';
import { DeleteInternModal } from '@/components/interns/DeleteInternModal';
import { getISTDateString } from '@/lib/dateUtils';
import {
  daysBetween,
  effectiveInternshipEndDate,
  isInternRecord,
  isValidIsoDate,
  type InternshipDetails,
} from '@/lib/employmentType';

type Phase = 'Upcoming' | 'Ongoing' | 'Ending Soon' | 'Completed' | 'Dates Missing';

interface InternRow {
  key: string;
  raw: any;
  accountStatus: string;
  employeeId: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  mentorName: string;
  institute: string;
  startDate: string;
  endDate: string | null;
  isExtended: boolean;
  stipend: number | null;
  phase: Phase;
  daysLeft: number | null;
  progress: number | null;
}

const ENDING_SOON_DAYS = 14;

const DEFAULT_DEPARTMENTS = [
  'Engineering & IT',
  'Cloud & DevOps',
  'Human Resources',
  'Finance & Accounts',
  'Sales & Marketing',
  'Operations',
  'Design & Creative',
  'Customer Support',
  'Administration',
];

const PHASE_BADGE: Record<Phase, string> = {
  Upcoming: 'bg-blue-50 text-blue-700 border-blue-200',
  Ongoing: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Ending Soon': 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-slate-100 text-slate-600 border-slate-200',
  'Dates Missing': 'bg-rose-50 text-rose-700 border-rose-200',
};

const PHASE_FILTERS: Array<'All' | Phase> = ['All', 'Ongoing', 'Ending Soon', 'Upcoming', 'Completed', 'Dates Missing'];

/** Account statuses that block login (shown as a red badge on the row). */
const INACTIVE_STATUSES = ['terminated', 'resigned', 'suspended', 'inactive'];

function fullName(emp: any): string {
  return `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() || emp?.name || 'Unnamed';
}

function formatDate(iso: string | null): string {
  if (!iso || !isValidIsoDate(iso)) return '—';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function toRow(emp: any, staffById: Map<string, any>, today: string): InternRow {
  const internship: Partial<InternshipDetails> = emp.internship || {};
  const joining = typeof emp.joiningDate === 'string' ? emp.joiningDate.slice(0, 10) : '';
  const startDate = internship.startDate || joining;
  const endDate = effectiveInternshipEndDate(internship);
  const mentorId = emp.managerId || emp.reportingTo || '';
  const mentor = mentorId ? staffById.get(String(mentorId).toLowerCase()) : null;

  let phase: Phase = 'Dates Missing';
  let daysLeft: number | null = null;
  let progress: number | null = null;
  if (isValidIsoDate(startDate) && endDate && isValidIsoDate(endDate)) {
    const total = Math.max(1, daysBetween(startDate, endDate));
    if (today < startDate) {
      phase = 'Upcoming';
      progress = 0;
    } else if (today > endDate) {
      phase = 'Completed';
      progress = 100;
    } else {
      daysLeft = daysBetween(today, endDate);
      phase = daysLeft <= ENDING_SOON_DAYS ? 'Ending Soon' : 'Ongoing';
      progress = Math.min(100, Math.max(0, Math.round((daysBetween(startDate, today) / total) * 100)));
    }
  }

  return {
    key: String(emp._id || emp.employeeId),
    raw: emp,
    accountStatus: String(emp.status || 'Active'),
    employeeId: emp.employeeId || '',
    name: fullName(emp),
    email: emp.email || '',
    department: emp.department || '—',
    designation: emp.designation || 'Intern',
    mentorName: mentor ? fullName(mentor) : mentorId ? String(mentorId) : '',
    institute: internship.institute || '',
    startDate,
    endDate,
    isExtended: Boolean(internship.extendedEndDate && internship.extendedEndDate !== internship.endDate),
    stipend: typeof internship.stipend === 'number' ? internship.stipend : null,
    phase,
    daysLeft,
    progress,
  };
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'IN';
}

export default function InternsPage() {
  const [interns, setInterns] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<'All' | Phase>('All');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [viewIntern, setViewIntern] = useState<any | null>(null);
  const [editIntern, setEditIntern] = useState<any | null>(null);
  const [deleteIntern, setDeleteIntern] = useState<any | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchInterns = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/employees?employmentType=Intern&limit=500');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || `Failed to load interns (HTTP ${res.status}).`);
      setInterns(Array.isArray(json.data) ? json.data : []);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load interns.');
    }
  }, []);

  // Everyone else in the organization: used for mentor names and the mentor dropdown
  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/employees?limit=500');
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && Array.isArray(json.data)) setStaff(json.data);
    } catch {
      /* mentor list is optional */
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchInterns(), fetchStaff()]);
    setIsLoading(false);
    setIsRefreshing(false);
  }, [fetchInterns, fetchStaff]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const today = getISTDateString(new Date());

  const staffById = useMemo(() => {
    const map = new Map<string, any>();
    staff.forEach((e) => {
      if (e.employeeId) map.set(String(e.employeeId).toLowerCase(), e);
    });
    return map;
  }, [staff]);

  const rows = useMemo(
    () => interns.filter((e) => isInternRecord(e)).map((e) => toRow(e, staffById, today)),
    [interns, staffById, today]
  );

  const mentors: MentorOption[] = useMemo(
    () =>
      staff
        .filter((e) => e.employeeId && !isInternRecord(e))
        .filter((e) => !['resigned', 'terminated', 'former employee', 'absconded'].includes(String(e.status || '').toLowerCase()))
        .map((e) => ({ employeeId: String(e.employeeId), name: fullName(e), designation: e.designation }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [staff]
  );

  const mentorNameFor = useCallback(
    (emp: any) => {
      const id = emp?.managerId || emp?.reportingTo;
      if (!id) return '';
      const mentor = staffById.get(String(id).toLowerCase());
      return mentor ? fullName(mentor) : String(id);
    },
    [staffById]
  );

  const departments = useMemo(
    () =>
      Array.from(new Set([...DEFAULT_DEPARTMENTS, ...staff.map((e) => e.department).filter(Boolean)])).sort((a, b) =>
        a.localeCompare(b)
      ),
    [staff]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => phaseFilter === 'All' || r.phase === phaseFilter)
      .filter(
        (r) =>
          !q ||
          [r.name, r.employeeId, r.email, r.institute, r.department, r.mentorName].some((v) => v.toLowerCase().includes(q))
      )
      .sort((a, b) => (a.endDate || '9999').localeCompare(b.endDate || '9999'));
  }, [rows, search, phaseFilter]);

  const counts = useMemo(() => {
    const c = { total: rows.length, ongoing: 0, endingSoon: 0, completed: 0 };
    rows.forEach((r) => {
      if (r.phase === 'Ongoing') c.ongoing++;
      if (r.phase === 'Ending Soon') c.endingSoon++;
      if (r.phase === 'Completed') c.completed++;
    });
    return c;
  }, [rows]);

  const statCards = [
    { label: 'Total Interns', value: counts.total, icon: Users, tone: 'bg-orange-50 text-orange-600' },
    { label: 'Currently Interning', value: counts.ongoing + counts.endingSoon, icon: GraduationCap, tone: 'bg-emerald-50 text-emerald-600' },
    { label: `Ending in ${ENDING_SOON_DAYS} Days`, value: counts.endingSoon, icon: Hourglass, tone: 'bg-amber-50 text-amber-600' },
    { label: 'Completed', value: counts.completed, icon: CheckCircle2, tone: 'bg-slate-100 text-slate-600' },
  ];

  return (
    <AdminLayout pageTitle="Interns" breadcrumbs={[{ label: 'Interns', href: '/admin/interns' }]}>
      {toast && (
        <div role="status" className="fixed right-6 top-20 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs text-white shadow-xl animate-fade-in border border-slate-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          <span>{toast}</span>
        </div>
      )}
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Interns</h2>
            <p className="text-xs text-slate-500">
              Add interns and track their internship period. Each intern gets their own login.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsRefreshing(true);
                loadAll();
              }}
              disabled={isRefreshing || isLoading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 text-slate-500 ${isRefreshing ? 'animate-spin text-orange-500' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 active:scale-95 transition-all cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add Intern</span>
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {statCards.map((card) => (
            <div key={card.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-xs">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tone}`}>
                <card.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
                <p className="text-xl font-extrabold text-slate-900">{isLoading ? '—' : card.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search by name, ID, email, college, mentor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search interns"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none font-medium"
            />
          </div>
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value as 'All' | Phase)}
            aria-label="Filter by internship status"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none font-semibold"
          >
            {PHASE_FILTERS.map((p) => (
              <option key={p} value={p}>
                {p === 'All' ? 'All Interns' : p}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" aria-hidden="true" /> Loading interns…
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-xs">
              <AlertCircle className="h-6 w-6 text-rose-500" aria-hidden="true" />
              <p className="font-semibold text-rose-700">{loadError}</p>
              <button type="button" onClick={() => { setIsRefreshing(true); loadAll(); }}
                className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 border border-orange-200">
                <GraduationCap className="h-6 w-6 text-orange-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">No interns yet</p>
                <p className="text-slate-500">Add your first intern. They will get their own login by email.</p>
              </div>
              <button type="button" onClick={() => setIsAddOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white hover:bg-orange-600 cursor-pointer">
                <UserPlus className="h-4 w-4" /> Add Intern
              </button>
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-500">No interns match your search or filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Intern</th>
                    <th className="px-4 py-3">College</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Mentor</th>
                    <th className="px-4 py-3">Internship Period</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3 text-right">Stipend</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((r) => (
                    <tr key={r.key} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-extrabold text-white">
                            {initials(r.name)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 whitespace-nowrap">{r.name}</p>
                            <p className="font-mono text-[10px] text-slate-400">{r.employeeId}</p>
                            <p className="text-[10px] text-slate-500 whitespace-nowrap">{r.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-700">{r.institute || <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-slate-800">{r.department}</p>
                        <p className="text-[10px] text-slate-400">{r.designation}</p>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-700">
                        {r.mentorName || <span className="text-amber-600 font-semibold">Not assigned</span>}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <p className="font-medium text-slate-700">
                          {formatDate(r.startDate)} → {formatDate(r.endDate)}
                        </p>
                        {r.isExtended && (
                          <p className="flex items-center gap-1 text-[10px] font-semibold text-orange-700">
                            <CalendarClock className="h-3 w-3" aria-hidden="true" /> Extended due to leave
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 min-w-[150px]">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${PHASE_BADGE[r.phase]}`}>
                            {r.phase}
                          </span>
                          {INACTIVE_STATUSES.includes(r.accountStatus.toLowerCase()) && (
                            <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700" title="This intern cannot log in">
                              {r.accountStatus}
                            </span>
                          )}
                        </div>
                        {r.progress !== null && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                              <div className="h-full rounded-full bg-orange-500" style={{ width: `${r.progress}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-500 whitespace-nowrap">
                              {r.daysLeft !== null ? `${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'} left` : `${r.progress}%`}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-800 whitespace-nowrap">
                        {r.stipend !== null ? `₹${r.stipend.toLocaleString('en-IN')}` : <span className="text-slate-400">Unpaid</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setViewIntern(r.raw)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-orange-50 hover:text-orange-600 transition-colors cursor-pointer"
                            title="View Intern"
                            aria-label={`View ${r.name}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditIntern(r.raw)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition-colors cursor-pointer"
                            title="Edit Intern"
                            aria-label={`Edit ${r.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteIntern(r.raw)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Delete Intern"
                            aria-label={`Delete ${r.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <AddInternModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={() => {
          fetchInterns();
        }}
        mentors={mentors}
        departments={departments}
      />

      <InternProfileModal
        intern={viewIntern}
        mentorName={mentorNameFor(viewIntern)}
        onClose={() => setViewIntern(null)}
        onEdit={(intern) => {
          setViewIntern(null);
          setEditIntern(intern);
        }}
      />

      <EditInternModal
        intern={editIntern}
        mentors={mentors}
        departments={departments}
        onClose={() => setEditIntern(null)}
        onSaved={(message) => {
          showToast(message);
          fetchInterns();
        }}
      />

      <DeleteInternModal
        intern={deleteIntern}
        onClose={() => setDeleteIntern(null)}
        onDone={(message) => {
          showToast(message);
          fetchInterns();
        }}
      />
    </AdminLayout>
  );
}