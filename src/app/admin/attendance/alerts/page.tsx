'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  AlertTriangle,
  Clock,
  UserX,
  LogOut,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  RefreshCw,
  Eye,
  Check,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Mail,
  Bell,
  Building,
  User,
  X,
  Sparkles,
} from 'lucide-react';

interface AttendanceAlert {
  _id: string;
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
  alertType: 'LATE_ARRIVAL' | 'ABSENT' | 'MISSED_CHECKOUT' | 'EARLY_DEPARTURE';
  date: string;
  time: string;
  expectedTime?: string;
  actualTime?: string;
  diffMinutes?: number;
  message: string;
  status: 'PENDING' | 'SENT' | 'READ' | 'RESOLVED';
  resolvedBy?: string;
  resolvedAt?: string | null;
  resolutionNote?: string;
  notifiedVia: ('IN_APP' | 'EMAIL')[];
  createdAt: string;
  updatedAt: string;
}

interface AlertStats {
  total: number;
  lateArrivals: number;
  absentEmployees: number;
  missedCheckouts: number;
  earlyDepartures: number;
  pending: number;
  resolved: number;
}

export default function AttendanceAlertsPage() {
  const [alerts, setAlerts] = useState<AttendanceAlert[]>([]);
  const [stats, setStats] = useState<AlertStats>({
    total: 0,
    lateArrivals: 0,
    absentEmployees: 0,
    missedCheckouts: 0,
    earlyDepartures: 0,
    pending: 0,
    resolved: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modals
  const [selectedAlert, setSelectedAlert] = useState<AttendanceAlert | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Application-wide background scroll lock while attendance alert modal is open
  useBodyScrollLock(Boolean((isDetailsOpen || isResolveOpen) && selectedAlert));

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 3800);
  };

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '15');
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedType !== 'All') params.set('alertType', selectedType);
      if (selectedStatus !== 'All') params.set('status', selectedStatus);
      if (selectedDepartment !== 'All') params.set('department', selectedDepartment);
      if (selectedDate) params.set('date', selectedDate);

      const res = await fetch(`/api/v1/attendance/alerts?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setAlerts(json.data || []);
        if (json.stats) setStats(json.stats);
        if (json.pagination) {
          setTotalPages(json.pagination.totalPages || 1);
          setTotalCount(json.pagination.total || 0);
        }
      } else {
        showToast(json.message || 'Failed to fetch attendance alerts', 'error');
      }
    } catch (err: any) {
      console.error('Failed to load alerts:', err);
      showToast('Network error while loading attendance alerts', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [page, searchQuery, selectedType, selectedStatus, selectedDepartment, selectedDate]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // On-demand automatic detection trigger
  const handleRunDetection = async () => {
    if (isDetecting) return;
    setIsDetecting(true);
    try {
      const res = await fetch('/api/v1/attendance/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate: selectedDate || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Attendance check completed successfully!', 'success');
        fetchAlerts();
      } else {
        showToast(data.message || 'Attendance detection failed', 'error');
      }
    } catch {
      showToast('Failed to trigger automatic attendance check', 'error');
    } finally {
      setIsDetecting(false);
    }
  };

  // Mark single alert as READ
  const handleMarkAsRead = async (alert: AttendanceAlert) => {
    try {
      const res = await fetch(`/api/v1/attendance/alerts/${alert.id || alert._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'READ' }),
      });
      const data = await res.json();
      if (data.success) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alert.id ? { ...a, status: 'READ' } : a))
        );
        showToast('Alert marked as read', 'success');
      }
    } catch {
      showToast('Failed to mark alert as read', 'error');
    }
  };

  // Open resolve modal
  const handleOpenResolve = (alert: AttendanceAlert) => {
    setSelectedAlert(alert);
    setResolutionNote(alert.resolutionNote || '');
    setIsResolveOpen(true);
  };

  // Submit resolution
  const handleConfirmResolve = async () => {
    if (!selectedAlert) return;
    setIsResolving(true);
    try {
      const res = await fetch(`/api/v1/attendance/alerts/${selectedAlert.id || selectedAlert._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'RESOLVED',
          resolutionNote: resolutionNote.trim() || 'Resolved by Manager/Admin',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Attendance alert marked as resolved', 'success');
        setIsResolveOpen(false);
        fetchAlerts();
      } else {
        showToast(data.message || 'Failed to resolve alert', 'error');
      }
    } catch {
      showToast('Network error while resolving alert', 'error');
    } finally {
      setIsResolving(false);
    }
  };

  // Unique departments for filter
  const departments = useMemo(() => {
    const set = new Set<string>();
    alerts.forEach((a) => {
      if (a.department) set.add(a.department);
    });
    return Array.from(set);
  }, [alerts]);

  // Alert type badge helper
  const renderTypeBadge = (type: AttendanceAlert['alertType']) => {
    switch (type) {
      case 'LATE_ARRIVAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Late Arrival
          </span>
        );
      case 'ABSENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <UserX className="w-3.5 h-3.5 text-rose-600" />
            Absent
          </span>
        );
      case 'MISSED_CHECKOUT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FFF7ED] text-orange-800 border border-[#FED7AA]">
            <LogOut className="w-3.5 h-3.5 text-orange-500" />
            Missed Check-out
          </span>
        );
      case 'EARLY_DEPARTURE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
            <AlertTriangle className="w-3.5 h-3.5 text-sky-600" />
            Early Departure
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
            {type}
          </span>
        );
    }
  };

  // Status badge helper
  const renderStatusBadge = (status: AttendanceAlert['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
            Pending
          </span>
        );
      case 'SENT':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#FFF7ED] text-orange-800 border border-[#FED7AA]">
            Sent
          </span>
        );
      case 'READ':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#FFF7ED] text-orange-800 border border-[#FED7AA]">
            Read
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Resolved
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  return (
    <AdminLayout
      allowedRoles={['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'Super Admin', 'HR/Admin', 'Manager']}
      breadcrumbs={[
        { label: 'Attendance', href: '/admin/attendance' },
        { label: 'Attendance Alerts' },
      ]}
    >
      {/* Toast notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all transform animate-in fade-in slide-in-from-top-2 ${
            toastType === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {toastType === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Top Header & Action */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-7 h-7 text-orange-500" />
              Attendance Alerts
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Automated attendance violation detection, instant notifications, and resolution workflow.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRunDetection}
              disabled={isDetecting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 transition shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isDetecting ? 'animate-spin' : ''}`} />
              <span>{isDetecting ? 'Detecting Alerts...' : 'Run Detection Now'}</span>
            </button>
          </div>
        </div>

        {/* 5 KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Total Alerts */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Alerts</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
              <p className="text-xs text-slate-400 mt-0.5">{stats.pending} pending action</p>
            </div>
            <div className="p-3 rounded-lg bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60">
              <Bell className="w-6 h-6" />
            </div>
          </div>

          {/* Card 2: Late Arrivals */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Late Arrivals</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{stats.lateArrivals}</p>
              <p className="text-xs text-slate-400 mt-0.5">Post grace period</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          {/* Card 3: Absent Employees */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Absent Employees</p>
              <p className="text-2xl font-bold text-rose-600 mt-1">{stats.absentEmployees}</p>
              <p className="text-xs text-slate-400 mt-0.5">Past cutoff time</p>
            </div>
            <div className="p-3 rounded-lg bg-rose-50 text-rose-600">
              <UserX className="w-6 h-6" />
            </div>
          </div>

          {/* Card 4: Missed Check-outs */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Missed Check-outs</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{stats.missedCheckouts}</p>
              <p className="text-xs text-slate-400 mt-0.5">Unclosed daily shift</p>
            </div>
            <div className="p-3 rounded-lg bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60">
              <LogOut className="w-6 h-6" />
            </div>
          </div>

          {/* Card 5: Early Departures */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Early Departures</p>
              <p className="text-2xl font-bold text-sky-600 mt-1">{stats.earlyDepartures}</p>
              <p className="text-xs text-slate-400 mt-0.5">Before shift end</p>
            </div>
            <div className="p-3 rounded-lg bg-sky-50 text-sky-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search employee, ID, message..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:border-transparent"
              />
            </div>

            {/* Alert Type */}
            <div>
              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
              >
                <option value="All">All Alert Types</option>
                <option value="LATE_ARRIVAL">Late Arrival</option>
                <option value="ABSENT">Absent Employee</option>
                <option value="MISSED_CHECKOUT">Missed Check-out</option>
                <option value="EARLY_DEPARTURE">Early Departure</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
              >
                <option value="All">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="SENT">Sent</option>
                <option value="READ">Read</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>

            {/* Department */}
            <div>
              <select
                value={selectedDepartment}
                onChange={(e) => {
                  setSelectedDepartment(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
              >
                <option value="All">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
              />
              {selectedDate && (
                <button
                  onClick={() => {
                    setSelectedDate('');
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                  title="Clear Date"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table of Alerts */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Employee</th>
                  <th className="py-3.5 px-4">Alert Type</th>
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Details & Message</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-center">Channels</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2" />
                      Loading attendance alerts...
                    </td>
                  </tr>
                ) : alerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                      No attendance alerts found matching the criteria.
                    </td>
                  </tr>
                ) : (
                  alerts.map((alert) => (
                    <tr key={alert.id || alert._id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Employee Info */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 font-semibold flex items-center justify-center shrink-0 text-sm">
                            {(alert.employeeName || 'E').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-tight">
                              {alert.employeeName}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {alert.employeeCode || alert.employeeId} &bull; {alert.department || 'General'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Alert Type */}
                      <td className="py-3.5 px-4">
                        {renderTypeBadge(alert.alertType)}
                      </td>

                      {/* Date & Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                        <div className="font-medium text-slate-900">{alert.date}</div>
                        <div className="text-slate-500">{alert.time}</div>
                      </td>

                      {/* Message */}
                      <td className="py-3.5 px-4 max-w-xs sm:max-w-md">
                        <p className="text-xs text-slate-800 line-clamp-2 leading-relaxed">
                          {alert.message}
                        </p>
                        {alert.resolutionNote && (
                          <p className="text-xs text-emerald-700 mt-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block">
                            Note: {alert.resolutionNote}
                          </p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(alert.status)}
                      </td>

                      {/* Channels Notified */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            title="In-App Notification Sent"
                            className="p-1 rounded bg-slate-100 text-slate-700"
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </span>
                          {alert.notifiedVia?.includes('EMAIL') && (
                            <span
                              title="Email Notification Sent"
                              className="p-1 rounded bg-orange-50 text-orange-600"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {alert.status !== 'RESOLVED' && (
                            <>
                              {alert.status !== 'READ' && (
                                <button
                                  onClick={() => handleMarkAsRead(alert)}
                                  title="Mark as Read"
                                  className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenResolve(alert)}
                                title="Resolve Alert"
                                className="px-2.5 py-1 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
                              >
                                Resolve
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => {
                              setSelectedAlert(alert);
                              setIsDetailsOpen(true);
                            }}
                            title="View Full Details"
                            className="p-1.5 rounded-md hover:bg-slate-100 text-orange-500 transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3 border-t border-slate-200/80 bg-slate-50/50 text-xs text-slate-500 gap-2">
            <div>
              Showing <span className="font-semibold text-slate-700">{alerts.length}</span> of{' '}
              <span className="font-semibold text-slate-700">{totalCount}</span> alerts
            </div>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-medium transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-semibold text-slate-700">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-medium transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: View Details Modal */}
      {isDetailsOpen && selectedAlert && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-orange-500" />
                Attendance Alert Details
              </h3>
              <button
                onClick={() => setIsDetailsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-700">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs uppercase font-semibold text-slate-400">Alert Type</span>
                {renderTypeBadge(selectedAlert.alertType)}
              </div>

              <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-100">
                <div>
                  <span className="text-xs uppercase font-semibold text-slate-400">Employee</span>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedAlert.employeeName}</p>
                  <p className="text-xs text-slate-500">{selectedAlert.employeeCode || selectedAlert.employeeId}</p>
                </div>
                <div>
                  <span className="text-xs uppercase font-semibold text-slate-400">Department</span>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedAlert.department || 'General'}</p>
                  <p className="text-xs text-slate-500">{selectedAlert.designation || 'Staff'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-100">
                <div>
                  <span className="text-xs uppercase font-semibold text-slate-400">Date & Recorded Time</span>
                  <p className="font-medium text-slate-900 mt-0.5">{selectedAlert.date}</p>
                  <p className="text-xs text-slate-500">{selectedAlert.time}</p>
                </div>
                <div>
                  <span className="text-xs uppercase font-semibold text-slate-400">Status</span>
                  <div className="mt-1">{renderStatusBadge(selectedAlert.status)}</div>
                </div>
              </div>

              {selectedAlert.diffMinutes !== undefined && (
                <div className="pb-3 border-b border-slate-100">
                  <span className="text-xs uppercase font-semibold text-slate-400">Time Variance</span>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {selectedAlert.diffMinutes} minutes difference from scheduled shift timing.
                  </p>
                </div>
              )}

              <div className="pb-3 border-b border-slate-100">
                <span className="text-xs uppercase font-semibold text-slate-400">Message</span>
                <p className="text-sm text-slate-800 mt-1 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                  {selectedAlert.message}
                </p>
              </div>

              {selectedAlert.resolutionNote && (
                <div className="pb-3 border-b border-slate-100 bg-emerald-50/50 p-3 rounded-lg border border-emerald-200">
                  <span className="text-xs uppercase font-semibold text-emerald-800">Resolution Information</span>
                  <p className="text-sm text-emerald-900 mt-1">{selectedAlert.resolutionNote}</p>
                  {selectedAlert.resolvedBy && (
                    <p className="text-xs text-emerald-700 mt-1">Resolved by: {selectedAlert.resolvedBy}</p>
                  )}
                </div>
              )}

              <div>
                <span className="text-xs uppercase font-semibold text-slate-400">Dispatched Via</span>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  <span className="inline-flex items-center gap-1 text-slate-700">
                    <Bell className="w-3.5 h-3.5 text-orange-500" /> In-App Notification
                  </span>
                  {selectedAlert.notifiedVia?.includes('EMAIL') && (
                    <span className="inline-flex items-center gap-1 text-orange-700">
                      <Mail className="w-3.5 h-3.5 text-orange-500" /> Email Alert
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsDetailsOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-200/60 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* MODAL 2: Resolve Alert Modal */}
      {isResolveOpen && selectedAlert && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Resolve Attendance Alert
              </h3>
              <button
                onClick={() => setIsResolveOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Resolving alert for <strong className="text-slate-900">{selectedAlert.employeeName}</strong> (
                {selectedAlert.date} &bull; {selectedAlert.alertType.replace('_', ' ')}).
              </p>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Resolution Note / Regularization Reason
                </label>
                <textarea
                  rows={3}
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="e.g., Approved late arrival due to client site visit, or approved half-day leave."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsResolveOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-200/60 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResolve}
                disabled={isResolving}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {isResolving ? 'Resolving...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </AdminLayout>
  );
}

