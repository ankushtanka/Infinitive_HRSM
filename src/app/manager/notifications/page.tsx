'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import {
  Bell,
  RefreshCw,
  CheckCircle2,
  Inbox,
  CalendarDays,
  Clock,
  MessageSquare,
  ShieldAlert,
  Search,
  RotateCcw,
  X,
  ExternalLink,
  CheckCheck,
  Building2,
  AlertCircle,
  Sparkles,
  Info,
  Eye,
  Check,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Award,
  HelpCircle,
  Loader2,
  FileText,
  User as UserIcon,
} from 'lucide-react';
import { formatISTDate, formatISTTime } from '@/lib/dateUtils';

interface NotificationItem {
  id: string;
  _id?: string;
  organizationId?: string;
  recipientType?: string;
  recipientId?: string;
  targetScope?: string;
  eventType?: string;
  category?: string;
  title: string;
  message: string;
  priority?: string; // 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'
  channel?: string;
  status?: string; // 'READ' | 'UNREAD'
  isRead?: boolean;
  actionUrl?: string | null;
  link?: string | null;
  metadata?: any;
  createdAt?: string;
  readAt?: string | null;
}

function getISTRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatISTDate(dateStr);
  } catch {
    return formatISTDate(dateStr);
  }
}

export default function ManagerNotificationsPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [kpis, setKpis] = useState({
    total: 0,
    unread: 0,
    read: 0,
    today: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All'); // 'All' | 'UNREAD' | 'READ'
  const [filterCategory, setFilterCategory] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);

  // Notification Detail Modal State
  const [selectedNotif, setSelectedNotif] = useState<NotificationItem | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch Manager Notifications from API
  const fetchNotifications = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', String(currentPage));
        queryParams.set('limit', String(pageSize));

        if (searchQuery.trim()) queryParams.set('search', searchQuery.trim());
        if (filterStatus !== 'All') queryParams.set('status', filterStatus);
        if (filterCategory !== 'All') queryParams.set('category', filterCategory);

        const res = await fetch(`/api/v1/notifications?${queryParams.toString()}`);
        if (!res.ok) {
          if (res.status === 403) throw new Error('Access denied. Manager authorization required.');
          throw new Error('Failed to fetch notifications.');
        }

        const data = await res.json();
        if (data.success) {
          const list: NotificationItem[] = data.notifications || data.data || [];
          setNotifications(list);

          if (data.pagination) {
            setTotalPages(data.pagination.totalPages || 1);
          }

          if (data.kpis) {
            setKpis({
              total: data.kpis.total || 0,
              unread: data.kpis.unread || 0,
              read: data.kpis.read || 0,
              today: data.kpis.today || 0,
            });
          } else {
            const unread = list.filter((n) => n.status === 'UNREAD' || !n.isRead).length;
            setKpis({
              total: list.length,
              unread,
              read: list.length - unread,
              today: list.filter((n) => n.createdAt && n.createdAt.startsWith(new Date().toISOString().split('T')[0])).length,
            });
          }

          if (isManualRefresh) {
            showToast('Notifications refreshed successfully');
          }
        } else {
          throw new Error(data.message || 'Failed to load notifications');
        }
      } catch (err: any) {
        console.error('Error fetching manager notifications:', err);
        setErrorMessage(err?.message || 'A network error occurred while loading notifications.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentPage, pageSize, searchQuery, filterStatus, filterCategory]
  );

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Mark Single Notification as READ
  const handleMarkAsRead = async (notif: NotificationItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (notif.status === 'READ' || notif.isRead) return;

    setMarkingReadId(notif.id);
    try {
      const res = await fetch(`/api/v1/notifications/${notif.id}/read`, {
        method: 'PATCH',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to mark notification as read');
      }

      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, status: 'READ', isRead: true } : n))
      );

      setKpis((prev) => ({
        ...prev,
        unread: Math.max(0, prev.unread - 1),
        read: prev.read + 1,
      }));

      showToast('Notification marked as read');
    } catch (err: any) {
      console.error('Error marking notification as read:', err);
      setErrorMessage(err?.message || 'Failed to update notification status.');
    } finally {
      setMarkingReadId(null);
    }
  };

  // Mark ALL Manager Notifications as READ
  const handleMarkAllRead = async () => {
    setIsMarkingAllRead(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/notifications/mark-all-read', {
        method: 'PATCH',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to mark all notifications as read');
      }

      setNotifications((prev) => prev.map((n) => ({ ...n, status: 'READ', isRead: true })));

      setKpis((prev) => ({
        ...prev,
        unread: 0,
        read: prev.total,
      }));

      showToast(`Marked ${data.updatedCount || 'all'} notifications as read`);
    } catch (err: any) {
      console.error('Error marking all notifications as read:', err);
      setErrorMessage(err?.message || 'Failed to mark notifications as read.');
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterStatus('All');
    setFilterCategory('All');
    setCurrentPage(1);
  };

  // Category Icon Mapping
  const getCategoryIcon = (category?: string) => {
    const cat = category ? category.toUpperCase() : 'SYSTEM';
    switch (cat) {
      case 'LEAVE':
        return <CalendarDays className="h-4 w-4 text-emerald-600" />;
      case 'ATTENDANCE':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'PERFORMANCE':
        return <Award className="h-4 w-4 text-amber-600" />;
      case 'COMMUNICATION':
      case 'HR_EMPLOYEE':
        return <MessageSquare className="h-4 w-4 text-indigo-600" />;
      case 'HELPDESK':
      case 'SUPPORT':
        return <HelpCircle className="h-4 w-4 text-purple-600" />;
      case 'SECURITY':
      case 'AUDIT':
        return <ShieldAlert className="h-4 w-4 text-rose-600" />;
      case 'EMPLOYEE':
        return <UserIcon className="h-4 w-4 text-teal-600" />;
      default:
        return <Bell className="h-4 w-4 text-slate-600" />;
    }
  };

  // Priority Badge Helper
  const getPriorityBadge = (priority?: string) => {
    const prio = priority ? priority.toUpperCase() : 'NORMAL';
    if (prio === 'CRITICAL' || prio === 'URGENT') {
      return (
        <span className="rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[9px] font-extrabold text-rose-700">
          CRITICAL
        </span>
      );
    }
    if (prio === 'HIGH' || prio === 'WARNING') {
      return (
        <span className="rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[9px] font-extrabold text-amber-700">
          HIGH
        </span>
      );
    }
    return (
      <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[9px] font-semibold text-indigo-600">
        NORMAL
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-slate-900 text-white px-5 py-3 shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Manager Header & Context */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Manager Notifications</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
              <ShieldCheck className="h-3 w-3" /> Manager Inbox
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back, <span className="font-semibold text-slate-700">{user?.name || 'Manager'}</span> ({user?.employeeId || 'ID'}). Stay updated with team activity that requires your attention.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkAllRead}
            disabled={isMarkingAllRead || kpis.unread === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isMarkingAllRead ? (
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
            ) : (
              <CheckCheck className="h-4 w-4 text-emerald-600" />
            )}
            <span>Mark All Read</span>
          </button>
          <button
            onClick={() => fetchNotifications(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 4 Real KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Alerts</span>
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
              <Bell className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{isLoading ? '...' : kpis.total}</p>
          <span className="text-[10px] text-slate-400 font-medium">Manager notifications</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unread</span>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <Inbox className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{isLoading ? '...' : kpis.unread}</p>
          <span className="text-[10px] text-amber-600 font-semibold">Requires attention</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Read Alerts</span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{isLoading ? '...' : kpis.read}</p>
          <span className="text-[10px] text-slate-400 font-medium">Reviewed notifications</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today (IST)</span>
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{isLoading ? '...' : kpis.today}</p>
          <span className="text-[10px] text-slate-400 font-medium">IST ({formatISTDate(new Date().toISOString())})</span>
        </div>
      </div>

      {/* Global Error Alert */}
      {errorMessage && (
        <div className="flex items-center gap-3 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span className="font-medium flex-1">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 font-bold">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search & Multi-Filter Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search notifications by title, content, or category..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            >
              <option value="All">All Statuses</option>
              <option value="UNREAD">Unread Only</option>
              <option value="READ">Read Only</option>
            </select>

            {/* Category Filter */}
            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            >
              <option value="All">All Categories</option>
              <option value="LEAVE">Leave Alerts</option>
              <option value="ATTENDANCE">Attendance</option>
              <option value="PERFORMANCE">Performance</option>
              <option value="COMMUNICATION">Communication</option>
              <option value="HELPDESK">Helpdesk</option>
              <option value="PAYROLL">Payroll</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="SYSTEM">System</option>
              <option value="SECURITY">Security</option>
            </select>

            {/* Reset Button */}
            {(searchQuery || filterStatus !== 'All' || filterCategory !== 'All') && (
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Enterprise Notification List */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center space-y-3">
            <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-medium">Loading manager notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Inbox className="h-10 w-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">No Notifications Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || filterStatus !== 'All' || filterCategory !== 'All'
                ? 'No notifications match your current filter parameters.'
                : "You're all caught up! There are no active notifications requiring your review."}
            </p>
            {(searchQuery || filterStatus !== 'All' || filterCategory !== 'All') && (
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-all cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Clear Filters</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((item) => {
              const isUnread = item.status === 'UNREAD' || !item.isRead;
              const isMarkingThisRead = markingReadId === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedNotif(item)}
                  className={`p-4 sm:p-5 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 ${
                    isUnread ? 'bg-indigo-50/30 border-l-4 border-indigo-600' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Category Icon */}
                    <div className="p-2.5 rounded-2xl bg-slate-100 border border-slate-200/60 shrink-0 mt-0.5">
                      {getCategoryIcon(item.category)}
                    </div>

                    {/* Notification Details */}
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-900 truncate">{item.title}</span>
                        {getPriorityBadge(item.priority)}
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600 uppercase">
                          {item.category || 'SYSTEM'}
                        </span>
                        {isUnread && (
                          <span className="rounded-full bg-amber-500 h-2 w-2 inline-block shrink-0" />
                        )}
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed font-sans line-clamp-2">{item.message}</p>

                      <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono pt-1">
                        <span>{getISTRelativeTime(item.createdAt)}</span>
                        <span>•</span>
                        <span>{formatISTDate(item.createdAt)} {formatISTTime(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pt-2 sm:pt-0">
                    {/* Mark as Read Button */}
                    {isUnread && (
                      <button
                        onClick={(e) => handleMarkAsRead(item, e)}
                        disabled={isMarkingThisRead}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
                        title="Mark as Read"
                      >
                        {isMarkingThisRead ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                        ) : (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        <span>Mark Read</span>
                      </button>
                    )}

                    {/* Action Target Navigation */}
                    {(item.actionUrl || item.link) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const target = item.actionUrl || item.link;
                          if (target) router.push(target);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 transition-all cursor-pointer"
                      >
                        <span>View</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Server-Side Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <span>
              Page <strong className="text-slate-900">{currentPage}</strong> of <strong className="text-slate-900">{totalPages}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1 || isLoading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || isLoading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* NOTIFICATION DETAILS MODAL */}
      {selectedNotif && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600/30 rounded-xl border border-indigo-400/30">
                  {getCategoryIcon(selectedNotif.category)}
                </div>
                <div>
                  <h2 className="font-bold text-sm text-white">{selectedNotif.title}</h2>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {formatISTDate(selectedNotif.createdAt)} {formatISTTime(selectedNotif.createdAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedNotif(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Priority:</span>
                {getPriorityBadge(selectedNotif.priority)}
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-3">Category:</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 uppercase">
                  {selectedNotif.category || 'SYSTEM'}
                </span>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-3">Status:</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                    selectedNotif.status === 'READ' || selectedNotif.isRead
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {selectedNotif.status || (selectedNotif.isRead ? 'READ' : 'UNREAD')}
                </span>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-slate-500 text-[11px]">Message Content:</span>
                <p className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-800 leading-relaxed font-sans font-medium whitespace-pre-wrap">
                  {selectedNotif.message}
                </p>
              </div>

              {/* Action Link Button */}
              {(selectedNotif.actionUrl || selectedNotif.link) && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      const target = selectedNotif.actionUrl || selectedNotif.link;
                      setSelectedNotif(null);
                      if (target) router.push(target);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-xs cursor-pointer"
                  >
                    <span>Navigate to Related Portal</span>
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              {(selectedNotif.status === 'UNREAD' || !selectedNotif.isRead) ? (
                <button
                  onClick={(e) => {
                    handleMarkAsRead(selectedNotif, e);
                    setSelectedNotif((prev) => (prev ? { ...prev, status: 'READ', isRead: true } : null));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-all"
                >
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Mark as Read</span>
                </button>
              ) : (
                <span className="text-[11px] text-slate-400 font-medium">Already reviewed</span>
              )}
              <button
                onClick={() => setSelectedNotif(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-colors"
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
