'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuthStore } from '@/store/authStore';
import {
  HelpCircle,
  Plus,
  Search,
  RefreshCw,
  CheckCircle2,
  Eye,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  MessageSquare,
  FileText,
  User,
  Building2,
  Filter,
  X,
} from 'lucide-react';
import { HrTicket, Employee } from '@/types/admin';
import { formatISTDate } from '@/lib/dateUtils';

// Modals
import { TicketDetailModal } from '@/components/modals/TicketDetailModal';
import { CreateHrTicketModal } from '@/components/modals/CreateHrTicketModal';

export default function ManagerHelpdeskPage() {
  const { user } = useAuthStore();

  // Filters & Search State
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedRequestType, setSelectedRequestType] = useState<string>('All');
  const [selectedPriority, setSelectedPriority] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(15);

  // Data State from MongoDB
  const [tickets, setTickets] = useState<HrTicket[]>([]);
  const [teamMembers, setTeamMembers] = useState<Employee[]>([]);
  const [statusCounts, setStatusCounts] = useState({
    open: 0,
    assigned: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0,
    total: 0,
  });

  const [totalFilteredCount, setTotalFilteredCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [activeDetailTicketId, setActiveDetailTicketId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchTeamMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/manager/team');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTeamMembers(data.data || []);
        }
      }
    } catch (err) {
      console.error('Error loading team members for helpdesk:', err);
    }
  }, []);

  const fetchTicketsFromApi = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setIsError(false);
      setErrorMsg('');

      try {
        const params = new URLSearchParams();
        if (selectedStatus !== 'All') params.append('status', selectedStatus);
        if (selectedRequestType !== 'All') params.append('requestType', selectedRequestType);
        if (selectedPriority !== 'All') params.append('priority', selectedPriority);
        if (searchQuery.trim()) params.append('search', searchQuery.trim());
        params.append('page', String(currentPage));
        params.append('limit', String(pageSize));

        const res = await fetch(`/api/v1/hr-requests?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setTickets(data.tickets || []);
            setStatusCounts(data.statusCounts || { open: 0, assigned: 0, inProgress: 0, resolved: 0, closed: 0, total: 0 });
            setTotalFilteredCount(data.count || 0);
            setTotalPages(data.totalPages || 1);

            if (isManualRefresh) {
              showToast('Team helpdesk tickets refreshed');
            }
          } else {
            setIsError(true);
            setErrorMsg(data.message || 'Unable to load team helpdesk requests.');
          }
        } else {
          setIsError(true);
          setErrorMsg('Failed to fetch team helpdesk tickets.');
        }
      } catch (err: any) {
        console.error('Error loading manager tickets:', err);
        setIsError(true);
        setErrorMsg(err.message || 'Unable to load support tickets. Please try again.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [selectedStatus, selectedRequestType, selectedPriority, searchQuery, currentPage, pageSize]
  );

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  useEffect(() => {
    fetchTicketsFromApi();
  }, [fetchTicketsFromApi]);

  const handleResetFilters = () => {
    setSelectedStatus('All');
    setSelectedRequestType('All');
    setSelectedPriority('All');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const isFiltered =
    selectedStatus !== 'All' || selectedRequestType !== 'All' || selectedPriority !== 'All' || searchQuery.trim() !== '';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Open':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-extrabold text-blue-700 border border-blue-200">
            <Clock className="h-3 w-3 text-blue-600" />
            Open
          </span>
        );
      case 'Assigned':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-extrabold text-purple-700 border border-purple-200">
            <User className="h-3 w-3 text-purple-600" />
            Assigned
          </span>
        );
      case 'In Progress':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-700 border border-amber-200">
            <RefreshCw className="h-3 w-3 text-amber-600 animate-spin" style={{ animationDuration: '4s' }} />
            In Progress
          </span>
        );
      case 'Resolved':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Resolved
          </span>
        );
      case 'Closed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-extrabold text-slate-700 border border-slate-300">
            <FileText className="h-3 w-3 text-slate-500" />
            Closed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'Urgent':
        return (
          <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-800 border border-rose-200">
            Urgent
          </span>
        );
      case 'High':
        return (
          <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 border border-amber-200">
            High
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
            Medium
          </span>
        );
      case 'Low':
        return (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">
            Low
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {priority}
          </span>
        );
    }
  };

  const openCount = statusCounts.open + statusCounts.assigned;
  const inProgressCount = statusCounts.inProgress;
  const resolvedCount = statusCounts.resolved + statusCounts.closed;
  const totalCount = statusCounts.total;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
          {/* Toast Banner */}
          {toastMessage && (
            <div className="fixed top-20 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-3 text-xs font-semibold shadow-2xl animate-in slide-in-from-top-4 duration-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Page Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <HelpCircle className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Team Helpdesk & Escalations</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Track, review, and manage HR requests & support tickets from your authorized direct reports.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchTicketsFromApi(true)}
                disabled={isRefreshing || isLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>

              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-sm cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Raise Ticket</span>
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Total Team Tickets</span>
                <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
                  <FileText className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900">{totalCount}</span>
                <p className="text-[11px] text-slate-500 mt-0.5">Across all categories</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Open & Pending</span>
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-blue-700">{openCount}</span>
                <p className="text-[11px] text-blue-600/80 mt-0.5">Awaiting initial action</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">In Progress</span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <RefreshCw className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-amber-700">{inProgressCount}</span>
                <p className="text-[11px] text-amber-600/80 mt-0.5">Currently being addressed</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Resolved & Closed</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-emerald-700">{resolvedCount}</span>
                <p className="text-[11px] text-emerald-600/80 mt-0.5">Completed support tickets</p>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by ticket no, subject, employee name..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status Filter */}
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-700"
                >
                  <option value="All">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="Assigned">Assigned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>

                {/* Priority Filter */}
                <select
                  value={selectedPriority}
                  onChange={(e) => {
                    setSelectedPriority(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-700"
                >
                  <option value="All">All Priorities</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>

                {/* Request Type Filter */}
                <select
                  value={selectedRequestType}
                  onChange={(e) => {
                    setSelectedRequestType(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-700 max-w-[180px] truncate"
                >
                  <option value="All">All Request Types</option>
                  <option value="Salary Issue">Salary Issue</option>
                  <option value="Attendance Correction">Attendance Correction</option>
                  <option value="Leave Issue">Leave Issue</option>
                  <option value="Document Request">Document Request</option>
                  <option value="Payroll Issue">Payroll Issue</option>
                  <option value="Profile Correction">Profile Correction</option>
                  <option value="IT/Asset Request">IT/Asset Request</option>
                  <option value="General HR Query">General HR Query</option>
                </select>

                {/* Reset Filters */}
                {isFiltered && (
                  <button
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Main Table / Content Section */}
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
            {isLoading ? (
              <div className="p-16 text-center text-xs text-slate-500 space-y-3">
                <RefreshCw className="h-6 w-6 animate-spin text-indigo-600 mx-auto" />
                <p className="font-semibold text-slate-600">Loading team helpdesk tickets...</p>
              </div>
            ) : isError ? (
              <div className="p-12 text-center text-xs space-y-3">
                <AlertCircle className="h-8 w-8 text-rose-500 mx-auto" />
                <p className="font-bold text-slate-800">{errorMsg || 'Failed to load tickets.'}</p>
                <button
                  onClick={() => fetchTicketsFromApi(true)}
                  className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-16 text-center text-xs text-slate-500 space-y-2">
                <HelpCircle className="h-10 w-10 text-slate-300 mx-auto mb-1" />
                <p className="font-bold text-slate-700 text-sm">No Helpdesk Tickets Found</p>
                <p className="text-slate-400 max-w-sm mx-auto">
                  {isFiltered
                    ? 'No support requests match your selected filters. Try clearing or adjusting search criteria.'
                    : 'Your direct reports have not submitted any support tickets yet.'}
                </p>
                {isFiltered && (
                  <button
                    onClick={handleResetFilters}
                    className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Clear Filters</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop Enterprise Table */}
                <div className="hidden md:block overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 text-slate-700 font-extrabold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3.5 px-4">Ticket No</th>
                        <th className="py-3.5 px-4">Team Member</th>
                        <th className="py-3.5 px-4">Subject & Type</th>
                        <th className="py-3.5 px-4">Priority</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Created Date</th>
                        <th className="py-3.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {tickets.map((t) => (
                        <tr key={t.id || (t as any)._id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Ticket No */}
                          <td className="py-3.5 px-4 font-mono font-bold text-indigo-600">
                            {t.ticketNo || t.id || 'HR-000'}
                          </td>

                          {/* Team Member */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 font-extrabold flex items-center justify-center text-[10px] uppercase border border-indigo-200">
                                {(t.creatorName || t.employeeId || 'E').slice(0, 2)}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 block">{t.creatorName || 'Employee'}</span>
                                <span className="text-[10px] text-slate-400 block">{t.department || 'Team Member'}</span>
                              </div>
                            </div>
                          </td>

                          {/* Subject & Type */}
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-slate-800 block truncate max-w-xs">{t.subject}</span>
                            <span className="text-[10px] text-slate-400 block">{t.requestType || t.category || 'General HR Query'}</span>
                          </td>

                          {/* Priority */}
                          <td className="py-3.5 px-4">{getPriorityBadge(t.priority)}</td>

                          {/* Status */}
                          <td className="py-3.5 px-4">{getStatusBadge(t.status)}</td>

                          {/* Created Date */}
                          <td className="py-3.5 px-4 text-slate-500">{formatISTDate(t.createdAt)}</td>

                          {/* Action */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setActiveDetailTicketId(t.id || (t as any)._id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {tickets.map((t) => (
                    <div key={t.id || (t as any)._id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                          {t.ticketNo || t.id}
                        </span>
                        {getStatusBadge(t.status)}
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{t.subject}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500 font-semibold">{t.creatorName || 'Employee'}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-xs text-slate-400">{t.requestType || t.category}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 text-xs border-t border-slate-50">
                        <div className="flex items-center gap-2">
                          {getPriorityBadge(t.priority)}
                          <span className="text-slate-400 text-[11px]">{formatISTDate(t.createdAt)}</span>
                        </div>

                        <button
                          onClick={() => setActiveDetailTicketId(t.id || (t as any)._id)}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Inspect</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Server Pagination */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-600">
                  <div>
                    Showing <span className="font-bold text-slate-900">{tickets.length}</span> of{' '}
                    <span className="font-bold text-slate-900">{totalFilteredCount}</span> support tickets
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="font-bold text-slate-700 px-2">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={currentPage >= totalPages}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

        {/* Details & Comment Thread Modal */}
        <TicketDetailModal
          isOpen={!!activeDetailTicketId}
          onClose={() => setActiveDetailTicketId(null)}
          ticketId={activeDetailTicketId}
          isHrUser={true}
          onTicketUpdated={() => fetchTicketsFromApi(false)}
        />

        {/* Raise Ticket Modal */}
        <CreateHrTicketModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          employees={teamMembers}
          isHrUser={true}
          onTicketCreated={() => {
            fetchTicketsFromApi(false);
            showToast('Helpdesk ticket raised successfully');
          }}
        />
      </div>
    );
}
