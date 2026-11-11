'use client';

import React from 'react';
import Link from 'next/link';
import { UserPlus, Sparkles } from 'lucide-react';

interface AddNewAccountCardProps {
  onOpenModal?: () => void;
  userRole?: string;
}

export const AddNewAccountCard: React.FC<AddNewAccountCardProps> = ({
  onOpenModal,
  userRole = 'ADMIN',
}) => {
  // Access Control check: Only SUPER_ADMIN, ADMIN, HR can see this card
  const isAuthorized = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(userRole.toUpperCase());

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#F0E4D6] bg-white p-5 shadow-xs transition-all duration-200 hover:border-[#FED7AA] hover:shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA] shadow-2xs">
            <UserPlus className="h-5 w-5" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#0F172A] tracking-tight">Add New Account</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF7ED] px-2.5 py-0.5 text-[10px] font-semibold text-[#C2410C] border border-[#FED7AA]">
                <Sparkles className="h-3 w-3 text-[#EA580C]" /> Secure Email OTP
              </span>
            </div>
            <p className="text-xs text-[#64748B] leading-relaxed max-w-lg">
              Create a secure user account and send email verification to the user.
            </p>
            <p className="text-[11px] text-[#64748B] font-medium pt-0.5">
              {userRole === 'SUPER_ADMIN'
                ? 'Create Super Admin, Admin, HR, Manager, or Employee accounts with secure email verification.'
                : 'Create employee, manager, HR or admin accounts with secure email verification.'}
            </p>
          </div>
        </div>

        <div className="w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
          {onOpenModal ? (
            <button
              type="button"
              onClick={onOpenModal}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-[#F97316] px-4 py-2.5 text-xs font-semibold text-[#0B1220] shadow-xs hover:bg-[#EA580C] active:bg-[#C2410C] transition-all cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add New Account</span>
            </button>
          ) : (
            <Link
              href="/admin/accounts/new"
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-[#F97316] px-4 py-2.5 text-xs font-semibold text-[#0B1220] shadow-xs hover:bg-[#EA580C] active:bg-[#C2410C] transition-all"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add New Account</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};
