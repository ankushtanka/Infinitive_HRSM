'use client';

import React, { useState } from 'react';
import { MapPin, MapPinOff, ShieldCheck, Play, Square, Loader2, Lock } from 'lucide-react';
import { useTracking } from '@/lib/clientGeo';
import { formatISTTime } from '@/lib/dateUtils';

export function EmployeeTrackingPanel({ checkedIn }: { checkedIn: boolean }) {
  const t = useTracking(checkedIn);
  const [consent, setConsent] = useState(false);

  // Nothing to show when the organization has not enabled tracking
  if (t.status === 'loading' || (t.status === 'disabled' && !t.message && !t.policy?.exempted)) return null;
  if (t.status === 'disabled' && t.policy?.exempted) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#F0E4D6] bg-[#FFFBF7] p-4 text-xs text-slate-600">
        <Lock className="h-4 w-4" /> You are exempted from live location tracking.
      </div>
    );
  }
  if (!checkedIn && t.status !== 'active') return null;

  const active = t.status === 'active';
  const outside = active && t.withinGeofence === false;

  return (
    <div
      className={`rounded-2xl border p-4 text-xs ${
        outside
          ? 'border-rose-200 bg-rose-50/70'
          : active
          ? 'border-emerald-200 bg-emerald-50/60'
          : t.status === 'denied' || t.status === 'error'
          ? 'border-amber-200 bg-amber-50/70'
          : 'border-[#F0E4D6] bg-white'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {active ? (
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </span>
            ) : t.status === 'denied' ? (
              <MapPinOff className="h-4 w-4 text-amber-700" />
            ) : (
              <MapPin className="h-4 w-4 text-slate-500" />
            )}
          </div>
          <div className="space-y-0.5">
            <p className="font-bold text-slate-900">
              {active && 'Live tracking is ON'}
              {t.status === 'starting' && 'Starting live tracking…'}
              {t.status === 'idle' && 'Live tracking is OFF'}
              {t.status === 'denied' && 'Location permission is blocked'}
              {t.status === 'error' && 'Live tracking problem'}
              {t.status === 'disabled' && 'Live tracking is unavailable'}
            </p>
            <p className="text-[11px] text-slate-600">
              {active && (
                <>
                  Your location is shared with your manager and HR until you stop tracking or check out.
                  {t.startedAt && ` Started ${formatISTTime(t.startedAt.toISOString())}.`}
                  {t.lastSentAt && ` Last update ${formatISTTime(t.lastSentAt.toISOString())}.`}
                  {t.accuracy != null && ` Accuracy ±${t.accuracy} m.`}
                  {t.withinGeofence === true && ' You are within the office area.'}
                  {t.withinGeofence === false &&
                    ` You are outside the office area${t.distanceMeters != null ? ` (about ${t.distanceMeters} m away)` : ''}.`}
                </>
              )}
              {t.message && <span className="block font-medium text-amber-800">{t.message}</span>}
            </p>
          </div>
        </div>

        <div className="shrink-0">
          {active ? (
            <button
              onClick={t.stop}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 font-bold text-white hover:bg-rose-500 cursor-pointer"
            >
              <Square className="h-3.5 w-3.5" /> Stop tracking
            </button>
          ) : t.status === 'starting' ? (
            <span className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting…
            </span>
          ) : t.status !== 'disabled' && t.policy?.requireConsent ? (
            <button
              onClick={() => t.start(consent)}
              disabled={!checkedIn || !consent}
              className="inline-flex items-center gap-2 rounded-xl bg-[#F97316] px-4 py-2 font-bold text-[#081220] hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" /> Start tracking
            </button>
          ) : t.status !== 'disabled' && checkedIn && !t.message ? (
            <span className="text-[11px] font-semibold text-slate-400">Starting automatically…</span>
          ) : null}
        </div>
      </div>

      {!active && t.status !== 'disabled' && t.policy?.requireConsent && (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded text-[#F97316]"
          />
          <span className="text-[11px] leading-relaxed text-slate-600">
            <span className="flex items-center gap-1 font-bold text-slate-800">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> I understand and agree
            </span>
            While tracking is on, my device location is sent every {t.policy.pingIntervalSeconds} seconds and is visible to my
            manager, HR and administrators. Tracking works only while I am checked in and this page stays open, and it stops
            when I check out or press Stop. Location history is kept for up to {t.policy.retentionDays} days.
          </span>
        </label>
      )}
    </div>
  );
}
