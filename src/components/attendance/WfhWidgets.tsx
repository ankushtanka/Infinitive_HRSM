'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, Home, Loader2, Plus, X, XCircle } from 'lucide-react';
import { getISTDateString } from '@/lib/dateUtils';

interface WfhRequestView {
  id: string;
  date: string;
  reason: string;
  source: 'ADVANCE' | 'CHECK_IN';
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  decidedBy: string | null;
  decisionComments: string;
  extensionDays: number;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '—';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
}

const STATUS_STYLE: Record<WfhRequestView['status'], string> = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

/**
 * Small line under today's attendance: Office (with office name) or Work From Home with its approval state.
 * Pass today's attendance record from /api/v1/attendance.
 */
export function WfhStatusBadge({ record }: { record: any }) {
  if (!record || !record.checkIn || record.checkIn === '--:--') return null;
  if (record.workMode === 'WFH' || record.wfhStatus) {
    const state = String(record.wfhStatus || 'PENDING').toUpperCase();
    const style =
      state === 'APPROVED'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : state === 'REJECTED'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-amber-50 text-amber-700 border-amber-200';
    const text =
      state === 'APPROVED'
        ? 'Work From Home · Approved'
        : state === 'REJECTED'
        ? 'Work From Home rejected · marked Absent'
        : 'Work From Home · Waiting for mentor / HR approval';
    return (
      <div className={`mb-3 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold ${style}`} role="status">
        <Home className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{text}</span>
      </div>
    );
  }
  if (record.workMode === 'OFFICE') {
    return (
      <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden="true" />
        <span>Office{record.location && record.location !== 'Office HQ' ? ` · ${record.location}` : ''}{record.isLate ? ' · Late' : ''}</span>
      </div>
    );
  }
  return null;
}

/** Attendance page card: ask for Work From Home a day (or more) in advance and see your requests. */
export function WfhRequestsCard() {
  const [requests, setRequests] = useState<WfhRequestView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const today = getISTDateString(new Date());
  const tomorrow = addDays(today, 1);
  const lastDay = addDays(today, 60);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/wfh', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && Array.isArray(json.data)) setRequests(json.data);
    } catch {
      /* list is optional */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = () => {
    setShowForm(true);
    setDate(tomorrow);
    setReason('');
    setNotice(null);
  };

  const submit = async () => {
    if (!date) return setNotice({ type: 'error', text: 'Choose a date.' });
    if (reason.trim().length < 5) return setNotice({ type: 'error', text: 'Write a short reason (at least 5 characters).' });
    setIsSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/v1/wfh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, reason: reason.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setNotice({ type: 'error', text: json?.message || `Could not send the request (HTTP ${res.status}).` });
        return;
      }
      setNotice({ type: 'success', text: json.message || 'Request sent.' });
      setShowForm(false);
      load();
    } catch {
      setNotice({ type: 'error', text: 'Server connection error. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const cancelRequest = async (id: string) => {
    setCancellingId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/wfh/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CANCEL' }),
      });
      const json = await res.json().catch(() => null);
      setNotice({ type: res.ok && json?.success ? 'success' : 'error', text: json?.message || 'Could not cancel the request.' });
      load();
    } catch {
      setNotice({ type: 'error', text: 'Server connection error. Please try again.' });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Home className="h-4 w-4 text-blue-600" aria-hidden="true" /> Work From Home
          </h3>
          <p className="text-slate-500">Ask at least one day before. Your mentor / HR approves it.</p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={openForm}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 font-bold text-white hover:bg-blue-700 cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Request WFH
          </button>
        )}
      </div>

      {showForm && (
        <div className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="wfh-date" className="font-bold text-slate-900">Date</label>
              <input
                id="wfh-date"
                type="date"
                min={tomorrow}
                max={lastDay}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setNotice(null);
                }}
                disabled={isSaving}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 font-medium focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="wfh-reason" className="font-bold text-slate-900">Reason</label>
              <input
                id="wfh-reason"
                type="text"
                maxLength={300}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setNotice(null);
                }}
                disabled={isSaving}
                placeholder="e.g. Plumber visit at home in the morning"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 font-medium focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">For today, choose Work From Home in the Check In popup instead.</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={isSaving}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Send Request
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`mt-3 flex items-start gap-2 rounded-xl border p-3 font-semibold ${
            notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {notice.type === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="mt-3">
        {isLoading ? (
          <p className="flex items-center gap-2 py-3 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" aria-hidden="true" /> Loading requests…
          </p>
        ) : requests.length === 0 ? (
          <p className="py-2 text-slate-400">No Work From Home requests yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {requests.slice(0, 6).map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{prettyDate(r.date)}</p>
                  <p className="text-[11px] text-slate-500 truncate max-w-[260px] sm:max-w-md">
                    {r.source === 'CHECK_IN' ? 'Chose Work From Home at check-in' : r.reason}
                  </p>
                  {r.decisionComments && <p className="text-[11px] italic text-slate-500">“{r.decisionComments}”</p>}
                  {r.extensionDays > 0 && (
                    <p className="text-[11px] font-semibold text-rose-700">Internship extended by {r.extensionDays} days</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[r.status]}`}>
                    {r.status === 'Rejected' && <XCircle className="h-3 w-3" aria-hidden="true" />}
                    {r.status}
                  </span>
                  {r.status === 'Pending' && r.date > today && (
                    <button
                      type="button"
                      onClick={() => cancelRequest(r.id)}
                      disabled={cancellingId !== null}
                      className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                    >
                      {cancellingId === r.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}