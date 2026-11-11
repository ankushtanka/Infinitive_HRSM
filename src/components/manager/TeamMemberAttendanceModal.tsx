'use client';
import { Portal } from '@/components/modals/Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState, useEffect } from 'react';
import {
  X,
  CalendarCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  History,
} from 'lucide-react';

interface TodayAttendance {
  date: string;
  status: string;
  clockIn: string | null;
  clockOut: string | null;
  workHours: string | null;
}

interface TeamMember {
  id: string;
  employeeId: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  todayAttendance: TodayAttendance;
}

interface TeamMemberAttendanceModalProps {
  member: TeamMember | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TeamMemberAttendanceModal({
  member,
  onClose,
  onSuccess,
}: TeamMemberAttendanceModalProps) {
  useBodyScrollLock(Boolean(member));

  const [status, setStatus] = useState('Present');
  const [checkIn, setCheckIn] = useState('09:00 AM');
  const [checkOut, setCheckOut] = useState('06:00 PM');
  const [workingHours, setWorkingHours] = useState('8.0');

  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!member) return;
    setStatus(member.todayAttendance?.status || 'Present');
    setCheckIn(member.todayAttendance?.clockIn || '09:00 AM');
    setCheckOut(member.todayAttendance?.clockOut || '06:00 PM');
    setFeedback(null);
  }, [member]);

  useEffect(() => {
    if (!member?.employeeId) return;
    let isMounted = true;
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const res = await fetch(`/api/v1/attendance?employeeId=${member.employeeId}&limit=5`);
        const data = await res.json();
        if (isMounted && data.success) {
          setHistoryLogs(data.data?.records || data.data?.attendance || []);
        }
      } catch (err) {
        console.error('Error fetching attendance history:', err);
      } finally {
        if (isMounted) setIsLoadingHistory(false);
      }
    };

    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [member?.employeeId]);

  if (!member) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/v1/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: member.employeeId,
          status,
          checkIn,
          checkOut,
          workingHours: parseFloat(workingHours) || 8,
          method: 'Manager Regularization',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: 'Attendance updated successfully.' });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 800);
      } else {
        setFeedback({ type: 'error', message: data.message || 'Failed to record attendance.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Server connection error.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Manage Attendance</h2>
              <p className="text-xs text-slate-500">
                Log or regularize attendance for <span className="font-semibold text-slate-700">{member.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-5">
          {feedback && (
            <div
              className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Today&apos;s Attendance Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 bg-white"
                >
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Half Day">Half Day</option>
                  <option value="Absent">Absent</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Work From Home">Work From Home</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Working Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={workingHours}
                  onChange={(e) => setWorkingHours(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Check-In Time
                </label>
                <input
                  type="text"
                  placeholder="09:00 AM"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Check-Out Time
                </label>
                <input
                  type="text"
                  placeholder="06:00 PM"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving Attendance...</span>
                  </>
                ) : (
                  <span>Update Attendance</span>
                )}
              </button>
            </div>
          </form>

          {/* Recent History Table */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-2.5">
              <History className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Recent Attendance History
              </span>
            </div>

            {isLoadingHistory ? (
              <div className="py-6 flex justify-center text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              </div>
            ) : historyLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No prior attendance logs found.</p>
            ) : (
              <div className="rounded-xl border border-slate-200 overflow-x-auto min-h-0 max-h-[300px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">In</th>
                      <th className="px-3 py-2">Out</th>
                      <th className="px-3 py-2">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyLogs.map((log: any, idx) => (
                      <tr key={log._id || idx} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 font-medium text-slate-800">{log.date}</td>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-slate-700">{log.status}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{log.checkIn || '--'}</td>
                        <td className="px-3 py-2 text-slate-600">{log.checkOut || '--'}</td>
                        <td className="px-3 py-2 text-slate-600">{log.workingHours || log.workHours || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

