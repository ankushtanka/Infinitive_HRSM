'use client';

import React from 'react';
import { Users, UserCheck, UserMinus, UserPlus, TrendingUp, TrendingDown, Clock, CreditCard, ShieldCheck } from 'lucide-react';
import { KpiMetric } from '@/types/dashboard';

const iconMap: Record<string, React.ElementType> = {
  'users': Users,
  'user-check': UserCheck,
  'user-minus': UserMinus,
  'user-plus': UserPlus,
  'clock': Clock,
  'credit-card': CreditCard,
  'shield-check': ShieldCheck,
};

interface StatCardProps {
  metric: KpiMetric;
}

export const StatCard: React.FC<StatCardProps> = ({ metric }) => {
  const IconComponent = iconMap[metric.iconName] || Users;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[#F0E4D6] bg-white p-[18px] shadow-xs transition-all duration-200 hover:border-[#FED7AA] hover:shadow-sm">
      {/* Top Row: Title & Light Peach Icon Chip */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#64748B] truncate">
          {metric.title}
        </span>
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA]/60 shadow-2xs transition-transform group-hover:scale-105">
          <IconComponent className="h-[17px] w-[17px]" />
        </div>
      </div>

      {/* Main Metric Value: 28px Bold with Tabular Numerals */}
      <div className="mt-2.5 flex items-baseline justify-between">
        <div className="text-[28px] font-bold text-[#0F172A] leading-9 tracking-tight tabular-nums">
          {metric.value}
        </div>
      </div>

      {/* Bottom Delta & Contextual Period */}
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            metric.isPositive
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {metric.isPositive ? (
            <TrendingUp className="mr-1 h-3 w-3 text-emerald-600" />
          ) : (
            <TrendingDown className="mr-1 h-3 w-3 text-rose-600" />
          )}
          {metric.change}
        </span>
        <span className="text-[11px] font-normal text-[#64748B]">
          {metric.periodText || 'vs last month'}
        </span>
      </div>
    </div>
  );
};
