'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { Employee, EmploymentStatus, EmploymentType, ProfilePhotoMeta } from '@/types/admin';
import {
  X,
  Pencil,
  ShieldAlert,
  Upload,
  Sparkles,
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCw,
  Camera,
  Mail,
  Lock,
  Building,
  User,
  Phone,
  Briefcase,
  Calendar,
  CreditCard,
  FileText,
  HeartHandshake,
  Check,
} from 'lucide-react';

interface EditEmployeeModalProps {
  isOpen: boolean;
  employee: Employee | null;
  onClose: () => void;
  onSuccess: (updatedEmployee: Employee) => void;
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

type EditTab = 'employment' | 'personal' | 'emergency' | 'bank_govt' | 'photo';

export const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({
  isOpen,
  employee,
  onClose,
  onSuccess,
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

  const [activeTab, setActiveTab] = useState<EditTab>('employment');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
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
    department: effectiveDepartments[0] || 'General',
    designation: effectiveDesignations[0] || 'Staff',
    manager: '',
    location: 'Headquarters',
    employmentType: 'Full-time' as EmploymentType,
    joiningDate: '',
    status: 'Active' as EmploymentStatus,
    shift: 'Standard (09:00 - 18:00)',
    grade: 'Grade A3',
    emergencyContactName: '',
    emergencyRelationship: 'Spouse',
    emergencyPhone: '',
    emergencyAddress: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    accountHolder: '',
    panNumber: '',
    aadhaarNo: '',
    passportNo: '',
  });

  // Photo extraction & upload state
  const docInputRef = useRef<HTMLInputElement>(null);
  const manualPhotoRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState('Aadhaar Card');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [photoMeta, setPhotoMeta] = useState<ProfilePhotoMeta | null>(null);

  // Synchronize form values whenever modal opens or selected employee changes
  useEffect(() => {
    if (isOpen && employee) {
      setErrorMessage(null);
      setExtractionError(null);
      setActiveTab('employment');
      setFormData({
        firstName: employee.firstName || '',
        lastName: employee.lastName || '',
        email: employee.email || '',
        phone: employee.phone || '',
        avatar: employee.avatar || '',
        dateOfBirth: employee.dateOfBirth || '1995-01-01',
        gender: employee.gender || 'Male',
        bloodGroup: employee.bloodGroup || 'O+',
        address: employee.address || '',
        city: employee.city || '',
        state: employee.state || '',
        country: employee.country || 'India',
        department: employee.department || effectiveDepartments[0] || 'General',
        designation: employee.designation || effectiveDesignations[0] || 'Staff',
        manager: employee.manager || '',
        location: employee.location || 'Headquarters',
        employmentType: (employee.employmentType || 'Full-time') as EmploymentType,
        joiningDate: employee.joiningDate ? employee.joiningDate.split('T')[0] : '',
        status: (employee.status || 'Active') as EmploymentStatus,
        shift: employee.shift || 'Standard (09:00 - 18:00)',
        grade: employee.grade || 'Grade A3',
        emergencyContactName: employee.emergencyContactName || '',
        emergencyRelationship: employee.emergencyRelationship || 'Spouse',
        emergencyPhone: employee.emergencyPhone || '',
        emergencyAddress: employee.emergencyAddress || '',
        bankName: employee.bankName || '',
        accountNumber: employee.accountNumber || '',
        ifscCode: employee.ifscCode || '',
        accountHolder: employee.accountHolder || '',
        panNumber: employee.panNumber || '',
        aadhaarNo: employee.aadhaarNo || '',
        passportNo: employee.passportNo || '',
      });
      setPhotoMeta(employee.profilePhoto || null);
    }
  }, [isOpen, employee]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reusable application-wide scroll lock for modal lifecycle
  useBodyScrollLock(Boolean(isOpen && employee));

  useEffect(() => {
    if (!isOpen || !employee) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, employee, isSubmitting, onClose]);

  if (!isOpen || !employee || !mounted) return null;

  const getInitials = () => {
    const f = formData.firstName.trim().charAt(0).toUpperCase();
    const l = formData.lastName.trim().charAt(0).toUpperCase();
    return f && l ? `${f}${l}` : f || employee.employeeId || 'EMP';
  };

  // Upload photo preview data to MongoDB GridFS & update form state
  const savePhotoToGridFS = async (photoUri: string, docName: string, source: 'document-extraction' | 'manual-upload') => {
    try {
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });

      const gridFsFormData = new FormData();
      gridFsFormData.append('file', file);
      gridFsFormData.append('isEmployeePhoto', 'true');
      gridFsFormData.append('targetEmployeeId', employee.employeeId);

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
      console.warn('GridFS upload warning, using direct photo URI:', err);
      setFormData((prev) => ({ ...prev, avatar: photoUri }));
    }
  };

  // Handle Document Upload & Auto Photo Extraction
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setExtractionError(null);

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
        setExtractionError(data.message || 'Could not detect a portrait photograph from this document.');
        return;
      }

      if (data.photoCandidates && data.photoCandidates.length > 0) {
        const primary = data.photoCandidates[0];
        await savePhotoToGridFS(primary.previewUrl, file.name, 'document-extraction');
      }
    } catch (err: any) {
      console.error('Error extracting photo from document:', err);
      setExtractionError('Extraction service error. Please try another document.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Handle Manual Photo Upload
  const handleManualPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const preview = event.target?.result as string;
      if (preview) {
        await savePhotoToGridFS(preview, file.name, 'manual-upload');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setFormData((prev) => ({ ...prev, avatar: '' }));
    setPhotoMeta(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setErrorMessage('First Name and Last Name are required.');
      setActiveTab('personal');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim() || !emailPattern.test(formData.email.trim())) {
      setErrorMessage('A valid official email address is required.');
      setActiveTab('personal');
      return;
    }

    if (!formData.department.trim()) {
      setErrorMessage('Department is required.');
      setActiveTab('employment');
      return;
    }

    if (!formData.joiningDate) {
      setErrorMessage('Joining Date is required.');
      setActiveTab('employment');
      return;
    }

    setIsSubmitting(true);

    try {
      const targetIdentifier = employee.id || employee.employeeId;
      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        department: formData.department.trim(),
        designation: formData.designation.trim(),
        location: formData.location.trim(),
        employmentType: formData.employmentType,
        joiningDate: formData.joiningDate,
        status: formData.status,
        manager: formData.manager.trim(),
        shift: formData.shift.trim(),
        grade: formData.grade.trim(),
        avatar: formData.avatar,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        bloodGroup: formData.bloodGroup,
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        country: formData.country.trim(),
        emergencyContactName: formData.emergencyContactName.trim(),
        emergencyRelationship: formData.emergencyRelationship.trim(),
        emergencyPhone: formData.emergencyPhone.trim(),
        emergencyAddress: formData.emergencyAddress.trim(),
        bankName: formData.bankName.trim(),
        accountNumber: formData.accountNumber.trim(),
        ifscCode: formData.ifscCode.trim(),
        accountHolder: formData.accountHolder.trim(),
        panNumber: formData.panNumber.trim().toUpperCase(),
        aadhaarNo: formData.aadhaarNo.trim(),
        passportNo: formData.passportNo.trim().toUpperCase(),
      };

      const res = await fetch(`/api/v1/employees/${encodeURIComponent(targetIdentifier)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Failed to update employee details. Please verify your entries.');
        setIsSubmitting(false);
        return;
      }

      // Merge updated fields into current employee object
      const updatedEmployee: Employee = {
        ...employee,
        ...payload,
        profilePhoto: photoMeta || employee.profilePhoto,
      };

      onSuccess(updatedEmployee);
      onClose();
    } catch (err: any) {
      console.error('Error submitting employee updates:', err);
      setErrorMessage(err.message || 'Network error occurred while saving employee record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-4 md:p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-employee-modal-title"
        className="relative flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-fade-in text-xs text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#FED7AA]/60 bg-white p-4 text-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500 border border-orange-200">
              <Pencil className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="edit-employee-modal-title" className="text-base font-bold text-slate-900">Edit Employee Details</h3>
                <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-mono font-extrabold text-orange-700 border border-orange-200">
                  <Lock className="h-3 w-3" />
                  {employee.employeeId}
                </span>
                <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                  {formData.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Update master record for {employee.firstName} {employee.lastName} • {employee.designation}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title="Close edit modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Read-Only System Metadata Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-6 py-2.5 text-[11px] text-slate-500 shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <strong className="text-slate-700">Employee ID:</strong>
              <span className="font-mono font-bold text-orange-600">{employee.employeeId}</span> (System Immutable)
            </span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="flex items-center gap-1">
              <strong className="text-slate-700">Account Type:</strong> Master HR Profile
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">All updates are audited</span>
          </div>
        </div>

        {/* Error Notification Banner */}
        {errorMessage && (
          <div className="flex items-center justify-between gap-2 bg-rose-50 p-3 text-xs font-semibold text-rose-700 border-b border-rose-200 animate-fade-in shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-6 text-xs font-semibold overflow-x-auto shrink-0">
          {[
            { key: 'employment', label: 'Employment Details', icon: Briefcase },
            { key: 'personal', label: 'Personal Information', icon: User },
            { key: 'emergency', label: 'Emergency Contact', icon: HeartHandshake },
            { key: 'bank_govt', label: 'Bank & Govt IDs', icon: CreditCard },
            { key: 'photo', label: 'Profile Photo', icon: Camera },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as EditTab)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'border-orange-500 text-orange-600 font-bold bg-orange-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`h-4 w-4 ${isSelected ? 'text-orange-500' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Form Body */}
        <form id="edit-employee-form" onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5 sm:space-y-6">
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

          {/* TAB 1: EMPLOYMENT DETAILS */}
          {activeTab === 'employment' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Briefcase className="h-4 w-4 text-orange-500" />
                <h4 className="font-bold text-slate-900 text-sm">Role, Department & Placement</h4>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="font-bold text-slate-900">Department *</label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-white font-semibold focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-slate-800"
                    required
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
                    required
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                    placeholder="e.g. Senior Software Engineer"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-900">Work Location *</label>
                  <input
                    type="text"
                    required
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                    placeholder="e.g. Headquarters / Mumbai"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="font-bold text-slate-900">Employment Type *</label>
                  <select
                    value={formData.employmentType}
                    onChange={(e) => setFormData({ ...formData, employmentType: e.target.value as EmploymentType })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Intern">Intern</option>
                    <option value="Temporary">Temporary</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-900">Employee Status *</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as EmploymentStatus })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                  >
                    <option value="Active">Active</option>
                    <option value="Probation">Probation</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Resigned">Resigned</option>
                    <option value="Terminated">Terminated</option>
                    <option value="Former Employee">Former Employee</option>
                  </select>
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
                  <label className="font-bold text-slate-900">Reporting Manager</label>
                  <input
                    type="text"
                    value={formData.manager}
                    onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                    placeholder="e.g. Rajesh Kumar"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-900">Work Shift</label>
                  <input
                    type="text"
                    value={formData.shift}
                    onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                    placeholder="e.g. Standard (09:00 - 18:00)"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-900">Job Grade</label>
                  <input
                    type="text"
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                    placeholder="e.g. Grade A3"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PERSONAL INFORMATION */}
          {activeTab === 'personal' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <User className="h-4 w-4 text-orange-500" />
                <h4 className="font-bold text-slate-900 text-sm">Personal & Contact Details</h4>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="font-bold text-slate-900">Official Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Changing the email will require the employee to re-verify their email address.
                  </p>
                </div>

                <div>
                  <label className="font-bold text-slate-900">Phone Number</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="font-bold text-slate-900">Date of Birth</label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-900">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-900">Blood Group</label>
                  <select
                    value={formData.bloodGroup}
                    onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                  >
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-900">Residential Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                  placeholder="Street address, building, suite..."
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="font-bold text-slate-900">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-900">State / Province</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-900">Country</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EMERGENCY CONTACT */}
          {activeTab === 'emergency' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <HeartHandshake className="h-4 w-4 text-orange-500" />
                <h4 className="font-bold text-slate-900 text-sm">Emergency Point of Contact</h4>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="font-bold text-slate-900">Contact Person Name</label>
                  <input
                    type="text"
                    value={formData.emergencyContactName}
                    onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                    placeholder="e.g. Suman Rathore"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-900">Relationship</label>
                  <input
                    type="text"
                    value={formData.emergencyRelationship}
                    onChange={(e) => setFormData({ ...formData, emergencyRelationship: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                    placeholder="e.g. Spouse / Parent / Sibling"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-900">Emergency Phone</label>
                  <input
                    type="tel"
                    value={formData.emergencyPhone}
                    onChange={(e) => setFormData({ ...formData, emergencyPhone: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                    placeholder="+91 98765 00000"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-900">Emergency Contact Address</label>
                <input
                  type="text"
                  value={formData.emergencyAddress}
                  onChange={(e) => setFormData({ ...formData, emergencyAddress: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                  placeholder="Address of emergency contact..."
                />
              </div>
            </div>
          )}

          {/* TAB 4: BANK & GOVT IDs */}
          {activeTab === 'bank_govt' && (
            <div className="space-y-6 animate-fade-in">
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <CreditCard className="h-4 w-4 text-amber-600" />
                  <h4 className="font-bold text-slate-900 text-sm">Confidential Bank Information</h4>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="font-bold text-slate-900">Bank Name</label>
                    <input
                      type="text"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                      placeholder="e.g. HDFC Bank, ICICI Bank, SBI"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-900">Account Holder Name</label>
                    <input
                      type="text"
                      value={formData.accountHolder}
                      onChange={(e) => setFormData({ ...formData, accountHolder: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                      placeholder="Name as registered with bank"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-900">Account Number</label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono"
                      placeholder="Bank account number"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-900">IFSC Code</label>
                    <input
                      type="text"
                      value={formData.ifscCode}
                      onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                      className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono"
                      placeholder="e.g. HDFC0001234"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <FileText className="h-4 w-4 text-orange-500" />
                  <h4 className="font-bold text-slate-900 text-sm">Government Identity Credentials</h4>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="font-bold text-slate-900">PAN Number</label>
                    <input
                      type="text"
                      value={formData.panNumber}
                      onChange={(e) => setFormData({ ...formData, panNumber: e.target.value.toUpperCase() })}
                      className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono uppercase"
                      placeholder="ABCDE1234F"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-900">Aadhaar Number</label>
                    <input
                      type="text"
                      value={formData.aadhaarNo}
                      onChange={(e) => setFormData({ ...formData, aadhaarNo: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono"
                      placeholder="12-digit Aadhaar number"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-900">Passport Number</label>
                    <input
                      type="text"
                      value={formData.passportNo}
                      onChange={(e) => setFormData({ ...formData, passportNo: e.target.value.toUpperCase() })}
                      className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono uppercase"
                      placeholder="Passport document number"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PROFILE PHOTO */}
          {activeTab === 'photo' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Camera className="h-4 w-4 text-orange-500" />
                <h4 className="font-bold text-slate-900 text-sm">Profile Photograph & Identity Portrait</h4>
              </div>

              {/* Photo Display Card */}
              <div className="flex flex-col sm:flex-row items-center gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
                {formData.avatar ? (
                  <img
                    src={formData.avatar}
                    alt={formData.firstName}
                    className="h-28 w-28 rounded-2xl object-cover ring-4 ring-orange-500/30 shadow-lg"
                  />
                ) : (
                  <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-orange-500 font-extrabold text-white text-3xl ring-4 ring-orange-500/20 shadow-lg">
                    {getInitials()}
                  </div>
                )}

                <div className="space-y-2 text-center sm:text-left">
                  <h4 className="font-bold text-slate-900 text-base">
                    {formData.firstName} {formData.lastName}
                  </h4>
                  <p className="text-slate-500 text-xs">
                    {formData.avatar ? 'Custom profile photo is active.' : 'Initials avatar is currently displayed.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => manualPhotoRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
                    >
                      <Camera className="h-4 w-4 text-slate-500" />
                      <span>Upload New Photo</span>
                    </button>
                    {formData.avatar && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Remove Photo</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Document Photo Extraction Box */}
              <div className="rounded-2xl border border-[#FED7AA]/80 bg-[#FFF7ED]/50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-orange-500" />
                    <h5 className="font-bold text-slate-900">Extract Photo from Official Document</h5>
                  </div>
                  <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-bold text-orange-800 border border-orange-200">
                    AI Detection
                  </span>
                </div>

                <p className="text-slate-500 text-xs">
                  Upload an identity card (Aadhaar, Passport, PAN Card, ID Card) to automatically crop and set portrait photo.
                </p>

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
                    className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 cursor-pointer"
                  >
                    {isExtracting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    <span>{isExtracting ? 'Analyzing Document...' : 'Upload & Auto Extract Portrait'}</span>
                  </button>
                </div>

                {extractionError && (
                  <div className="rounded-xl bg-amber-50 p-3 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>{extractionError}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 p-4 shrink-0">
          <div className="text-[11px] text-slate-400 hidden sm:block">
            Editing Employee <strong className="text-slate-600">{employee.employeeId}</strong>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-employee-form"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
