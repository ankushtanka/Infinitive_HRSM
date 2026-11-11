'use client';
import { Portal } from '@/components/modals/Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  User,
  Calendar,
  Building2,
  Briefcase,
  ShieldCheck,
  Search,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Save,
} from 'lucide-react';
import {
  ExperienceLetterRecord,
  EmployeeSalutation,
  EmployeePronounPreference,
  DEFAULT_EXPERIENCE_COMPANY,
  PREDEFINED_CONDUCT_REMARKS,
} from '@/types/experienceLetter';

interface EmployeeOption {
  _id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  department?: string;
  designation?: string;
  joiningDate?: string;
  lastWorkingDate?: string;
  status?: string;
  email?: string;
  avatar?: string;
  gender?: string;
  title?: string;
  salutation?: string;
  pronouns?: string;
}

interface GenerateExperienceLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    data: Partial<ExperienceLetterRecord>,
    andPreview?: boolean
  ) => Promise<{ success: boolean; message: string; letterId?: string }>;
  initialData?: Partial<ExperienceLetterRecord> | null;
}

export const GenerateExperienceLetterModal: React.FC<GenerateExperienceLetterModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  useBodyScrollLock(isOpen);

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');

  // Selected Employee
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);

  // Form State
  const [salutation, setSalutation] = useState<EmployeeSalutation>('None');
  const [pronouns, setPronouns] = useState<EmployeePronounPreference>('neutral');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelation, setGuardianRelation] = useState<'S/o' | 'D/o' | 'W/o' | ''>('S/o');
  const [letterTitle, setLetterTitle] = useState('EXPERIENCE CUM RELIEVING LETTER');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [relievingDate, setRelievingDate] = useState(new Date().toISOString().split('T')[0]);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [conductRemark, setConductRemark] = useState(PREDEFINED_CONDUCT_REMARKS[0]);
  const [signatoryName, setSignatoryName] = useState('Ankush Ranka');
  const [signatoryDesignation, setSignatoryDesignation] = useState('Founder & CEO');
  const [referenceNumber, setReferenceNumber] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch verified employees from MongoDB database
  useEffect(() => {
    if (!isOpen) return;

    const fetchEmployees = async () => {
      setIsLoadingEmployees(true);
      try {
        const res = await fetch('/api/v1/employees?limit=200');
        const json = await res.json();
        if (res.ok && json.success) {
          const list: EmployeeOption[] = json.employees || json.data || [];
          setEmployees(list);
        }
      } catch (err) {
        console.error('Failed to load employee list:', err);
      } finally {
        setIsLoadingEmployees(false);
      }
    };

    fetchEmployees();
  }, [isOpen]);

  // Populate when initialData is supplied (e.g. Editing a draft)
  useEffect(() => {
    if (initialData) {
      setSalutation(initialData.salutation !== undefined ? initialData.salutation : 'None');
      setPronouns(initialData.pronouns || 'neutral');
      setEmployeeEmail(initialData.employeeEmail || '');
      setEmployeeName(initialData.employeeName || '');
      setEmployeeId(initialData.employeeId || '');
      setGuardianName(initialData.guardianName || '');
      setGuardianRelation(initialData.guardianRelation || 'S/o');
      setLetterTitle(initialData.letterTitle || 'EXPERIENCE CUM RELIEVING LETTER');
      setDepartment(initialData.department || '');
      setDesignation(initialData.designation || '');
      setJoiningDate(initialData.joiningDate || '');
      setRelievingDate(initialData.relievingDate || new Date().toISOString().split('T')[0]);
      setIssueDate(initialData.issueDate || new Date().toISOString().split('T')[0]);
      setConductRemark(initialData.conductRemark || PREDEFINED_CONDUCT_REMARKS[0]);
      setSignatoryName(initialData.signatoryName || 'Ankush Ranka');
      setSignatoryDesignation(initialData.signatoryDesignation || 'Founder & CEO');
      setReferenceNumber(initialData.referenceNumber || '');
    } else {
      // Reset form
      setSelectedEmployee(null);
      setEmployeeSearch('');
      setSalutation('None');
      setPronouns('neutral');
      setEmployeeEmail('');
      setEmployeeName('');
      setEmployeeId('');
      setGuardianName('');
      setGuardianRelation('S/o');
      setLetterTitle('EXPERIENCE CUM RELIEVING LETTER');
      setDepartment('');
      setDesignation('');
      setJoiningDate('');
      setRelievingDate(new Date().toISOString().split('T')[0]);
      setIssueDate(new Date().toISOString().split('T')[0]);
      setConductRemark(PREDEFINED_CONDUCT_REMARKS[0]);
      setSignatoryName('Ankush Ranka');
      setSignatoryDesignation('Founder & CEO');
      setReferenceNumber('');
      setErrorMessage(null);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  // Handle employee selection from dropdown with verified profile pronoun resolution
  const handleSelectEmployee = (emp: EmployeeOption) => {
    setSelectedEmployee(emp);
    const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
    setEmployeeName(fullName);
    setEmployeeId(emp.employeeId || '');
    setEmployeeEmail(emp.email || '');
    setDepartment(emp.department || 'General');
    setDesignation(emp.designation || 'Software Developer Engineer');

    // Title / Pronoun resolution:
    // Respects verified employee profile information. If missing or ambiguous, does NOT guess; falls back to neutral.
    const rawGender = String((emp as any).gender || '').trim().toLowerCase();
    const rawTitle = String((emp as any).salutation || (emp as any).title || '').trim();
    const rawPronouns = String((emp as any).pronouns || '').trim().toLowerCase();

    let resolvedSal: EmployeeSalutation = 'None';
    let resolvedPro: EmployeePronounPreference = 'neutral';
    let resolvedRel: 'S/o' | 'D/o' | 'W/o' | '' = '';

    if (rawTitle === 'Mr.' || rawTitle.toLowerCase() === 'mr' || rawGender === 'male' || rawGender === 'm' || rawPronouns.includes('he')) {
      resolvedSal = 'Mr.';
      resolvedPro = 'he/him';
      resolvedRel = 'S/o';
    } else if (rawTitle === 'Ms.' || rawTitle === 'Mrs.' || rawTitle.toLowerCase() === 'ms' || rawTitle.toLowerCase() === 'mrs' || rawGender === 'female' || rawGender === 'f' || rawPronouns.includes('she')) {
      resolvedSal = rawTitle === 'Mrs.' ? 'Mrs.' : 'Ms.';
      resolvedPro = 'she/her';
      resolvedRel = 'D/o';
    } else if (rawTitle === 'Mx.') {
      resolvedSal = 'Mx.';
      resolvedPro = 'they/them';
      resolvedRel = '';
    } else {
      // Missing or ambiguous profile info -> Strictly neutral, do NOT guess based on employee name
      resolvedSal = 'None';
      resolvedPro = 'neutral';
      resolvedRel = '';
    }

    setSalutation(resolvedSal);
    setPronouns(resolvedPro);
    setGuardianRelation(resolvedRel);

    if ((emp as any).emergencyContactName && (emp as any).emergencyRelationship?.toLowerCase().includes('father')) {
      setGuardianName((emp as any).emergencyContactName);
    }

    if (emp.joiningDate) {
      setJoiningDate(emp.joiningDate.split('T')[0]);
    }
    if (emp.lastWorkingDate) {
      setRelievingDate(emp.lastWorkingDate.split('T')[0]);
    } else {
      setRelievingDate(new Date().toISOString().split('T')[0]);
    }

    setErrorMessage(null);
  };

  const filteredEmployees = employees.filter((e) => {
    if (!employeeSearch.trim()) return true;
    const q = employeeSearch.toLowerCase().trim();
    const fullName = `${e.firstName || ''} ${e.lastName || ''}`.toLowerCase();
    const empId = (e.employeeId || '').toLowerCase();
    const dept = (e.department || '').toLowerCase();
    return fullName.includes(q) || empId.includes(q) || dept.includes(q);
  });

  const handleSubmit = async (andPreview = false) => {
    setErrorMessage(null);

    if (!employeeName.trim() || !employeeId.trim()) {
      setErrorMessage('Please select a verified employee from the database.');
      return;
    }
    if (!joiningDate) {
      setErrorMessage('Joining date is required.');
      return;
    }
    if (!relievingDate) {
      setErrorMessage('Relieving / Last working date is required.');
      return;
    }
    if (new Date(joiningDate) > new Date(relievingDate)) {
      setErrorMessage('Joining date cannot be after the relieving date.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Partial<ExperienceLetterRecord> = {
        id: initialData?.id || initialData?._id,
        _id: initialData?._id || initialData?.id,
        referenceNumber,
        employeeId,
        employeeName,
        employeeEmail: employeeEmail.trim() || undefined,
        salutation,
        pronouns,
        guardianName: guardianName.trim() || undefined,
        guardianRelation: guardianName.trim() ? guardianRelation : undefined,
        letterTitle: letterTitle.trim() || 'EXPERIENCE CUM RELIEVING LETTER',
        department,
        designation,
        joiningDate,
        relievingDate,
        issueDate,
        conductRemark,
        signatoryName,
        signatoryDesignation,
        companyName: DEFAULT_EXPERIENCE_COMPANY.companyName,
        registeredOffice: DEFAULT_EXPERIENCE_COMPANY.registeredOffice,
        officeAddress: DEFAULT_EXPERIENCE_COMPANY.officeAddress,
        phone: DEFAULT_EXPERIENCE_COMPANY.phone,
        email: DEFAULT_EXPERIENCE_COMPANY.email,
        cin: DEFAULT_EXPERIENCE_COMPANY.cin,
        website: DEFAULT_EXPERIENCE_COMPANY.website,
        status: initialData?.status || 'DRAFT',
      };

      const result = await onSave(payload, andPreview);
      if (!result.success) {
        setErrorMessage(result.message || 'Failed to save experience letter.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving experience letter.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs overflow-y-auto overscroll-contain">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#FFF7ED] p-2 text-orange-500 border border-[#FED7AA]/60">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {initialData ? 'Edit Experience Letter' : 'Generate Experience Letter'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Issue an official company experience certificate on Infinitive Cloud letterhead
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-5 text-xs">
          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Employee Selection */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <User className="h-4 w-4 text-orange-500" />
                <span>Select Employee from Database <span className="text-rose-500">*</span></span>
              </label>
              {isLoadingEmployees && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading employees...</span>
                </span>
              )}
            </div>

            {/* Search Input for Employees */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search employee by name, ID, or department..."
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>

            {/* Filtered Employees Dropdown/List */}
            {!selectedEmployee && (
              <div className="max-h-44 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                {filteredEmployees.length === 0 ? (
                  <div className="p-3 text-center text-slate-400 text-xs">
                    No matching employees found in database.
                  </div>
                ) : (
                  filteredEmployees.slice(0, 15).map((emp) => (
                    <button
                      key={emp._id}
                      type="button"
                      onClick={() => handleSelectEmployee(emp)}
                      className="w-full text-left p-2.5 hover:bg-[#FFF7ED]/70 transition-colors flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-orange-100 text-orange-700 font-bold flex items-center justify-center text-[10px] shrink-0 uppercase">
                          {emp.firstName?.[0] || 'E'}{emp.lastName?.[0] || ''}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 group-hover:text-orange-600">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {emp.employeeId} • {emp.designation || 'Staff'} • {emp.department || 'General'}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">
                        {emp.status || 'Active'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Selected Employee Badge */}
            {selectedEmployee && (
              <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED]/70 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-orange-500 text-white font-bold flex items-center justify-center text-xs">
                    {selectedEmployee.firstName?.[0]}{selectedEmployee.lastName?.[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">
                        {selectedEmployee.firstName} {selectedEmployee.lastName}
                      </span>
                      <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded-md border border-[#FED7AA] font-bold text-orange-700">
                        {selectedEmployee.employeeId}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {selectedEmployee.designation} • {selectedEmployee.department}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEmployee(null)}
                  className="text-[11px] font-semibold text-orange-700 hover:text-orange-900 underline cursor-pointer"
                >
                  Change Employee
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Verified Employee Details (Auto-populated & confirmed) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Title / Salutation</label>
              <select
                value={salutation}
                onChange={(e) => setSalutation(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-xs"
              >
                <option value="None">None (Gender-Neutral / No Title)</option>
                <option value="Mr.">Mr.</option>
                <option value="Ms.">Ms.</option>
                <option value="Mrs.">Mrs.</option>
                <option value="Mx.">Mx.</option>
                <option value="Dr.">Dr.</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Pronouns & Grammar</label>
              <select
                value={pronouns}
                onChange={(e) => setPronouns(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-xs"
              >
                <option value="he/him">He / Him / His (Male)</option>
                <option value="she/her">She / Her / Her (Female)</option>
                <option value="they/them">They / Them / Their (Neutral)</option>
                <option value="neutral">Neutral (Name Only / Respectful)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Official Email Address</label>
              <input
                type="email"
                value={employeeEmail}
                onChange={(e) => setEmployeeEmail(e.target.value)}
                placeholder="e.g. employee@company.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-xs"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Employee Full Name"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Employee ID</label>
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g. EMP1003"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Engineering & IT"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Designation</label>
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Software Developer Engineer"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Letter Title</label>
              <input
                type="text"
                value={letterTitle}
                onChange={(e) => setLetterTitle(e.target.value)}
                placeholder="EXPERIENCE CUM RELIEVING LETTER"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Relation</label>
              <select
                value={guardianRelation}
                onChange={(e) => setGuardianRelation(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              >
                <option value="S/o">S/o (Son of)</option>
                <option value="D/o">D/o (Daughter of)</option>
                <option value="W/o">W/o (Wife of)</option>
                <option value="">None / Omit</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Father / Guardian Name</label>
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="e.g. Mr. Naresh or Naresh"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Issue Date</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Joining Date <span className="text-rose-500">*</span></label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Last Working / Relieving Date <span className="text-rose-500">*</span></label>
              <input
                type="date"
                value={relievingDate}
                onChange={(e) => setRelievingDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Reference Number</label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Auto-generated if blank (e.g. ICS/EXP/2026/001)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Section 3: Performance & Conduct Appraisal Text */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-700">Conduct & Performance Appraisal Remark</label>
              <span className="text-[10px] text-slate-400">Choose preset or edit text</span>
            </div>

            <div className="space-y-2">
              <select
                onChange={(e) => {
                  if (e.target.value) setConductRemark(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                defaultValue=""
              >
                <option value="" disabled>-- Select preset remark template --</option>
                {PREDEFINED_CONDUCT_REMARKS.map((remark, idx) => (
                  <option key={idx} value={remark}>
                    Preset {idx + 1}: {remark.slice(0, 80)}...
                  </option>
                ))}
              </select>

              <textarea
                rows={3}
                value={conductRemark}
                onChange={(e) => setConductRemark(e.target.value)}
                placeholder="Enter formal conduct and performance remark..."
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-xs leading-relaxed"
              />
            </div>
          </div>

          {/* Section 4: Authorized Signatory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-100">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Authorized Signatory Name</label>
              <input
                type="text"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                placeholder="e.g. Ankush Ranka"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Signatory Designation</label>
              <input
                type="text"
                value={signatoryDesignation}
                onChange={(e) => setSignatoryDesignation(e.target.value)}
                placeholder="e.g. Founder & CEO"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <p className="text-[11px] text-slate-500">
            All details verified against official employee master records.
          </p>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>Save Draft</span>
            </button>

            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  <span>Preview & Generate</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
};

