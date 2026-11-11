'use client';
import { Portal } from '@/components/modals/Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React from 'react';
import {
  X,
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Calendar,
  Clock,
  Shield,
  CheckCircle2,
  CalendarCheck,
  Edit2,
  Send,
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
  phone?: string;
  department: string;
  designation: string;
  status: string;
  joiningDate?: string;
  photoUrl?: string | null;
  todayAttendance: TodayAttendance;
}

interface TeamMemberProfileModalProps {
  member: TeamMember | null;
  managerName?: string;
  onClose: () => void;
  onOpenEdit?: () => void;
  onOpenAttendance?: () => void;
  onOpenLeave?: () => void;
}

export default function TeamMemberProfileModal({
  member,
  managerName = 'Manager',
  onClose,
  onOpenEdit = () => {},
  onOpenAttendance = () => {},
  onOpenLeave = () => {},
}: TeamMemberProfileModalProps) {
  useBodyScrollLock(Boolean(member));
  if (!member) return null;

  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const getAttendanceBadgeClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'present':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'late':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'half day':
      case 'half_day':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'on leave':
      case 'leave':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'absent':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden max-h-[90vh]">
        {/* Banner and Header */}
        <div className="relative bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 p-6 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-lg p-1.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md text-xl font-bold text-white shadow-inner border border-white/20">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-extrabold">{member.name}</h2>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-md">
                  {member.employeeId}
                </span>
              </div>
              <p className="text-sm text-blue-100 mt-0.5">
                {member.designation} • {member.department}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200 border border-emerald-400/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {member.status}
                </span>
                <span className="text-xs text-blue-100/80">
                  Reports to <span className="font-semibold text-white">{managerName}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-6">
          {/* Today's Attendance Overview */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <CalendarCheck className="h-4 w-4 text-blue-600" />
                Today&apos;s Attendance Status (IST)
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${getAttendanceBadgeClass(
                  member.todayAttendance?.status || 'Not Marked'
                )}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {member.todayAttendance?.status || 'Not Marked'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-white p-3 border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase text-slate-400">Clock In</span>
                <p className="mt-1 text-sm font-bold text-slate-800">
                  {member.todayAttendance?.clockIn || '--:--'}
                </p>
              </div>
              <div className="rounded-xl bg-white p-3 border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase text-slate-400">Clock Out</span>
                <p className="mt-1 text-sm font-bold text-slate-800">
                  {member.todayAttendance?.clockOut || '--:--'}
                </p>
              </div>
              <div className="rounded-xl bg-white p-3 border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase text-slate-400">Total Hours</span>
                <p className="mt-1 text-sm font-bold text-slate-800">
                  {member.todayAttendance?.workHours || '--'}
                </p>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" /> Email Address
              </span>
              <p className="text-xs font-bold text-slate-800 truncate">{member.email}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" /> Phone Number
              </span>
              <p className="text-xs font-bold text-slate-800">
                {member.phone || 'Not provided'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-400" /> Department
              </span>
              <p className="text-xs font-bold text-slate-800">{member.department}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-slate-400" /> Designation
              </span>
              <p className="text-xs font-bold text-slate-800">{member.designation}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" /> Joining Date
              </span>
              <p className="text-xs font-bold text-slate-800">{member.joiningDate || 'N/A'}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-slate-400" /> Employment Status
              </span>
              <p className="text-xs font-bold text-slate-800">{member.status}</p>
            </div>
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenEdit();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
            >
              <Edit2 className="h-3.5 w-3.5 text-slate-500" />
              <span>Edit Details</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onOpenAttendance();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
            >
              <CalendarCheck className="h-3.5 w-3.5 text-blue-600" />
              <span>Manage Attendance</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onOpenLeave();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
            >
              <Send className="h-3.5 w-3.5 text-indigo-600" />
              <span>Request Leave</span>
            </button>
          </div>

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

