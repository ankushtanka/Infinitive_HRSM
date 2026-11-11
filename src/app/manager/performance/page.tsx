'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Star,
  Target,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Plus,
  Award,
  ChevronLeft,
  ChevronRight,
  FileText,
  X,
  Loader2,
  Building2,
  Check,
  Download,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface PerformanceGoal {
  title: string;
  description?: string;
  target?: string;
  progress?: number;
  status?: string;
  dueDate?: string;
  priority?: string;
}

interface PerformanceReview {
  id: string;
  reviewId: string;
  employeeId: string;
  employeeName: string;
  email: string;
  department: string;
  designation: string;
  photoUrl?: string | null;
  reviewer: string;
  reviewPeriod: string;
  reviewDate: string;
  rating: number;
  feedback: string;
  selfAssessment?: string;
  strengths?: string;
  improvements?: string;
  status: 'Completed' | 'Pending' | 'In Progress' | 'Submitted' | 'Draft' | string;
  goals: PerformanceGoal[];
  goalsCount: number;
  goalsCompletedCount: number;
}

interface TeamMemberOption {
  employeeId: string;
  name: string;
  department: string;
  designation: string;
}

interface PerformanceKPIs {
  totalTeamMembers: number;
  activeReviewsCount: number;
  completedReviewsCount: number;
  pendingReviewsCount: number;
  averagePerformanceScore: number;
  totalGoalsCount: number;
  goalsCompletedCount: number;
  goalsCompletionRate: number;
}

export default function ManagerPerformancePage() {
  const { user } = useAuthStore();

  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [kpis, setKpis] = useState<PerformanceKPIs>({
    totalTeamMembers: 0,
    activeReviewsCount: 0,
    completedReviewsCount: 0,
    pendingReviewsCount: 0,
    averagePerformanceScore: 0,
    totalGoalsCount: 0,
    goalsCompletedCount: 0,
    goalsCompletionRate: 0,
  });

  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [availableReviewPeriods, setAvailableReviewPeriods] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [reviewPeriodFilter, setReviewPeriodFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });

  // Modals
  const [selectedReview, setSelectedReview] = useState<PerformanceReview | null>(null);
  const [isAppraisalModalOpen, setIsAppraisalModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);

  // Application-wide background scroll lock while manager performance modal is open
  useBodyScrollLock(Boolean(selectedReview || isAppraisalModalOpen || isGoalModalOpen));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Appraisal Form State
  const [appraisalForm, setAppraisalForm] = useState({
    employeeId: '',
    reviewPeriod: 'Q4 2026',
    rating: 4,
    feedback: '',
    strengths: '',
    improvements: '',
    status: 'Completed',
  });

  // Goal Form State
  const [goalForm, setGoalForm] = useState({
    employeeId: '',
    title: '',
    metric: '',
    priority: 'High',
    dueDate: '',
  });

  const fetchPerformanceData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: '10',
        search: search.trim(),
        status: statusFilter,
        reviewPeriod: reviewPeriodFilter,
        department: departmentFilter,
      });

      const res = await fetch(`/api/v1/manager/performance?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access Denied: You do not have permission to view team performance.');
        }
        throw new Error(`Failed to load team performance (HTTP ${res.status}).`);
      }

      const json = await res.json();
      if (json.success && json.data) {
        setReviews(json.data.reviews || []);
        if (json.data.kpis) setKpis(json.data.kpis);
        if (json.data.teamMembers) setTeamMembers(json.data.teamMembers);
        if (json.data.pagination) setPagination(json.data.pagination);

        if (json.data.filters) {
          if (json.data.filters.departments) setAvailableDepartments(json.data.filters.departments);
          if (json.data.filters.reviewPeriods) setAvailableReviewPeriods(json.data.filters.reviewPeriods);
        }
      } else {
        throw new Error(json.message || 'Failed to parse performance records.');
      }
    } catch (err: any) {
      console.error('Error fetching manager performance data:', err);
      setErrorMsg(err.message || 'Unable to connect to server.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentPage, search, statusFilter, reviewPeriodFilter, departmentFilter]);

  useEffect(() => {
    fetchPerformanceData();
  }, [fetchPerformanceData]);

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('All');
    setReviewPeriodFilter('All');
    setDepartmentFilter('All');
    setCurrentPage(1);
  };

  const handleApplyFilters = () => {
    setCurrentPage(1);
    fetchPerformanceData();
  };

  const handleSubmitAppraisal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appraisalForm.employeeId) {
      setFeedbackMsg({ type: 'error', text: 'Please select an employee.' });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/v1/manager/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SUBMIT_EVALUATION',
          employeeId: appraisalForm.employeeId,
          overallRating: appraisalForm.rating,
          reviewPeriod: appraisalForm.reviewPeriod,
          feedback: appraisalForm.feedback.trim() || 'Meets standard expectations for current review cycle.',
          strengths: appraisalForm.strengths.trim(),
          improvements: appraisalForm.improvements.trim(),
          status: 'Completed',
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFeedbackMsg({ type: 'success', text: json.message || 'Performance appraisal recorded successfully.' });
        setIsAppraisalModalOpen(false);
        setAppraisalForm({
          employeeId: '',
          reviewPeriod: 'Q4 2026',
          rating: 4,
          feedback: '',
          strengths: '',
          improvements: '',
          status: 'Completed',
        });
        fetchPerformanceData(true);
      } else {
        throw new Error(json.message || 'Failed to save appraisal.');
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error saving appraisal.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalForm.employeeId || !goalForm.title.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Please specify an employee and goal title.' });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/v1/manager/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ASSIGN_GOAL',
          employeeId: goalForm.employeeId,
          title: goalForm.title.trim(),
          metric: goalForm.metric.trim() || 'Deliver assigned targets',
          priority: goalForm.priority,
          dueDate: goalForm.dueDate || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFeedbackMsg({ type: 'success', text: json.message || 'Goal assigned successfully.' });
        setIsGoalModalOpen(false);
        setGoalForm({
          employeeId: '',
          title: '',
          metric: '',
          priority: 'High',
          dueDate: '',
        });
        fetchPerformanceData(true);
      } else {
        throw new Error(json.message || 'Failed to assign goal.');
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error assigning goal.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'in progress':
      case 'in_progress':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'submitted':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'pending':
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Team Performance & Reviews
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Conduct appraisals, track quarterly deliverables, and guide employee growth.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsAppraisalModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
          >
            <Award className="h-4 w-4" />
            <span>Record Appraisal</span>
          </button>

          <button
            onClick={() => setIsGoalModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Target className="h-4 w-4 text-indigo-600" />
            <span>Assign Goal</span>
          </button>

          <button
            onClick={() => fetchPerformanceData(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh Performance Records"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
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

      {/* Error Alert */}
      {errorMsg && (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => fetchPerformanceData()}
            className="rounded-lg bg-rose-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-rose-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. Top 4 Clean KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Completed Reviews */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Completed Reviews
            </span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 border border-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {isLoading ? '...' : kpis.completedReviewsCount}
            </p>
            <p className="text-xs font-medium text-emerald-600 mt-0.5">
              Appraisals finalized
            </p>
          </div>
        </div>

        {/* Pending Appraisals */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pending Appraisals
            </span>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600 border border-amber-100">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-amber-600 tracking-tight">
              {isLoading ? '...' : kpis.pendingReviewsCount}
            </p>
            <p className="text-xs font-medium text-amber-700/80 mt-0.5">
              Awaiting manager evaluation
            </p>
          </div>
        </div>

        {/* Average Rating */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Team Average Rating
            </span>
            <div className="rounded-xl bg-purple-50 p-2 text-purple-600 border border-purple-100">
              <Star className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {(kpis.averagePerformanceScore || 4.2).toFixed(1)}
              </span>
              <span className="text-xs font-semibold text-slate-400">/ 5.0</span>
            </div>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Across direct reports
            </p>
          </div>
        </div>

        {/* Goals Completed */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Goals Completion Rate
            </span>
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600 border border-indigo-100">
              <Target className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {isLoading ? '...' : `${kpis.goalsCompletionRate || 0}%`}
            </p>
            <p className="text-xs font-medium text-indigo-600 mt-0.5">
              {kpis.goalsCompletedCount} of {kpis.totalGoalsCount} completed
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
            <option value="Completed">Completed</option>
            <option value="In Progress">In Progress</option>
            <option value="Pending">Pending</option>
          </select>

          {availableReviewPeriods.length > 0 && (
            <select
              value={reviewPeriodFilter}
              onChange={(e) => setReviewPeriodFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer min-w-[140px]"
            >
              <option value="All">All Periods</option>
              {availableReviewPeriods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}

          {availableDepartments.length > 0 && (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer min-w-[140px]"
            >
              <option value="All">All Departments</option>
              {availableDepartments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}

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

      {/* 4. Performance Reviews Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">EMPLOYEE</th>
                <th className="py-3 px-4">ROLE & DEPT</th>
                <th className="py-3 px-4">REVIEW CYCLE</th>
                <th className="py-3 px-4">RATING</th>
                <th className="py-3 px-4">GOALS PROGRESS</th>
                <th className="py-3 px-4">STATUS</th>
                <th className="py-3 pr-4 pl-2 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="py-4 px-4 text-center">
                      <div className="h-6 bg-slate-100 rounded-lg w-full" />
                    </td>
                  </tr>
                ))
              ) : reviews.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Award className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No performance records found</p>
                    <p className="text-xs text-slate-400 mt-1">Record a new appraisal or assign goals to your team.</p>
                  </td>
                </tr>
              ) : (
                reviews.map((rev) => (
                  <tr key={rev.id || rev.reviewId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        {rev.photoUrl ? (
                          <img
                            src={rev.photoUrl}
                            alt={rev.employeeName}
                            className="h-8 w-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs border border-indigo-100">
                            {rev.employeeName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 leading-tight truncate">
                            {rev.employeeName}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                            {rev.employeeId}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800 leading-tight">{rev.designation}</p>
                      <p className="text-[11px] text-slate-500">{rev.department}</p>
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      {rev.reviewPeriod}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                        <span>{(rev.rating || 0).toFixed(1)}</span>
                        <span className="text-[10px] text-slate-400">/ 5.0</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full"
                            style={{
                              width: `${rev.goalsCount > 0 ? (rev.goalsCompletedCount / rev.goalsCount) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-[11px] text-slate-600 font-mono">
                          {rev.goalsCompletedCount}/{rev.goalsCount}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${getStatusBadge(
                          rev.status
                        )}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {rev.status}
                      </span>
                    </td>

                    <td className="py-3.5 pr-4 pl-2 text-right">
                      <button
                        onClick={() => setSelectedReview(rev)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
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
              of <span className="font-semibold text-slate-700">{pagination.total}</span> reviews
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

      {/* MODAL 1: Record Appraisal Modal */}
      {isAppraisalModalOpen && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Record Performance Appraisal
              </h3>
              <button
                onClick={() => setIsAppraisalModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAppraisal} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Team Member *
                </label>
                <select
                  value={appraisalForm.employeeId}
                  onChange={(e) => setAppraisalForm({ ...appraisalForm, employeeId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  required
                >
                  <option value="">Select team member...</option>
                  {teamMembers.map((m) => (
                    <option key={m.employeeId} value={m.employeeId}>
                      {m.name} ({m.employeeId}) - {m.designation}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Rating (1 to 5 Stars) *
                  </label>
                  <select
                    value={appraisalForm.rating}
                    onChange={(e) => setAppraisalForm({ ...appraisalForm, rating: Number(e.target.value) })}
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
                    value={appraisalForm.reviewPeriod}
                    onChange={(e) => setAppraisalForm({ ...appraisalForm, reviewPeriod: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Key Strengths
                </label>
                <input
                  type="text"
                  value={appraisalForm.strengths}
                  onChange={(e) => setAppraisalForm({ ...appraisalForm, strengths: e.target.value })}
                  placeholder="e.g. Reliable delivery, proactive communication..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Manager Feedback & Summary
                </label>
                <textarea
                  rows={3}
                  value={appraisalForm.feedback}
                  onChange={(e) => setAppraisalForm({ ...appraisalForm, feedback: e.target.value })}
                  placeholder="Provide detailed feedback on goals and contributions..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAppraisalModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 font-semibold text-white shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Appraisal'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* MODAL 2: Assign Goal Modal */}
      {isGoalModalOpen && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Assign Team Member Goal
              </h3>
              <button
                onClick={() => setIsGoalModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitGoal} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Team Member *
                </label>
                <select
                  value={goalForm.employeeId}
                  onChange={(e) => setGoalForm({ ...goalForm, employeeId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  required
                >
                  <option value="">Select team member...</option>
                  {teamMembers.map((m) => (
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
                  value={goalForm.title}
                  onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                  placeholder="e.g. Optimize API response latency by 20%..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Target Metric
                </label>
                <input
                  type="text"
                  value={goalForm.metric}
                  onChange={(e) => setGoalForm({ ...goalForm, metric: e.target.value })}
                  placeholder="e.g. Sub-200ms p95 latency across endpoints"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={goalForm.priority}
                    onChange={(e) => setGoalForm({ ...goalForm, priority: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Target Completion Date
                  </label>
                  <input
                    type="date"
                    value={goalForm.dueDate}
                    onChange={(e) => setGoalForm({ ...goalForm, dueDate: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsGoalModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 font-semibold text-white shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* MODAL 3: Review Details Modal */}
      {selectedReview && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Performance Evaluation Details
              </h3>
              <button
                onClick={() => setSelectedReview(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                  {selectedReview.employeeName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{selectedReview.employeeName}</p>
                  <p className="text-[11px] text-slate-500">{selectedReview.employeeId} • {selectedReview.designation}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Review Period</span>
                  <span className="font-bold text-slate-800">{selectedReview.reviewPeriod}</span>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Overall Rating</span>
                  <div className="flex items-center gap-1 font-bold text-amber-600 mt-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                    <span>{(selectedReview.rating || 0).toFixed(1)} / 5.0</span>
                  </div>
                </div>
              </div>

              {selectedReview.feedback && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-700">
                  <span className="font-bold text-slate-800 block mb-1">Manager Feedback:</span>
                  <p className="italic">&quot;{selectedReview.feedback}&quot;</p>
                </div>
              )}

              {selectedReview.strengths && (
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50 text-slate-700">
                  <span className="font-bold text-slate-800 block mb-0.5">Key Strengths:</span>
                  <p>{selectedReview.strengths}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedReview(null)}
                className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
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