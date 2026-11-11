'use client';

import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useEmsStore } from '@/store/emsStore';
import { TrendingUp, Users } from 'lucide-react';

export const EmployeeGrowthChart: React.FC = () => {
  const { state } = useEmsStore();

  const growthData = useMemo(() => {
    const employees = state.employees || [];
    if (employees.length === 0) return [];

    const monthCounts: Record<string, number> = {};
    const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    employees.forEach((emp) => {
      if (emp.joiningDate) {
        const d = new Date(emp.joiningDate);
        if (!isNaN(d.getTime())) {
          const key = monthsOrder[d.getMonth()];
          monthCounts[key] = (monthCounts[key] || 0) + 1;
        }
      }
    });

    let runningTotal = 0;
    return monthsOrder.map((month) => {
      runningTotal += monthCounts[month] || 0;
      return { month, count: runningTotal };
    });
  }, [state.employees]);

  const hasData = (state.employees || []).length > 0;

  return (
    <div className="flex h-full w-full flex-col justify-between rounded-xl border border-[#F0E4D6] bg-white p-5 shadow-xs transition-all hover:shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#F7EFE5] pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[#0F172A]">Employee Growth Trend</h3>
            {hasData && (
              <span className="flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                <TrendingUp className="mr-1 h-3.5 w-3.5 text-emerald-600" /> {(state.employees || []).length} Total
              </span>
            )}
          </div>
          <p className="text-xs text-[#64748B]">Headcount trajectory based on joining dates</p>
        </div>
      </div>

      {/* Main Chart Body */}
      {!hasData ? (
        <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA]">
            <Users className="h-6 w-6" />
          </div>
          <h4 className="mt-3 text-sm font-semibold text-[#0F172A]">No employees recorded</h4>
          <p className="mt-1 max-w-xs text-xs text-[#64748B]">
            Add employees to visualize monthly headcount growth trajectory.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex-1 min-h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={growthData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F7EFE5" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }}
              />
              <YAxis
                domain={[0, 'dataMax + 2']}
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0F172A',
                  borderRadius: '8px',
                  border: '1px solid #FED7AA',
                  color: '#fff',
                  fontSize: '12px',
                  padding: '8px 12px',
                }}
                formatter={(value: number) => [`${value} Employees`, 'Headcount']}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#F97316"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#growthGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
