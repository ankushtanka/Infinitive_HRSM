'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { Employee, EmploymentStatus, EmploymentType, ProfilePhotoMeta } from '@/types/admin';
import {
  X,
  UserPlus,
  ShieldAlert,
  FileText,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCw,
  Camera,
  FileCheck,
  Mail,
  Plus,
} from 'lucide-react';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (emp: Omit<Employee, 'id'>) => { success: boolean; message: string } | Promise<{ success: boolean; message: string }>;
  departments: string[];
  designations: string[];
}

export const DEFAULT_DEPARTMENTS = [
  'Engineering & IT',
  'Human Resources',
  'Finance & Accounts',
  'Sales & Marketing',
  'Operations',
  'Product Management',
  'Design & Creative',
  'Quality Assurance',
  'Legal & Compliance',
  'Customer Support',
  'Administration',
  'Executive Board',
  'General',
];

export const DEFAULT_DESIGNATIONS = [
  'CEO/Founder',
  'Director',
  'Vice President',
  'Senior Software Engineer',
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'DevOps Engineer',
  'QA / Test Engineer',
  'UI/UX Designer',
  'Product Manager',
  'HR Manager',
  'HR Executive',
  'Talent Acquisition Specialist',
  'Finance Manager',
  'Accountant',
  'Financial Analyst',
  'Sales Manager',
  'Sales Executive',
  'Business Development Manager',
  'Marketing Specialist',
  'Digital Marketing Lead',
  'Operations Lead',
  'Operations Executive',
  'System Administrator',
  'IT Support Specialist',
  'Customer Support Specialist',
  'Legal Counsel',
  'Office Administrator',
  'Staff',
];

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  departments,
  designations,
}) => {
  const effectiveDepartments = Array.from(
    new Set([
      ...DEFAULT_DEPARTMENTS,
      ...(departments || []),
    ])
  );
  const effectiveDesignations = Array.from(
    new Set([
      ...DEFAULT_DESIGNATIONS,
      ...(designations || []),
    ])
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSuccess, setCreatedSuccess] = useState<{ email: string; employeeId: string } | null>(null);
  const [formData, setFormData] = useState({
    employeeId: 'EMP101',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatar: '',
    dateOfBirth: '1995-01-01',
    gender: 'Male',
    bloodGroup: 'O+',
    address: '',
    city: '',
    state: '',
    country: 'India',
    department: effectiveDepartments[0] || 'Engineering & IT',
    designation: effectiveDesignations[0] || 'Senior Software Engineer',
    manager: 'Rajesh K.',
    location: 'Mumbai Tech Hub',
    employmentType: 'Full-time' as EmploymentType,
    joiningDate: new Date().toISOString().split('T')[0],
    status: 'Active' as EmploymentStatus,
    shift: 'Standard (09:00 - 18:00)',
    grade: 'Grade A3',
    emergencyContactName: '',
    emergencyRelationship: 'Spouse',
    emergencyPhone: '',
    emergencyAddress: '',
    bankName: 'HDFC Bank',
    accountNumber: '',
    ifscCode: '',
    accountHolder: '',
    panNumber: '',
    aadhaarNo: '',
    passportNo: '',
  });

  // Document photo extraction state
  const docInputRef = useRef<HTMLInputElement>(null);
  const manualPhotoRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState('Aadhaar Card');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [extractedPhotoUri, setExtractedPhotoUri] = useState<string | null>(null);
  const [photoMeta, setPhotoMeta] = useState<ProfilePhotoMeta | null>(null);
  const [uploadedDocName, setUploadedDocName] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setFormData({
      employeeId: 'EMP101',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      avatar: '',
      dateOfBirth: '1995-01-01',
      gender: 'Male',
      bloodGroup: 'O+',
      address: '',
      city: '',
      state: '',
      country: 'India',
      department: effectiveDepartments[0] || 'Engineering & IT',
      designation: effectiveDesignations[0] || 'Senior Software Engineer',
      manager: 'Rajesh K.',
      location: 'Mumbai Tech Hub',
      employmentType: 'Full-time' as EmploymentType,
      joiningDate: new Date().toISOString().split('T')[0],
      status: 'Active' as EmploymentStatus,
      shift: 'Standard (09:00 - 18:00)',
      grade: 'Grade A3',
      emergencyContactName: '',
      emergencyRelationship: 'Spouse',
      emergencyPhone: '',
      emergencyAddress: '',
      bankName: 'HDFC Bank',
      accountNumber: '',
      ifscCode: '',
      accountHolder: '',
      panNumber: '',
      aadhaarNo: '',
      passportNo: '',
    });
    setExtractedPhotoUri(null);
    setCandidates([]);
    setSelectedCandidateId(null);
    setPhotoMeta(null);
    setUploadedDocName(null);
    setErrorMessage(null);
    setCreatedSuccess(null);
  }, [effectiveDepartments, effectiveDesignations]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reusable application-wide scroll lock for modal lifecycle
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSubmitting, handleClose]);

  // Fetch server-side preview of next available Employee ID when modal opens
  useEffect(() => {
    if (isOpen) {
      fetch('/api/v1/employees/next-id')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data?.employeeId) {
            setFormData((prev) => ({
              ...prev,
              employeeId: data.data.employeeId,
              department: prev.department || effectiveDepartments[0],
            }));
          }
        })
        .catch((err) => console.warn('Could not fetch next employee ID preview:', err));
    }
  }, [isOpen, effectiveDepartments]);

  if (!isOpen || !mounted) return null;

  // Generate initials for avatar fallback (e.g. Suryabhan Rathore -> SR)
  const getInitials = () => {
    const f = formData.firstName.trim().charAt(0).toUpperCase();
    const l = formData.lastName.trim().charAt(0).toUpperCase();
    return f && l ? `${f}${l}` : f || 'EMP';
  };

  // Handle Identity Document Upload & Automatic Photo Extraction
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setExtractionError(null);
    setUploadedDocName(file.name);

    try {
      const apiFormData = new FormData();
      apiFormData.append('file', file);
      apiFormData.append('documentType', documentType);

      const res = await fetch('/api/v1/documents/extract-photo', {
        method: 'POST',
        body: apiFormData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setExtractionError(
          data.message || "Couldn't automatically detect a profile photo from this document."
        );
        return;
      }

      if (data.photoCandidates && data.photoCandidates.length > 0) {
        setCandidates(data.photoCandidates);
        const primary = data.photoCandidates[0];
        setSelectedCandidateId(primary.id);
        setExtractedPhotoUri(primary.previewUrl);

        // Upload extracted photo binary to GridFS for permanent storage
        await saveExtractedPhotoToGridFS(primary.previewUrl, file.name, 'document-extraction');
      }
    } catch (err: any) {
      console.error('Error extracting photo from document:', err);
      setExtractionError('Extraction service error. Please try uploading a different document.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Upload photo preview data to MongoDB GridFS & update form state
  const saveExtractedPhotoToGridFS = async (
    photoUri: string,
    docName: string,
    source: 'document-extraction' | 'manual-upload'
  ) => {
    try {
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const file = new File([blob], `extracted_${Date.now()}.jpg`, { type: 'image/jpeg' });

      const gridFsFormData = new FormData();
      gridFsFormData.append('file', file);

      const res = await fetch('/api/v1/admin/profile/photo', {
        method: 'POST',
        body: gridFsFormData,
      });

      const gridFsData = await res.json();

      if (res.ok && gridFsData.success && gridFsData.photoUrl) {
        setFormData((prev) => ({ ...prev, avatar: gridFsData.photoUrl }));
        setPhotoMeta({
          fileId: gridFsData.fileId,
          mimeType: 'image/jpeg',
          fileName: docName,
          source,
          uploadedAt: new Date().toISOString(),
          documentType,
        });
      } else {
        setFormData((prev) => ({ ...prev, avatar: photoUri }));
      }
    } catch (err) {
      console.warn('GridFS upload warning, using local photo preview:', err);
      setFormData((prev) => ({ ...prev, avatar: photoUri }));
    }
  };

  // Handle Manual Profile Photo Upload from computer
  const handleManualPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const uri = event.target?.result as string;
      setExtractedPhotoUri(uri);
      setExtractionError(null);
      await saveExtractedPhotoToGridFS(uri, file.name, 'manual-upload');
    };
    reader.readAsDataURL(file);
  };

  // Switch candidate photo if multiple detected
  const handleSelectCandidate = async (candidate: any) => {
    setSelectedCandidateId(candidate.id);
    setExtractedPhotoUri(candidate.previewUrl);
    await saveExtractedPhotoToGridFS(candidate.previewUrl, uploadedDocName || 'identity-doc', 'document-extraction');
  };

  // Clear photo
  const handleRemovePhoto = () => {
    setExtractedPhotoUri(null);
    setCandidates([]);
    setSelectedCandidateId(null);
    setPhotoMeta(null);
    setFormData((prev) => ({ ...prev, avatar: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Form Validation
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setErrorMessage('First Name and Last Name are required.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setErrorMessage('Valid email address is required.');
      return;
    }
    if (!formData.joiningDate) {
      setErrorMessage('Joining Date is required.');
      return;
    }
    if (!formData.department || !formData.department.trim()) {
      setErrorMessage('Department is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      let finalEmployeeId = formData.employeeId;

      // 1. Dispatch POST request to create account & trigger Gmail OTP dispatch
      try {
        const apiRes = await fetch('/api/v1/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: formData.employeeId === 'Auto-generated' ? '' : formData.employeeId,
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            department: formData.department,
            designation: formData.designation,
            role: 'EMPLOYEE',
            joiningDate: formData.joiningDate,
            location: formData.location,
            avatar: formData.avatar,
          }),
        });
        const apiData = await apiRes.json();
        if (apiRes.ok && apiData.success && apiData.data?.employeeId) {
          finalEmployeeId = apiData.data.employeeId;
        } else if (!apiRes.ok || !apiData.success) {
          setErrorMessage(apiData.message || 'Failed to create employee account record.');
          setIsSubmitting(false);
          return;
        }
      } catch (apiErr: any) {
        console.warn('API POST /api/v1/employees call warning:', apiErr);
        setErrorMessage(apiErr?.message || 'Server connection error while creating employee account.');
        setIsSubmitting(false);
        return;
      }

      // 2. Save into store / local state
      const payload = {
        ...formData,
        employeeId: finalEmployeeId,
        profilePhoto: photoMeta || undefined,
      };

      try {
        const res = await Promise.resolve(onSave(payload));
        if (res && !res.success) {
          console.warn('Store update warning:', res.message);
        }
      } catch (storeErr) {
        console.warn('Store save warning:', storeErr);
      }

      setCreatedSuccess({ email: formData.email.trim(), employeeId: finalEmployeeId });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create employee account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentAvatarUrl = extractedPhotoUri || formData.avatar;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-4 md:p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-employee-modal-title"
        className="relative flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-fade-in text-xs text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header (Fixed / Shrink-0) */}
        <div className="shrink-0 flex items-center justify-between border-b border-[#FED7AA]/60 bg-white p-4 text-slate-900">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-orange-500" />
            <div>
              <h3 id="add-employee-modal-title" className="text-base font-bold text-slate-900">
                {createdSuccess ? 'Account Created' : 'Add New Employee Master Record'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {createdSuccess
                  ? 'Verification code dispatched via Gmail SMTP'
                  : 'Register employee details & automatically extract photo from identity document'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-orange-50 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Validation Error Banner (shrink-0) */}
        {errorMessage && (
          <div className="shrink-0 flex items-center justify-between gap-2 bg-rose-50 p-3 text-xs font-semibold text-rose-700 border-b border-rose-200 animate-fade-in">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="rounded-lg p-1 text-rose-500 hover:bg-rose-100 hover:text-rose-800 transition-colors cursor-pointer"
              title="Dismiss error message"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {createdSuccess ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 sm:p-8 text-center space-y-6 animate-fade-in">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-slate-900">Account Created Successfully</h3>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-4 py-1.5 text-xs font-bold text-orange-700 border border-orange-200">
                  <span>Employee ID: <strong className="font-extrabold">{createdSuccess.employeeId}</strong></span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <Mail className="h-4 w-4 text-emerald-600" />
                  <span>
                    Verification sent to <strong className="underline">{createdSuccess.email}</strong>
                  </span>
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Ask the user to check their email and enter the 6-digit verification code.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-slate-100">
              <a
                href={`/verify-email?email=${encodeURIComponent(createdSuccess.email)}`}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700 transition-all"
              >
                <Mail className="h-4 w-4" />
                <span>Open Verification</span>
              </a>

              <button
                type="button"
                onClick={resetForm}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all"
              >
                <Plus className="h-4 w-4 text-slate-500" />
                <span>Create Another Account</span>
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all"
              >
                <span>Back to Accounts</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Scrollable Form Body */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5 sm:space-y-6">
              {/* Hidden File Inputs */}
              <input
                type="file"
                ref={docInputRef}
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleDocumentUpload}
                className="hidden"
              />
              <input
                type="file"
                ref={manualPhotoRef}
                accept="image/jpeg,image/png,image/webp"
                onChange={handleManualPhotoUpload}
                className="hidden"
              />

          {/* SECTION 1: IDENTITY DOCUMENT & AUTOMATIC PHOTO EXTRACTION */}
          <div className="rounded-2xl border border-[#FED7AA]/80 bg-[#FFF7ED]/50 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-500" />
                <h4 className="text-sm font-bold text-slate-900">
                  Automatic Photo Extraction from Identity Document
                </h4>
              </div>
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-bold text-orange-800 border border-orange-200">
                AI Powered
              </span>
            </div>

            <p className="text-slate-500 text-xs leading-relaxed">
              Upload an official identity document (Aadhaar, Passport, PAN Card, Driving License, ID Card). The system automatically detects, crops, and processes the employee&apos;s portrait photograph for MongoDB GridFS storage.
            </p>

            {/* Document Type Selector & Upload Trigger */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="w-full sm:w-48">
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-semibold text-slate-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                >
                  <option value="Aadhaar Card">Aadhaar Card</option>
                  <option value="Passport">Passport</option>
                  <option value="PAN Card">PAN Card</option>
                  <option value="Driving License">Driving License</option>
                  <option value="Employee ID Card">Employee ID Card</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                disabled={isExtracting}
                className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700 active:scale-95 transition-all w-full sm:w-auto justify-center disabled:opacity-50"
              >
                {isExtracting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>
                  {isExtracting ? 'Analyzing Document...' : 'Upload & Extract Photo from Document'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => manualPhotoRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-700 hover:bg-orange-50/50 hover:border-orange-200 active:scale-95 transition-all w-full sm:w-auto justify-center"
              >
                <Camera className="h-3.5 w-3.5 text-slate-500" />
                <span>Manual Upload</span>
              </button>
            </div>

            {/* Extraction Processing State */}
            {isExtracting && (
              <div className="flex items-center gap-3 rounded-xl bg-white p-3 border border-indigo-100 shadow-2xs">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                <div>
                  <p className="font-bold text-slate-900">Analyzing document for portrait photograph...</p>
                  <p className="text-[11px] text-slate-500">Detecting face bounding box & cropping portrait</p>
                </div>
              </div>
            )}

            {/* Extraction Error Fallback */}
            {extractionError && (
              <div className="rounded-xl bg-amber-50 p-3 border border-amber-200 text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>{extractionError}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => manualPhotoRef.current?.click()}
                    className="rounded-lg bg-amber-600 px-3 py-1 font-bold text-white hover:bg-amber-700 text-[11px]"
                  >
                    Upload Profile Photo Manually
                  </button>
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1 font-semibold text-amber-800 hover:bg-amber-100 text-[11px]"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* Photo Preview & Confirmation Card */}
            {currentAvatarUrl ? (
              <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-emerald-200 bg-white p-4 shadow-xs">
                {/* Extracted Photo Image Preview */}
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-4 ring-emerald-500/20 shadow-md">
                  <img
                    src={currentAvatarUrl}
                    alt="Extracted Profile"
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      {photoMeta?.source === 'document-extraction'
                        ? 'Photo detected from identity document'
                        : 'Uploaded profile photo'}
                    </span>
                  </div>

                  {uploadedDocName && (
                    <p className="text-[11px] text-slate-500 font-medium">
                      Source File: <strong>{uploadedDocName}</strong> ({documentType})
                    </p>
                  )}

                  {/* Multiple Candidate Selection */}
                  {candidates.length > 1 && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px] font-bold text-slate-700">Select Portrait Candidate:</span>
                      {candidates.map((cand, idx) => (
                        <button
                          key={cand.id}
                          type="button"
                          onClick={() => handleSelectCandidate(cand)}
                          className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all ${
                            selectedCandidateId === cand.id
                              ? 'bg-orange-500 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-orange-50'
                          }`}
                        >
                          Photo {idx + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Photo Action Buttons */}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 text-[11px]"
                    >
                      <RefreshCw className="h-3 w-3" /> Re-extract
                    </button>
                    <button
                      type="button"
                      onClick={() => manualPhotoRef.current?.click()}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 text-[11px]"
                    >
                      <Camera className="h-3 w-3" /> Upload Different
                    </button>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-100 text-[11px]"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Professional Initials Avatar Preview Fallback */
              <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-orange-500 font-extrabold text-white text-lg ring-4 ring-orange-500/20 shadow-md">
                  {getInitials()}
                </div>
                <div>
                  <p className="font-bold text-slate-900">Professional Initials Avatar Preview ({getInitials()})</p>
                  <p className="text-[11px] text-slate-500">
                    Will be displayed until an identity document or profile photo is uploaded.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: EMPLOYEE DETAILS FORM */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="font-bold text-slate-900">Employee ID</label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={formData.employeeId}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-slate-100 font-bold text-slate-600 cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-400 mt-1">Assigned automatically on server (e.g. EMP101)</p>
              </div>
              <div>
                <label className="font-bold text-slate-900">First Name *</label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-semibold focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-900">Last Name *</label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-semibold focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="font-bold text-slate-900">Official Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                />
              </div>
              <div>
                <label className="font-bold text-slate-900">Phone Number</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                />
              </div>
              <div>
                <label className="font-bold text-slate-900">Joining Date *</label>
                <input
                  type="date"
                  required
                  value={formData.joiningDate}
                  onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="font-bold text-slate-900">Department *</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-white font-semibold focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                >
                  {effectiveDepartments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-900">Designation *</label>
                <input
                  type="text"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                />
              </div>
              <div>
                <label className="font-bold text-slate-900">Employment Type</label>
                <select
                  value={formData.employmentType}
                  onChange={(e) => setFormData({ ...formData, employmentType: e.target.value as EmploymentType })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                >
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Contract</option>
                  <option value="Intern">Intern</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="font-bold text-slate-900">Work Location</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                />
              </div>
              <div>
                <label className="font-bold text-slate-900">Reporting Manager</label>
                <input
                  type="text"
                  value={formData.manager}
                  onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                />
              </div>
              <div>
                <label className="font-bold text-slate-900">Initial Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as EmploymentStatus })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                >
                  <option value="Active">Active</option>
                  <option value="Probation">Probation</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed / Sticky Modal Footer (shrink-0) */}
        <div className="shrink-0 flex items-center justify-end gap-3 border-t border-[#FED7AA]/50 bg-white p-3.5 sm:p-4 shadow-xs">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Registering & Sending Email...</span>
              </>
            ) : (
              <span>Save & Register Employee</span>
            )}
          </button>
        </div>
      </form>
      )}
      </div>
    </div>,
    document.body
  );
};
