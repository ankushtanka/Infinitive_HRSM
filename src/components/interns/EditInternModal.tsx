'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, Loader2, Save, X } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  DEFAULT_INTERNSHIP_MONTHS,
  defaultInternshipEndDate,
  describeInternshipDuration,
  isValidIsoDate,
  sanitizeInternship,
} from '@/lib/employmentType';
import type { MentorOption } from '@/components/interns/AddInternModal';

interface EditInternModalProps {
  /** Raw intern record from /api/v1/employees (null = closed). */
  intern: any | null;
  mentors: MentorOption[];
  departments: string[];
  onClose: () => void;
  /** Called after a successful save with a short confirmation message. */
  onSaved: (message: string) => void;
}

type Tab = 'personal' | 'internship' | 'emergency' | 'bank' | 'govt';

const TABS: { key: Tab; label: string }[] = [
  { key: 'personal', label: 'Personal' },
  { key: 'internship', label: 'Internship & Work' },
  { key: 'emergency', label: 'Emergency Contact' },
  { key: 'bank', label: 'Bank Details' },
  { key: 'govt', label: 'Govt ID' },
];

const STATUS_OPTIONS = ['Active', 'On Leave', 'Suspended', 'Resigned', 'Terminated'];

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  city: string;
  state: string;
  country: string;
  department: string;
  designation: string;
  managerId: string;
  location: string;
  status: string;
  startDate: string;
  endDate: string;
  institute: string;
  stipend: string;
  emergencyContactName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  emergencyAddress: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  accountHolder: string;
  panNumber: string;
  aadhaarNo: string;
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

function toForm(intern: any): FormState {
  const internship = intern?.internship || {};
  return {
    firstName: str(intern?.firstName),
    lastName: str(intern?.lastName),
    email: str(intern?.email),
    phone: str(intern?.phone),
    dateOfBirth: str(intern?.dateOfBirth).slice(0, 10),
    gender: str(intern?.gender),
    address: str(intern?.address),
    city: str(intern?.city),
    state: str(intern?.state),
    country: str(intern?.country) || 'India',
    department: str(intern?.department),
    designation: str(intern?.designation) || 'Intern',
    managerId: str(intern?.managerId || intern?.reportingTo),
    location: str(intern?.location),
    status: STATUS_OPTIONS.includes(str(intern?.status)) ? str(intern?.status) : 'Active',
    startDate: str(internship.startDate || str(intern?.joiningDate).slice(0, 10)),
    endDate: str(internship.endDate),
    institute: str(internship.institute),
    stipend: internship.stipend !== undefined && internship.stipend !== null ? String(internship.stipend) : '',
    emergencyContactName: str(intern?.emergencyContactName),
    emergencyRelationship: str(intern?.emergencyRelationship),
    emergencyPhone: str(intern?.emergencyPhone),
    emergencyAddress: str(intern?.emergencyAddress),
    bankName: str(intern?.bankName),
    accountNumber: str(intern?.accountNumber),
    ifscCode: str(intern?.ifscCode),
    accountHolder: str(intern?.accountHolder),
    panNumber: str(intern?.panNumber),
    aadhaarNo: str(intern?.aadhaarNo),
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDate(iso: string | null): string {
  if (!iso || !isValidIsoDate(iso)) return '';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const labelClass = 'font-bold text-slate-900';
const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none font-medium disabled:bg-slate-50';

/** Edit an intern's profile, work and internship details (PATCH /api/v1/employees/:id). */
export function EditInternModal({ intern, mentors, departments, onClose, onSaved }: EditInternModalProps) {
  const [form, setForm] = useState<FormState>(() => toForm(intern));
  const [activeTab, setActiveTab] = useState<Tab>('personal');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (intern) {
      setForm(toForm(intern));
      setActiveTab('personal');
      setErrorMessage(null);
    }
  }, [intern]);
  useBodyScrollLock(Boolean(intern));

  const handleClose = useCallback(() => {
    if (!isSaving) onClose();
  }, [isSaving, onClose]);

  useEffect(() => {
    if (!intern) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [intern, handleClose]);

  if (!mounted || !intern) return null;

  const set = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrorMessage(null);
  };
  const fail = (message: string, tab: Tab) => {
    setErrorMessage(message);
    setActiveTab(tab);
  };

  const emailChanged = form.email.trim().toLowerCase() !== str(intern.email).trim().toLowerCase();
  const defaultEndDate = defaultInternshipEndDate(form.startDate);
  const durationLabel = describeInternshipDuration(form.startDate, form.endDate || defaultEndDate || '');

  /** Changing the start date moves the end date along, unless a custom end date was picked. */
  const changeStartDate = (startDate: string) => {
    const followsDefault = !form.endDate || form.endDate === defaultEndDate;
    set({ startDate, ...(followsDefault ? { endDate: defaultInternshipEndDate(startDate) || '' } : {}) });
  };
  // The intern's current mentor stays selectable even if they are not in the active-staff list
  const mentorOptions = mentors.some((m) => m.employeeId === form.managerId) || !form.managerId
    ? mentors
    : [{ employeeId: form.managerId, name: form.managerId }, ...mentors];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!form.firstName.trim() || !form.lastName.trim()) return fail('First name and last name are required.', 'personal');
    if (!EMAIL_PATTERN.test(form.email.trim())) return fail('Enter a valid email address.', 'personal');
    if (!form.department.trim()) return fail('Department is required.', 'internship');
    const internship = sanitizeInternship({
      startDate: form.startDate,
      endDate: form.endDate,
      institute: form.institute,
      stipend: form.stipend,
    });
    if (!internship.ok) return fail(internship.message, 'internship');

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const targetId = intern._id ? String(intern._id) : intern.employeeId;
      const res = await fetch(`/api/v1/employees/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          country: form.country.trim(),
          department: form.department.trim(),
          designation: form.designation.trim() || 'Intern',
          managerId: form.managerId,
          location: form.location.trim(),
          // Only send status when the admin changed it, so a pending (not yet verified) login is not activated by a plain edit
          ...(form.status !== str(intern.status) ? { status: form.status } : {}),
          internship: internship.value,
          emergencyContactName: form.emergencyContactName.trim(),
          emergencyRelationship: form.emergencyRelationship.trim(),
          emergencyPhone: form.emergencyPhone.trim(),
          emergencyAddress: form.emergencyAddress.trim(),
          bankName: form.bankName.trim(),
          accountNumber: form.accountNumber.trim(),
          ifscCode: form.ifscCode.trim().toUpperCase(),
          accountHolder: form.accountHolder.trim(),
          panNumber: form.panNumber.trim().toUpperCase(),
          aadhaarNo: form.aadhaarNo.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setErrorMessage(data?.message || `Could not save changes (HTTP ${res.status}).`);
        return;
      }
      onSaved(`${form.firstName.trim()} ${form.lastName.trim()} (${intern.employeeId}) updated successfully.`);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Server connection error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const name = `${str(intern.firstName)} ${str(intern.lastName)}`.trim();

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
        aria-labelledby="edit-intern-title"
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
              <h3 id="edit-intern-title" className="text-base font-bold text-slate-900">Edit Intern</h3>
              <p className="text-[11px] text-slate-500">
                {name} • <span className="font-mono">{intern.employeeId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-orange-50 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-slate-200 bg-slate-50 px-4 text-xs font-semibold overflow-x-auto" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-4 py-3 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === tab.key ? 'border-orange-500 text-orange-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          {errorMessage && (
            <div role="alert" className="shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
              {errorMessage}
            </div>
          )}

          <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
            {activeTab === 'personal' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ei-first" className={labelClass}>First Name *</label>
                  <input id="ei-first" type="text" maxLength={50} value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-last" className={labelClass}>Last Name *</label>
                  <input id="ei-last" type="text" maxLength={50} value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-email" className={labelClass}>Email (used to log in) *</label>
                  <input id="ei-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} disabled={isSaving} className={inputClass} />
                  {emailChanged && (
                    <p className="mt-1 text-[10px] font-semibold text-amber-700">
                      Changing the email means the intern has to verify the new address before logging in again.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="ei-phone" className={labelClass}>Phone</label>
                  <input id="ei-phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-dob" className={labelClass}>Date of Birth</label>
                  <input id="ei-dob" type="date" value={form.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-gender" className={labelClass}>Gender</label>
                  <select id="ei-gender" value={form.gender} onChange={(e) => set({ gender: e.target.value })} disabled={isSaving} className={inputClass}>
                    <option value="">Not specified</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="ei-address" className={labelClass}>Address</label>
                  <input id="ei-address" type="text" value={form.address} onChange={(e) => set({ address: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-city" className={labelClass}>City</label>
                  <input id="ei-city" type="text" value={form.city} onChange={(e) => set({ city: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-state" className={labelClass}>State</label>
                  <input id="ei-state" type="text" value={form.state} onChange={(e) => set({ state: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
              </div>
            )}

            {activeTab === 'internship' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ei-dept" className={labelClass}>Department *</label>
                    <input id="ei-dept" type="text" list="ei-dept-options" value={form.department} onChange={(e) => set({ department: e.target.value })} disabled={isSaving} className={inputClass} />
                    <datalist id="ei-dept-options">
                      {departments.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label htmlFor="ei-designation" className={labelClass}>Designation</label>
                    <input id="ei-designation" type="text" value={form.designation} onChange={(e) => set({ designation: e.target.value })} disabled={isSaving} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="ei-mentor" className={labelClass}>Mentor / Reporting Manager</label>
                    <select id="ei-mentor" value={form.managerId} onChange={(e) => set({ managerId: e.target.value })} disabled={isSaving} className={inputClass}>
                      <option value="">Not assigned</option>
                      {mentorOptions.map((m) => (
                        <option key={m.employeeId} value={m.employeeId}>
                          {m.name} ({m.employeeId}){m.designation ? ` — ${m.designation}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ei-location" className={labelClass}>Work Location</label>
                    <input id="ei-location" type="text" value={form.location} onChange={(e) => set({ location: e.target.value })} disabled={isSaving} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="ei-status" className={labelClass}>Account Status</label>
                    <select id="ei-status" value={form.status} onChange={(e) => set({ status: e.target.value })} disabled={isSaving} className={inputClass}>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    {['Suspended', 'Resigned', 'Terminated'].includes(form.status) && (
                      <p className="mt-1 text-[10px] font-semibold text-rose-700">The intern will not be able to log in with this status.</p>
                    )}
                  </div>
                </div>

                <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-orange-700">Internship</h4>
                    {durationLabel && <span className="text-[11px] font-semibold text-orange-700">Duration: {durationLabel}</span>}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="ei-start" className={labelClass}>Start Date *</label>
                      <input id="ei-start" type="date" value={form.startDate} onChange={(e) => changeStartDate(e.target.value)} disabled={isSaving} className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="ei-end" className={labelClass}>End Date</label>
                      <input id="ei-end" type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set({ endDate: e.target.value })} disabled={isSaving} className={inputClass} />
                      {defaultEndDate && form.endDate === defaultEndDate ? (
                        <p className="mt-1 text-[10px] text-slate-500">
                          Default: {DEFAULT_INTERNSHIP_MONTHS} months from the start date. Pick another date to set a custom end date.
                        </p>
                      ) : defaultEndDate ? (
                        <p className="mt-1 text-[10px] text-slate-500">
                          {form.endDate ? 'Custom end date. ' : `Empty: ${DEFAULT_INTERNSHIP_MONTHS} months will be used. `}
                          <button type="button" onClick={() => set({ endDate: defaultEndDate })} disabled={isSaving}
                            className="font-semibold text-orange-700 hover:underline cursor-pointer">
                            Use {DEFAULT_INTERNSHIP_MONTHS} months ({formatDate(defaultEndDate)})
                          </button>
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label htmlFor="ei-institute" className={labelClass}>College / Institute</label>
                      <input id="ei-institute" type="text" maxLength={150} value={form.institute} onChange={(e) => set({ institute: e.target.value })} disabled={isSaving} className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="ei-stipend" className={labelClass}>Monthly Stipend (₹)</label>
                      <input id="ei-stipend" type="number" min={0} step="1" inputMode="numeric" value={form.stipend} onChange={(e) => set({ stipend: e.target.value })} disabled={isSaving} placeholder="Leave empty if unpaid" className={inputClass} />
                    </div>
                  </div>
                  {intern.internship?.extendedEndDate && intern.internship.extendedEndDate !== intern.internship.endDate && (
                    <p className="text-[11px] font-semibold text-orange-700">
                      Extended till {intern.internship.extendedEndDate} because of leave taken (managed automatically).
                    </p>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'emergency' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ei-ec-name" className={labelClass}>Contact Person</label>
                  <input id="ei-ec-name" type="text" value={form.emergencyContactName} onChange={(e) => set({ emergencyContactName: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-ec-rel" className={labelClass}>Relationship</label>
                  <input id="ei-ec-rel" type="text" value={form.emergencyRelationship} onChange={(e) => set({ emergencyRelationship: e.target.value })} disabled={isSaving} placeholder="e.g. Father" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-ec-phone" className={labelClass}>Phone</label>
                  <input id="ei-ec-phone" type="tel" value={form.emergencyPhone} onChange={(e) => set({ emergencyPhone: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="ei-ec-address" className={labelClass}>Address</label>
                  <input id="ei-ec-address" type="text" value={form.emergencyAddress} onChange={(e) => set({ emergencyAddress: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
              </div>
            )}

            {activeTab === 'bank' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <p className="sm:col-span-2 text-[11px] text-slate-500">Used for stipend payments.</p>
                <div>
                  <label htmlFor="ei-bank" className={labelClass}>Bank Name</label>
                  <input id="ei-bank" type="text" value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-acc" className={labelClass}>Account Number</label>
                  <input id="ei-acc" type="text" value={form.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-ifsc" className={labelClass}>IFSC Code</label>
                  <input id="ei-ifsc" type="text" value={form.ifscCode} onChange={(e) => set({ ifscCode: e.target.value })} disabled={isSaving} placeholder="e.g. HDFC0001234" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-holder" className={labelClass}>Account Holder</label>
                  <input id="ei-holder" type="text" value={form.accountHolder} onChange={(e) => set({ accountHolder: e.target.value })} disabled={isSaving} className={inputClass} />
                </div>
              </div>
            )}

            {activeTab === 'govt' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ei-pan" className={labelClass}>PAN Number</label>
                  <input id="ei-pan" type="text" value={form.panNumber} onChange={(e) => set({ panNumber: e.target.value })} disabled={isSaving} placeholder="e.g. ABCDE1234F" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ei-aadhaar" className={labelClass}>Aadhaar Number</label>
                  <input id="ei-aadhaar" type="text" inputMode="numeric" value={form.aadhaarNo} onChange={(e) => set({ aadhaarNo: e.target.value })} disabled={isSaving} placeholder="12 digits" className={inputClass} />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-end gap-2 border-t border-slate-100 bg-white p-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default EditInternModal;