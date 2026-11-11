'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, UserPlus, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { useEmsStore } from '@/store/emsStore';
import { useAuthStore } from '@/store/authStore';
import { formatRoleLabel } from '@/lib/roleUtils';

interface WelcomeSectionProps {
  onAddEmployee?: () => void;
  onAddDepartment?: () => void;
  onAddDesignation?: () => void;
  onAddHoliday?: () => void;
  onCreateAnnouncement?: () => void;
  onAddLeaveType?: () => void;
}

export const WelcomeSection: React.FC<WelcomeSectionProps> = ({
  onAddEmployee,
}) => {
  const { state } = useEmsStore();
  const { user } = useAuthStore();
  const [currentDateFormatted, setCurrentDateFormatted] = useState<string>('');

  useEffect(() => {
    setCurrentDateFormatted(format(new Date(), 'EEEE, MMMM d, yyyy'));
  }, []);

  const displayName = user?.name || (user?.role?.toUpperCase().includes('SUPER') ? 'Super Administrator' : state.adminUser?.name || 'Administrator');
  const roleLabel = formatRoleLabel(user?.role || state.adminUser?.role);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[26px] font-bold leading-8 tracking-tight text-[#0F172A]">
            Welcome back, {displayName}!
          </h2>
          <span className="inline-flex items-center rounded-full bg-[#FFF7ED] px-3 py-1 text-xs font-semibold text-[#C2410C] border border-[#FED7AA]">
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-[#EA580C]" /> {roleLabel}
          </span>
        </div>
        <p className="mt-1 text-[13px] font-normal text-[#64748B]">
          Manage workforce operations, organization structure, attendance records, and system analytics.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Dynamic Date Display */}
        <div className="flex h-10 items-center gap-2 rounded-lg border border-[#F0E4D6] bg-white px-3.5 text-xs font-medium text-[#0F172A] shadow-2xs">
          <Calendar className="h-4 w-4 text-[#EA580C]" />
          <span>{currentDateFormatted || 'Loading date...'}</span>
        </div>

        {/* Primary Action Button (Solid Orange with Dark Navy Text for WCAG AA) */}
        {onAddEmployee && (
          <button
            onClick={onAddEmployee}
            type="button"
            className="flex h-10 items-center gap-2 rounded-lg bg-[#F97316] px-4 text-xs font-semibold text-[#0B1220] shadow-xs transition-all duration-150 hover:bg-[#EA580C] active:bg-[#C2410C] cursor-pointer"
          >
            <UserPlus className="h-4 w-4 text-[#0B1220]" />
            <span>+ Add Employee</span>
          </button>
        )}
      </div>
    </div>
  );
};
