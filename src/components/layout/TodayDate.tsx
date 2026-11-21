'use client';

import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';

/** Today's date in India time, e.g. "Thu, 19 Nov 2026". */
function formatToday(): string {
  const parts = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${part('weekday')}, ${part('day')} ${part('month')} ${part('year')}`;
}

/**
 * Small "Today: Thu, 19 Nov 2026" badge for the top header.
 * Rendered only in the browser (avoids a server/browser time-zone mismatch) and refreshed every minute,
 * so it rolls over to the next day at midnight without a page reload.
 */
export function TodayDate({ className = '' }: { className?: string }) {
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    setToday(formatToday());
    const timer = setInterval(() => setToday(formatToday()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!today) return null;

  return (
    <div
      className={`items-center gap-1.5 h-[30px] rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 whitespace-nowrap ${className}`}
      title="Today's date (India time)"
    >
      <CalendarDays className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
      <span>Today: {today}</span>
    </div>
  );
}

export default TodayDate;