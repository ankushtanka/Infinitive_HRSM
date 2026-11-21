'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  CheckSquare,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  Filter,
  RefreshCw,
  Calendar,
  User,
  Building2,
  FileText,
  MessageSquare,
  ShieldAlert,
  Loader2,
  ChevronRight,
  ArrowLeft,
  CalendarDays,
  Check,
  X,
  Laptop,
  UserMinus,
  Flame,
  Home,
} from 'lucide-react';
import { ApprovalItem, ApprovalType, ApprovalStatus, ApprovalsSummaryStats } from '@/types/approval';

export default function UnifiedApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [stats, setStats] = useState<ApprovalsSummaryStats>({
    pendingCount: 0,
    approvedThisMonthCount: 0,
    rejectedThisMonthCount: 0,
    avgProcessingTimeHours: 4.2,
  });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modals & Action Drawer
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [actionModalState, setActionModalState] = useState<{
    isOpen: boolean;
    item: ApprovalItem | null;
    action: 'APPROVE' | 'REJECT' | null;
  }>({
    isOpen: false,
    item: null,
    action: null,
  });

  const [actionComments, setActionComments] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Global background scroll lock while approvals modal is open
  useBodyScrollLock(Boolean(
    (actionModalState.isOpen && actionModalState.item && actionModalState.action) ||
    (isDetailModalOpen && selectedItem)
  ));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        type: typeFilter,
        status: statusFilter,
        search,
      });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`/api/v1/approvals?${params.toString()}`);
      const json = await res.json();

      if (res.ok && json.success) {
        setApprovals(json.data.approvals || []);
        if (json.data.stats) {
          setStats(json.data.stats);
        }
        setTotalPages(json.data.pagination.totalPages || 1);
        setTotalCount(json.data.pagination.total || 0);
      } else {
        setErrorMsg(json.message || 'Failed to fetch approval queue.');
      }
    } catch (err: any) {
      console.error('Error loading approval queue:', err);
      setErrorMsg('Unable to load HR approval queue.');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, statusFilter, search, startDate, endDate]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { item, action } = actionModalState;
    if (!item || !action) return;

    if (action === 'REJECT' && !actionComments.trim()) {
      setActionError('Comments are required when rejecting a request.');
      return;
    }

    setIsProcessing(true);
    setActionError(null);

    try {
      const res = await fetch('/api/v1/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: item.id || item._id,
          requestType: item.requestType,
          sourceCollection: item.sourceCollection,
          action,
          comments: actionComments.trim(),
        }),
      });

      const json = await res.json();
      setIsProcessing(false);

      if (res.ok && json.success) {
        showToast(
          json.message ||
            `Request ${item.referenceNumber} ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully.`
        );
        setActionModalState({ isOpen: false, item: null, action: null });
        setActionComments('');
        setIsDetailModalOpen(false);
        fetchApprovals();
      } else {
        setActionError(json.message || 'Failed to process approval action.');
      }
    } catch (err: any) {
      setIsProcessing(false);
      setActionError(err.message || 'Network error processing approval.');
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime())
        ? dateStr
        : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const getTypeBadge = (type: ApprovalType) => {
    switch (type) {
      case 'LEAVE':
        return {
          label: 'Leave Request',
          bg: 'bg-[#FFF7ED] text-orange-700 border-[#FED7AA]',
          icon: CalendarDays,
        };
      case 'ATTENDANCE_CORRECTION':
        return {
          label: 'Attendance Regularization',
          bg: 'bg-[#FFF7ED] text-orange-700 border-[#FED7AA]',
          icon: Clock,
        };
      case 'PROFILE_CHANGE':
        return {
          label: 'Profile Change',
          bg: 'bg-[#FFF7ED] text-orange-700 border-[#FED7AA]',
          icon: User,
        };
      case 'ASSET_REQUEST':
        return {
          label: 'Asset Request',
          bg: 'bg-cyan-50 text-cyan-700 border-cyan-200',
          icon: Laptop,
        };
      case 'RESIGNATION':
        return {
          label: 'Resignation / Exit',
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: UserMinus,
        };
         case 'WFH':
        return {
          label: 'Work From Home',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: Home,
        };

      default:
        return {
          label: type,
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
          icon: FileText,
        };
    }
  };

  const getStatusBadge = (status: ApprovalStatus) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'REJECTED':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'CANCELLED':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'PENDING':
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse';
    }
  };

  return (
    <AdminLayout
      pageTitle="Unified HR Approval Center"
      breadcrumbs={[
        { label: 'Admin', href: '/admin/dashboard' },
        { label: 'Approval Center', href: '/admin/approvals' },
      ]}
    >
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed right-6 top-20 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl border border-slate-700 animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin/dashboard"
              className="flex items-center gap-1 text-xs font-bold text-orange-500 hover:text-orange-800 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Dashboard</span>
            </Link>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Unified HR Approval Center</span>
            <span className="rounded-full bg-[#FFF7ED] px-2.5 py-0.5 text-[10px] font-bold text-orange-700 border border-[#FED7AA]">
              {stats.pendingCount} Pending Queue
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-medium pt-0.5">
            Single actionable inbox for Leave Requests, Attendance Corrections, Profile Updates, Asset Requests, and Resignations.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchApprovals}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">Pending Approvals</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-200/60 text-amber-800">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-900">{stats.pendingCount}</p>
          <p className="text-[10px] text-amber-700 font-medium mt-0.5">Requires Action</p>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">Approved This Month</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-200/60 text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-900">{stats.approvedThisMonthCount}</p>
          <p className="text-[10px] text-emerald-700 font-medium mt-0.5">Processed & Approved</p>
        </div>

        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-800">Rejected This Month</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-200/60 text-rose-800">
              <XCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-rose-900">{stats.rejectedThisMonthCount}</p>
          <p className="text-[10px] text-rose-700 font-medium mt-0.5">Declined Requests</p>
        </div>

        <div className="rounded-2xl border border-[#FED7AA]/80 bg-[#FFF7ED]/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-800">Avg Response SLA</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-200/60 text-orange-800">
              <CheckSquare className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-orange-950">{stats.avgProcessingTimeHours}h</p>
          <p className="text-[10px] text-orange-700 font-medium mt-0.5">Fast Turnaround Time</p>
        </div>
      </div>

      {/* Toolbar & Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        {/* Search */}
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee, ID, ref no..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Request Types</option>
            <option value="LEAVE">Leave Requests</option>
            <option value="ATTENDANCE_CORRECTION">Attendance Corrections</option>
             <option value="WFH">Work From Home Requests</option>
            <option value="PROFILE_CHANGE">Profile Change Requests</option>
            <option value="ASSET_REQUEST">Asset Requests</option>
            <option value="RESIGNATION">Resignation / Exit Requests</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* Date Range Inputs */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
          />
          <span className="text-xs text-slate-400 font-bold">&rarr;</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
          />

          {(search || typeFilter !== 'ALL' || statusFilter !== 'PENDING' || startDate || endDate) && (
            <button
              onClick={() => {
                setSearch('');
                setTypeFilter('ALL');
                setStatusFilter('PENDING');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Unified Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <p className="text-xs font-bold">Fetching approval queue...</p>
          </div>
        ) : approvals.length > 0 ? (
          <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
              <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500">
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Ref No / ID</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Requester</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Type & Details</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Submitted</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {approvals.map((item) => {
                  const typeBadge = getTypeBadge(item.requestType);
                  const TypeIcon = typeBadge.icon;
                  const statusBadgeClass = getStatusBadge(item.status);

                  return (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-4 py-3.5 font-mono font-bold text-orange-700">
                        {item.referenceNumber}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-slate-900">{item.employeeName}</p>
                        <p className="text-[10px] text-slate-500 font-medium">
                          {item.employeeId} • {item.department} ({item.designation})
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-extrabold ${typeBadge.bg}`}
                          >
                            <TypeIcon className="h-3 w-3" />
                            <span>{typeBadge.label}</span>
                          </span>
                          {(item.isUrgent || item.details?.isUrgent) && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-600 text-white px-2 py-0.5 text-[9px] font-black shadow-xs">
                              <Flame className="h-2.5 w-2.5" /> URGENT
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-slate-800 text-xs">{item.title}</p>
                        {item.details?.durationType === 'HALF_DAY' && (
                          <p className="text-[10px] font-mono text-orange-500 font-bold">
                            Half Day ({item.details.session || '0.5d'}){item.details.requestedStartTime && item.details.requestedEndTime ? ` • ${item.details.requestedStartTime} - ${item.details.requestedEndTime}` : ''}
                          </p>
                        )}
                        {item.details?.reason && (
                          <p className="text-[11px] text-slate-500 italic truncate max-w-xs mt-0.5">
                            &quot;{item.details.reason}&quot;
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 font-medium">
                        {formatDate(item.submittedAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusBadgeClass}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setIsDetailModalOpen(true);
                            }}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                            title="View Full Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {item.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => {
                                  setActionComments('');
                                  setActionError(null);
                                  setActionModalState({
                                    isOpen: true,
                                    item,
                                    action: 'APPROVE',
                                  });
                                }}
                                disabled={item.canApprove === false}
                                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                title={item.canApprove === false ? 'Self-approval is forbidden' : 'Approve Request'}
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>Approve</span>
                              </button>

                              <button
                                onClick={() => {
                                  setActionComments('');
                                  setActionError(null);
                                  setActionModalState({
                                    isOpen: true,
                                    item,
                                    action: 'REJECT',
                                  });
                                }}
                                disabled={item.canApprove === false}
                                className="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                title={item.canApprove === false ? 'Self-approval is forbidden' : 'Reject Request'}
                              >
                                <X className="h-3.5 w-3.5" />
                                <span>Reject</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 space-y-3">
            <CheckSquare className="h-12 w-12 text-slate-300 stroke-[1.5]" />
            <div>
              <p className="font-bold text-slate-800 text-sm">No Approvals Pending in Queue</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                All requests have been reviewed or no records match your selected filters.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ACTION MODAL (Approve / Reject) */}
      {actionModalState.isOpen && actionModalState.item && actionModalState.action && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3 font-bold text-sm">
              <div
                className={`flex items-center gap-2 ${
                  actionModalState.action === 'APPROVE' ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {actionModalState.action === 'APPROVE' ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                <span>
                  {actionModalState.action === 'APPROVE' ? 'Approve Request' : 'Reject Request'}
                </span>
              </div>
              <button
                onClick={() => setActionModalState({ isOpen: false, item: null, action: null })}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {actionError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="mt-3 space-y-2 text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p>
                <span className="font-bold">Reference:</span>{' '}
                <span className="font-mono text-orange-700">{actionModalState.item.referenceNumber}</span>
              </p>
              <p>
                <span className="font-bold">Requester:</span> {actionModalState.item.employeeName} ({actionModalState.item.employeeId})
              </p>
              <p>
                <span className="font-bold">Request Title:</span> {actionModalState.item.title}
              </p>
            </div>

            <form onSubmit={handleActionSubmit} className="mt-4 space-y-3">
              <div>
                <label className="font-bold text-xs text-slate-800">
                  {actionModalState.action === 'REJECT' ? 'Rejection Reason (Required) *' : 'Approval Comments (Optional)'}
                </label>
                <textarea
                  rows={4}
                  required={actionModalState.action === 'REJECT'}
                  placeholder={
                    actionModalState.action === 'REJECT'
                      ? 'Specify exact reason for rejecting this request...'
                      : 'Add any optional notes or instructions...'
                  }
                  value={actionComments}
                  onChange={(e) => setActionComments(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 border-t pt-3 mt-4">
                <button
                  type="button"
                  onClick={() => setActionModalState({ isOpen: false, item: null, action: null })}
                  disabled={isProcessing}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition-all ${
                    actionModalState.action === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  } disabled:opacity-50`}
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : actionModalState.action === 'APPROVE' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  <span>
                    {isProcessing
                      ? 'Processing...'
                      : actionModalState.action === 'APPROVE'
                      ? 'Confirm Approval'
                      : 'Confirm Rejection'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* DETAIL MODAL DRAWER */}
      {isDetailModalOpen && selectedItem && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-xl max-h-[90vh] rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-xs text-slate-800">
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-3.5">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-orange-500" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  Request Detail Overview — <span className="font-mono text-orange-700">{selectedItem.referenceNumber}</span>
                </h3>
              </div>
              <button onClick={() => setIsDetailModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto pt-4 space-y-4 pr-1">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Requester Name</span>
                  <p className="font-extrabold text-slate-900 text-xs mt-0.5">{selectedItem.employeeName}</p>
                  <p className="text-[10px] text-slate-500 font-medium">{selectedItem.employeeId}</p>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Department & Role</span>
                  <p className="font-extrabold text-slate-900 text-xs mt-0.5">{selectedItem.department}</p>
                  <p className="text-[10px] text-slate-500 font-medium">{selectedItem.designation}</p>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Submission Date</span>
                  <p className="font-bold text-slate-800 mt-0.5">{formatDate(selectedItem.submittedAt)}</p>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Current Status</span>
                  <p className="mt-0.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getStatusBadge(selectedItem.status)}`}>
                      {selectedItem.status}
                    </span>
                  </p>
                </div>
              </div>

              {/* Specific Breakdown */}
              <div className="space-y-2 border-t pt-3">
                <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] text-orange-500">
                  Request Information
                </h4>

                {(selectedItem.isUrgent || selectedItem.details?.isUrgent) && (
                  <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-300 p-2.5 text-rose-800 font-bold text-xs">
                    <Flame className="h-4 w-4 text-rose-600 shrink-0" />
                    <span>🚨 Urgent Priority Request — Requires Immediate Processing</span>
                  </div>
                )}

                <p className="font-bold text-sm text-slate-900">{selectedItem.title}</p>

                {selectedItem.details?.leaveType && (
                  <p><span className="font-bold">Leave Type:</span> {selectedItem.details.leaveType}</p>
                )}
                {selectedItem.details?.durationType && (
                  <p>
                    <span className="font-bold">Duration Category:</span>{' '}
                    {selectedItem.details.durationType === 'HALF_DAY'
                      ? 'Half Day'
                      : selectedItem.details.durationType === 'CUSTOM_HOURS'
                      ? 'Custom Hours'
                      : 'Full Day'}
                    {selectedItem.details.session ? ` (${selectedItem.details.session})` : ''}
                  </p>
                )}
                {selectedItem.details?.requestedStartTime && selectedItem.details?.requestedEndTime && (
                  <p>
                    <span className="font-bold">Shift Slot Time:</span> {selectedItem.details.requestedStartTime} - {selectedItem.details.requestedEndTime}
                  </p>
                )}
                {selectedItem.details?.startDate && selectedItem.details?.endDate && (
                  <p><span className="font-bold">Duration:</span> {selectedItem.details.startDate} &rarr; {selectedItem.details.endDate} ({selectedItem.details.durationDays} days)</p>
                )}
                {selectedItem.details?.attendanceDate && (
                  <p><span className="font-bold">Attendance Date:</span> {selectedItem.details.attendanceDate}</p>
                )}
                {selectedItem.details?.checkInTime && (
                  <p><span className="font-bold">Check-In / Out:</span> {selectedItem.details.checkInTime} - {selectedItem.details.checkOutTime}</p>
                )}
                {selectedItem.details?.reason && (
                  <div className="rounded-xl bg-slate-100 p-3 border border-slate-200">
                    <span className="font-bold text-slate-700 block mb-0.5">Reason / Description:</span>
                    <p className="text-slate-800 leading-relaxed italic">{selectedItem.details.reason}</p>
                  </div>
                )}
                {selectedItem.details?.workSummary && (
                  <div className="rounded-xl bg-blue-50 p-3 border border-blue-200">
                    <span className="font-bold text-blue-900 block mb-0.5">Work done (written at check-out):</span>
                    <p className="text-slate-800 leading-relaxed whitespace-pre-line">{selectedItem.details.workSummary}</p>
                  </div>
                )}
                {selectedItem.details?.adminComments && (
                  <div className="rounded-xl bg-[#FFF7ED] p-3 border border-[#FED7AA]/60">
                    <span className="font-bold text-orange-950 block mb-0.5">HR Admin Comments:</span>
                    <p className="text-slate-900 font-medium">{selectedItem.details.adminComments}</p>
                  </div>
                )}
              </div>

              {/* Approval History Timeline */}
              {selectedItem.history && selectedItem.history.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] text-orange-500">
                    Approval History Timeline
                  </h4>
                  <div className="space-y-2 pl-2 border-l-2 border-orange-200">
                    {selectedItem.history.map((step, idx) => (
                      <div key={idx} className="text-xs relative pl-4">
                        <div className="absolute -left-[11px] top-1.5 h-2 w-2 rounded-full bg-orange-500" />
                        <p className="font-bold text-slate-900">
                          {step.action} by <span className="text-orange-700">{step.performedBy}</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">{formatDate(step.timestamp)}</p>
                        {step.comments && (
                          <p className="text-[11px] text-slate-600 italic mt-0.5">&quot;{step.comments}&quot;</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between border-t pt-3.5 mt-4">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>

              {selectedItem.status === 'PENDING' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setActionComments('');
                      setActionError(null);
                      setActionModalState({
                        isOpen: true,
                        item: selectedItem,
                        action: 'REJECT',
                      });
                    }}
                    disabled={selectedItem.canApprove === false}
                    className="flex items-center gap-1 rounded-xl bg-rose-600 px-4 py-2 font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <X className="h-4 w-4" />
                    <span>Reject</span>
                  </button>

                  <button
                    onClick={() => {
                      setActionComments('');
                      setActionError(null);
                      setActionModalState({
                        isOpen: true,
                        item: selectedItem,
                        action: 'APPROVE',
                      });
                    }}
                    disabled={selectedItem.canApprove === false}
                    className="flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Check className="h-4 w-4" />
                    <span>Approve</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </Portal>
      )}
    </AdminLayout>
  );
}
