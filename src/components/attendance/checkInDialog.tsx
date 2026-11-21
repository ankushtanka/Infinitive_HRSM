'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, Building2, ClipboardList, Clock, Home, Loader2, MapPin, X } from 'lucide-react';
import { requestPosition, type ClientGeo } from '@/lib/clientGeo';
import { acquireScrollLock } from '@/lib/scrollLock';

/** Result of a check-in / check-out. `null` from the open* functions means the person closed the dialog. */
export interface PunchResult {
  success: boolean;
  message: string;
  data?: any;
}

type WorkMode = 'OFFICE' | 'WFH';

let activeDialog: Promise<PunchResult | null> | null = null;

/** Renders a dialog into its own root on <body> and resolves when it finishes. One dialog at a time. */
function mountDialog(render: (finish: (value: PunchResult | null) => void) => React.ReactElement): Promise<PunchResult | null> {
  if (activeDialog) return activeDialog;
  activeDialog = new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let finished = false;
    const finish = (value: PunchResult | null) => {
      if (finished) return;
      finished = true;
      activeDialog = null;
      resolve(value);
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    root.render(render(finish));
  });
  return activeDialog;
}

async function postPunch(body: Record<string, unknown>): Promise<PunchResult & { code?: string }> {
  try {
    const res = await fetch('/api/v1/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) {
      return { success: true, message: json.message || 'Attendance updated.', data: json.data };
    }
    return {
      success: false,
      code: json?.code,
      message: json?.message || `Could not update attendance (HTTP ${res.status}).`,
    };
  } catch {
    return { success: false, message: 'Server connection error. Please check your internet and try again.' };
  }
}

/** Minutes after midnight for "10:00 AM" / "18:00", or null. */
function toMinutes(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const m = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const mod = m[3]?.toUpperCase();
  if (mod === 'PM' && h < 12) h += 12;
  if (mod === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function toTimeLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const min = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(min).padStart(2, '0')} ${suffix}`;
}

type Step = 'choose' | 'working' | 'error';

function CheckInDialog({ onFinish }: { onFinish: (value: PunchResult | null) => void }) {
  const [step, setStep] = useState<Step>('choose');
  const [workingText, setWorkingText] = useState('');
  const [error, setError] = useState<{ message: string; code?: string; mode: WorkMode } | null>(null);
  const [shiftLine, setShiftLine] = useState<string | null>(null);

  useEffect(() => acquireScrollLock(), []);

  // Shift timing line, e.g. "Shift 10:00 AM – 06:00 PM · Late after 10:15 AM"
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/settings/attendance', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.success) return;
        const start = toMinutes(json.data?.workStartTime);
        const end = toMinutes(json.data?.workEndTime);
        const grace = Number(json.data?.gracePeriodMinutes);
        if (start === null) return;
        const parts = [`Shift ${toTimeLabel(start)}${end !== null ? ` – ${toTimeLabel(end)}` : ''}`];
        if (json.data?.lateMarkingEnabled !== false && Number.isFinite(grace)) {
          parts.push(`Late after ${toTimeLabel(start + grace)}`);
        }
        setShiftLine(parts.join(' · '));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = step === 'working';

  const close = useCallback(() => {
    if (!busy) onFinish(null);
  }, [busy, onFinish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const checkIn = async (mode: WorkMode) => {
    setStep('working');
    setError(null);
    setWorkingText(mode === 'OFFICE' ? 'Checking your location…' : 'Checking in…');

    // Office needs the location; for WFH it is only kept for the record, so do not wait long
    const position = await requestPosition(mode === 'OFFICE' ? 12000 : 5000);
    const geo: ClientGeo | null = position.ok ? position.geo : null;

    setWorkingText('Checking in…');
    const result = await postPunch({ action: 'CLOCK_IN', workMode: mode, ...(geo ? { geo } : {}) });
    if (result.success) {
      onFinish({ success: true, message: result.message, data: result.data });
      return;
    }

    let message = result.message;
    if (result.code === 'GEO_REQUIRED' && !position.ok) {
      message =
        position.reason === 'denied'
          ? 'Location permission is blocked for this site. Click the lock icon next to the website address, allow Location, then try again.'
          : 'Your location could not be found. Turn on location / GPS (a phone works best) and try again.';
    }
    setError({ message, code: result.code, mode });
    setStep('error');
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-in-title"
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl text-xs text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <div>
            <h3 id="check-in-title" className="text-base font-bold text-slate-900">Check In</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">Where are you working from today?</p>
            {shiftLine && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-orange-700">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {shiftLine}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-50 hover:text-slate-700 disabled:opacity-50 cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {step === 'choose' && (
            <>
              <button
                type="button"
                onClick={() => checkIn('OFFICE')}
                className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-orange-400 hover:bg-orange-50/50 transition-colors cursor-pointer"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 border border-orange-200">
                  <Building2 className="h-5 w-5 text-orange-600" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-900">Office</span>
                  <span className="block text-[11px] text-slate-500">I am at the office. Your location will be checked.</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => checkIn('WFH')}
                className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-orange-400 hover:bg-orange-50/50 transition-colors cursor-pointer"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-200">
                  <Home className="h-5 w-5 text-blue-600" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-900">Work From Home</span>
                  <span className="block text-[11px] text-slate-500">
                    Your mentor / HR approves it, unless your WFH for today was already approved.
                  </span>
                </span>
              </button>
            </>
          )}

          {step === 'working' && (
            <div className="flex flex-col items-center gap-2 py-8 text-slate-600" role="status">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" aria-hidden="true" />
              <p className="font-semibold">{workingText}</p>
              {workingText.startsWith('Checking your location') && (
                <p className="text-[11px] text-slate-400">Allow location if your browser asks.</p>
              )}
            </div>
          )}

          {step === 'error' && error && (
            <div className="space-y-3">
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">
                {error.code === 'OUTSIDE_OFFICE' ? (
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
                )}
                <span>{error.message}</span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep('choose');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Back
                </button>
                {error.code === 'OUTSIDE_OFFICE' && (
                  <button
                    type="button"
                    onClick={() => checkIn('WFH')}
                    className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
                  >
                    Check in as Work From Home
                  </button>
                )}
                {error.code === 'WFH_REJECTED' && (
                  <button
                    type="button"
                    onClick={() => checkIn('OFFICE')}
                    className="rounded-xl bg-orange-500 px-4 py-2 font-bold text-white hover:bg-orange-600 cursor-pointer"
                  >
                    Check in from Office
                  </button>
                )}
                {!['ON_LEAVE', 'DAY_COMPLETED', 'WFH_REJECTED'].includes(error.code || '') && (
                  <button
                    type="button"
                    onClick={() => checkIn(error.mode)}
                    className="rounded-xl bg-orange-500 px-4 py-2 font-bold text-white hover:bg-orange-600 cursor-pointer"
                  >
                    Try Again
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Opens the Check In dialog (Office / Work From Home). Resolves with the server result once checked in,
 * or null when the person closes the dialog. Errors such as "outside the office" are shown inside the dialog.
 */
export function openCheckInDialog(): Promise<PunchResult | null> {
  return mountDialog((finish) => <CheckInDialog onFinish={finish} />);
}

const SUMMARY_MIN = 20;
const SUMMARY_MAX = 1500;

/** Work From Home check-out: asks what was done today, then checks out. */
function WorkSummaryDialog({
  geo,
  firstMessage,
  onFinish,
}: {
  geo: ClientGeo | null;
  firstMessage: string;
  onFinish: (value: PunchResult | null) => void;
}) {
  const [summary, setSummary] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => acquireScrollLock(), []);

  const close = useCallback(() => {
    if (!isSaving) onFinish(null);
  }, [isSaving, onFinish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const length = summary.trim().length;

  const submit = async () => {
    if (length < SUMMARY_MIN) {
      setError(`Write at least ${SUMMARY_MIN} characters about the work you did today.`);
      return;
    }
    setIsSaving(true);
    setError(null);
    const result = await postPunch({ action: 'CLOCK_OUT', workSummary: summary.trim(), ...(geo ? { geo } : {}) });
    setIsSaving(false);
    if (result.success) {
      onFinish({ success: true, message: result.message, data: result.data });
      return;
    }
    setError(result.message);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-summary-title"
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl text-xs text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <div>
            <h3 id="work-summary-title" className="flex items-center gap-1.5 text-base font-bold text-slate-900">
              <ClipboardList className="h-4 w-4 text-blue-600" aria-hidden="true" /> Check Out · Work From Home
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">{firstMessage || 'Write what you worked on today. Your mentor / HR will see it.'}</p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={isSaving}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-50 hover:text-slate-700 disabled:opacity-50 cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <label htmlFor="wfh-work-summary" className="font-bold text-slate-900">What did you work on today? *</label>
          <textarea
            id="wfh-work-summary"
            rows={5}
            maxLength={SUMMARY_MAX}
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              setError(null);
            }}
            disabled={isSaving}
            autoFocus
            placeholder="e.g. Finished the login page UI, fixed 2 bugs in the attendance report, attended the 4 PM team call."
            className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <p className={`text-right text-[10px] ${length < SUMMARY_MIN ? 'text-slate-400' : 'text-emerald-600'}`}>
            {length < SUMMARY_MIN ? `${SUMMARY_MIN - length} more characters needed` : `${length} characters`}
          </p>
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={isSaving}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white hover:bg-orange-600 disabled:opacity-60 cursor-pointer"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Check Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Checks out, sending the current location for the record (it never blocks check-out).
 * On a Work From Home day it first asks what was done today. Resolves with the server result,
 * or null when the person closes the dialog.
 */
export async function openCheckOutDialog(): Promise<PunchResult | null> {
  const position = await requestPosition(6000);
  const geo = position.ok ? position.geo : null;
  const first = await postPunch({ action: 'CLOCK_OUT', ...(geo ? { geo } : {}) });
  if (first.success || first.code !== 'WORK_SUMMARY_REQUIRED') return first;
  return mountDialog((finish) => <WorkSummaryDialog geo={geo} firstMessage="" onFinish={finish} />);
}