'use client';
import { Portal } from '@/components/modals/Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState, useEffect } from 'react';
import { X, Award, AlertCircle, Sparkles, Building2, Calendar, User, Eye, CheckCircle2 } from 'lucide-react';
import { InternshipCertificateRecord } from '@/types/certificate';

interface AddCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (cert: Partial<InternshipCertificateRecord>) => Promise<{ success: boolean; message: string; certificateId?: string }>;
  onOpenPreview?: (cert: Partial<InternshipCertificateRecord>) => void;
  initialData?: Partial<InternshipCertificateRecord> | null;
}

export const AddCertificateModal: React.FC<AddCertificateModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onOpenPreview,
  initialData,
}) => {
  useBodyScrollLock(isOpen);

  const [formData, setFormData] = useState({
    internName: '',
    salutation: 'Ms.',
    degreeCourse: '',
    collegeName: '',
    internshipRole: '',
    internEmail: '',
    startDate: '',
    completionDate: '',
    issueDate: new Date().toISOString().split('T')[0],
    companyName: 'INFINITIVE CLOUD',
    registeredOffice: 'Kankroli,Rajasthan,313324',
    officeAddress: 'Udaipur Rajasthan,313001',
    phone: '+91 8690393087',
    email: 'cloudinfinitive@gmail.com',
    cin: 'U62020RJ2025PTC109151',
    signatoryName: 'Ankush Ranka',
    signatoryDesignation: 'Founder & CEO',
  });

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setFormData({
        internName: initialData.internName || '',
        salutation: initialData.salutation || 'Ms.',
        degreeCourse: initialData.degreeCourse || '',
        collegeName: initialData.collegeName || '',
        internshipRole: initialData.internshipRole || '',
        internEmail: initialData.internEmail || '',
        startDate: initialData.startDate || '',
        completionDate: initialData.completionDate || '',
        issueDate: initialData.issueDate || new Date().toISOString().split('T')[0],
        companyName: initialData.companyName || 'INFINITIVE CLOUD',
        registeredOffice: initialData.registeredOffice || 'Kankroli,Rajasthan,313324',
        officeAddress: initialData.officeAddress || 'Udaipur Rajasthan,313001',
        phone: initialData.phone || '+91 8690393087',
        email: initialData.email || 'cloudinfinitive@gmail.com',
        cin: initialData.cin || 'U62020RJ2025PTC109151',
        signatoryName: initialData.signatoryName || 'Ankush Ranka',
        signatoryDesignation: initialData.signatoryDesignation || 'Founder & CEO',
      });
    } else {
      setFormData({
        internName: '',
        salutation: 'Ms.',
        degreeCourse: '',
        collegeName: '',
        internshipRole: '',
        internEmail: '',
        startDate: '',
        completionDate: '',
        issueDate: new Date().toISOString().split('T')[0],
        companyName: 'INFINITIVE CLOUD',
        registeredOffice: 'Kankroli,Rajasthan,313324',
        officeAddress: 'Udaipur Rajasthan,313001',
        phone: '+91 8690393087',
        email: 'cloudinfinitive@gmail.com',
        cin: 'U62020RJ2025PTC109151',
        signatoryName: 'Ankush Ranka',
        signatoryDesignation: 'Founder & CEO',
      });
    }
  }, [isOpen, initialData]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleValidation = (): boolean => {
    setErrorMsg(null);
    if (!formData.internName.trim()) {
      setErrorMsg('Intern full name is required.');
      return false;
    }
    if (!formData.collegeName.trim()) {
      setErrorMsg('College/Institute name is required.');
      return false;
    }
    if (!formData.internshipRole.trim()) {
      setErrorMsg('Internship role/domain is required.');
      return false;
    }
    if (!formData.startDate || !formData.completionDate || !formData.issueDate) {
      setErrorMsg('Start date, completion date, and issue date are required.');
      return false;
    }

    const start = new Date(formData.startDate);
    const end = new Date(formData.completionDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setErrorMsg('Invalid date format.');
      return false;
    }
    if (end < start) {
      setErrorMsg('Completion date cannot be earlier than internship start date.');
      return false;
    }
    return true;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleValidation()) return;

    setIsSubmitting(true);
    try {
      const res = await onSave(formData);
      setIsSubmitting(false);
      if (res.success) {
        onClose();
      } else {
        setErrorMsg(res.message || 'Failed to save certificate record.');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || 'Unable to save certificate record.');
    }
  };

  const handlePreviewClick = () => {
    if (!handleValidation()) return;
    if (onOpenPreview) {
      onOpenPreview(formData);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60 shrink-0">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {initialData?.id || initialData?._id ? 'Edit Internship Certificate' : 'Add Internship Certificate'}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">Issue official A4 internship completion certificate</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto overscroll-contain pt-4 space-y-5 pr-1">
          {/* Section 1: Intern Information */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-orange-600 border-b pb-1">
              <User className="h-3.5 w-3.5" /> Intern Details
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Salutation <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.salutation}
                  onChange={(e) => setFormData((prev) => ({ ...prev, salutation: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                >
                  <option value="Ms.">Ms.</option>
                  <option value="Mr.">Mr.</option>
                  <option value="Mx.">Mx.</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Intern Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aarav Sharma"
                  value={formData.internName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, internName: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Degree / Course <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. B.Tech / MCA"
                  value={formData.degreeCourse}
                  onChange={(e) => setFormData((prev) => ({ ...prev, degreeCourse: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  College / Institute Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. National Institute of Technology / University"
                  value={formData.collegeName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, collegeName: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Internship Role / Domain <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Software Engineering Intern"
                  value={formData.internshipRole}
                  onChange={(e) => setFormData((prev) => ({ ...prev, internshipRole: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Intern Email Address (Destination Email)
                </label>
                <input
                  type="email"
                  placeholder="e.g. intern@example.com"
                  value={formData.internEmail}
                  onChange={(e) => setFormData((prev) => ({ ...prev, internEmail: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Dates */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-orange-600 border-b pb-1">
              <Calendar className="h-3.5 w-3.5" /> Internship Timeline & Issue Date
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Start Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Completion Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.completionDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, completionDate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Issue Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.issueDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, issueDate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Company & Signatory */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-orange-600 border-b pb-1">
              <Building2 className="h-3.5 w-3.5" /> Company & Signatory Settings
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, companyName: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">CIN No.</label>
                <input
                  type="text"
                  value={formData.cin}
                  onChange={(e) => setFormData((prev) => ({ ...prev, cin: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Signatory Name</label>
                <input
                  type="text"
                  value={formData.signatoryName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, signatoryName: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Signatory Designation</label>
                <input
                  type="text"
                  value={formData.signatoryDesignation}
                  onChange={(e) => setFormData((prev) => ({ ...prev, signatoryDesignation: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handlePreviewClick}
              className="flex items-center gap-1.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-2 text-xs font-bold text-orange-700 hover:bg-[#FFEDD5] transition-colors"
            >
              <Eye className="h-4 w-4" />
              <span>Preview Certificate</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-5 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                <Award className="h-4 w-4" />
                <span>
                  {isSubmitting
                    ? 'Saving Record...'
                    : initialData?.id || initialData?._id
                    ? 'Update Certificate'
                    : 'Generate Certificate'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
};
