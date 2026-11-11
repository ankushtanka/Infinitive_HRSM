'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useEmsStore } from '@/store/emsStore';
import { Eye, Check, X, Clock, CalendarOff, ArrowRight } from 'lucide-react';

export const LeaveRequestsTable: React.FC = () => {
  const { state } = useEmsStore();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const requests = state.leaves || [];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <Check className="mr-1 h-3 w-3" /> Approved
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
            <X className="mr-1 h-3 w-3" /> Rejected
          </span>
        );
      case 'Pending':
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-[#FFF7ED] px-2.5 py-0.5 text-xs font-semibold text-[#C2410C] border border-[#FED7AA]">
            <Clock className="mr-1 h-3 w-3" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col justify-between rounded-xl border border-[#F0E4D6] bg-white p-5 shadow-xs transition-all hover:shadow-sm">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="absolute right-6 top-4 z-20 flex items-center gap-2 rounded-lg bg-[#0F172A] px-3.5 py-2 text-xs text-white shadow-xl animate-fade-in border border-[#FED7AA]/30">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#F7EFE5] pb-3.5">
        <div>
          <h3 className="text-base font-semibold text-[#0F172A]">Recent Leave Requests</h3>
          <p className="text-xs text-[#64748B]">Applications requiring management review & action</p>
        </div>
        <Link
          href="/admin/leave"
          className="flex items-center gap-1 text-xs font-semibold text-[#EA580C] hover:text-[#C2410C] transition-colors"
        >
          View All ({requests.length}) <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Empty State vs Table Container */}
      {requests.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA]">
            <CalendarOff className="h-6 w-6" />
          </div>
          <h4 className="mt-3 text-sm font-semibold text-[#0F172A]">No leave requests yet</h4>
          <p className="mt-1 max-w-xs text-xs text-[#64748B]">
            Submitted employee leave applications and time-off requests will appear here.
          </p>
        </div>
      ) : (
        <div
          className="mt-3.5 flex-1 overflow-x-auto min-h-0 max-h-[380px] overflow-y-auto overscroll-contain pr-1 hrms-scrollbar"
        >
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#FFF7ED] border-b border-[#FED7AA] text-[#64748B]">
              <tr>
                <th className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider">Employee</th>
                <th className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider">Leave Type</th>
                <th className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider">Duration</th>
                <th className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider">Status</th>
                <th className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F7EFE5]">
              {requests.map((req) => (
                <tr key={req.id} className="transition-colors hover:bg-[#FFF7ED]">
                  {/* Employee Info */}
                  <td className="px-3.5 py-3">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={req.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80'}
                        alt={req.employeeName}
                        className="h-8 w-8 rounded-full object-cover ring-1 ring-[#FED7AA]"
                      />
                      <div>
                        <p className="font-semibold text-[#0F172A]">{req.employeeName}</p>
                        <p className="text-[10px] text-[#64748B]">{req.employeeId}</p>
                      </div>
                    </div>
                  </td>

                  {/* Leave Type */}
                  <td className="px-3.5 py-3 font-medium text-[#0F172A]">
                    <span className="rounded-md bg-[#FFF7ED] px-2 py-0.5 text-[11px] font-semibold text-[#C2410C] border border-[#FED7AA]/60">
                      {req.leaveType}
                    </span>
                  </td>

                  {/* Duration */}
                  <td className="px-3.5 py-3 text-[#0F172A]">
                    <div>
                      <span className="font-medium">{req.startDate}</span> to <span className="font-medium">{req.endDate}</span>
                    </div>
                    <span className="text-[10px] text-[#64748B]">({req.durationDays} Days)</span>
                  </td>

                  {/* Status Badge */}
                  <td className="px-3.5 py-3">
                    {getStatusBadge(req.status)}
                  </td>

                  {/* Actions */}
                  <td className="px-3.5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => showToast(`Viewing details for ${req.employeeName}`)}
                        className="rounded-lg p-1.5 text-[#64748B] transition-colors hover:bg-[#FFF7ED] hover:text-[#0F172A]"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>

                      {req.status === 'Pending' && (
                        <>
                          <button
                            onClick={() => showToast(`Approved leave for ${req.employeeName}`)}
                            className="flex items-center gap-1 rounded-lg bg-[#F97316] px-2.5 py-1 text-xs font-semibold text-[#0B1220] transition-colors hover:bg-[#EA580C]"
                            title="Approve Leave"
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => showToast(`Rejected leave for ${req.employeeName}`)}
                            className="flex items-center gap-1 rounded-lg border border-[#F0E4D6] px-2.5 py-1 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#FFF7ED]"
                            title="Reject Leave"
                          >
                            <X className="h-3.5 w-3.5" /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
