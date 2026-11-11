'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  Users,
  Search,
  RefreshCw,
  Mail,
  Phone,
  Building2,
  Briefcase,
  MapPin,
  CalendarDays,
  Eye,
  X,
  AlertCircle,
  UserCheck,
  Clock,
  Plane,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface TeamEmployee {
  id?: string;
  _id?: string;
  employeeId: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  status?: string;
  employmentType?: string;
  location?: string;
  joiningDate?: string;
  photoUrl?: string;
  avatar?: string;
}

const STATUS_STYLES: Record<string, string> = {
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Probation: 'bg-amber-50 text-amber-700 ring-amber-200',
  'On Leave': 'bg-sky-50 text-sky-700 ring-sky-200',
  Suspended: 'bg-orange-50 text-orange-700 ring-orange-200',
  Resigned: 'bg-slate-100 text-slate-600 ring-slate-200',
  Terminated: 'bg-rose-50 text-rose-700 ring-rose-200',
  'Former Employee': 'bg-slate-100 text-slate-600 ring-slate-200',
};

const getFullName = (emp: TeamEmployee) =>
  emp.name?.trim() || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.employeeId;

const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const label = status || 'Active';
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
        STATUS_STYLES[label] || 'bg-slate-100 text-slate-600 ring-slate-200'
      }`}
    >
      {label}
    </span>
  );
};

const Avatar: React.FC<{ emp: TeamEmployee; size?: 'sm' | 'lg' }> = ({ emp, size = 'sm' }) => {
  const src = emp.photoUrl || emp.avatar;
  const dims = size === 'lg' ? 'h-14 w-14 text-base' : 'h-9 w-9 text-xs';
  if (src) {
    return <img src={src} alt="" className={`${dims} shrink-0 rounded-full object-cover ring-2 ring-white`} />;
  }
  return (
    <div
      className={`${dims} flex shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700 ring-2 ring-white`}
    >
      {getInitials(getFullName(emp))}
    </div>
  );
};

export default function ManagerEmployeesPage() {
  const { user } = useAuthStore();

  const [employees, setEmployees] = useState<TeamEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedEmp, setSelectedEmp] = useState<TeamEmployee | null>(null);

  // Application-wide background scroll lock while viewing employee details modal
  useBodyScrollLock(Boolean(selectedEmp));

  // Team size is small and already scoped server-side to direct reports,
  // so fetch once and filter on the client instead of refetching per keystroke.
  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/employees?limit=500');
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setEmployees(data.data || []);
      } else {
        setErrorMessage(data?.message || 'Unable to load your team right now.');
      }
    } catch (err) {
      console.error('Failed to fetch team employees:', err);
      setErrorMessage('Network error while loading your team.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    if (!selectedEmp) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEmp(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEmp]);

  // The API includes the manager's own record in their scope; exclude it from "direct reports".
  const teamMembers = useMemo(
    () => employees.filter((emp) => !user?.employeeId || emp.employeeId !== user.employeeId),
    [employees, user?.employeeId]
  );

  const departments = useMemo(
    () => Array.from(new Set(teamMembers.map((e) => e.department).filter(Boolean) as string[])).sort(),
    [teamMembers]
  );

  const statuses = useMemo(
    () => Array.from(new Set(teamMembers.map((e) => e.status || 'Active'))).sort(),
    [teamMembers]
  );

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return teamMembers.filter((emp) => {
      if (departmentFilter !== 'All' && emp.department !== departmentFilter) return false;
      if (statusFilter !== 'All' && (emp.status || 'Active') !== statusFilter) return false;
      if (!query) return true;
      return [getFullName(emp), emp.employeeId, emp.email, emp.department, emp.designation]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));
    });
  }, [teamMembers, search, departmentFilter, statusFilter]);

  const stats = useMemo(() => {
    const count = (status: string) => teamMembers.filter((e) => (e.status || 'Active') === status).length;
    return [
      { label: 'Direct Reports', value: teamMembers.length, icon: Users, tone: 'text-indigo-600 bg-indigo-50' },
      { label: 'Active', value: count('Active'), icon: UserCheck, tone: 'text-emerald-600 bg-emerald-50' },
      { label: 'On Probation', value: count('Probation'), icon: Clock, tone: 'text-amber-600 bg-amber-50' },
      { label: 'On Leave', value: count('On Leave'), icon: Plane, tone: 'text-sky-600 bg-sky-50' },
    ];
  }, [teamMembers]);

  const hasActiveFilters = search.trim() !== '' || departmentFilter !== 'All' || statusFilter !== 'All';

  const clearFilters = () => {
    setSearch('');
    setDepartmentFilter('All');
    setStatusFilter('All');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Team Employees</h1>
          <p className="text-sm text-slate-500 mt-1">View and manage direct reports under your management scope.</p>
        </div>
        <button
          onClick={fetchEmployees}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60 transition-all cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-extrabold text-slate-900">{isLoading ? '–' : stat.value}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, employee ID, email, or designation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-4 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-hidden"
          />
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
        >
          <option value="All">All Departments</option>
          {departments.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
        >
          <option value="All">All Statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-xs text-slate-500">
            <RefreshCw className="h-5 w-5 animate-spin text-indigo-600 mr-2" />
            <span>Loading team employee data...</span>
          </div>
        ) : errorMessage ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500" />
            <p className="text-sm font-semibold text-slate-800">{errorMessage}</p>
            <button
              onClick={fetchEmployees}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <Users className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">
              {teamMembers.length === 0 ? 'No direct reports assigned to you yet.' : 'No team members match your filters.'}
            </p>
            {hasActiveFilters && teamMembers.length > 0 && (
              <button onClick={clearFilters} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Employee</th>
                    <th className="py-3.5 px-4">Department</th>
                    <th className="py-3.5 px-4">Designation</th>
                    <th className="py-3.5 px-4 hidden lg:table-cell">Joined</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.map((emp) => (
                    <tr
                      key={emp.id || emp._id || emp.employeeId}
                      onClick={() => setSelectedEmp(emp)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar emp={emp} />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{getFullName(emp)}</p>
                            <p className="font-mono text-[10px] text-slate-400 truncate">
                              {emp.employeeId}
                              {emp.email ? ` · ${emp.email}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">{emp.department || '—'}</td>
                      <td className="py-3 px-4">{emp.designation || '—'}</td>
                      <td className="py-3 px-4 hidden lg:table-cell">{formatDate(emp.joiningDate)}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={emp.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEmp(emp);
                          }}
                          className="inline-flex items-center gap-1 text-indigo-600 font-semibold hover:text-indigo-800 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-400">
              Showing {filteredEmployees.length} of {teamMembers.length} team members
            </div>
          </>
        )}
      </div>

      {/* Details Panel */}
      {selectedEmp && (
        <Portal>
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setSelectedEmp(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-details-title"
            className="w-full max-w-lg rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
              <div className="flex items-center gap-4 min-w-0">
                <Avatar emp={selectedEmp} size="lg" />
                <div className="min-w-0">
                  <h3 id="employee-details-title" className="text-base font-bold text-slate-900 truncate">
                    {getFullName(selectedEmp)}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">{selectedEmp.designation || 'Team Member'}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">{selectedEmp.employeeId}</span>
                    <StatusBadge status={selectedEmp.status} />
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmp(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <dl className="grid grid-cols-1 gap-4 p-6 text-xs sm:grid-cols-2">
              {[
                { label: 'Email', value: selectedEmp.email, icon: Mail, href: selectedEmp.email && `mailto:${selectedEmp.email}` },
                { label: 'Phone', value: selectedEmp.phone, icon: Phone, href: selectedEmp.phone && `tel:${selectedEmp.phone}` },
                { label: 'Department', value: selectedEmp.department, icon: Building2 },
                { label: 'Employment Type', value: selectedEmp.employmentType, icon: Briefcase },
                { label: 'Location', value: selectedEmp.location, icon: MapPin },
                { label: 'Joining Date', value: selectedEmp.joiningDate && formatDate(selectedEmp.joiningDate), icon: CalendarDays },
              ].map(({ label, value, icon: Icon, href }) => (
                <div key={label} className="flex items-start gap-2.5 min-w-0">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                    <dd className="mt-0.5 font-medium text-slate-800 break-words">
                      {value ? (
                        href ? (
                          <a href={href} className="text-indigo-600 hover:text-indigo-800">
                            {value}
                          </a>
                        ) : (
                          value
                        )
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>

            <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
              {selectedEmp.email && (
                <a
                  href={`mailto:${selectedEmp.email}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </a>
              )}
              <button
                onClick={() => setSelectedEmp(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
