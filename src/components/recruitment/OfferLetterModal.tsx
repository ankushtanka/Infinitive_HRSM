'use client';
import { Portal } from '@/components/modals/Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState, useEffect } from 'react';
import { X, FileText, Building2, User, Calendar, Briefcase, Plus, Trash2, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { OfferLetterRecord, OfferType, VALID_CANDIDATE_TITLES, CandidateTitle } from '@/types/offerLetter';

interface OfferLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (offer: Partial<OfferLetterRecord>) => void;
  initialData?: Partial<OfferLetterRecord> | null;
  candidateDefault?: {
    id?: string;
    candidateTitle?: string;
    salutation?: string;
    candidateName?: string;
    email?: string;
    phone?: string;
    address?: string;
    collegeName?: string;
    employeeId?: string;
    position?: string;
    department?: string;
  } | null;
}

export const OfferLetterModal: React.FC<OfferLetterModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  candidateDefault,
}) => {
  useBodyScrollLock(isOpen);

  const [offerType, setOfferType] = useState<OfferType>('INTERNSHIP');
  const [candidateTitle, setCandidateTitle] = useState<string>('None');
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [candidateAddress, setCandidateAddress] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('Engineering & IT');
  const [location, setLocation] = useState('Udaipur, Rajasthan');
  const [joiningDate, setJoiningDate] = useState('');
  const [offerDate, setOfferDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState('');

  const [durationMonths, setDurationMonths] = useState(3);
  const [stipendType, setStipendType] = useState<'STIPENDIARY' | 'NON_STIPENDIARY'>('NON_STIPENDIARY');
  const [salaryStipend, setSalaryStipend] = useState(0);

  const [probationPeriod, setProbationPeriod] = useState('3 Months');
  const [noticePeriod, setNoticePeriod] = useState('15 Days');
  const [workingHours, setWorkingHours] = useState('9:30 AM - 6:30 PM (Mon-Sat)');
  const [reportingManager, setReportingManager] = useState('');

  const [requiredDocs, setRequiredDocs] = useState<string[]>([
    'Education Qualification Certificates',
    'e-Aadhar',
    'PAN Card',
    'Recent Professional Passport Size Photographs',
  ]);
  const [newDocText, setNewDocText] = useState('');
  const [additionalTerms, setAdditionalTerms] = useState('');

  const [validationError, setValidationError] = useState<string | null>(null);

  const resetForm = React.useCallback(() => {
    setOfferType('INTERNSHIP');
    setCandidateTitle('None');
    setCandidateName('');
    setCandidateEmail('');
    setCandidatePhone('');
    setCandidateAddress('');
    setCollegeName('');
    setEmployeeId('');
    setPosition('');
    setDepartment('Engineering & IT');
    setLocation('Udaipur, Rajasthan');
    setJoiningDate('');
    setOfferDate(new Date().toISOString().split('T')[0]);
    setExpiryDate('');
    setDurationMonths(3);
    setStipendType('NON_STIPENDIARY');
    setSalaryStipend(0);
    setProbationPeriod('3 Months');
    setNoticePeriod('15 Days');
    setWorkingHours('9:30 AM - 6:30 PM (Mon-Sat)');
    setReportingManager('');
    setRequiredDocs([
      'Education Qualification Certificates',
      'e-Aadhar',
      'PAN Card',
      'Recent Professional Passport Size Photographs',
    ]);
    setNewDocText('');
    setAdditionalTerms('');
    setValidationError(null);
  }, []);

  const prevOpenRef = React.useRef(false);
  const prevDataIdRef = React.useRef<string | undefined>(undefined);

  useEffect(() => {
    const dataId = initialData?.id || candidateDefault?.id || candidateDefault?.email;
    const justOpened = isOpen && !prevOpenRef.current;
    const dataChanged = isOpen && dataId !== prevDataIdRef.current;

    if (justOpened || dataChanged) {
      if (initialData) {
        setOfferType(initialData.offerType || 'INTERNSHIP');
        setCandidateTitle(
          initialData.candidate?.candidateTitle ||
          (initialData as any).candidateTitle ||
          initialData.candidate?.salutation ||
          (initialData as any).salutation ||
          'None'
        );
        setCandidateName(initialData.candidate?.candidateName || '');
        setCandidateEmail(initialData.candidate?.email || '');
        setCandidatePhone(initialData.candidate?.phone || '');
        setCandidateAddress(initialData.candidate?.address || '');
        setCollegeName(initialData.candidate?.collegeName || '');
        setEmployeeId(initialData.candidate?.employeeId || '');

        setPosition(initialData.position || '');
        setDepartment(initialData.department || 'Engineering & IT');
        setLocation(initialData.location || 'Udaipur, Rajasthan');
        setJoiningDate(initialData.joiningDate || '');
        setOfferDate(initialData.offerDate || new Date().toISOString().split('T')[0]);
        setExpiryDate(initialData.expiryDate || '');

        setDurationMonths(initialData.durationMonths || 3);
        setStipendType(initialData.stipendType || 'NON_STIPENDIARY');
        setSalaryStipend(initialData.salaryStipend || 0);

        setProbationPeriod(initialData.probationPeriod || '3 Months');
        setNoticePeriod(initialData.noticePeriod || '15 Days');
        setWorkingHours(initialData.workingHours || '9:30 AM - 6:30 PM (Mon-Sat)');
        setReportingManager(initialData.reportingManager || '');

        if (Array.isArray(initialData.requiredDocuments) && initialData.requiredDocuments.length > 0) {
          setRequiredDocs(initialData.requiredDocuments);
        } else {
          setRequiredDocs([
            'Education Qualification Certificates',
            'e-Aadhar',
            'PAN Card',
            'Recent Professional Passport Size Photographs',
          ]);
        }
        setAdditionalTerms(initialData.additionalTerms || '');
      } else if (candidateDefault) {
        resetForm();
        setCandidateTitle(
          candidateDefault.candidateTitle ||
          candidateDefault.salutation ||
          'None'
        );
        setCandidateName(candidateDefault.candidateName || '');
        setCandidateEmail(candidateDefault.email || '');
        setCandidatePhone(candidateDefault.phone || '');
        setCandidateAddress(candidateDefault.address || '');
        setCollegeName(candidateDefault.collegeName || '');
        setEmployeeId(candidateDefault.employeeId || '');
        setPosition(candidateDefault.position || '');
        setDepartment(candidateDefault.department || 'Engineering & IT');
        setJoiningDate(new Date().toISOString().split('T')[0]);
      } else {
        resetForm();
      }
    } else if (!isOpen && prevOpenRef.current) {
      resetForm();
    }

    prevOpenRef.current = isOpen;
    prevDataIdRef.current = dataId;
  }, [isOpen, initialData, candidateDefault, resetForm]);

  if (!isOpen) return null;

  const handleAddDoc = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    const trimmed = newDocText.trim();
    if (trimmed && !requiredDocs.includes(trimmed)) {
      setRequiredDocs((prev) => [...prev, trimmed]);
      setNewDocText('');
    }
  };

  const handleRemoveDoc = (idx: number) => {
    setRequiredDocs(requiredDocs.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const nameTrimmed = candidateName.trim();
    const emailTrimmed = candidateEmail.trim();
    const positionTrimmed = position.trim();
    const dateTrimmed = joiningDate.trim();

    if (!nameTrimmed || !emailTrimmed || !positionTrimmed || !dateTrimmed) {
      setValidationError('Candidate Name, Email, Position, and Joining Date are required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      setValidationError('Please enter a valid email address.');
      return;
    }

    const titleTrimmed = (candidateTitle || 'None').trim() || 'None';

    const payload: Partial<OfferLetterRecord> & Record<string, any> = {
      ...(initialData?.id ? { id: initialData.id } : {}),
      candidateId: candidateDefault?.id || initialData?.candidateId,
      offerType,
      position: positionTrimmed,
      department: department.trim(),
      location: location.trim(),
      joiningDate: dateTrimmed,
      offerDate,
      expiryDate: expiryDate || undefined,
      durationMonths: Number(durationMonths) || 3,
      stipendType,
      salaryStipend: Number(salaryStipend) || 0,
      probationPeriod,
      noticePeriod,
      workingHours,
      reportingManager: reportingManager.trim(),
      requiredDocuments: requiredDocs,
      additionalTerms: additionalTerms.trim(),
      candidateTitle: titleTrimmed,
      salutation: titleTrimmed,
      candidateName: nameTrimmed,
      candidateEmail: emailTrimmed.toLowerCase(),
      candidatePhone: candidatePhone.trim(),
      candidateAddress: candidateAddress.trim(),
      collegeName: collegeName.trim(),
      employeeId: employeeId.trim() || undefined,
      candidate: {
        candidateTitle: titleTrimmed,
        salutation: titleTrimmed,
        candidateName: nameTrimmed,
        email: emailTrimmed.toLowerCase(),
        phone: candidatePhone.trim(),
        address: candidateAddress.trim(),
        collegeName: collegeName.trim(),
        employeeId: employeeId.trim() || undefined,
      },
    };

    onSave(payload);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl text-xs text-slate-800 animate-fade-in max-h-[92vh] flex flex-col justify-between overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b pb-3 font-bold text-sm text-slate-900">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <span>{initialData ? 'Edit Offer Letter' : 'Generate New Offer Letter'}</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        {validationError && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="my-4 flex-1 overflow-y-auto overscroll-contain space-y-4 pr-1">
          {/* Template / Offer Type Selection */}
          <div className="rounded-xl border border-[#FED7AA]/80 bg-[#FFF7ED]/50 p-3">
            <label className="font-bold text-indigo-950">Select Offer Template / Type *</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              {[
                { id: 'INTERNSHIP', label: 'Internship Offer' },
                { id: 'FULL_TIME', label: 'Full-Time Offer' },
                { id: 'PART_TIME', label: 'Part-Time Offer' },
                { id: 'CONTRACT', label: 'Contract Offer' },
              ].map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setOfferType(t.id as OfferType)}
                  className={`rounded-xl py-2 px-3 text-xs font-bold border transition-all ${
                    offerType === t.id
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Candidate Details Section */}
          <div className="space-y-3 border-t pt-3">
            <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-orange-500" />
              <span>Candidate Information</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <label className="font-bold text-slate-900 block truncate" title="Title / Salutation">
                      Title / Salutation
                    </label>
                    <select
                      value={candidateTitle}
                      onChange={(e) => setCandidateTitle(e.target.value)}
                      className="mt-1 w-full rounded-xl border p-2 bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-semibold text-slate-800"
                    >
                      {VALID_CANDIDATE_TITLES.map((titleOption) => (
                        <option key={titleOption} value={titleOption}>
                          {titleOption}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-7">
                    <label className="font-bold text-slate-900 block">Candidate Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-900">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="candidate@example.com"
                  value={candidateEmail}
                  onChange={(e) => setCandidateEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Phone Number</label>
                <input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={candidatePhone}
                  onChange={(e) => setCandidatePhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">College / Institute Name</label>
                <input
                  type="text"
                  placeholder="e.g. ABC Institute of Technology"
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700">Candidate Address / Location</label>
                <input
                  type="text"
                  placeholder="e.g. Udaipur, Rajasthan"
                  value={candidateAddress}
                  onChange={(e) => setCandidateAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Offer Details Section */}
          <div className="space-y-3 border-t pt-3">
            <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-orange-500" />
              <span>Offer Details & Terms</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-slate-900">Position / Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Software Developer"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-900">Department *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Engineering & IT"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-900">Joining Date *</label>
                <input
                  type="date"
                  required
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                />
              </div>

              {offerType === 'INTERNSHIP' ? (
                <>
                  <div>
                    <label className="font-bold text-slate-900">Duration (Months)</label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={durationMonths}
                      onChange={(e) => setDurationMonths(Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-900">Stipend Type</label>
                    <select
                      value={stipendType}
                      onChange={(e) => setStipendType(e.target.value as any)}
                      className="mt-1 w-full rounded-xl border p-2 bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-semibold text-slate-800"
                    >
                      <option value="NON_STIPENDIARY">Non-Stipendiary</option>
                      <option value="STIPENDIARY">Stipendiary</option>
                    </select>
                  </div>

                  {stipendType === 'STIPENDIARY' && (
                    <div>
                      <label className="font-bold text-slate-900">Monthly Stipend (₹)</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="e.g. 15000"
                        value={salaryStipend}
                        onChange={(e) => setSalaryStipend(Number(e.target.value))}
                        className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="font-bold text-slate-900">Annual Salary / CTC (₹)</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="e.g. 600000"
                      value={salaryStipend}
                      onChange={(e) => setSalaryStipend(Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-900">Probation Period</label>
                    <input
                      type="text"
                      placeholder="3 Months"
                      value={probationPeriod}
                      onChange={(e) => setProbationPeriod(e.target.value)}
                      className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-900">Notice Period</label>
                    <input
                      type="text"
                      placeholder="15 Days"
                      value={noticePeriod}
                      onChange={(e) => setNoticePeriod(e.target.value)}
                      className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Required Documents Checklist Section */}
          <div className="space-y-3 border-t pt-3">
            <h4 className="font-bold text-slate-900 text-xs flex items-center justify-between">
              <span>Required Documents Checklist</span>
              <span className="text-[10px] text-slate-500 font-normal">{requiredDocs.length} items included</span>
            </h4>

            <div className="space-y-1.5">
              {requiredDocs.map((doc, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-1.5 border border-slate-200 text-slate-800">
                  <span>{idx + 1}. {doc}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveDoc(idx)}
                    className="p-1 text-slate-400 hover:text-rose-600"
                    title="Remove item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Add custom required document requirement..."
                value={newDocText}
                onChange={(e) => setNewDocText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddDoc(e);
                  }
                }}
                className="flex-1 rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleAddDoc}
                className="flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-2 font-bold text-white hover:bg-slate-900"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Item</span>
              </button>
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex justify-end gap-2 border-t pt-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-5 py-2 font-bold text-white shadow-md hover:bg-orange-600 active:bg-orange-700 active:scale-95"
            >
              <Save className="h-4 w-4" />
              <span>{initialData ? 'Update Offer Draft' : 'Save Offer Draft'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
};
