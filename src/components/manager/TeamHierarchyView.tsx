'use client';

import React from 'react';
import {
  User,
  Users,
  Shield,
  Briefcase,
  Building2,
  CalendarCheck,
  ChevronDown,
  Eye,
  Calendar,
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

interface TeamHierarchyViewProps {
  managerName: string;
  managerEmpId: string;
  teamMembers: TeamMember[];
  onSelectMember: (member: TeamMember) => void;
}

export default function TeamHierarchyView({
  managerName,
  managerEmpId,
  teamMembers,
  onSelectMember,
}: TeamHierarchyViewProps) {
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
    <div className="w-full py-8 px-4 flex flex-col items-center">
      {/* 1. Root Manager Node */}
      <div className="relative flex flex-col items-center">
        <div className="w-72 rounded-2xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-600 p-5 text-white shadow-xl border border-indigo-500/30 transition-transform hover:-translate-y-1">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md text-base font-extrabold text-white shadow-inner border border-white/20">
              {managerName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase backdrop-blur-md">
                Reporting Manager
              </span>
              <h3 className="text-base font-bold truncate mt-1">{managerName}</h3>
              <p className="text-xs text-indigo-100 font-mono">{managerEmpId}</p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-xs text-indigo-100">
            <span className="flex items-center gap-1.5 font-medium">
              <Users className="h-3.5 w-3.5" />
              Direct Reports:
            </span>
            <span className="font-extrabold text-white px-2 py-0.5 rounded-full bg-white/20">
              {teamMembers.length}
            </span>
          </div>
        </div>

        {/* Vertical connector from manager node */}
        {teamMembers.length > 0 && (
          <div className="w-0.5 h-10 bg-slate-300" />
        )}
      </div>

      {/* 2. Direct Reports Branches */}
      {teamMembers.length === 0 ? (
        <div className="mt-8 text-center text-slate-400 py-8">
          <p className="text-sm font-semibold">No direct reports currently assigned.</p>
          <p className="text-xs text-slate-400 mt-1">Use the &quot;+ Add Team Member&quot; button to add reports to your team.</p>
        </div>
      ) : (
        <div className="w-full max-w-6xl flex flex-col items-center">
          {/* Horizontal crossbar connector */}
          <div className="w-full hidden md:block">
            <div className="h-0.5 bg-slate-300 mx-auto w-3/4" />
          </div>

          {/* Direct Reports Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6 w-full">
            {teamMembers.map((member) => {
              const initials = member.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);

              return (
                <div
                  key={member.id || member.employeeId}
                  className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-lg hover:border-blue-300 transition-all flex flex-col justify-between"
                >
                  {/* Top: Header with Avatar & Details */}
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 font-bold text-xs text-white shadow-xs">
                          {initials}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {member.name}
                          </h4>
                          <span className="text-[11px] font-mono text-slate-400 font-medium">
                            {member.employeeId}
                          </span>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/80">
                        <span className="h-1 w-1 rounded-full bg-emerald-500" />
                        {member.status}
                      </span>
                    </div>

                    <div className="mt-3.5 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5 truncate">
                        <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{member.designation}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{member.department}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Attendance Pill & View Button */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${getAttendanceBadgeClass(
                        member.todayAttendance?.status || 'Not Marked'
                      )}`}
                    >
                      <span className="h-1 w-1 rounded-full bg-current" />
                      {member.todayAttendance?.status || 'Not Marked'}
                    </span>

                    <button
                      onClick={() => onSelectMember(member)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Details</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

