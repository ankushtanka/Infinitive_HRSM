'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, Lock, Pencil, X } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { effectiveInternshipEndDate, isValidIsoDate } from '@/lib/employmentType';

interface InternProfileModalProps {
  /** Raw intern record from /api/v1/employees (null = closed). */
  intern: any | null;
  mentorName: string;
  onClose: () => void;
  onEdit: (intern: any) => void;
}

type Tab = 'personal' | 'internship' | 'emergency' | 'bank' | 'govt';

const TABS: { key: Tab; label: string }[] = [
  { key: 'personal', label: 'Personal Info' },
  { key: 'internship', label: 'Internship' },
  { key: 'emergency', label: 'Emergency Contact' },
  { key: 'bank', label: 'Bank Details' },
  { key: 'govt', label: 'Govt Identity' },
];

function show(value: unknown): string {
  if (value === undefined || value === null) return '—';
  const text = String(value).trim();
  return text ? text : '—';
}

function formatDate(iso?: string | null): string {
  if (!iso || !isValidIsoDate(iso)) return '—';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function Field({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <span className="font-bold text-slate-900">{label}:</span> {value}
    </div>
  );
}

/** Read-only intern profile, same layout as the employee profile on the Employees page. */
export function InternProfileModal({ intern, mentorName, onClose, onEdit }: InternProfileModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('personal');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (intern) setActiveTab('personal');
  }, [intern]);
  useBodyScrollLock(Boolean(intern));

  useEffect(() => {
    if (!intern) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [intern, onClose]);

  if (!mounted || !intern) return null;

  const name = `${intern.firstName || ''} ${intern.lastName || ''}`.trim() || 'Intern';
  const initials = name.split(/\s+/).map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();
  const internship = intern.internship || {};
  const endDate = effectiveInternshipEndDate(internship);
  const address = [intern.address, intern.city, intern.state, intern.country].filter(Boolean).join(', ');

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-4 md:p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} profile`}
        className="relative flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-fade-in text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-[#FED7AA]/60 bg-white p-4 text-slate-900">
          <div className="flex items-center gap-3">
            {intern.avatar && !String(intern.avatar).includes('images.unsplash.com') ? (
              <img src={intern.avatar} alt={name} className="h-12 w-12 rounded-full object-cover ring-2 ring-orange-500/40 shadow-md" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 font-extrabold text-white text-base shadow-md">
                {initials}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">{name}</h3>
                <span className="flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 border border-orange-200">
                  <GraduationCap className="h-3 w-3 text-orange-500" aria-hidden="true" />
                  Intern
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {show(intern.employeeId)} • {show(intern.designation)} ({show(intern.department)})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-orange-50 hover:text-slate-700 transition-colors cursor-pointer"
            aria-label="Close profile"
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

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 text-xs text-slate-700">
          {activeTab === 'personal' && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email" value={show(intern.email)} />
              <Field label="Phone" value={show(intern.phone)} />
              <Field label="Date of Birth" value={show(intern.dateOfBirth)} />
              <Field label="Gender" value={show(intern.gender)} />
              <Field label="Account Status" value={show(intern.status)} />
              <Field label="Address" value={address || '—'} wide />
            </div>
          )}

          {activeTab === 'internship' && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="College / Institute" value={show(internship.institute)} />
              <Field label="Monthly Stipend" value={typeof internship.stipend === 'number' ? `₹${internship.stipend.toLocaleString('en-IN')}` : 'Unpaid'} />
              <Field label="Start Date" value={formatDate(internship.startDate || String(intern.joiningDate || '').slice(0, 10))} />
              <Field label="Planned End Date" value={formatDate(internship.endDate)} />
              {internship.extendedEndDate && internship.extendedEndDate !== internship.endDate && (
                <Field label="Extended Till (leave)" value={<span className="font-semibold text-orange-700">{formatDate(internship.extendedEndDate)}</span>} />
              )}
              <Field label="Internship Ends" value={formatDate(endDate)} />
              <Field label="Department" value={show(intern.department)} />
              <Field label="Designation" value={show(intern.designation)} />
              <Field label="Mentor / Reporting Manager" value={mentorName || <span className="font-semibold text-amber-600">Not assigned</span>} />
              <Field label="Work Location" value={show(intern.location)} />
            </div>
          )}

          {activeTab === 'emergency' && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact Person" value={show(intern.emergencyContactName)} />
              <Field label="Relationship" value={show(intern.emergencyRelationship)} />
              <Field label="Phone" value={show(intern.emergencyPhone)} />
              <Field label="Address" value={show(intern.emergencyAddress)} wide />
            </div>
          )}

          {activeTab === 'bank' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <div className="flex items-center gap-2 font-bold text-amber-900 mb-2">
                <Lock className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <span>Confidential Bank Information (stipend payments)</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-slate-800">
                <Field label="Bank Name" value={show(intern.bankName)} />
                <Field label="Account Number" value={show(intern.accountNumber)} />
                <Field label="IFSC Code" value={show(intern.ifscCode)} />
                <Field label="Account Holder" value={show(intern.accountHolder)} />
              </div>
            </div>
          )}

          {activeTab === 'govt' && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="PAN Number" value={show(intern.panNumber)} />
              <Field label="Aadhaar Number" value={show(intern.aadhaarNo)} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={() => onEdit(intern)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit Intern
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-950 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-900 transition-colors cursor-pointer"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default InternProfileModal;