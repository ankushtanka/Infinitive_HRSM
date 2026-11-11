'use client';

import React from 'react';
import Link from 'next/link';
import { useEmsStore } from '@/store/emsStore';
import { Megaphone, Pin, ArrowRight, BellOff } from 'lucide-react';

export const Announcements: React.FC = () => {
  const { state } = useEmsStore();
  const announcements = state.announcements || [];

  return (
    <div className="flex h-full w-full flex-col rounded-xl border border-[#F0E4D6] bg-white p-5 shadow-xs transition-all hover:shadow-sm">
      {/* Header - Fixed outside the scrollable container */}
      <div className="flex items-center justify-between border-b border-[#F7EFE5] pb-3.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA]">
            <Megaphone className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-[#0F172A]">Announcements</h3>
              {announcements.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-[#FFF7ED] px-2 py-0.5 text-[10px] font-semibold text-[#C2410C] border border-[#FED7AA]/60">
                  {announcements.length}
                </span>
              )}
            </div>
            <p className="text-xs text-[#64748B]">Company broadcast & policy alerts</p>
          </div>
        </div>
        <Link
          href="/admin/communication"
          className="flex items-center gap-1 text-xs font-semibold text-[#EA580C] hover:text-[#C2410C] transition-colors"
        >
          View All <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Announcements List vs Empty State */}
      {announcements.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA]">
            <BellOff className="h-6 w-6" />
          </div>
          <h4 className="mt-3 text-sm font-semibold text-[#0F172A]">No announcements yet</h4>
          <p className="mt-1 max-w-xs text-xs text-[#64748B]">
            HR policies, general notices, and broadcast updates published by Admin will display here.
          </p>
        </div>
      ) : (
        <div
          className="mt-3.5 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1.5 max-h-[380px] hrms-scrollbar"
        >
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className={`relative rounded-xl border p-3.5 transition-all hover:shadow-xs ${
                ann.isImportant
                  ? 'border-[#FED7AA] bg-[#FFF7ED]/70'
                  : 'border-[#F0E4D6] bg-[#FFFBF7] hover:bg-[#FFF7ED]'
              }`}
            >
              {ann.isImportant && (
                <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-[#F97316] px-2 py-0.5 text-[10px] font-semibold text-[#0B1220]">
                  <Pin className="h-2.5 w-2.5" /> Pinned
                </span>
              )}

              <div className="flex items-center gap-2">
                <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-[#64748B] border border-[#F0E4D6]">
                  {ann.category}
                </span>
                <span className="text-[11px] text-[#64748B]">{ann.date}</span>
              </div>

              <h4 className="mt-1.5 text-sm font-semibold text-[#0F172A]">{ann.title}</h4>
              <p className="mt-1 text-xs text-[#64748B] line-clamp-2">{ann.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
