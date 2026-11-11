'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { Employee, EmploymentStatus, EmploymentType } from '@/types/admin';
import { Upload, X, CheckCircle2, AlertTriangle, FileSpreadsheet, ShieldAlert } from 'lucide-react';

interface ImportEmployeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmImport: (employees: Omit<Employee, 'id'>[]) => { added: number; skippedDuplicates: number; message: string };
  existingEmployeeIds: Set<string>;
}

interface ParsedRecord {
  data: Omit<Employee, 'id'>;
  isValid: boolean;
  isDuplicate: boolean;
  errors: string[];
}

export const ImportEmployeesModal: React.FC<ImportEmployeesModalProps> = ({
  isOpen,
  onClose,
  onConfirmImport,
  existingEmployeeIds,
}) => {
  const [csvText, setCsvText] = useState<string>('');
  const [parsedRecords, setParsedRecords] = useState<ParsedRecord[]>([]);
  const [isParsed, setIsParsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reusable application-wide scroll lock for modal lifecycle
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const sampleCsvTemplate = `employeeId,firstName,lastName,email,department,designation,joiningDate,employmentType,location
EMP2001,Raj,Verma,raj.verma@company.com,Engineering & IT,Senior Developer,2026-09-01,Full-time,Mumbai Tech Hub
EMP2002,Meera,Nair,meera.nair@company.com,Human Resources,HR Executive,2026-09-02,Full-time,Bangalore R&D Center
EMP2003,Sunil,Dutt,sunil.dutt@company.com,Sales & Business Dev,Account Manager,2026-09-05,Contract,Gurgaon Corporate Office`;

  const handleParseCsv = (textToParse: string) => {
    const lines = textToParse.trim().split('\n');
    if (lines.length < 2) {
      setParsedRecords([]);
      setIsParsed(false);
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim());
    const records: ParsedRecord[] = [];
    const seenInBatch = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(',').map((c) => c.trim());
      const empId = cols[0] || '';
      const fName = cols[1] || '';
      const lName = cols[2] || '';
      const email = cols[3] || '';
      const dept = cols[4] || 'Engineering & IT';
      const desig = cols[5] || 'Software Engineer';
      const joinDate = cols[6] || new Date().toISOString().split('T')[0];
      const empType = (cols[7] || 'Full-time') as EmploymentType;
      const loc = cols[8] || 'Mumbai Tech Hub';

      const errors: string[] = [];
      let isDuplicate = false;

      if (!empId) errors.push('Missing Employee ID');
      if (!fName || !lName) errors.push('Missing Name');
      if (!email || !email.includes('@')) errors.push('Invalid Email');

      const idLower = empId.toLowerCase();
      if (existingEmployeeIds.has(idLower) || seenInBatch.has(idLower)) {
        isDuplicate = true;
        errors.push('Duplicate Employee ID');
      } else if (empId) {
        seenInBatch.add(idLower);
      }

      const candidate: Omit<Employee, 'id'> = {
        employeeId: empId,
        firstName: fName,
        lastName: lName,
        email,
        phone: '+91 90000 00000',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        dateOfBirth: '1995-01-01',
        gender: 'Male',
        bloodGroup: 'O+',
        address: 'Company Office',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        department: dept,
        designation: desig,
        manager: 'HR Manager',
        location: loc,
        employmentType: empType,
        joiningDate: joinDate,
        status: 'Active' as EmploymentStatus,
        shift: 'Standard Shift',
        grade: 'Grade A3',
        emergencyContactName: 'Family Contact',
        emergencyRelationship: 'Spouse',
        emergencyPhone: '+91 90000 00000',
        emergencyAddress: 'Office Address',
        bankName: 'HDFC Bank',
        accountNumber: '••••••••1234',
        ifscCode: 'HDFC0001234',
        accountHolder: `${fName} ${lName}`,
        panNumber: 'ABCDE1234F',
        aadhaarNo: '•••• •••• 1234',
        passportNo: 'A1234567',
      };

      records.push({
        data: candidate,
        isValid: errors.length === 0,
        isDuplicate,
        errors,
      });
    }

    setParsedRecords(records);
    setIsParsed(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCsvText(text);
        handleParseCsv(text);
      };
      reader.readAsText(file);
    }
  };

  const validRecords = parsedRecords.filter((r) => r.isValid).map((r) => r.data);
  const invalidCount = parsedRecords.filter((r) => !r.isValid && !r.isDuplicate).length;
  const duplicateCount = parsedRecords.filter((r) => r.isDuplicate).length;

  const handleConfirm = () => {
    if (validRecords.length > 0) {
      onConfirmImport(validRecords);
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-4 md:p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-employees-modal-title"
        className="relative flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-fade-in text-xs text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-[#FED7AA]/60 bg-white p-4 text-slate-900">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-orange-500" />
            <h3 id="import-employees-modal-title" className="text-base font-bold text-slate-900">Import Employee Master Data (CSV)</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-orange-50 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
          {/* Upload Controls */}
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <p className="font-bold text-slate-900">Upload CSV File or Paste Raw CSV Data</p>
            <p className="text-[11px] text-slate-500 mt-1">Headers: employeeId, firstName, lastName, email, department, designation, joiningDate, employmentType, location</p>
            
            <div className="mt-4 flex items-center justify-center gap-3">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-file-input"
              />
              <label
                htmlFor="csv-file-input"
                className="cursor-pointer rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700"
              >
                Select CSV File
              </label>
              <button
                type="button"
                onClick={() => {
                  setCsvText(sampleCsvTemplate);
                  handleParseCsv(sampleCsvTemplate);
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Load Sample Template
              </button>
            </div>
          </div>

          {/* Validation Summary Cards */}
          {isParsed && (
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Total Records</span>
                <p className="text-xl font-extrabold text-slate-900">{parsedRecords.length}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                <span className="text-[10px] font-bold text-emerald-700 uppercase">Valid Records</span>
                <p className="text-xl font-extrabold text-emerald-700">{validRecords.length}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                <span className="text-[10px] font-bold text-amber-700 uppercase">Duplicate IDs</span>
                <p className="text-xl font-extrabold text-amber-700">{duplicateCount}</p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
                <span className="text-[10px] font-bold text-rose-700 uppercase">Invalid Records</span>
                <p className="text-xl font-extrabold text-rose-700">{invalidCount}</p>
              </div>
            </div>
          )}

          {/* Preview Table */}
          {isParsed && parsedRecords.length > 0 && (
            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-[#FFF7ED] text-slate-800 font-bold border-b border-[#FED7AA]">
                  <tr>
                    <th className="p-2">Status</th>
                    <th className="p-2">Employee ID</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">Department</th>
                    <th className="p-2">Errors / Warnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRecords.map((rec, idx) => (
                    <tr key={idx} className={rec.isValid ? 'bg-emerald-50/40' : 'bg-rose-50/40'}>
                      <td className="p-2">
                        {rec.isValid ? (
                          <span className="text-emerald-600 font-bold">✓ Valid</span>
                        ) : (
                          <span className="text-rose-600 font-bold">✕ Invalid</span>
                        )}
                      </td>
                      <td className="p-2 font-bold">{rec.data.employeeId}</td>
                      <td className="p-2">{rec.data.firstName} {rec.data.lastName}</td>
                      <td className="p-2">{rec.data.email}</td>
                      <td className="p-2">{rec.data.department}</td>
                      <td className="p-2 text-rose-600 font-medium">
                        {rec.errors.join(', ') || 'None'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal Footer */}
        </div>

        {/* Modal Footer (Pinned / Shrink-0) */}
        <div className="shrink-0 flex items-center justify-between border-t border-[#FED7AA]/50 bg-white p-3.5 sm:p-4 shadow-xs">
          <span className="text-slate-500 text-[11px] hidden sm:inline">Only valid records will be imported into the EMS Data Store.</span>
          <div className="flex items-center gap-2 justify-end w-full sm:w-auto">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={validRecords.length === 0}
              className="rounded-xl bg-emerald-600 px-5 py-2 font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Confirm & Import {validRecords.length} Employees
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
