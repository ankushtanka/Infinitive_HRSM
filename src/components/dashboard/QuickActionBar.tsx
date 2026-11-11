'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, CalendarDays, CreditCard, BarChart3, Megaphone } from 'lucide-react';

interface QuickActionBarProps {
  onAddEmployee?: () => void;
  onLogLeave?: () => void;
  onCreateAnnouncement?: () => void;
}

export const QuickActionBar: React.FC<QuickActionBarProps> = ({
  onAddEmployee,
  onLogLeave,
  onCreateAnnouncement,
}) => {
  const router = useRouter();

  const actions = [
    {
      id: 'add-employee',
      label: 'Add Employee',
      icon: UserPlus,
      onClick: () => {
        if (onAddEmployee) onAddEmployee();
        else router.push('/admin/employees');
      },
    },
    {
      id: 'log-leave',
      label: 'Log Leave',
      icon: CalendarDays,
      onClick: () => {
        if (onLogLeave) onLogLeave();
        else router.push('/admin/leave');
      },
    },
    {
      id: 'run-payroll',
      label: 'Run Payroll',
      icon: CreditCard,
      onClick: () => router.push('/admin/payroll'),
    },
    {
      id: 'generate-report',
      label: 'Generate Report',
      icon: BarChart3,
      onClick: () => router.push('/admin/reports'),
    },
    {
      id: 'send-notice',
      label: 'Send Notice',
      icon: Megaphone,
      onClick: () => {
        if (onCreateAnnouncement) onCreateAnnouncement();
        else router.push('/admin/communication');
      },
    },
  ];

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.id}
              onClick={act.onClick}
              type="button"
              className="group flex h-12 items-center gap-3 rounded-lg border border-[#F0E4D6] bg-white px-3.5 shadow-2xs transition-all duration-150 hover:bg-[#FFF7ED] hover:border-[#FED7AA] hover:shadow-xs active:scale-[0.99] cursor-pointer text-left"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA]/50 transition-colors group-hover:bg-[#FFEDD5]">
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-[13px] font-medium text-[#0F172A] group-hover:text-[#9A3412] truncate">
                {act.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
