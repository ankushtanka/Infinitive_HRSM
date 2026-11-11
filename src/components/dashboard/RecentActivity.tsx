'use client';

import React from 'react';
import { useEmsStore } from '@/store/emsStore';
import { Activity, Clock, Inbox } from 'lucide-react';

export const RecentActivity: React.FC = () => {
  const { state } = useEmsStore();
  const activities = state.activities || [];

  return (
    <div className="flex h-full w-full flex-col rounded-xl border border-[#F0E4D6] bg-white p-5 shadow-xs transition-all hover:shadow-sm">
      {/* Header - Fixed outside the scrollable container */}
      <div className="flex items-center justify-between border-b border-[#F7EFE5] pb-3.5 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[#0F172A]">Recent Activity Stream</h3>
            {activities.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-[#FFF7ED] px-2 py-0.5 text-[10px] font-semibold text-[#C2410C] border border-[#FED7AA]/60">
                {activities.length} {activities.length === 1 ? 'event' : 'events'}
              </span>
            )}
          </div>
          <p className="text-xs text-[#64748B]">Real-time system audit & update timeline</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA]">
          <Activity className="h-4 w-4" />
        </div>
      </div>

      {/* Activity Stream vs Empty State */}
      {activities.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA]">
            <Inbox className="h-6 w-6" />
          </div>
          <h4 className="mt-3 text-sm font-semibold text-[#0F172A]">No recent activity</h4>
          <p className="mt-1 max-w-xs text-xs text-[#64748B]">
            Admin data entries, employee updates, and system events will stream live here.
          </p>
        </div>
      ) : (
        <div
          className="mt-3.5 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1.5 max-h-[380px] hrms-scrollbar"
        >
          {activities.map((act, index) => (
            <div key={act.id || index} className="relative flex items-start gap-3 pl-1">
              {/* Continuous vertical timeline connector to the next item */}
              {index < activities.length - 1 && (
                <span
                  className="absolute left-[19px] top-8 -bottom-3 w-[2px] bg-[#FED7AA]"
                  aria-hidden="true"
                />
              )}

              {/* Avatar or User Indicator */}
              <div className="relative z-10 h-8 w-8 shrink-0 overflow-hidden rounded-full ring-2 ring-white shadow-xs bg-[#FFF7ED]">
                <img
                  src={act.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80'}
                  alt={act.user}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80';
                  }}
                  className="h-full w-full object-cover"
                />
              </div>

              {/* Activity Details Box */}
              <div className="flex-1 rounded-xl bg-[#FFFBF7] p-3 text-xs text-[#0F172A] transition-all hover:bg-[#FFF7ED] border border-[#F0E4D6]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#0F172A] truncate">{act.user}</span>
                  <span className="flex items-center shrink-0 text-[10px] text-[#64748B]">
                    <Clock className="mr-1 h-3 w-3 text-[#EA580C]" /> {act.timestamp}
                  </span>
                </div>
                <p className="mt-1 text-[#64748B] font-medium leading-relaxed">{act.action}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
