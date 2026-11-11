'use client';
import { Portal } from './Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState, useRef } from 'react';
import { X, Upload, FileText, FileImage, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { EmployeeDocument, DocumentCategory, DocumentAccessRole } from '@/types/admin';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: { id: string; firstName: string; lastName: string; employeeId: string }[];
  onSuccess: (newDoc: EmployeeDocument) => void;
}

const CATEGORIES: DocumentCategory[] = [
  'Offer Letter',
  'Appointment Letter',
  'Identity Proof',
  'Payslip',
  'Resume',
  'Experience Letter',
  'Contract',
  'Other',
];

const ACCESS_ROLES: DocumentAccessRole[] = [
  'HR Only',
  'Admin Only',
  'HR & Admin',
  'Employee',
  'Public',
];

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  employees,
  onSuccess,
}) => {
  useBodyScrollLock(isOpen);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('Offer Letter');
  const [accessRole, setAccessRole] = useState<DocumentAccessRole>('HR Only');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEmployeeSelect = (empId: string) => {
    setEmployeeId(empId);
    const target = employees.find((e) => e.employeeId === empId || e.id === empId);
    if (target) {
      setEmployeeName(`${target.firstName} ${target.lastName}`);
    } else {
      setEmployeeName('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type.toLowerCase()) && !file.name.endsWith('.pdf')) {
      setErrorMsg('Invalid file type. Supported formats: PDF, PNG, JPG, WEBP, DOC, DOCX.');
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setErrorMsg(`Selected file (${sizeMb} MB) exceeds the maximum 15 MB size limit.`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    if (!title.trim()) {
      // Auto-suggest title based on file name and category
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setTitle(`${category} - ${cleanName}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg('Please enter a Document Title.');
      return;
    }

    if (!selectedFile) {
      setErrorMsg('Please select a file to upload from your computer.');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', title.trim());
      formData.append('employeeId', employeeId || 'EMP-GEN');
      formData.append('employeeName', employeeName.trim() || 'General Enterprise Record');
      formData.append('category', category);
      formData.append('accessRole', accessRole);
      formData.append('uploadedBy', 'HR Administrator');

      const res = await fetch('/api/v1/documents', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to upload document to vault.');
      }

      onSuccess(data.document);
      handleReset();
      onClose();
    } catch (err: any) {
      console.error('Upload document error:', err);
      setErrorMsg(err.message || 'An error occurred while uploading the document.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setTitle('');
    setEmployeeId('');
    setEmployeeName('');
    setCategory('Offer Letter');
    setAccessRole('HR Only');
    setSelectedFile(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl text-xs text-slate-800 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 font-bold text-sm text-slate-900">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-[#FFF7ED] p-1.5 text-orange-500 border border-[#FED7AA]">
              <Upload className="h-4 w-4" />
            </div>
            <span>Upload Document to Vault</span>
          </div>
          <button
            onClick={() => {
              if (!isUploading) onClose();
            }}
            disabled={isUploading}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-700 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* File Picker Zone */}
          <div>
            <label className="font-bold text-slate-900 block mb-1">Select File from Computer *</label>
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
              onChange={handleFileChange}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center cursor-pointer transition-all ${
                selectedFile
                  ? 'border-orange-500 bg-[#FFF7ED]/50'
                  : 'border-slate-300 hover:border-orange-400 hover:bg-[#FFF7ED]/30'
              }`}
            >
              {selectedFile ? (
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-orange-500 p-2.5 text-white">
                    {selectedFile.type.includes('image') ? (
                      <FileImage className="h-5 w-5" />
                    ) : (
                      <FileText className="h-5 w-5" />
                    )}
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-bold text-slate-900 truncate max-w-[220px]">{selectedFile.name}</p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'Document'}
                    </p>
                  </div>
                  <span className="ml-auto rounded-lg bg-[#FFF7ED] px-2 py-1 text-[10px] font-bold text-orange-700 border border-[#FED7AA]/60">
                    Selected
                  </span>
                </div>
              ) : (
                <>
                  <Upload className="h-7 w-7 text-slate-400 mb-1" />
                  <p className="font-bold text-slate-800">Click to choose a file or drag & drop</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    PDF, PNG, JPG, WEBP, DOC, DOCX up to 15 MB
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Document Title */}
          <div>
            <label className="font-bold text-slate-900">Document Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Offer Letter - Rahul Sharma"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white font-medium"
            />
          </div>

          {/* Employee & Category Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-900">Select Employee</label>
              <select
                value={employeeId}
                onChange={(e) => handleEmployeeSelect(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white font-medium"
              >
                <option value="">-- General / Company Wide --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.employeeId}>
                    {emp.firstName} {emp.lastName} ({emp.employeeId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-900">Document Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white font-medium"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Access Role */}
          <div>
            <label className="font-bold text-slate-900">Access Permission Role *</label>
            <select
              value={accessRole}
              onChange={(e) => setAccessRole(e.target.value as DocumentAccessRole)}
              className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white font-medium"
            >
              {ACCESS_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2 font-bold text-white shadow-md hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 transition-all active:scale-95"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Uploading to GridFS...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  <span>Upload Document</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
      </Portal>
);
};
