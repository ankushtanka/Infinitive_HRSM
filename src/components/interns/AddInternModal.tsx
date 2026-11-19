'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, GraduationCap, Loader2, MailWarning, X } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { getISTDateString } from '@/lib/dateUtils';
import {
  DEFAULT_INTERNSHIP_MONTHS,
  defaultInternshipEndDate,
  describeInternshipDuration,
  isValidIsoDate,
  sanitizeInternship,
} from '@/lib/employmentType';

export interface MentorOption {
  employeeId: string;
  name: string;
  designation?: string;
}

interface AddInternModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the intern account is created, so the list can refresh. */
  onCreated: () => void;
  /** Employees who can mentor (reporting manager for the intern). */
  mentors: MentorOption[];
  /** Department suggestions for the department field. */
  departments: string[];
}

interface InternForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  mentorId: string;
  location: string;
  startDate: string;
  endDate: string;
  institute: string;
  stipend: string;
}

const emptyForm = (): InternForm => {
  const startDate = getISTDateString(new Date());
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: '',
    designation: 'Intern',
    mentorId: '',
    location: 'Headquarters',
    startDate,
    // Default internship length is 3 months; the admin can pick a custom end date
    endDate: defaultInternshipEndDate(startDate) || '',
    institute: '',
    stipend: '',
  };
};

function formatDate(iso: string | null): string {
  if (!iso || !isValidIsoDate(iso)) return '';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const labelClass = 'font-bold text-slate-900';
const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none font-medium disabled:bg-slate-50';

function validate(form: InternForm): string | null {
  if (!form.firstName.trim() || !form.lastName.trim()) return 'First name and last name are required.';
  if (form.firstName.trim().length > 50 || form.lastName.trim().length > 50) return 'Name is too long (max 50 characters each).';
  if (!EMAIL_PATTERN.test(form.email.trim())) return 'Enter a valid email address. The intern logs in with this email.';
  if (form.phone.trim()) {
    const digits = form.phone.replace(/\D/g, '');
    if (!/^[+\d\s()-]+$/.test(form.phone.trim()) || digits.length < 7 || digits.length > 15) {
      return 'Enter a valid phone number.';
    }
  }
  if (!form.department.trim()) return 'Department is required.';
  return null;
}

/** Admin / HR form to add a new intern. Creates their own login and emails them an invitation. */
export function AddInternModal({ isOpen, onClose, onCreated, mentors, departments }: AddInternModalProps) {
  const [form, setForm] = useState<InternForm>(emptyForm);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<{ employeeId: string; email: string; inviteSent: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useBodyScrollLock(isOpen);

  const set = (patch: Partial<InternForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrorMessage(null);
  };

  const resetForm = useCallback(() => {
    setForm(emptyForm());
    setErrorMessage(null);
    setCreated(null);
  }, []);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }, [isSubmitting, resetForm, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  const defaultEndDate = useMemo(() => defaultInternshipEndDate(form.startDate), [form.startDate]);
  const durationLabel = useMemo(
    () => describeInternshipDuration(form.startDate, form.endDate || defaultEndDate || ''),
    [form.startDate, form.endDate, defaultEndDate]
  );

  /** Changing the start date moves the end date along, unless the admin picked a custom end date. */
  const changeStartDate = (startDate: string) => {
    const followsDefault = !form.endDate || form.endDate === defaultEndDate;
    set({ startDate, ...(followsDefault ? { endDate: defaultInternshipEndDate(startDate) || '' } : {}) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const formError = validate(form);
    if (formError) {
      setErrorMessage(formError);
      return;
    }
    const internship = sanitizeInternship({
      startDate: form.startDate,
      endDate: form.endDate,
      institute: form.institute,
      stipend: form.stipend,
    });
    if (!internship.ok) {
      setErrorMessage(internship.message);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          department: form.department.trim(),
          designation: form.designation.trim() || 'Intern',
          role: 'EMPLOYEE',
          joiningDate: internship.value.startDate,
          location: form.location.trim() || 'Headquarters',
          ...(form.mentorId ? { managerId: form.mentorId } : {}),
          employmentType: 'Intern',
          internship: internship.value,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setErrorMessage(data?.message || `Could not add the intern (HTTP ${res.status}).`);
        return;
      }
      setCreated({
        employeeId: data.data?.employeeId || '',
        email: data.email || form.email.trim().toLowerCase(),
        inviteSent: data.emailVerificationSent !== false,
      });
      onCreated();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Server connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-4 md:p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-intern-title"
        className="relative flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-fade-in text-xs text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-[#FED7AA]/60 bg-white p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 border border-orange-200">
              <GraduationCap className="h-5 w-5 text-orange-600" aria-hidden="true" />
            </div>
            <div>
              <h3 id="add-intern-title" className="text-base font-bold text-slate-900">
                {created ? 'Intern Added' : 'Add New Intern'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {created ? 'Their own login has been created' : 'The intern gets their own login and an invitation email'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-orange-50 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {created ? (
          /* Success state */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden="true" />
              <p className="text-sm font-bold text-slate-900">
                {form.firstName.trim()} {form.lastName.trim()} is now an intern
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left space-y-1">
                <p>
                  <span className="text-slate-500">Employee ID:</span>{' '}
                  <span className="font-mono font-bold text-slate-900">{created.employeeId || '—'}</span>
                </p>
                <p>
                  <span className="text-slate-500">Login email:</span>{' '}
                  <span className="font-bold text-slate-900">{created.email}</span>
                </p>
              </div>
              {created.inviteSent ? (
                <p className="text-slate-600">
                  An invitation email with a verification code has been sent. The intern sets their own password from it.
                </p>
              ) : (
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-amber-800">
                  <MailWarning className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  The account was created, but the invitation email could not be sent. Resend it from the user&apos;s
                  account settings once email (SMTP) is working.
                </p>
              )}
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Add Another Intern
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
            {errorMessage && (
              <div role="alert" className="shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
                {errorMessage}
              </div>
            )}

            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5">
              {/* Personal */}
              <section className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Intern Details</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="intern-first" className={labelClass}>First Name *</label>
                    <input id="intern-first" type="text" maxLength={50} autoFocus value={form.firstName}
                      onChange={(e) => set({ firstName: e.target.value })} disabled={isSubmitting} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="intern-last" className={labelClass}>Last Name *</label>
                    <input id="intern-last" type="text" maxLength={50} value={form.lastName}
                      onChange={(e) => set({ lastName: e.target.value })} disabled={isSubmitting} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="intern-email" className={labelClass}>Email (used to log in) *</label>
                    <input id="intern-email" type="email" autoComplete="off" value={form.email}
                      onChange={(e) => set({ email: e.target.value })} disabled={isSubmitting}
                      placeholder="name@example.com" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="intern-phone" className={labelClass}>Phone</label>
                    <input id="intern-phone" type="tel" value={form.phone}
                      onChange={(e) => set({ phone: e.target.value })} disabled={isSubmitting}
                      placeholder="+91 98765 43210" className={inputClass} />
                  </div>
                </div>
              </section>

              {/* Work */}
              <section className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Work</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="intern-dept" className={labelClass}>Department *</label>
                    <input id="intern-dept" type="text" list="intern-dept-options" value={form.department}
                      onChange={(e) => set({ department: e.target.value })} disabled={isSubmitting}
                      placeholder="e.g. Engineering & IT" className={inputClass} />
                    <datalist id="intern-dept-options">
                      {departments.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label htmlFor="intern-designation" className={labelClass}>Designation</label>
                    <input id="intern-designation" type="text" value={form.designation}
                      onChange={(e) => set({ designation: e.target.value })} disabled={isSubmitting}
                      placeholder="e.g. Cloud Intern" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="intern-mentor" className={labelClass}>Mentor / Reporting Manager</label>
                    <select id="intern-mentor" value={form.mentorId}
                      onChange={(e) => set({ mentorId: e.target.value })} disabled={isSubmitting} className={inputClass}>
                      <option value="">Not assigned yet</option>
                      {mentors.map((m) => (
                        <option key={m.employeeId} value={m.employeeId}>
                          {m.name} ({m.employeeId}){m.designation ? ` — ${m.designation}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] text-slate-500">The mentor will approve this intern&apos;s leave and attendance.</p>
                  </div>
                  <div>
                    <label htmlFor="intern-location" className={labelClass}>Work Location</label>
                    <input id="intern-location" type="text" value={form.location}
                      onChange={(e) => set({ location: e.target.value })} disabled={isSubmitting} className={inputClass} />
                  </div>
                </div>
              </section>

              {/* Internship */}
              <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-orange-700">Internship</h4>
                  {durationLabel && <span className="text-[11px] font-semibold text-orange-700">Duration: {durationLabel}</span>}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="intern-start" className={labelClass}>Start Date *</label>
                    <input id="intern-start" type="date" value={form.startDate}
                      onChange={(e) => changeStartDate(e.target.value)} disabled={isSubmitting} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="intern-end" className={labelClass}>End Date</label>
                    <input id="intern-end" type="date" value={form.endDate} min={form.startDate || undefined}
                      onChange={(e) => set({ endDate: e.target.value })} disabled={isSubmitting} className={inputClass} />
                    {defaultEndDate && form.endDate === defaultEndDate ? (
                      <p className="mt-1 text-[10px] text-slate-500">
                        Default: {DEFAULT_INTERNSHIP_MONTHS} months from the start date. Pick another date to set a custom end date.
                      </p>
                    ) : defaultEndDate ? (
                      <p className="mt-1 text-[10px] text-slate-500">
                        {form.endDate ? 'Custom end date. ' : `Empty: ${DEFAULT_INTERNSHIP_MONTHS} months will be used. `}
                        <button type="button" onClick={() => set({ endDate: defaultEndDate })} disabled={isSubmitting}
                          className="font-semibold text-orange-700 hover:underline cursor-pointer">
                          Use {DEFAULT_INTERNSHIP_MONTHS} months ({formatDate(defaultEndDate)})
                        </button>
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="intern-institute" className={labelClass}>College / Institute</label>
                    <input id="intern-institute" type="text" maxLength={150} value={form.institute}
                      onChange={(e) => set({ institute: e.target.value })} disabled={isSubmitting}
                      placeholder="e.g. MLSU Udaipur" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="intern-stipend" className={labelClass}>Monthly Stipend (₹)</label>
                    <input id="intern-stipend" type="number" min={0} step="1" inputMode="numeric" value={form.stipend}
                      onChange={(e) => set({ stipend: e.target.value })} disabled={isSubmitting}
                      placeholder="Leave empty if unpaid" className={inputClass} />
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="shrink-0 flex items-center justify-end gap-2 border-t border-slate-100 bg-white p-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GraduationCap className="h-4 w-4" aria-hidden="true" />}
                {isSubmitting ? 'Adding…' : 'Add Intern'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

export default AddInternModal;