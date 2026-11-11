'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useCallback } from 'react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  CalendarDays,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Users,
  Search,
  Filter,
  RotateCcw,
  Eye,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Building2,
  FileText,
  Calendar,
  X,
  Loader2,
  Check,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface LeaveRequest {
  id: string;
  leaveId: string;
  employeeId: string;
  employeeName: string;
  email: string;
  department: string;
  designation: string;
  photoUrl?: string | null;
  leaveType: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  durationType?: string;
  session?: string | null;
  durationFormatted?: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  requestedDate: string;
  attachmentName?: string | null;
}

interface LeaveKPIs {
  pendingCount: number;
  urgentPendingCount?: number;
  approvedCount: number;
  rejectedCount: number;
  onLeaveTodayCount: number;
  totalRequests: number;
  leaveDaysUsed: number;
}

interface AvailableFilters {
  departments: string[];
  leaveTypes: string[];
  statuses: string[];
}

export default function ManagerLeavePage() {
  const { user } = useAuthStore();

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [kpis, setKpis] = useState<LeaveKPIs>({
    pendingCount: 0,
    urgentPendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    onLeaveTodayCount: 0,
    totalRequests: 0,
    leaveDaysUsed: 0,
  });
  const [filters, setFilters] = useState<AvailableFilters>({
    departments: [],
    leaveTypes: [],
    statuses: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<LeaveRequest | null>(null);

  // Application-wide background scroll lock while manager leave modal is open
  useBodyScrollLock(Boolean(selectedLeave || rejectionTarget));
  const [rejectionInputReason, setRejectionInputReason] = useState('');

  const fetchLeaveData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: '10',
        search: search.trim(),
        status: statusFilter,
        leaveType: leaveTypeFilter,
        department: departmentFilter,
      });

      const res = await fetch(`/api/v1/manager/leave?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access Denied: You do not have permission to view team leave requests.');
        }
        throw new Error(`Failed to load leave requests (HTTP ${res.status}).`);
      }

      const json = await res.json();
      if (json.success && json.data) {
        setLeaves(json.data.leaves || []);
        if (json.data.kpis) setKpis(json.data.kpis);
        if (json.data.filters) setFilters(json.data.filters);
        if (json.data.pagination) setPagination(json.data.pagination);
      } else {
        throw new Error(json.message || 'Failed to parse leave response.');
      }
    } catch (err: any) {
      console.error('Error fetching manager leave data:', err);
      setErrorMsg(err.message || 'Unable to connect to server.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentPage, search, statusFilter, leaveTypeFilter, departmentFilter]);

  useEffect(() => {
    fetchLeaveData();
  }, [fetchLeaveData]);

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('All');
    setLeaveTypeFilter('All');
    setDepartmentFilter('All');
    setCurrentPage(1);
  };

  const handleApplyFilters = () => {
    setCurrentPage(1);
    fetchLeaveData();
  };

  const handleApproveLeave = async (leave: LeaveRequest) => {
    const targetId = leave.leaveId || leave.id;
    setActioningId(targetId);
    setIsSubmittingAction(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch(`/api/v1/leave/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFeedbackMsg({
          type: 'success',
          text: json.message || `Leave request approved for ${leave.employeeName}.`,
        });
        setSelectedLeave(null);
        fetchLeaveData(true);
      } else {
        throw new Error(json.message || 'Failed to approve leave request.');
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error processing approval.' });
    } finally {
      setActioningId(null);
      setIsSubmittingAction(false);
    }
  };

  const handleConfirmRejection = async () => {
    if (!rejectionTarget) return;
    if (!rejectionInputReason.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Please enter a valid rejection reason.' });
      return;
    }

    const targetId = rejectionTarget.leaveId || rejectionTarget.id;
    setActioningId(targetId);
    setIsSubmittingAction(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch(`/api/v1/leave/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          rejectionReason: rejectionInputReason.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFeedbackMsg({
          type: 'success',
          text: json.message || `Leave request rejected for ${rejectionTarget.employeeName}.`,
        });
        setRejectionTarget(null);
        setRejectionInputReason('');
        setSelectedLeave(null);
        fetchLeaveData(true);
      } else {
        throw new Error(json.message || 'Failed to reject leave request.');
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error rejecting leave request.' });
    } finally {
      setActioningId(null);
      setIsSubmittingAction(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'cancelled':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Team Leave Requests
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review, approve, and track leave applications submitted by your team members.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchLeaveData(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`flex items-center justify-between rounded-2xl border p-4 text-xs font-semibold ${
            feedbackMsg.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => fetchLeaveData()}
            className="rounded-lg bg-rose-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-rose-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. Top 4 Clean KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Actionable Pending */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pending Approvals
            </span>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600 border border-amber-100">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-amber-600 tracking-tight">
              {isLoading ? '...' : kpis.pendingCount}
            </p>
            <p className="text-xs font-medium text-amber-700/80 mt-0.5">
              Requires manager decision
            </p>
          </div>
        </div>

        {/* On Leave Today */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              On Leave Today
            </span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 border border-emerald-100">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {isLoading ? '...' : kpis.onLeaveTodayCount}
            </p>
            <p className="text-xs font-medium text-emerald-600 mt-0.5">
              Team members off today
            </p>
          </div>
        </div>

        {/* Approved Requests */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Approved
            </span>
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600 border border-indigo-100">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {isLoading ? '...' : kpis.approvedCount}
            </p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Approved this cycle
            </p>
          </div>
        </div>

        {/* Total Applications */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Applications
            </span>
            <div className="rounded-xl bg-slate-100 p-2 text-slate-600 border border-slate-200">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {isLoading ? '...' : kpis.totalRequests}
            </p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              {kpis.leaveDaysUsed} total days taken
            </p>
          </div>
        </div>
      </div>

      {/* 3. Filter Toolbar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by employee name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer min-w-[130px]"
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <select
            value={leaveTypeFilter}
            onChange={(e) => setLeaveTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer min-w-[140px]"
          >
            <option value="All">All Leave Types</option>
            {filters.leaveTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer min-w-[140px]"
          >
            <option value="All">All Departments</option>
            {filters.departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <button
              onClick={handleApplyFilters}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Apply
            </button>
            <button
              onClick={handleResetFilters}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* 4. Leave Requests Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">EMPLOYEE</th>
                <th className="py-3 px-4">LEAVE TYPE</th>
                <th className="py-3 px-4">DURATION & DATES</th>
                <th className="py-3 px-4">REASON</th>
                <th className="py-3 px-4">STATUS</th>
                <th className="py-3 pr-4 pl-2 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="py-4 px-4 text-center">
                      <div className="h-6 bg-slate-100 rounded-lg w-full" />
                    </td>
                  </tr>
                ))
              ) : leaves.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <CalendarDays className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No leave requests found</p>
                    <p className="text-xs text-slate-400 mt-1">Try clearing filters or search criteria.</p>
                  </td>
                </tr>
              ) : (
                leaves.map((leave) => {
                  const isPending = (leave.status || '').toLowerCase() === 'pending';
                  const isActioningThis = actioningId === (leave.leaveId || leave.id);

                  return (
                    <tr key={leave.id || leave.leaveId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {leave.photoUrl ? (
                            <img
                              src={leave.photoUrl}
                              alt={leave.employeeName}
                              className="h-8 w-8 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs border border-indigo-100">
                              {leave.employeeName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 leading-tight truncate">
                              {leave.employeeName}
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                              {leave.employeeId} • {leave.department}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {leave.leaveType}
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-900">
                          {leave.durationDays} {leave.durationDays === 1 ? 'day' : 'days'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {leave.startDate} to {leave.endDate}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 max-w-xs truncate text-slate-600">
                        {leave.reason || '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${getStatusBadge(
                            leave.status
                          )}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {leave.status}
                        </span>
                      </td>

                      <td className="py-3.5 pr-4 pl-2 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {isPending && (
                            <>
                              <button
                                onClick={() => handleApproveLeave(leave)}
                                disabled={isSubmittingAction}
                                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {isActioningThis ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Approve'
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setRejectionTarget(leave);
                                  setRejectionInputReason('');
                                }}
                                disabled={isSubmittingAction}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setSelectedLeave(leave)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer"
                          >
                            Details
                          </button>
                        </div>
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
              <span className="font-semibold text-slate-700">
                {(currentPage - 1) * pagination.limit + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-slate-700">
                {Math.min(currentPage * pagination.limit, pagination.total)}
              </span>{' '}
              of <span className="font-semibold text-slate-700">{pagination.total}</span> requests
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
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
                disabled={currentPage === pagination.totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Rejection Confirmation Modal */}
      {rejectionTarget && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Reject Leave Application
              </h3>
              <button
                onClick={() => setRejectionTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Provide a valid reason for declining the leave request from{' '}
              <span className="font-bold text-slate-900">{rejectionTarget.employeeName}</span>.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rejection Reason *
              </label>
              <textarea
                rows={3}
                value={rejectionInputReason}
                onChange={(e) => setRejectionInputReason(e.target.value)}
                placeholder="e.g. Critical release scheduled during this period..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setRejectionTarget(null)}
                disabled={isSubmittingAction}
                className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRejection}
                disabled={isSubmittingAction || !rejectionInputReason.trim()}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingAction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Leave Details Modal */}
      {selectedLeave && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Leave Request Details
              </h3>
              <button
                onClick={() => setSelectedLeave(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                  {selectedLeave.employeeName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{selectedLeave.employeeName}</p>
                  <p className="text-[11px] text-slate-500 font-mono">{selectedLeave.employeeId} • {selectedLeave.department}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Leave Type</span>
                  <span className="font-bold text-slate-800">{selectedLeave.leaveType}</span>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Duration</span>
                  <span className="font-bold text-slate-800">{selectedLeave.durationDays} days</span>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Start Date</span>
                  <span className="font-bold text-slate-800">{selectedLeave.startDate}</span>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">End Date</span>
                  <span className="font-bold text-slate-800">{selectedLeave.endDate}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-700">
                <span className="font-bold text-slate-800 block mb-1">Reason:</span>
                <p className="italic">&quot;{selectedLeave.reason}&quot;</p>
              </div>

              {selectedLeave.rejectionReason && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-800">
                  <span className="font-bold text-rose-900 block mb-1">Rejection Reason:</span>
                  <p className="italic">&quot;{selectedLeave.rejectionReason}&quot;</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${getStatusBadge(
                  selectedLeave.status
                )}`}
              >
                {selectedLeave.status}
              </span>

              <div className="flex items-center gap-2">
                {(selectedLeave.status || '').toLowerCase() === 'pending' && (
                  <>
                    <button
                      onClick={() => handleApproveLeave(selectedLeave)}
                      disabled={isSubmittingAction}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setRejectionTarget(selectedLeave);
                        setRejectionInputReason('');
                      }}
                      disabled={isSubmittingAction}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                    >
                      Reject
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelectedLeave(null)}
                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
