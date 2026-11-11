'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import {
  Bell,
  Calendar,
  Clock,
  Cake,
  Award,
  FileText,
  UserPlus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  Check,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Mail,
  User,
  X,
  Plus,
  ExternalLink,
  Sparkles,
  ClipboardList,
  CalendarDays,
  FileCheck,
} from 'lucide-react';

interface EmployeeReminder {
  _id: string;
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
  avatar?: string;
  category: 'PROBATION' | 'BIRTHDAY' | 'ANNIVERSARY' | 'DOCUMENT_EXPIRY' | 'JOINING';
  reminderType: string;
  targetDate: string;
  reminderDate: string;
  daysRemaining: number;
  title: string;
  message: string;
  status: 'UPCOMING' | 'PENDING' | 'SENT' | 'EXPIRING_SOON' | 'EXPIRED' | 'COMPLETED' | 'RESOLVED';
  documentId?: string;
  documentTitle?: string;
  documentCategory?: string;
  documentUrl?: string;
  yearsOfService?: number;
  joiningDate?: string;
  probationEndDate?: string;
  probationPeriodMonths?: number;
  probationStatus?: string;
  onboardingStatus?: string;
  onboardingChecklist?: Array<{ task: string; completed: boolean }>;
  actionTaken?: string | null;
  actionNote?: string | null;
  notifiedVia: ('IN_APP' | 'EMAIL')[];
  createdAt: string;
}

interface ReminderStats {
  probation: {
    total: number;
    expiring30d: number;
    expiring7d: number;
    completed: number;
  };
  birthday: {
    today: number;
    upcoming30d: number;
  };
  anniversary: {
    today: number;
    upcoming30d: number;
  };
  documentExpiry: {
    total: number;
    expiringSoon: number;
    expired: number;
  };
  joining: {
    today: number;
    upcoming: number;
    onboardingPending: number;
  };
}

export default function RemindersDashboardPage() {
  const [activeTab, setActiveTab] = useState<'PROBATION' | 'CELEBRATIONS' | 'DOCUMENT_EXPIRY' | 'JOINING'>('PROBATION');
  const [celebrationFilter, setCelebrationFilter] = useState<'ALL' | 'BIRTHDAY' | 'ANNIVERSARY'>('ALL');

  const [reminders, setReminders] = useState<EmployeeReminder[]>([]);
  const [stats, setStats] = useState<ReminderStats>({
    probation: { total: 0, expiring30d: 0, expiring7d: 0, completed: 0 },
    birthday: { today: 0, upcoming30d: 0 },
    anniversary: { today: 0, upcoming30d: 0 },
    documentExpiry: { total: 0, expiringSoon: 0, expired: 0 },
    joining: { today: 0, upcoming: 0, onboardingPending: 0 },
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modals
  const [selectedReminder, setSelectedReminder] = useState<EmployeeReminder | null>(null);
  const [isProbationModalOpen, setIsProbationModalOpen] = useState(false);
  const [probationAction, setProbationAction] = useState<'COMPLETE' | 'CONFIRM' | 'EXTEND'>('CONFIRM');
  const [extensionMonths, setExtensionMonths] = useState(3);
  const [probationNote, setProbationNote] = useState('');

  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [newDocExpiryDate, setNewDocExpiryDate] = useState('');
  const [docRenewNote, setDocRenewNote] = useState('');

  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [activeChecklist, setActiveChecklist] = useState<Array<{ task: string; completed: boolean }>>([]);
  const [onboardingStatusSelect, setOnboardingStatusSelect] = useState<'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('IN_PROGRESS');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 3800);
  };

  const fetchReminders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '15');
      params.set('category', activeTab);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedStatus !== 'All') params.set('status', selectedStatus);
      if (selectedDepartment !== 'All') params.set('department', selectedDepartment);

      const res = await fetch(`/api/v1/reminders?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setReminders(json.data || []);
        if (json.stats) setStats(json.stats);
        if (json.pagination) {
          setTotalPages(json.pagination.totalPages || 1);
          setTotalCount(json.pagination.total || 0);
        }
      } else {
        showToast(json.message || 'Failed to fetch reminders', 'error');
      }
    } catch {
      showToast('Network error while loading reminders', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [page, activeTab, searchQuery, selectedStatus, selectedDepartment]);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // Run on-demand reminder check
  const handleRunChecks = async () => {
    if (isDetecting) return;
    setIsDetecting(true);
    try {
      const res = await fetch('/api/v1/reminders', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Reminders check completed successfully!', 'success');
        fetchReminders();
      } else {
        showToast(data.message || 'Failed to complete check', 'error');
      }
    } catch {
      showToast('Error triggering reminder checks', 'error');
    } finally {
      setIsDetecting(false);
    }
  };

  // Submit probation action
  const handleConfirmProbationAction = async () => {
    if (!selectedReminder) return;
    try {
      let actionType = 'PROBATION_CONFIRM';
      if (probationAction === 'COMPLETE') actionType = 'PROBATION_COMPLETE';
      if (probationAction === 'EXTEND') actionType = 'PROBATION_EXTEND';

      const res = await fetch(`/api/v1/reminders/${selectedReminder.id || selectedReminder._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionType,
          note: probationNote,
          extensionMonths,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Probation ${probationAction.toLowerCase()} action submitted successfully`, 'success');
        setIsProbationModalOpen(false);
        fetchReminders();
      } else {
        showToast(data.message || 'Failed to update probation', 'error');
      }
    } catch {
      showToast('Error submitting probation update', 'error');
    }
  };

  // Submit document renewal
  const handleConfirmDocRenew = async () => {
    if (!selectedReminder || !newDocExpiryDate) return;
    try {
      const res = await fetch(`/api/v1/reminders/${selectedReminder.id || selectedReminder._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DOCUMENT_RENEW',
          newExpiryDate: newDocExpiryDate,
          note: docRenewNote,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Document expiry renewed and reminder resolved', 'success');
        setIsDocModalOpen(false);
        fetchReminders();
      } else {
        showToast(data.message || 'Failed to renew document', 'error');
      }
    } catch {
      showToast('Error updating document renewal', 'error');
    }
  };

  // Submit onboarding checklist update
  const handleConfirmOnboarding = async () => {
    if (!selectedReminder) return;
    try {
      const res = await fetch(`/api/v1/reminders/${selectedReminder.id || selectedReminder._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_ONBOARDING',
          checklist: activeChecklist,
          onboardingStatus: onboardingStatusSelect,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Onboarding tasks updated successfully', 'success');
        setIsOnboardingModalOpen(false);
        fetchReminders();
      } else {
        showToast(data.message || 'Failed to update onboarding', 'error');
      }
    } catch {
      showToast('Error saving onboarding checklist', 'error');
    }
  };

  // Unique departments for filter
  const departments = useMemo(() => {
    const set = new Set<string>();
    reminders.forEach((r) => {
      if (r.department) set.add(r.department);
    });
    return Array.from(set);
  }, [reminders]);

  // Filtered for Celebrations sub-filter
  const displayedReminders = useMemo(() => {
    if (activeTab !== 'CELEBRATIONS') return reminders;
    if (celebrationFilter === 'ALL') return reminders;
    return reminders.filter((r) => r.category === celebrationFilter);
  }, [reminders, activeTab, celebrationFilter]);

  // Badge helpers
  const renderStatusBadge = (status: EmployeeReminder['status'], daysRemaining?: number) => {
    switch (status) {
      case 'UPCOMING':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#FFF7ED] text-orange-700 border border-[#FED7AA]">Upcoming</span>;
      case 'PENDING':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Pending Review</span>;
      case 'EXPIRING_SOON':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">Expiring Soon</span>;
      case 'EXPIRED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">Overdue / Expired</span>;
      case 'COMPLETED':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3 text-emerald-600" /> Completed</span>;
      case 'RESOLVED':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3 text-emerald-600" /> Resolved</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  const renderDaysBadge = (days: number) => {
    if (days === 0) {
      return <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">Today</span>;
    }
    if (days === 1) {
      return <span className="font-semibold text-orange-700 bg-[#FFF7ED] px-2 py-0.5 rounded border border-[#FED7AA] text-xs">Tomorrow</span>;
    }
    if (days > 1 && days <= 7) {
      return <span className="font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 text-xs">{days} days left</span>;
    }
    if (days > 7) {
      return <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-xs">{days} days left</span>;
    }
    return <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-xs">{Math.abs(days)} days overdue</span>;
  };

  return (
    <AdminLayout
      allowedRoles={['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'Super Admin', 'HR/Admin', 'Manager']}
      breadcrumbs={[
        { label: 'Employees', href: '/admin/employees' },
        { label: 'Reminders & Alerts' },
      ]}
    >
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toastType === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          }`}
        >
          {toastType === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Bell className="w-7 h-7 text-orange-500" />
              Employee Reminders & Alerts
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Automated probation tracking, celebrations, document expiry monitoring, and onboarding reminders.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRunChecks}
              disabled={isDetecting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 transition shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isDetecting ? 'animate-spin' : ''}`} />
              <span>{isDetecting ? 'Running Checks...' : 'Run Checks Now'}</span>
            </button>
          </div>
        </div>

        {/* 4 Category Tabs */}
        <div className="border-b border-slate-200 flex overflow-x-auto gap-2 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveTab('PROBATION')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-semibold transition whitespace-nowrap ${
              activeTab === 'PROBATION'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            Probation-End Reminders
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {stats.probation.total}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('CELEBRATIONS')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-semibold transition whitespace-nowrap ${
              activeTab === 'CELEBRATIONS'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Cake className="w-4 h-4 text-pink-500" />
            Birthdays & Anniversaries
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-pink-50 text-pink-700">
              {stats.birthday.today + stats.anniversary.today} Today
            </span>
          </button>

          <button
            onClick={() => setActiveTab('DOCUMENT_EXPIRY')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-semibold transition whitespace-nowrap ${
              activeTab === 'DOCUMENT_EXPIRY'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4 text-amber-500" />
            Document Expiry Alerts
            {stats.documentExpiry.expired > 0 && (
              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold">
                {stats.documentExpiry.expired} Expired
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('JOINING')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-semibold transition whitespace-nowrap ${
              activeTab === 'JOINING'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4 text-emerald-500" />
            Joining-Date & Onboarding
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {stats.joining.today + stats.joining.upcoming}
            </span>
          </button>
        </div>

        {/* Tab-Specific KPI Cards */}
        {activeTab === 'PROBATION' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">In Probation Review</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.probation.total}</p>
                <p className="text-xs text-slate-400 mt-0.5">Active probation records</p>
              </div>
              <div className="p-3 rounded-lg bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60"><Clock className="w-6 h-6" /></div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Expiring in 30 Days</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{stats.probation.expiring30d}</p>
                <p className="text-xs text-slate-400 mt-0.5">Action pending</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 text-amber-600"><AlertTriangle className="w-6 h-6" /></div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Critical (&le; 7 Days)</p>
                <p className="text-2xl font-bold text-rose-600 mt-1">{stats.probation.expiring7d}</p>
                <p className="text-xs text-slate-400 mt-0.5">Immediate review required</p>
              </div>
              <div className="p-3 rounded-lg bg-rose-50 text-rose-600"><Clock className="w-6 h-6" /></div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Completed / Confirmed</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.probation.completed}</p>
                <p className="text-xs text-slate-400 mt-0.5">Regularized employees</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600"><CheckCircle2 className="w-6 h-6" /></div>
            </div>
          </div>
        )}

        {activeTab === 'CELEBRATIONS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Birthdays Today</p>
                <p className="text-2xl font-bold text-pink-600 mt-1">{stats.birthday.today}</p>
                <p className="text-xs text-slate-400 mt-0.5">Send celebratory wishes</p>
              </div>
              <div className="p-3 rounded-lg bg-pink-50 text-pink-600"><Cake className="w-6 h-6" /></div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Upcoming Birthdays (30d)</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.birthday.upcoming30d}</p>
                <p className="text-xs text-slate-400 mt-0.5">Next 30 days</p>
              </div>
              <div className="p-3 rounded-lg bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60"><Calendar className="w-6 h-6" /></div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Anniversaries Today</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{stats.anniversary.today}</p>
                <p className="text-xs text-slate-400 mt-0.5">Milestone completions</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 text-amber-600"><Award className="w-6 h-6" /></div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Upcoming Anniversaries (30d)</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.anniversary.upcoming30d}</p>
                <p className="text-xs text-slate-400 mt-0.5">Years of service milestones</p>
              </div>
              <div className="p-3 rounded-lg bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60"><Award className="w-6 h-6" /></div>
            </div>
          </div>
        )}

        {activeTab === 'DOCUMENT_EXPIRY' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Monitored Documents</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.documentExpiry.total}</p>
                <p className="text-xs text-slate-400 mt-0.5">Passports, visas, contracts, certs</p>
              </div>
              <div className="p-3 rounded-lg bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60"><FileText className="w-6 h-6" /></div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Expiring Soon (&le; 30d)</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{stats.documentExpiry.expiringSoon}</p>
                <p className="text-xs text-slate-400 mt-0.5">Renewal notifications sent</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 text-amber-600"><Clock className="w-6 h-6" /></div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Overdue / Expired</p>
                <p className="text-2xl font-bold text-rose-600 mt-1">{stats.documentExpiry.expired}</p>
                <p className="text-xs text-slate-400 mt-0.5">Urgent renewal required</p>
              </div>
              <div className="p-3 rounded-lg bg-rose-50 text-rose-600"><AlertTriangle className="w-6 h-6" /></div>
            </div>
          </div>
        )}

        {activeTab === 'JOINING' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Joining Today</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.joining.today}</p>
                <p className="text-xs text-slate-400 mt-0.5">First day induction</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600"><UserPlus className="w-6 h-6" /></div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Upcoming Joiners</p>
                <p className="text-2xl font-bold text-orange-500 mt-1">{stats.joining.upcoming}</p>
                <p className="text-xs text-slate-400 mt-0.5">Pre-boarding underway</p>
              </div>
              <div className="p-3 rounded-lg bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60"><CalendarDays className="w-6 h-6" /></div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Onboarding Checklist Pending</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{stats.joining.onboardingPending}</p>
                <p className="text-xs text-slate-400 mt-0.5">Incomplete checklist tasks</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 text-amber-600"><ClipboardList className="w-6 h-6" /></div>
            </div>
          </div>
        )}

        {/* Filters & Search */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search employee, ID, document..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            {/* Department */}
            <div>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
              >
                <option value="All">All Departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
              >
                <option value="All">All Statuses</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="PENDING">Pending Action</option>
                <option value="EXPIRING_SOON">Expiring Soon</option>
                <option value="EXPIRED">Expired / Overdue</option>
                <option value="COMPLETED">Completed</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>

            {/* Celebrations Sub-filter */}
            {activeTab === 'CELEBRATIONS' ? (
              <div>
                <select
                  value={celebrationFilter}
                  onChange={(e) => setCelebrationFilter(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                >
                  <option value="ALL">All Celebrations</option>
                  <option value="BIRTHDAY">Birthdays Only</option>
                  <option value="ANNIVERSARY">Work Anniversaries Only</option>
                </select>
              </div>
            ) : (
              <div className="flex items-center text-xs text-slate-500 px-2">
                <span>Auto-refreshing with system notifications.</span>
              </div>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Employee</th>
                  <th className="py-3.5 px-4">Event / Alert</th>
                  <th className="py-3.5 px-4">Target Date</th>
                  <th className="py-3.5 px-4">Timeline</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2" />
                      Loading reminders...
                    </td>
                  </tr>
                ) : displayedReminders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                      No reminders or alerts found for this category.
                    </td>
                  </tr>
                ) : (
                  displayedReminders.map((rem) => (
                    <tr key={rem.id || rem._id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Employee */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          {rem.avatar ? (
                            <img
                              src={rem.avatar}
                              alt={rem.employeeName}
                              className="w-9 h-9 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 font-semibold flex items-center justify-center shrink-0 text-sm">
                              {(rem.employeeName || 'E').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-slate-900 leading-tight">{rem.employeeName}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {rem.employeeCode || rem.employeeId} &bull; {rem.department || 'General'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Event / Alert */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="flex items-center gap-1.5 font-medium text-slate-900">
                          {rem.category === 'PROBATION' && <Clock className="w-4 h-4 text-orange-500 shrink-0" />}
                          {rem.category === 'BIRTHDAY' && <Cake className="w-4 h-4 text-pink-500 shrink-0" />}
                          {rem.category === 'ANNIVERSARY' && <Award className="w-4 h-4 text-amber-500 shrink-0" />}
                          {rem.category === 'DOCUMENT_EXPIRY' && <FileText className="w-4 h-4 text-rose-500 shrink-0" />}
                          {rem.category === 'JOINING' && <UserPlus className="w-4 h-4 text-emerald-500 shrink-0" />}
                          <span className="truncate">{rem.title}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{rem.message}</p>
                      </td>

                      {/* Target Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs font-medium text-slate-900">
                        {rem.targetDate}
                      </td>

                      {/* Timeline */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderDaysBadge(rem.daysRemaining)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(rem.status, rem.daysRemaining)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Tab 1: Probation Actions */}
                          {rem.category === 'PROBATION' && (
                            <button
                              onClick={() => {
                                setSelectedReminder(rem);
                                setProbationAction('CONFIRM');
                                setProbationNote('');
                                setIsProbationModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-md text-xs font-medium text-orange-700 bg-[#FFF7ED] hover:bg-[#FFEDD5] border border-[#FED7AA] transition"
                            >
                              Review & Action
                            </button>
                          )}

                          {/* Tab 3: Document Renewal */}
                          {rem.category === 'DOCUMENT_EXPIRY' && (
                            <button
                              onClick={() => {
                                setSelectedReminder(rem);
                                setNewDocExpiryDate('');
                                setDocRenewNote('');
                                setIsDocModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
                            >
                              Renew Expiry
                            </button>
                          )}

                          {/* Tab 4: Onboarding Checklist */}
                          {rem.category === 'JOINING' && (
                            <button
                              onClick={() => {
                                setSelectedReminder(rem);
                                setActiveChecklist(rem.onboardingChecklist || []);
                                setOnboardingStatusSelect((rem.onboardingStatus as any) || 'IN_PROGRESS');
                                setIsOnboardingModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
                            >
                              Onboarding Checklist
                            </button>
                          )}

                          {/* Document View Link */}
                          {rem.documentUrl && (
                            <a
                              href={rem.documentUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="View Document File"
                              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
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
              Showing <span className="font-semibold text-slate-700">{displayedReminders.length}</span> of{' '}
              <span className="font-semibold text-slate-700">{totalCount}</span> reminders
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

      {/* MODAL 1: Probation Review & Action */}
      {isProbationModalOpen && selectedReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500" />
                Probation Review & Decision
              </h3>
              <button onClick={() => setIsProbationModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div>
                <p className="font-semibold text-slate-900">{selectedReminder.employeeName}</p>
                <p className="text-xs text-slate-500">
                  {selectedReminder.employeeCode || selectedReminder.employeeId} &bull; {selectedReminder.department}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Probation End Date: <strong>{selectedReminder.probationEndDate || selectedReminder.targetDate}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">Action to Take</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setProbationAction('CONFIRM')}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition ${
                      probationAction === 'CONFIRM'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-500 shadow-xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Confirm Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setProbationAction('EXTEND')}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition ${
                      probationAction === 'EXTEND'
                        ? 'bg-amber-50 text-amber-700 border-amber-500 shadow-xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Extend Period
                  </button>
                  <button
                    type="button"
                    onClick={() => setProbationAction('COMPLETE')}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition ${
                      probationAction === 'COMPLETE'
                        ? 'bg-orange-50 text-orange-700 border-orange-500 shadow-xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Mark Complete
                  </button>
                </div>
              </div>

              {probationAction === 'EXTEND' && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Extension Duration
                  </label>
                  <select
                    value={extensionMonths}
                    onChange={(e) => setExtensionMonths(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                  >
                    <option value={1}>Extend by 1 Month</option>
                    <option value={2}>Extend by 2 Months</option>
                    <option value={3}>Extend by 3 Months</option>
                    <option value={6}>Extend by 6 Months</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Review & Performance Note
                </label>
                <textarea
                  rows={3}
                  value={probationNote}
                  onChange={(e) => setProbationNote(e.target.value)}
                  placeholder="Enter comments on performance evaluation or extension justification..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsProbationModalOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-200/60 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmProbationAction}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 transition"
              >
                Confirm Decision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Document Renewal */}
      {isDocModalOpen && selectedReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-600" />
                Renew Document Expiry Date
              </h3>
              <button onClick={() => setIsDocModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div>
                <p className="font-semibold text-slate-900">{selectedReminder.documentTitle || 'Document'}</p>
                <p className="text-xs text-slate-500">
                  Employee: {selectedReminder.employeeName} ({selectedReminder.employeeCode || selectedReminder.employeeId})
                </p>
                <p className="text-xs text-rose-600 mt-1">
                  Current Expiry: <strong>{selectedReminder.targetDate}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  New Verified Expiry Date *
                </label>
                <input
                  type="date"
                  value={newDocExpiryDate}
                  onChange={(e) => setNewDocExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Renewal Note
                </label>
                <textarea
                  rows={2}
                  value={docRenewNote}
                  onChange={(e) => setDocRenewNote(e.target.value)}
                  placeholder="e.g., Verified new passport validity copy uploaded..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsDocModalOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-200/60 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDocRenew}
                disabled={!newDocExpiryDate}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50"
              >
                Save Renewal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Onboarding Checklist */}
      {isOnboardingModalOpen && selectedReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-orange-500" />
                New Joiner Onboarding Checklist
              </h3>
              <button onClick={() => setIsOnboardingModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <p className="font-semibold text-slate-900">{selectedReminder.employeeName}</p>
                  <p className="text-xs text-slate-500">
                    {selectedReminder.designation} &bull; {selectedReminder.department}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs uppercase font-semibold text-slate-400">Joining Date</span>
                  <p className="text-xs font-bold text-slate-900">{selectedReminder.targetDate}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
                  Onboarding Tasks Checklist
                </label>
                <div className="space-y-2">
                  {activeChecklist.map((item, idx) => (
                    <label
                      key={idx}
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={(e) => {
                          const updated = [...activeChecklist];
                          updated[idx].completed = e.target.checked;
                          setActiveChecklist(updated);
                        }}
                        className="w-4 h-4 text-orange-500 rounded border-slate-300 focus:ring-orange-500 focus:border-orange-500"
                      />
                      <span className={`text-sm ${item.completed ? 'line-through text-slate-400 font-normal' : 'text-slate-800 font-medium'}`}>
                        {item.task}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Overall Onboarding Status
                </label>
                <select
                  value={onboardingStatusSelect}
                  onChange={(e) => setOnboardingStatusSelect(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                >
                  <option value="PENDING">Pending (Pre-boarding)</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed (Fully Onboarded)</option>
                </select>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsOnboardingModalOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-200/60 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOnboarding}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 transition"
              >
                Save Onboarding Progress
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

