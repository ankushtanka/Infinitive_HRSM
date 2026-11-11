'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  CalendarDays,
  CheckCircle2,
  Plus,
  CalendarOff,
  Clock,
  RefreshCw,
  Paperclip,
  Download,
  AlertCircle,
  X,
  FileText,
  Upload,
  ChevronLeft,
  ChevronRight,
  Eye,
  RotateCcw,
  AlertTriangle,
  Flame,
  Zap,
  Sun,
  Moon,
} from 'lucide-react';
import { getISTDateString } from '@/lib/dateUtils';
import {
  calculateAuthoritativeDuration,
  getShiftTimeSlots,
  formatLeaveDurationText,
  HalfDaySession,
  LeaveDurationType,
} from '@/lib/leaveUtils';

interface LeaveBalanceCategory {
  code: string;
  name: string;
  total: number;
  used: number;
  pending: number;
  remaining: number;
  isPaid?: boolean;
}

interface LeaveTypeOption {
  id: string;
  name: string;
  code: string;
  allowanceDays: number;
  isPaid: boolean;
  description?: string;
}

interface PersonalLeaveItem {
  _id: string;
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  durationType?: LeaveDurationType;
  session?: HalfDaySession;
  requestedStartTime?: string;
  requestedEndTime?: string;
  requestedHours?: number;
  isUrgent?: boolean;
  isSameDay?: boolean;
  reason: string;
  requestedDate: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  rejectionReason?: string;
  attachmentFileId?: string;
  attachmentName?: string;
  approver?: string;
  history?: Array<{
    action: string;
    performedBy: string;
    role?: string;
    timestamp: string;
    comments?: string;
  }>;
}

const DEFAULT_LEAVE_TYPES: LeaveTypeOption[] = [
  { id: 'lt-cl', name: 'Casual Leave', code: 'CL', allowanceDays: 12, isPaid: true, description: 'Short-term casual time off' },
  { id: 'lt-sl', name: 'Sick Leave', code: 'SL', allowanceDays: 10, isPaid: true, description: 'Medical or sick leave' },
  { id: 'lt-el', name: 'Earned Leave', code: 'EL', allowanceDays: 15, isPaid: true, description: 'Privilege / earned vacation leave' },
  { id: 'lt-mat', name: 'Maternity / Paternity Leave', code: 'MAT', allowanceDays: 30, isPaid: true, description: 'Parental leave' },
  { id: 'lt-comp', name: 'Compensatory Off', code: 'COMP', allowanceDays: 5, isPaid: true, description: 'Compensatory off for extra work' },
  { id: 'lt-ber', name: 'Bereavement Leave', code: 'BER', allowanceDays: 5, isPaid: true, description: 'Compassionate leave' },
  { id: 'lt-lop', name: 'Unpaid Leave / LOP', code: 'LOP', allowanceDays: 30, isPaid: false, description: 'Loss of pay leave' },
];

export default function EmployeeLeavePage() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // Balances & Leave Types & Requests
  const [balances, setBalances] = useState<Record<string, LeaveBalanceCategory>>({});
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>(DEFAULT_LEAVE_TYPES);
  const [myRequests, setMyRequests] = useState<PersonalLeaveItem[]>([]);

  // Pagination & Filtering
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRequestsCount, setTotalRequestsCount] = useState(0);
  const [pageSize] = useState(15);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterLeaveType, setFilterLeaveType] = useState('All');
  const [filterUrgency, setFilterUrgency] = useState('All');
  const [filterDurationType, setFilterDurationType] = useState('All');

  // Apply Modal state
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [selectedLeaveType, setSelectedLeaveType] = useState('Casual Leave');
  const [selectedReasonTemplate, setSelectedReasonTemplate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationType, setDurationType] = useState<LeaveDurationType>('FULL_DAY');
  const [session, setSession] = useState<HalfDaySession>('FIRST_HALF');
  const [customStartTime, setCustomStartTime] = useState('09:00 AM');
  const [customEndTime, setCustomEndTime] = useState('01:30 PM');
  const [isUrgent, setIsUrgent] = useState(false);
  const [reason, setReason] = useState('');

  // Attachment state
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [requestToCancel, setRequestToCancel] = useState<PersonalLeaveItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailRequest, setSelectedDetailRequest] = useState<PersonalLeaveItem | null>(null);

  // Global background scroll lock while any leave modal is open
  useBodyScrollLock(Boolean(isApplyModalOpen || (cancelModalOpen && requestToCancel) || (detailModalOpen && selectedDetailRequest)));

  const todayIST = useMemo(() => getISTDateString(), []);
  const shiftSlots = useMemo(() => getShiftTimeSlots(), []);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Live Calculated Duration
  const calculatedDurationDetails = useMemo(() => {
    if (!startDate) return null;
    return calculateAuthoritativeDuration({
      durationType,
      startDate,
      endDate: durationType === 'FULL_DAY' ? endDate || startDate : startDate,
      session,
      customStartTime,
      customEndTime,
      shiftConfig: shiftSlots,
    });
  }, [durationType, startDate, endDate, session, customStartTime, customEndTime, shiftSlots]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const params = new URLSearchParams();
      if (filterStatus && filterStatus !== 'All') params.append('status', filterStatus);
      if (filterLeaveType && filterLeaveType !== 'All') params.append('leaveType', filterLeaveType);
      if (filterUrgency && filterUrgency !== 'All') params.append('urgency', filterUrgency);
      if (filterDurationType && filterDurationType !== 'All') params.append('durationType', filterDurationType);
      params.append('page', String(currentPage));
      params.append('limit', String(pageSize));

      const [balRes, typesRes, requestsRes] = await Promise.all([
        fetch('/api/v1/leave/balances').catch(() => null),
        fetch('/api/v1/leave/types').catch(() => null),
        fetch(`/api/v1/leave?${params.toString()}`).catch(() => null),
      ]);

      if (balRes && balRes.ok) {
        const balData = await balRes.json();
        if (balData.success && balData.data?.balances) {
          setBalances(balData.data.balances);
        }
      }

      if (typesRes && typesRes.ok) {
        const typesData = await typesRes.json();
        if (typesData.success && Array.isArray(typesData.data) && typesData.data.length > 0) {
          setLeaveTypes(typesData.data);
          if (!selectedLeaveType) {
            setSelectedLeaveType(typesData.data[0].name);
          }
        }
      }

      if (requestsRes && requestsRes.ok) {
        const reqData = await requestsRes.json();
        if (reqData.success && reqData.data?.leaves) {
          setMyRequests(reqData.data.leaves);
          setTotalRequestsCount(reqData.data.pagination?.total || reqData.data.leaves.length);
          setTotalPages(reqData.data.pagination?.totalPages || 1);
        }
      } else {
        setIsError(true);
      }
    } catch (err) {
      console.error('Error fetching employee leave data:', err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus, filterLeaveType, filterUrgency, filterDurationType, currentPage, pageSize, selectedLeaveType]);

  const effectiveLeaveTypes = useMemo(() => {
    if (leaveTypes && leaveTypes.length > 0) return leaveTypes;
    if (balances && Object.keys(balances).length > 0) {
      return Object.keys(balances).map((name) => ({
        id: `lt-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name,
        code: name.substring(0, 3).toUpperCase(),
        allowanceDays: balances[name]?.total || 12,
        isPaid: !name.toLowerCase().includes('unpaid') && !name.toLowerCase().includes('lop'),
      }));
    }
    return DEFAULT_LEAVE_TYPES;
  }, [leaveTypes, balances]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle File Upload to GridFS
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('Attachment must be smaller than 10MB.', 'error');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/v1/leave/upload-attachment', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.data?.fileId) {
        setUploadedFileId(data.data.fileId);
        setUploadedFileName(data.data.filename);
        setAttachmentFile(file);
        showToast('Document uploaded successfully to GridFS storage!');
      } else {
        showToast(data.message || 'File upload failed.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error uploading file.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Submit Leave Request
  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeaveType || !startDate) {
      showToast('Please fill all required fields.', 'error');
      return;
    }

    if (durationType === 'FULL_DAY' && !endDate) {
      showToast('End date is required for full-day leave.', 'error');
      return;
    }

    if (!calculatedDurationDetails || !calculatedDurationDetails.isValid) {
      showToast(calculatedDurationDetails?.errorMessage || 'Invalid leave duration calculation.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaveType: selectedLeaveType,
          startDate,
          endDate: durationType === 'FULL_DAY' ? endDate : startDate,
          durationType,
          session: durationType === 'HALF_DAY' ? session : undefined,
          requestedStartTime: durationType === 'CUSTOM_HOURS' ? customStartTime : undefined,
          requestedEndTime: durationType === 'CUSTOM_HOURS' ? customEndTime : undefined,
          reason,
          isUrgent,
          attachmentFileId: uploadedFileId,
          attachmentName: uploadedFileName,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Leave request submitted successfully.');
        setIsApplyModalOpen(false);
        setStartDate('');
        setEndDate('');
        setDurationType('FULL_DAY');
        setSession('FIRST_HALF');
        setIsUrgent(false);
        setReason('');
        setUploadedFileId(null);
        setUploadedFileName(null);
        setAttachmentFile(null);
        fetchData();
      } else {
        showToast(data.message || 'Unable to submit leave request.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Unable to submit leave request.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel Personal Leave Request
  const handleCancelRequest = async () => {
    if (!requestToCancel) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/leave/${requestToCancel._id || requestToCancel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' }),
      });

      const data = await res.json();
      if (data.success) {
        showToast('Leave request cancelled successfully.');
        setCancelModalOpen(false);
        setRequestToCancel(null);
        fetchData();
      } else {
        showToast(data.message || 'Unable to cancel the request.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Unable to cancel the request.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetFilters = () => {
    setFilterStatus('All');
    setFilterLeaveType('All');
    setFilterUrgency('All');
    setFilterDurationType('All');
    setCurrentPage(1);
  };

  const setQuickSameDay = () => {
    setStartDate(todayIST);
    setEndDate(todayIST);
    if (durationType === 'FULL_DAY') {
      setDurationType('HALF_DAY');
    }
  };

  const balanceEntries = Object.entries(balances);

  return (
    <AuthGuard allowedRoles={['EMPLOYEE', 'SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']}>
      <AdminLayout
        allowedRoles={['EMPLOYEE', 'SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']}
        pageTitle="Leave"
        breadcrumbs={[
          { label: 'My Workspace', href: '/employee/dashboard' },
          { label: 'Leave', href: '/employee/leave' },
        ]}
      >
        {/* Toast Alert */}
        {toastMessage && (
          <div
            className={`fixed right-6 top-20 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-xs text-white shadow-2xl animate-fade-in ${
              toastType === 'success' ? 'bg-slate-900 border border-emerald-500/40' : 'bg-rose-950 border border-rose-500/40'
            }`}
          >
            {toastType === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{toastMessage}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* Page Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-950">Leave Management</h1>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                Apply for Full-Day, Same-Day Half-Day, or Urgent Leave, and track your allowance balance.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchData}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-[#F0E4D6] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition-all cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh Data</span>
              </button>
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setDurationType('FULL_DAY');
                  setIsUrgent(false);
                  setIsApplyModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#F97316] px-4 py-2 text-xs font-bold text-[#081220] shadow-sm hover:bg-[#EA580C] transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Apply for Leave</span>
              </button>
            </div>
          </div>

          {/* Global Error Alert */}
          {isError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>Unable to load leave information. Please check your connection.</span>
              </div>
              <button
                onClick={fetchData}
                className="rounded-xl bg-rose-600 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-rose-700 transition-all cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Pulse Skeleton Loading State */}
          {isLoading ? (
            <div className="space-y-6 animate-pulse">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-28 rounded-2xl bg-slate-200/80"></div>
                ))}
              </div>
              <div className="h-64 rounded-2xl bg-slate-200/80"></div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Leave Balance Cards */}
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Leave Balance Summary</h2>
                {balanceEntries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#F0E4D6] bg-white p-6 text-center text-xs text-slate-400">
                    No leave balance available.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {balanceEntries.map(([key, cat]) => (
                      <div key={key} className="rounded-xl border border-[#F0E4D6] bg-white p-4 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 truncate max-w-[120px]">{cat.name || key}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                              cat.isPaid !== false
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {cat.isPaid !== false ? 'Paid' : 'Unpaid'}
                          </span>
                        </div>

                        <p className="text-2xl font-black text-[#C2410C]">
                          {cat.remaining} <span className="text-xs font-medium text-slate-400">Days remaining</span>
                        </p>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-[#F0E4D6] pt-2 font-mono">
                          <span>Quota: <strong className="text-slate-800">{cat.total}</strong></span>
                          <span>Used: <strong className="text-slate-800">{cat.used}</strong></span>
                          <span>Pending: <strong className="text-amber-600">{cat.pending}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Leave Requests Table */}
              <div className="rounded-xl border border-[#F0E4D6] bg-white shadow-xs overflow-hidden">
                {/* Filter Bar */}
                <div className="border-b border-[#F0E4D6] p-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#FFFBF7]">
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-[#C2410C]" />
                    <span>My Leave Requests</span>
                  </h3>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {/* Status Filter */}
                    <select
                      value={filterStatus}
                      onChange={(e) => {
                        setFilterStatus(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="rounded-xl border border-[#F0E4D6] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Pending">Pending</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>

                    {/* Urgency Filter */}
                    <select
                      value={filterUrgency}
                      onChange={(e) => {
                        setFilterUrgency(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="rounded-xl border border-[#F0E4D6] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="All">All Urgencies</option>
                      <option value="Urgent">🚨 Urgent Requests</option>
                      <option value="Normal">Normal Requests</option>
                    </select>

                    {/* Duration Type Filter */}
                    <select
                      value={filterDurationType}
                      onChange={(e) => {
                        setFilterDurationType(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="rounded-xl border border-[#F0E4D6] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="All">All Durations</option>
                      <option value="FULL_DAY">Full Day</option>
                      <option value="HALF_DAY">Half Day</option>
                      <option value="CUSTOM_HOURS">Custom Hours</option>
                    </select>

                    {/* Leave Type Filter */}
                    <select
                      value={filterLeaveType}
                      onChange={(e) => {
                        setFilterLeaveType(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="rounded-xl border border-[#F0E4D6] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="All">All Categories</option>
                      {effectiveLeaveTypes.map((t) => (
                        <option key={t.id || t.name} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>

                    {(filterStatus !== 'All' || filterLeaveType !== 'All' || filterUrgency !== 'All' || filterDurationType !== 'All') && (
                      <button
                        onClick={handleResetFilters}
                        className="inline-flex items-center gap-1 rounded-xl border border-[#F0E4D6] bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Table Feed */}
                {myRequests.length === 0 ? (
                  <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                    <CalendarOff className="h-10 w-10 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-700 text-sm">No leave requests found.</p>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      Submitted full-day, half-day, or urgent leave requests will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="sticky top-0 z-10 bg-[#FFFBF7] backdrop-blur-xs border-b border-[#F0E4D6] text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-3.5 px-4">Request ID</th>
                          <th className="py-3.5 px-4">Category</th>
                          <th className="py-3.5 px-4">Priority / Type</th>
                          <th className="py-3.5 px-4">Dates & Time</th>
                          <th className="py-3.5 px-4">Duration</th>
                          <th className="py-3.5 px-4">Attachment</th>
                          <th className="py-3.5 px-4">Submitted</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0E4D6] font-medium">
                        {myRequests.map((req) => (
                          <tr key={req._id || req.id} className="hover:bg-[#FFF7ED]/30 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-[#C2410C] text-[11px]">
                              {(req._id || req.id).substring(0, 8)}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-slate-900">{req.leaveType}</td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {req.isUrgent ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 border border-amber-300">
                                    <Flame className="h-3 w-3 text-amber-600 fill-amber-500" />
                                    <span>URGENT</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-medium">Normal</span>
                                )}
                                {req.startDate === todayIST && (
                                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-700 border border-blue-200">
                                    Same Day
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-700">
                              <div>
                                {req.startDate === req.endDate ? (
                                  <span className="font-bold text-slate-900">{req.startDate}</span>
                                ) : (
                                  <span>{req.startDate} <span className="text-slate-400">to</span> {req.endDate}</span>
                                )}
                              </div>
                              {req.durationType === 'HALF_DAY' && (
                                <p className="text-[10px] text-[#C2410C] font-semibold mt-0.5">
                                  {req.session === 'SECOND_HALF' ? 'Second Half (Afternoon)' : 'First Half (Morning)'}
                                  {req.requestedStartTime && req.requestedEndTime ? ` • ${req.requestedStartTime} - ${req.requestedEndTime}` : ''}
                                </p>
                              )}
                              {req.durationType === 'CUSTOM_HOURS' && req.requestedStartTime && (
                                <p className="text-[10px] text-[#C2410C] font-semibold mt-0.5">
                                  {req.requestedStartTime} → {req.requestedEndTime}
                                </p>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-[#C2410C]">
                              {formatLeaveDurationText(req)}
                            </td>
                            <td className="py-3.5 px-4">
                              {req.attachmentFileId ? (
                                <a
                                  href={`/api/v1/leave/${req._id || req.id}/attachment/${req.attachmentFileId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#FFF7ED] px-2 py-1 text-[11px] font-bold text-[#C2410C] border border-[#FED7AA] hover:bg-[#FFEDD5]"
                                >
                                  <Paperclip className="h-3 w-3" />
                                  <span className="truncate max-w-[80px]">{req.attachmentName || 'Doc'}</span>
                                  <Download className="h-3 w-3 shrink-0" />
                                </a>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">None</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-slate-500">{req.requestedDate}</td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                                  req.status === 'Approved'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : req.status === 'Rejected'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : req.status === 'Cancelled'
                                    ? 'bg-slate-100 text-slate-600 border-[#F0E4D6]'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                {req.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right space-x-2">
                              <button
                                onClick={() => {
                                  setSelectedDetailRequest(req);
                                  setDetailModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 text-xs font-bold text-[#EA580C] hover:text-[#C2410C] cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Details</span>
                              </button>
                              {(req.status === 'Pending' || req.status === 'Approved') && (
                                <button
                                  onClick={() => {
                                    setRequestToCancel(req);
                                    setCancelModalOpen(true);
                                  }}
                                  className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination Footer */}
                {totalRequestsCount > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#F0E4D6] bg-[#FFFBF7] px-4 py-3 text-xs text-slate-500">
                    <div>
                      Showing <span className="font-bold text-slate-800">{myRequests.length}</span> of{' '}
                      <span className="font-bold text-slate-800">{totalRequestsCount}</span> leave requests
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#F0E4D6] bg-white px-2.5 py-1 font-semibold text-slate-700 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Previous</span>
                      </button>
                      <span className="px-2 font-medium text-slate-700">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#F0E4D6] bg-white px-2.5 py-1 font-semibold text-slate-700 disabled:opacity-40 cursor-pointer"
                      >
                        <span>Next</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Apply for Leave Modal */}
          {isApplyModalOpen && (
            <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
              <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl text-xs text-slate-800 space-y-3.5 animate-fade-in">
                <div className="flex items-center justify-between border-b border-[#F0E4D6] pb-3 font-bold text-sm text-slate-900">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-[#C2410C]" />
                    <span>Apply for Leave</span>
                  </div>
                  <button
                    onClick={() => setIsApplyModalOpen(false)}
                    className="rounded-lg p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={handleSubmitLeave} className="space-y-3.5">
                  {/* Category Selection Dropdown */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-900">Leave Category *</label>
                      {selectedLeaveType && (
                        <span className="text-[11px] font-bold text-[#C2410C] bg-[#FFF7ED] px-2 py-0.5 rounded-lg border border-[#FED7AA]">
                          {balances[selectedLeaveType]?.remaining !== undefined
                            ? `${balances[selectedLeaveType].remaining} day(s) balance available`
                            : 'Available'}
                        </span>
                      )}
                    </div>
                    <select
                      required
                      value={selectedLeaveType}
                      onChange={(e) => setSelectedLeaveType(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] outline-none cursor-pointer"
                    >
                      <option value="" disabled>-- Select Leave Category from Dropdown List --</option>
                      {effectiveLeaveTypes.map((t) => {
                        const remainingDays = balances[t.name]?.remaining;
                        const balanceNotice = remainingDays !== undefined ? `${remainingDays} days left` : `${t.allowanceDays || 12} days/yr`;
                        return (
                          <option key={t.id || t.name} value={t.name}>
                            {t.name} ({balanceNotice} • {t.isPaid ? 'Paid Leave' : 'Unpaid Leave'})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Duration Type Segmented Tabs */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-900">Leave Duration Type *</label>
                      <button
                        type="button"
                        onClick={setQuickSameDay}
                        className="text-[11px] font-bold text-[#EA580C] hover:text-[#C2410C] underline cursor-pointer"
                      >
                        ⚡ Apply for Today ({todayIST})
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setDurationType('FULL_DAY');
                          if (!endDate) setEndDate(startDate);
                        }}
                        className={`rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
                          durationType === 'FULL_DAY'
                            ? 'bg-[#F97316] text-[#081220] font-bold shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Full Day
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDurationType('HALF_DAY');
                          setEndDate(startDate);
                        }}
                        className={`rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
                          durationType === 'HALF_DAY'
                            ? 'bg-[#F97316] text-[#081220] font-bold shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Half Day (0.5)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDurationType('CUSTOM_HOURS');
                          setEndDate(startDate);
                        }}
                        className={`rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
                          durationType === 'CUSTOM_HOURS'
                            ? 'bg-[#F97316] text-[#081220] font-bold shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Custom Hours
                      </button>
                    </div>
                  </div>

                  {/* Date Input(s) */}
                  {durationType === 'FULL_DAY' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-900">Start Date *</label>
                        <input
                          type="date"
                          required
                          value={startDate}
                          onChange={(e) => {
                            setStartDate(e.target.value);
                            if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                          }}
                          className="mt-1 w-full rounded-xl border border-[#F0E4D6] bg-slate-50 p-2.5 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] focus:bg-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-900">End Date *</label>
                        <input
                          type="date"
                          required
                          value={endDate}
                          min={startDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-[#F0E4D6] bg-slate-50 p-2.5 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] focus:bg-white font-semibold"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="font-bold text-slate-900">Leave Date *</label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="date"
                          required
                          value={startDate}
                          onChange={(e) => {
                            setStartDate(e.target.value);
                            setEndDate(e.target.value);
                          }}
                          className="flex-1 rounded-xl border border-[#F0E4D6] bg-slate-50 p-2.5 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] focus:bg-white font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setStartDate(todayIST);
                            setEndDate(todayIST);
                          }}
                          className={`rounded-xl border px-3 py-2.5 text-xs font-bold cursor-pointer transition-all ${
                            startDate === todayIST
                              ? 'border-[#F97316] bg-[#FFF7ED] text-[#C2410C]'
                              : 'border-[#F0E4D6] bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Today
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Half-Day Session Radio Cards */}
                  {durationType === 'HALF_DAY' && (
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-900 block">Select Half-Day Session *</label>
                      <div className="grid grid-cols-2 gap-2.5">
                        <label
                          className={`flex flex-col rounded-xl border p-3 cursor-pointer transition-all ${
                            session === 'FIRST_HALF'
                              ? 'border-[#F97316] bg-[#FFF7ED] text-[#C2410C] shadow-xs'
                              : 'border-[#F0E4D6] bg-slate-50 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 flex items-center gap-1.5">
                              <Sun className="h-4 w-4 text-amber-500" />
                              <span>First Half</span>
                            </span>
                            <input
                              type="radio"
                              name="halfDaySession"
                              value="FIRST_HALF"
                              checked={session === 'FIRST_HALF'}
                              onChange={() => setSession('FIRST_HALF')}
                              className="accent-orange-500"
                            />
                          </div>
                          <span className="text-[11px] font-bold text-[#C2410C] mt-1">
                            {shiftSlots.firstHalf.startTime} - {shiftSlots.firstHalf.endTime}
                          </span>
                          <span className="text-[10px] text-slate-500 mt-0.5">Morning session (4.5 hrs)</span>
                        </label>

                        <label
                          className={`flex flex-col rounded-xl border p-3 cursor-pointer transition-all ${
                            session === 'SECOND_HALF'
                              ? 'border-[#F97316] bg-[#FFF7ED] text-[#C2410C] shadow-xs'
                              : 'border-[#F0E4D6] bg-slate-50 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 flex items-center gap-1.5">
                              <Moon className="h-4 w-4 text-[#C2410C]" />
                              <span>Second Half</span>
                            </span>
                            <input
                              type="radio"
                              name="halfDaySession"
                              value="SECOND_HALF"
                              checked={session === 'SECOND_HALF'}
                              onChange={() => setSession('SECOND_HALF')}
                              className="accent-orange-500"
                            />
                          </div>
                          <span className="text-[11px] font-bold text-[#C2410C] mt-1">
                            {shiftSlots.secondHalf.startTime} - {shiftSlots.secondHalf.endTime}
                          </span>
                          <span className="text-[10px] text-slate-500 mt-0.5">Afternoon session (4.5 hrs)</span>
                        </label>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Assigned Shift: {shiftSlots.workStartTime} to {shiftSlots.workEndTime} (1 hr lunch break).
                      </p>
                    </div>
                  )}

                  {/* Custom Hours Interval */}
                  {durationType === 'CUSTOM_HOURS' && (
                    <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#F0E4D6] bg-slate-50 p-3">
                      <div>
                        <label className="font-bold text-slate-900">Start Time *</label>
                        <input
                          type="text"
                          required
                          value={customStartTime}
                          placeholder="09:00 AM"
                          onChange={(e) => setCustomStartTime(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-[#F0E4D6] bg-white p-2 text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-900">End Time *</label>
                        <input
                          type="text"
                          required
                          value={customEndTime}
                          placeholder="01:30 PM"
                          onChange={(e) => setCustomEndTime(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-[#F0E4D6] bg-white p-2 text-xs font-semibold"
                        />
                      </div>
                      <p className="col-span-2 text-[10px] text-slate-500">
                        Time must fall within shift hours ({shiftSlots.workStartTime} - {shiftSlots.workEndTime}).
                      </p>
                    </div>
                  )}

                  {/* Urgent / Emergency Leave Priority Checkbox */}
                  <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 space-y-1">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isUrgent}
                        onChange={(e) => setIsUrgent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded accent-amber-600"
                      />
                      <div>
                        <span className="font-bold text-amber-950 flex items-center gap-1">
                          <Flame className="h-3.5 w-3.5 text-amber-600 fill-amber-500" />
                          <span>Urgent / Emergency Leave (Priority Flag)</span>
                        </span>
                        <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                          Flags this request for immediate management review and allows same-day emergency applications without advance notice.
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Duration & Shift Breakdown Banner */}
                  {calculatedDurationDetails && calculatedDurationDetails.isValid && (
                    <div className="rounded-xl bg-[#FFF7ED]/90 p-3 border border-[#FED7AA] space-y-1 text-orange-950">
                      <div className="flex items-center justify-between font-bold">
                        <span>Calculated Duration:</span>
                        <span className="text-sm font-black text-orange-600">
                          {formatLeaveDurationText({
                            durationDays: calculatedDurationDetails.durationDays,
                            durationType: calculatedDurationDetails.durationType,
                            session: calculatedDurationDetails.session,
                            requestedHours: calculatedDurationDetails.requestedHours,
                            requestedStartTime: calculatedDurationDetails.requestedStartTime,
                            requestedEndTime: calculatedDurationDetails.requestedEndTime,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-[#FED7AA] pt-1">
                        <span>Shift Schedule:</span>
                        <span className="font-mono text-slate-700">
                          {shiftSlots.workStartTime} - {shiftSlots.workEndTime} (8h work + 1h break)
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Reason for Leave with Dropdown List Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-900">Reason for Leave *</label>
                      <span className="text-[10px] text-slate-400 font-medium">Select from dropdown or type below</span>
                    </div>

                    {/* Predefined Reasons Dropdown List */}
                    <select
                      value={selectedReasonTemplate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedReasonTemplate(val);
                        if (val && val !== 'OTHER') {
                          setReason(val);
                        }
                      }}
                      className="w-full mb-1.5 rounded-xl border border-slate-300 bg-slate-50 p-2 font-semibold text-xs text-slate-700 focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 outline-none cursor-pointer"
                    >
                      <option value="">-- Choose Reason from Dropdown List --</option>
                      <option value="Personal Emergency / Urgent Personal Matter">🚨 Personal Emergency / Urgent Personal Matter</option>
                      <option value="Medical Sickness / Viral Fever / Unwell">🤒 Medical Sickness / Viral Fever / Unwell</option>
                      <option value="Doctor Consultation / Clinic Appointment">🏥 Doctor Consultation / Clinic Appointment</option>
                      <option value="Family Function / Wedding / Religious Ceremony">🎉 Family Function / Wedding / Ceremony</option>
                      <option value="Out of Station / Hometown Travel">✈️ Out of Station / Hometown Travel</option>
                      <option value="Urgent Domestic Work / Home Maintenance">🏠 Urgent Domestic Work / Home Maintenance</option>
                      <option value="Government / Bank / Legal Documentation Work">🏛️ Government / Bank / Legal Work</option>
                      <option value="Academic Exam / Certification Preparation">📚 Academic Exam / Certification Preparation</option>
                      <option value="OTHER">✍️ Other / Custom Reason (Type below)</option>
                    </select>

                    <textarea
                      required
                      placeholder="Provide details or reason for time off..."
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        if (selectedReasonTemplate && e.target.value !== selectedReasonTemplate) {
                          setSelectedReasonTemplate('OTHER');
                        }
                      }}
                      rows={3}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 p-2.5 font-medium text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-1 focus:ring-orange-500/20 outline-none"
                    />
                  </div>

                  {/* Attachment Upload */}
                  <div>
                    <label className="font-bold text-slate-900 block mb-1">Supporting Document (GridFS)</label>
                    <div className="flex items-center gap-2">
                      <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2.5 hover:bg-slate-100">
                        <Upload className="h-4 w-4 text-slate-400" />
                        <span className="text-slate-600 font-medium truncate max-w-[200px]">
                          {isUploading ? 'Uploading to Vault...' : uploadedFileName || 'Choose File (Max 10MB)'}
                        </span>
                        <input type="file" onChange={handleFileUpload} className="hidden" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
                      </label>
                      {uploadedFileId && (
                        <span className="rounded-full bg-emerald-100 p-1.5 text-emerald-700" title="File Uploaded">
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Submit / Cancel Buttons */}
                  <div className="flex justify-end gap-2 border-t border-[#F0E4D6] pt-3 mt-4">
                    <button
                      type="button"
                      onClick={() => setIsApplyModalOpen(false)}
                      className="rounded-xl border border-[#F0E4D6] px-3.5 py-2 font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || isUploading || !calculatedDurationDetails?.isValid}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-5 py-2 font-bold text-white shadow-xs hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <span>Submit Application</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
        </Portal>
          )}

          {/* Details Modal */}
          {detailModalOpen && selectedDetailRequest && (
            <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
              <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl text-xs text-slate-800 space-y-4 animate-fade-in">
                <div className="flex items-center justify-between border-b border-[#F0E4D6] pb-3 font-bold text-sm text-slate-900">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#C2410C]" />
                    <span>Leave Request Details</span>
                  </div>
                  <button onClick={() => setDetailModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2.5 rounded-xl bg-slate-50 p-4 text-xs font-medium text-slate-700 border border-[#F0E4D6]">
                  <div className="flex justify-between border-b border-[#F0E4D6]/60 pb-2">
                    <span className="text-slate-400">Request ID:</span>
                    <span className="font-bold text-slate-900 font-mono">{(selectedDetailRequest._id || selectedDetailRequest.id).substring(0, 10)}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#F0E4D6]/60 pb-2">
                    <span className="text-slate-400">Leave Type:</span>
                    <span className="font-bold text-slate-900">{selectedDetailRequest.leaveType}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#F0E4D6]/60 pb-2">
                    <span className="text-slate-400">Priority Level:</span>
                    <span>
                      {selectedDetailRequest.isUrgent ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 border border-amber-300">
                          <Flame className="h-3 w-3 text-amber-600 fill-amber-500" />
                          <span>URGENT / EMERGENCY</span>
                        </span>
                      ) : (
                        <span className="text-slate-700 font-semibold">Standard Application</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-[#F0E4D6]/60 pb-2">
                    <span className="text-slate-400">Duration Type:</span>
                    <span className="font-bold text-orange-700">
                      {selectedDetailRequest.durationType === 'HALF_DAY'
                        ? `Half Day (${selectedDetailRequest.session === 'SECOND_HALF' ? 'Second Half' : 'First Half'})`
                        : selectedDetailRequest.durationType === 'CUSTOM_HOURS'
                        ? 'Custom Hours'
                        : 'Full Day'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-[#F0E4D6]/60 pb-2">
                    <span className="text-slate-400">Date Range:</span>
                    <span className="font-bold text-slate-900">{selectedDetailRequest.startDate} to {selectedDetailRequest.endDate}</span>
                  </div>
                  {selectedDetailRequest.requestedStartTime && selectedDetailRequest.requestedEndTime && (
                    <div className="flex justify-between border-b border-[#F0E4D6]/60 pb-2">
                      <span className="text-slate-400">Time Interval:</span>
                      <span className="font-bold text-orange-600 font-mono">
                        {selectedDetailRequest.requestedStartTime} → {selectedDetailRequest.requestedEndTime}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-b border-[#F0E4D6]/60 pb-2">
                    <span className="text-slate-400">Total Duration:</span>
                    <span className="font-bold text-orange-600">{formatLeaveDurationText(selectedDetailRequest)}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#F0E4D6]/60 pb-2">
                    <span className="text-slate-400">Reason:</span>
                    <span className="font-bold text-slate-900 text-right max-w-[200px] truncate">{selectedDetailRequest.reason || 'None provided'}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#F0E4D6]/60 pb-2">
                    <span className="text-slate-400">Submitted On:</span>
                    <span className="font-bold text-slate-900">{selectedDetailRequest.requestedDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Approver Role:</span>
                    <span className="font-bold text-slate-800">{selectedDetailRequest.approver || 'Manager / HR'}</span>
                  </div>
                </div>

                {/* Workflow Timeline Indicator */}
                <div className="space-y-2 rounded-xl bg-slate-50/70 p-3 border border-[#F0E4D6] text-[11px]">
                  <span className="font-bold text-slate-500 uppercase tracking-wider block">Approval Workflow Timeline</span>
                  <div className="flex items-center justify-between text-slate-600 pt-1 font-medium">
                    <span className="text-emerald-600 font-bold">1. Submitted</span>
                    <span>→</span>
                    <span className={selectedDetailRequest.status === 'Pending' ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>2. Manager Review</span>
                    <span>→</span>
                    <span className={selectedDetailRequest.status === 'Approved' ? 'text-emerald-600 font-bold' : selectedDetailRequest.status === 'Rejected' ? 'text-rose-600 font-bold' : 'text-slate-400'}>
                      3. {selectedDetailRequest.status}
                    </span>
                  </div>
                </div>

                {selectedDetailRequest.rejectionReason && (
                  <div className="rounded-xl bg-rose-50 p-3 border border-rose-200 text-rose-800 text-xs">
                    <span className="font-bold">Rejection Reason:</span>
                    <p className="mt-0.5">{selectedDetailRequest.rejectionReason}</p>
                  </div>
                )}

                <div className="flex justify-end pt-2 border-t border-[#F0E4D6]">
                  <button
                    onClick={() => setDetailModalOpen(false)}
                    className="rounded-xl border border-[#F0E4D6] bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
        </Portal>
          )}

          {/* Cancel Confirmation Modal */}
          {cancelModalOpen && requestToCancel && (
            <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
              <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl text-xs text-slate-800 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 border-b border-[#F0E4D6] pb-3">
                  <CalendarOff className="h-4 w-4 text-amber-600" />
                  <span>Cancel Leave Request</span>
                </div>

                <p className="text-slate-600">
                  Are you sure you want to cancel your <span className="font-bold text-slate-900">{requestToCancel.leaveType}</span> request ({requestToCancel.startDate} to {requestToCancel.endDate})?
                </p>

                <div className="flex justify-end gap-2 border-t border-[#F0E4D6] pt-3">
                  <button
                    onClick={() => setCancelModalOpen(false)}
                    className="rounded-xl border border-[#F0E4D6] px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Keep Request
                  </button>
                  <button
                    onClick={handleCancelRequest}
                    disabled={isSubmitting}
                    className="rounded-xl bg-rose-600 px-3.5 py-1.5 font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                  >
                    Confirm Cancellation
                  </button>
                </div>
              </div>
            </div>
        </Portal>
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
