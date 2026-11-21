'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  Users,
  UserCheck,
  UserX,
  CalendarDays,
  Clock,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  Award,
  Target,
  Building2,
  Download,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Eye,
  Check,
  X,
  Radio,
  FileSpreadsheet,
  ChevronRight,
  Plus,
  Star,
  MessageSquare,
  Bell,
  Loader2,
  UserPlus,
  ArrowRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { formatRoleLabel } from '@/lib/roleUtils';
import { getCurrentPositionOnce } from '@/lib/clientGeo';
import { openCheckInDialog, openCheckOutDialog } from '@/components/attendance/checkInDialog';
import AddTeamMemberModal from '@/components/manager/AddTeamMemberModal';
import TeamMemberProfileModal from '@/components/manager/TeamMemberProfileModal';
import { OfficeMapModal } from '@/components/modals/OfficeMapModal';

interface TeamMember {
  id: string;
  employeeId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  department: string;
  designation: string;
  status: string;
  avatar: string;
  joiningDate?: string;
  rating?: number | null;
  reviewStatus?: string;
  completedGoals?: number;
  totalGoals?: number;
  todayAttendance: {
    status: string;
    checkIn: string;
    checkOut: string;
    workingHours: string;
  };
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  designation: string;
  department: string;
  avatar: string;
  date: string;
  checkIn: string;
  checkOut: string;
  workingHours: string;
  status: string;
}

interface ManagerSelf {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  role: string;
  isCheckedIn: boolean;
  isCheckedOut: boolean;
  clockIn: string | null;
  clockOut: string | null;
  workingHours: string;
  status: string;
  isTracking: boolean;
}

interface OfficeLocation {
  latitude: number;
  longitude: number;
  radius: number;
  name: string;
  geofenceEnabled: boolean;
  geofenceEnforce: boolean;
}

interface PendingLeaveItem {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  avatar: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  reason: string;
  requestedDate: string;
  status: string;
}

interface GoalsSummary {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  completionRate: number;
  recentGoals: Array<{
    id: string;
    title: string;
    employeeId: string;
    employeeName: string;
    status: string;
    metric: string;
    dueDate: string;
  }>;
}

interface UpcomingReview {
  id: string;
  employeeId: string;
  employeeName: string;
  reviewPeriod: string;
  dueDate: string;
  status: string;
}

interface DashboardData {
  manager: {
    name: string;
    email: string;
    role: string;
    employeeId: string;
    organizationId: string;
    department?: string;
    designation?: string;
  };
  managerAttendance: ManagerSelf;
  officeLocation: OfficeLocation;
  kpis: {
    totalTeamMembers: number;
    presentTodayCount: number;
    absentTodayCount: number;
    onLeaveTodayCount: number;
    lateArrivalsCount: number;
    pendingLeavesCount: number;
    attendanceRate: number;
    averageTeamRating: number;
    completedReviewsCount: number;
    totalGoalsCount: number;
    goalsCompletionRate: number;
    openHelpdeskCount: number;
  };
  todayAttendance: AttendanceRecord[];
  teamMembers: TeamMember[];
  pendingLeaves: PendingLeaveItem[];
  goalsSummary: GoalsSummary;
  upcomingReviews: UpcomingReview[];
  needsAttention: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    count: number;
    link: string;
    severity: 'high' | 'medium' | 'info';
  }>;
}

export default function ManagerDashboardPage() {
  const { user } = useAuthStore();

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Live IST Clock
  const [currentTime, setCurrentTime] = useState('');
  const [currentDateFormatted, setCurrentDateFormatted] = useState('');

  // Manager Self Attendance Actions
  const [isClocking, setIsClocking] = useState(false);
  const [isTrackingToggling, setIsTrackingToggling] = useState(false);

  // My Team Table Filters & Search
  const [teamSearch, setTeamSearch] = useState('');
  const [teamDeptFilter, setTeamDeptFilter] = useState('All');

  // Modals
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isOfficeMapOpen, setIsOfficeMapOpen] = useState(false);
  const [selectedProfileMember, setSelectedProfileMember] = useState<TeamMember | null>(null);
  const [actioningLeaveId, setActioningLeaveId] = useState<string | null>(null);
  const [rejectModalLeave, setRejectModalLeave] = useState<PendingLeaveItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Assign Goal Modal
  const [isAssignGoalOpen, setIsAssignGoalOpen] = useState(false);
  const [goalEmpId, setGoalEmpId] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalMetric, setGoalMetric] = useState('');
  const [goalPriority, setGoalPriority] = useState<'High' | 'Medium' | 'Low'>('High');
  const [goalDueDate, setGoalDueDate] = useState('');
  const [isSubmittingGoal, setIsSubmittingGoal] = useState(false);

  // Quick Appraisal Modal
  const [isAppraisalOpen, setIsAppraisalOpen] = useState(false);
  const [appraisalEmpId, setAppraisalEmpId] = useState('');
  const [appraisalRating, setAppraisalRating] = useState(5);
  const [appraisalPeriod, setAppraisalPeriod] = useState('Q4 2026');
  const [appraisalFeedback, setAppraisalFeedback] = useState('');
  const [isSubmittingAppraisal, setIsSubmittingAppraisal] = useState(false);

  // Application-wide background scroll lock while any manager dashboard inline modal is open
  useBodyScrollLock(Boolean(rejectModalLeave || isAssignGoalOpen || isAppraisalOpen));

  // Live IST Clock ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const istTime = now.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      const istDate = now.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      setCurrentTime(istTime);
      setCurrentDateFormatted(istDate);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setIsError(false);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/manager/dashboard');
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          setData(result.data);
          if (isManualRefresh) {
            showToast('Manager dashboard updated with live records.');
          }
        } else {
          setIsError(true);
          setErrorMessage(result.message || 'Failed to load manager dashboard.');
        }
      } else {
        setIsError(true);
        setErrorMessage('Server error fetching manager team records.');
      }
    } catch (err: any) {
      console.error('Error fetching manager dashboard:', err);
      setIsError(true);
      setErrorMessage(err.message || 'Network error fetching team records.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Handle Manager Self Check-In / Check-Out
    const handleManagerClock = async (action: 'CLOCK_IN' | 'CLOCK_OUT') => {
    setIsClocking(true);
    try {
      // Check In asks "Office or Work From Home" and checks the location; Check Out sends the location for the record
      const result = action === 'CLOCK_IN' ? await openCheckInDialog() : await openCheckOutDialog();
      if (!result) return; // dialog closed
      if (result.success) {
        if (action === 'CLOCK_IN') {
          fetch('/api/v1/tracking/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ consent: true }),
          }).catch(() => {});
        } else {
          fetch('/api/v1/tracking/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }).catch(() => {});
        }
        // Refresh first: the refresh shows its own toast, and the check-in message (e.g. Late / WFH pending) must stay visible
        await fetchDashboardData(true);
        showToast(result.message);
      } else {
        showToast(result.message || 'Failed to record attendance.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error recording attendance.', 'error');
    } finally {
      setIsClocking(false);
    }
  };

  // Handle Start / Stop Live Tracking
  const handleToggleTracking = async () => {
    if (!data?.managerAttendance.isCheckedIn) {
      showToast('Please check in first to activate shift live tracking.', 'error');
      return;
    }

    setIsTrackingToggling(true);
    const isCurrentlyTracking = data.managerAttendance.isTracking;

    try {
      const geo = await getCurrentPositionOnce(5000);
      const endpoint = isCurrentlyTracking ? '/api/v1/tracking/stop' : '/api/v1/tracking/start';
      const body = isCurrentlyTracking ? { ...(geo ? { geo } : {}) } : { consent: true, ...(geo ? { geo } : {}) };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const resData = await res.json();
      if (resData.success) {
        showToast(
          isCurrentlyTracking
            ? 'Live GPS tracking stopped.'
            : 'Live GPS tracking started. Location reporting active.'
        );
        fetchDashboardData(true);
      } else {
        showToast(resData.message || 'Tracking update failed.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error communicating with tracking service.', 'error');
    } finally {
      setIsTrackingToggling(false);
    }
  };

  // Handle Leave Approval
  const handleApproveLeave = async (leaveItem: PendingLeaveItem) => {
    setActioningLeaveId(leaveItem.id);
    setIsProcessingAction(true);
    try {
      const res = await fetch(`/api/v1/leave/${leaveItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'Approved' }),
      });
      const result = await res.json();
      if (result.success) {
        showToast(`Approved ${leaveItem.leaveType} for ${leaveItem.employeeName}.`);
        fetchDashboardData();
      } else {
        showToast(result.message || 'Failed to approve leave request.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Network error approving leave.', 'error');
    } finally {
      setActioningLeaveId(null);
      setIsProcessingAction(false);
    }
  };

  // Handle Leave Rejection
  const handleConfirmRejectLeave = async () => {
    if (!rejectModalLeave || !rejectionReason.trim()) {
      showToast('Please provide a reason for rejection.', 'error');
      return;
    }

    setIsProcessingAction(true);
    try {
      const res = await fetch(`/api/v1/leave/${rejectModalLeave.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'Rejected',
          rejectionReason: rejectionReason.trim(),
        }),
      });
      const result = await res.json();
      if (result.success) {
        showToast(`Rejected leave request for ${rejectModalLeave.employeeName}.`);
        setRejectModalLeave(null);
        setRejectionReason('');
        fetchDashboardData();
      } else {
        showToast(result.message || 'Failed to reject leave request.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error communicating with server.', 'error');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Handle Assign Goal Submission
  const handleAssignGoalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalEmpId || !goalTitle.trim()) {
      showToast('Please select an employee and specify a goal title.', 'error');
      return;
    }

    setIsSubmittingGoal(true);
    try {
      const res = await fetch('/api/v1/manager/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ASSIGN_GOAL',
          employeeId: goalEmpId,
          title: goalTitle.trim(),
          metric: goalMetric.trim() || 'Deliver target milestones',
          priority: goalPriority,
          dueDate: goalDueDate || undefined,
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        showToast(resData.message || 'Goal assigned successfully.');
        setIsAssignGoalOpen(false);
        setGoalTitle('');
        setGoalMetric('');
        fetchDashboardData(true);
      } else {
        showToast(resData.message || 'Failed to assign goal.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error assigning goal.', 'error');
    } finally {
      setIsSubmittingGoal(false);
    }
  };

  // Handle Quick Appraisal Submission
  const handleAppraisalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appraisalEmpId) {
      showToast('Please select a team member to evaluate.', 'error');
      return;
    }

    setIsSubmittingAppraisal(true);
    try {
      const res = await fetch('/api/v1/manager/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SUBMIT_EVALUATION',
          employeeId: appraisalEmpId,
          overallRating: appraisalRating,
          reviewPeriod: appraisalPeriod,
          feedback: appraisalFeedback.trim() || 'Meets expectations for current cycle.',
          status: 'Completed',
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        showToast(resData.message || 'Performance appraisal saved successfully.');
        setIsAppraisalOpen(false);
        setAppraisalFeedback('');
        fetchDashboardData(true);
      } else {
        showToast(resData.message || 'Failed to submit appraisal.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error submitting appraisal.', 'error');
    } finally {
      setIsSubmittingAppraisal(false);
    }
  };

  // Export Team Report to CSV
  const handleExportTeamReport = () => {
    if (!data) return;
    const dateStr = new Date().toISOString().split('T')[0];
    const rows = [
      ['InfinitiveCloud EMS - Manager Team Operations Report'],
      ['Manager', data.manager.name, 'Employee ID', data.manager.employeeId, 'Date', dateStr],
      ['Total Team Members', data.kpis.totalTeamMembers, 'Present Today', data.kpis.presentTodayCount, 'Attendance Rate', `${data.kpis.attendanceRate}%`],
      [],
      ['Employee ID', 'Name', 'Department', 'Designation', 'Status', 'Attendance Today', 'Clock In', 'Clock Out', 'Working Hours', 'Rating', 'Total Goals'],
    ];

    data.teamMembers.forEach((m) => {
      rows.push([
        m.employeeId,
        m.name,
        m.department,
        m.designation,
        m.status,
        m.todayAttendance.status,
        m.todayAttendance.checkIn,
        m.todayAttendance.checkOut,
        m.todayAttendance.workingHours,
        m.rating ? `${m.rating} / 5.0` : 'Not Rated',
        `${m.completedGoals || 0} / ${m.totalGoals || 0}`,
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.map((val) => `"${val}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Manager_Team_Report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Team report exported successfully.');
  };

  // Filtered Team Members for Directory
  const filteredTeamMembers = useMemo(() => {
    if (!data?.teamMembers) return [];
    return data.teamMembers.filter((m) => {
      const matchSearch =
        teamSearch === '' ||
        m.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
        m.employeeId.toLowerCase().includes(teamSearch.toLowerCase()) ||
        m.department.toLowerCase().includes(teamSearch.toLowerCase()) ||
        m.designation.toLowerCase().includes(teamSearch.toLowerCase());
      const matchDept = teamDeptFilter === 'All' || m.department === teamDeptFilter;
      return matchSearch && matchDept;
    });
  }, [data?.teamMembers, teamSearch, teamDeptFilter]);

  // Available unique departments
  const uniqueDepartments = useMemo(() => {
    if (!data?.teamMembers) return [];
    const depts = new Set<string>();
    data.teamMembers.forEach((m) => {
      if (m.department) depts.add(m.department);
    });
    return Array.from(depts);
  }, [data?.teamMembers]);

  const activeManagerName = user?.name || data?.manager.name || 'Manager';
  const activeManagerRole = formatRoleLabel(data?.manager.role || user?.role || 'MANAGER');

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Feedback */}
      {toastMessage && (
        <div
          className={`fixed right-6 top-20 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold text-white shadow-2xl animate-fade-in ${
            toastType === 'success' ? 'bg-slate-900 border border-emerald-500/40' : 'bg-rose-950 border border-rose-500/40'
          }`}
        >
          {toastType === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Welcome Greeting Banner (Matches Admin WelcomeSection) */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              Welcome back, {activeManagerName}
            </h1>
            <span className="text-xl">👋</span>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-200">
              {activeManagerRole}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Manage your team attendance, leave approvals, goals, and appraisals in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Live IST Clock Pill */}
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono">{currentTime || '04:00:00 PM'} IST</span>
          </div>

          {/* Add Team Member Button */}
          <button
            onClick={() => setIsAddMemberOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Add Member</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => fetchDashboardData(true)}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing || isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Export Report Button */}
          <button
            onClick={handleExportTeamReport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
            title="Export Team Report CSV"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {isError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMessage || 'Unable to load manager team records.'}</span>
          </div>
          <button
            onClick={() => fetchDashboardData(true)}
            className="rounded-xl bg-rose-600 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-rose-700 transition-all cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Skeleton Loading State */}
      {isLoading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-slate-200/80" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 h-72 rounded-2xl bg-slate-200/80" />
            <div className="lg:col-span-5 h-72 rounded-2xl bg-slate-200/80" />
          </div>
        </div>
      ) : (
        <>
          {/* 2. Top 4 Clean Stat Cards (Matches Admin StatCard pattern) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Team */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Team
                </span>
                <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600 border border-indigo-100">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-slate-900 tracking-tight">
                  {data?.kpis.totalTeamMembers || 0}
                </p>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  Direct reports assigned
                </p>
              </div>
            </div>

            {/* Present Today */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Present Today
                </span>
                <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 border border-emerald-100">
                  <UserCheck className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-slate-900 tracking-tight">
                  {data?.kpis.presentTodayCount || 0}
                </p>
                <p className="text-xs font-medium text-emerald-600 mt-0.5">
                  {data?.kpis.attendanceRate || 0}% attendance rate
                </p>
              </div>
            </div>

            {/* Pending Leaves */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Pending Leaves
                </span>
                <div className="rounded-xl bg-amber-50 p-2 text-amber-600 border border-amber-100">
                  <CalendarDays className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-slate-900 tracking-tight">
                  {data?.kpis.pendingLeavesCount || 0}
                </p>
                <p className="text-xs font-medium text-amber-600 mt-0.5">
                  Requires manager review
                </p>
              </div>
            </div>

            {/* Team Performance */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Team Performance
                </span>
                <div className="rounded-xl bg-purple-50 p-2 text-purple-600 border border-purple-100">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-900 tracking-tight">
                    {(data?.kpis.averageTeamRating || 4.5).toFixed(1)}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">/ 5.0</span>
                </div>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  {data?.kpis.goalsCompletionRate || 0}% goals completed
                </p>
              </div>
            </div>
          </div>

          {/* 3. Main Workspace Row 1 (12 Columns) */}
          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
            {/* Left (7 Cols): Manager Live Attendance & Team Status */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-7 flex flex-col justify-between space-y-5 min-h-0 min-w-0">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">Shift Attendance & Tracking</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOfficeMapOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-700 hover:text-indigo-900 font-semibold bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1 rounded-lg border border-indigo-200/80 transition-colors cursor-pointer"
                    title="Click to view office location and geofence map"
                  >
                    <MapPin className="h-3.5 w-3.5 text-indigo-600" />
                    <span>{data?.officeLocation.name || 'Office HQ'}</span>
                    <span className="text-[10px] text-indigo-500 font-bold">· Show Map</span>
                  </button>
                </div>

                {/* Manager Punch Stats */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold mt-1 ${
                        data?.managerAttendance.isCheckedIn
                          ? data.managerAttendance.isCheckedOut
                            ? 'text-purple-700'
                            : 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          data?.managerAttendance.isCheckedIn
                            ? data.managerAttendance.isCheckedOut
                              ? 'bg-purple-600'
                              : 'bg-emerald-600 animate-pulse'
                            : 'bg-amber-500'
                        }`}
                      />
                      {data?.managerAttendance.status || 'Not Marked'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Clock In</span>
                    <span className="text-xs font-semibold text-slate-800 font-mono mt-1 block">
                      {data?.managerAttendance.clockIn || '--:--'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Clock Out</span>
                    <span className="text-xs font-semibold text-slate-800 font-mono mt-1 block">
                      {data?.managerAttendance.clockOut || '--:--'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Work Hours</span>
                    <span className="text-xs font-bold text-indigo-700 font-mono mt-1 block">
                      {data?.managerAttendance.workingHours || '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Punch & Live Tracking Action Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  {!data?.managerAttendance.isCheckedIn ? (
                    <button
                      onClick={() => handleManagerClock('CLOCK_IN')}
                      disabled={isClocking}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isClocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      <span>Clock In (Self)</span>
                    </button>
                  ) : !data.managerAttendance.isCheckedOut ? (
                    <button
                      onClick={() => handleManagerClock('CLOCK_OUT')}
                      disabled={isClocking}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isClocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                      <span>Clock Out (Self)</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Shift Completed</span>
                    </span>
                  )}

                  <button
                    onClick={handleToggleTracking}
                    disabled={isTrackingToggling || !data?.managerAttendance.isCheckedIn}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 border ${
                      data?.managerAttendance.isTracking
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {isTrackingToggling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Radio className={`h-3.5 w-3.5 ${data?.managerAttendance.isTracking ? 'text-white' : 'text-slate-500'}`} />
                    )}
                    <span>{data?.managerAttendance.isTracking ? 'Tracking Active' : 'Start Tracking'}</span>
                  </button>
                </div>

                {/* Quick Team Status Chips */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-medium">Team Today:</span>
                  <span className="font-semibold text-emerald-600">{data?.kpis.presentTodayCount || 0} Present</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-semibold text-amber-600">{data?.kpis.lateArrivalsCount || 0} Late</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-semibold text-blue-600">{data?.kpis.onLeaveTodayCount || 0} Leave</span>
                </div>
              </div>
            </div>

            {/* Right (5 Cols): Pending Leave Approvals */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-5 flex flex-col justify-between min-h-0 min-w-0" id="pending-leaves-section">
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">Pending Leave Approvals</h3>
                    {data?.pendingLeaves && data.pendingLeaves.length > 0 && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                        {data.pendingLeaves.length}
                      </span>
                    )}
                  </div>
                  <Link
                    href="/manager/leave"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors shrink-0"
                  >
                    <span>View All</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {/* List of Pending Leaves */}
                {!data?.pendingLeaves || data.pendingLeaves.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400 space-y-1 flex-1 flex flex-col items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto" />
                    <p className="font-semibold text-slate-700">All caught up!</p>
                    <p>No leave requests awaiting your review.</p>
                  </div>
                ) : (
                  <div
                    className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1.5 max-h-[380px]"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    {data.pendingLeaves.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={item.avatar}
                              alt={item.employeeName}
                              className="h-7 w-7 rounded-full object-cover border border-slate-200"
                            />
                            <div>
                              <p className="text-xs font-bold text-slate-900">{item.employeeName}</p>
                              <p className="text-[10px] text-slate-500 font-medium">{item.leaveType} • {item.durationDays} {item.durationDays === 1 ? 'day' : 'days'}</p>
                            </div>
                          </div>
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                            Pending
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-1 italic">
                          &quot;{item.reason}&quot;
                        </p>

                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200/60">
                          <button
                            onClick={() => {
                              setRejectModalLeave(item);
                              setRejectionReason('');
                            }}
                            disabled={isProcessingAction && actioningLeaveId === item.id}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleApproveLeave(item)}
                            disabled={isProcessingAction && actioningLeaveId === item.id}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
                          >
                            {actioningLeaveId === item.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              'Approve'
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Main Workspace Row 2 (12 Columns) */}
          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
            {/* Left (7 Cols): My Team Directory Table */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs lg:col-span-7 flex flex-col justify-between overflow-hidden min-h-0 min-w-0">
              <div className="flex flex-col flex-1 min-h-0">
                {/* Table Header Controls */}
                <div className="border-b border-slate-100 p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">My Team Directory</h3>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                      {filteredTeamMembers.length}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search team member..."
                        value={teamSearch}
                        onChange={(e) => setTeamSearch(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-slate-50 py-1 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-indigo-500 w-36 sm:w-44 font-medium"
                      />
                    </div>

                    {uniqueDepartments.length > 0 && (
                      <select
                        value={teamDeptFilter}
                        onChange={(e) => setTeamDeptFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 font-medium focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="All">All Departments</option>
                        {uniqueDepartments.map((dept) => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Data Table with subtle internal scroll and sticky header */}
                <div
                  className="overflow-x-auto min-h-0 flex-1 max-h-[380px] overflow-y-auto overscroll-contain"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Role & Dept</th>
                        <th className="py-3 px-4">Status Today</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredTeamMembers.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            No team members found.
                          </td>
                        </tr>
                      ) : (
                        filteredTeamMembers.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={emp.avatar}
                                  alt={emp.name}
                                  className="h-8 w-8 rounded-full object-cover border border-slate-200 shrink-0"
                                />
                                <div>
                                  <p className="font-bold text-slate-900 leading-tight">{emp.name}</p>
                                  <p className="font-mono text-[10px] text-slate-400">{emp.employeeId}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-semibold text-slate-800 leading-tight">{emp.designation}</p>
                              <p className="text-[11px] text-slate-500">{emp.department}</p>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                  emp.todayAttendance.status === 'Present'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : emp.todayAttendance.status === 'On Leave'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : emp.todayAttendance.status === 'Late'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {emp.todayAttendance.status || 'Not Marked'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => setSelectedProfileMember(emp)}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t border-slate-100 p-3 bg-slate-50/50 flex items-center justify-between shrink-0">
                <span className="text-[11px] text-slate-500">
                  Showing {filteredTeamMembers.length} team members
                </span>
                <Link
                  href="/manager/team"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  <span>Go to My Team</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Right (5 Cols): Goals & Appraisals Summary */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-5 flex flex-col justify-between space-y-4 min-h-0 min-w-0">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">Performance & Goals</h3>
                  </div>
                  <Link
                    href="/manager/performance"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    <span>Details</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {/* Goals Completion Bar */}
                <div className="mt-4 p-4 rounded-xl bg-slate-50/70 border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-600">Goal Completion Rate</span>
                    <span className="font-bold text-indigo-700">
                      {data?.goalsSummary.completionRate || 0}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${data?.goalsSummary.completionRate || 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>{data?.goalsSummary.completed || 0} completed</span>
                    <span>{data?.goalsSummary.total || 0} total goals</span>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => setIsAssignGoalOpen(true)}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50 hover:border-indigo-300 transition-colors cursor-pointer group"
                  >
                    <Plus className="h-4 w-4 text-indigo-600 mb-1 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-slate-800">Assign Goal</p>
                    <p className="text-[10px] text-slate-500">Set team member targets</p>
                  </button>

                  <button
                    onClick={() => setIsAppraisalOpen(true)}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50 hover:border-purple-300 transition-colors cursor-pointer group"
                  >
                    <Award className="h-4 w-4 text-purple-600 mb-1 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-slate-800">Record Appraisal</p>
                    <p className="text-[10px] text-slate-500">Submit quarterly rating</p>
                  </button>
                </div>
              </div>

              {/* Reviews Summary */}
              <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs text-slate-500">
                <span>Reviews Completed this Cycle:</span>
                <span className="font-bold text-slate-900">
                  {data?.kpis.completedReviewsCount || 0}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* MODAL 1: Add Team Member Modal */}
      <AddTeamMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        onSuccess={() => fetchDashboardData(true)}
      />

      {/* MODAL 2: Team Member Profile Modal */}
      {selectedProfileMember && (
        <TeamMemberProfileModal
          member={selectedProfileMember as any}
          managerName={activeManagerName}
          onClose={() => setSelectedProfileMember(null)}
        />
      )}

      {/* MODAL 3: Rejection Reason Confirmation Modal */}
      {rejectModalLeave && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Reject Leave Request
              </h3>
              <button
                onClick={() => setRejectModalLeave(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Provide a clear reason for rejecting the leave request from{' '}
              <span className="font-bold text-slate-900">{rejectModalLeave.employeeName}</span>.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Rejection *
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Critical project deadline or overlap with sprint release..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setRejectModalLeave(null)}
                disabled={isProcessingAction}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRejectLeave}
                disabled={isProcessingAction || !rejectionReason.trim()}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors disabled:opacity-50"
              >
                {isProcessingAction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* MODAL 4: Assign Goal Modal */}
      {isAssignGoalOpen && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Assign Goal to Team Member
              </h3>
              <button
                onClick={() => setIsAssignGoalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAssignGoalSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Team Member *
                </label>
                <select
                  value={goalEmpId}
                  onChange={(e) => setGoalEmpId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  required
                >
                  <option value="">Select an employee...</option>
                  {(data?.teamMembers || []).map((m) => (
                    <option key={m.employeeId} value={m.employeeId}>
                      {m.name} ({m.employeeId}) - {m.designation}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Goal Title *
                </label>
                <input
                  type="text"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="e.g. Complete AWS Certification, Optimize DB indexing..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Target Metric / Deliverable
                </label>
                <input
                  type="text"
                  value={goalMetric}
                  onChange={(e) => setGoalMetric(e.target.value)}
                  placeholder="e.g. 95% pass rate or by end of sprint"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={goalPriority}
                    onChange={(e) => setGoalPriority(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={goalDueDate}
                    onChange={(e) => setGoalDueDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssignGoalOpen(false)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingGoal}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 font-semibold text-white shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmittingGoal ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* MODAL 5: Quick Appraisal Modal */}
      {isAppraisalOpen && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Record Performance Appraisal
              </h3>
              <button
                onClick={() => setIsAppraisalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAppraisalSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Team Member *
                </label>
                <select
                  value={appraisalEmpId}
                  onChange={(e) => setAppraisalEmpId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  required
                >
                  <option value="">Select an employee...</option>
                  {(data?.teamMembers || []).map((m) => (
                    <option key={m.employeeId} value={m.employeeId}>
                      {m.name} ({m.employeeId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Rating (1 - 5 Stars) *
                  </label>
                  <select
                    value={appraisalRating}
                    onChange={(e) => setAppraisalRating(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value={5}>5 - Outstanding</option>
                    <option value={4}>4 - Exceeds Expectations</option>
                    <option value={3}>3 - Meets Expectations</option>
                    <option value={2}>2 - Needs Improvement</option>
                    <option value={1}>1 - Unsatisfactory</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Review Period *
                  </label>
                  <input
                    type="text"
                    value={appraisalPeriod}
                    onChange={(e) => setAppraisalPeriod(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Manager Feedback & Comments
                </label>
                <textarea
                  rows={3}
                  value={appraisalFeedback}
                  onChange={(e) => setAppraisalFeedback(e.target.value)}
                  placeholder="Summarize key strengths and goals for the next review cycle..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAppraisalOpen(false)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAppraisal}
                  className="rounded-xl bg-purple-600 hover:bg-purple-700 px-4 py-2 font-semibold text-white shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmittingAppraisal ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Appraisal'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* Office Location & Geofence Modal */}
      <OfficeMapModal
        isOpen={isOfficeMapOpen}
        onClose={() => setIsOfficeMapOpen(false)}
        officeLocation={
          data?.officeLocation
            ? {
                lat: data.officeLocation.latitude,
                lng: data.officeLocation.longitude,
                radiusMeters: data.officeLocation.radius,
                name: data.officeLocation.name,
                geofenceEnabled: data.officeLocation.geofenceEnabled,
                geofenceEnforce: data.officeLocation.geofenceEnforce,
              }
            : null
        }
        title={`${data?.officeLocation.name || 'Head Office HQ'} · Geofence & Location Map`}
        onRefresh={() => fetchDashboardData(true)}
        isRefreshing={isRefreshing}
      />
    </div>
  );
}
