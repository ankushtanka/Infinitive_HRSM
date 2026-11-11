'use client';
import { Portal } from './Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Calendar,
  Users,
  Calculator,
  Info,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  FileText,
  Check,
  Building2,
  DollarSign,
  AlertCircle,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { useEmsStore } from '@/store/emsStore';
import { AssignSalaryModal } from './AssignSalaryModal';

interface ProcessPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const ProcessPayrollModal: React.FC<ProcessPayrollModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  useBodyScrollLock(isOpen);

  const { state, processMonthlyPayroll, setEmployees } = useEmsStore();

  const now = new Date();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [calculationResult, setCalculationResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deductPf, setDeductPf] = useState<boolean>(true);
const [deductEsi, setDeductEsi] = useState<boolean>(true);

  // Live employees state fallback
  const [loadedEmployees, setLoadedEmployees] = useState<any[]>([]);

  // Salary readiness verification states
  const [serverAssignments, setServerAssignments] = useState<any[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState<boolean>(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [assigningEmployee, setAssigningEmployee] = useState<any | null>(null);
  const [assignSuccessMsg, setAssignSuccessMsg] = useState<string | null>(null);
  const [isBulkAssigning, setIsBulkAssigning] = useState<boolean>(false);

  const fetchEmployeesFromApi = async () => {
    try {
      const res = await fetch('/api/v1/employees?limit=500');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const mapped = json.data.map((emp: any) => ({
            id: String(emp._id || emp.id || emp.employeeId),
            employeeId: String(emp.employeeId || '').trim(),
            firstName: emp.firstName || '',
            lastName: emp.lastName || '',
            email: emp.email || emp.personalEmail || '',
            phone: emp.phone || '',
            avatar: emp.avatar || '',
            department: emp.department || 'General',
            designation: emp.designation || 'Staff',
            status: (emp.status || emp.employmentStatus || 'Active'),
            joiningDate: emp.joiningDate ? String(emp.joiningDate).split('T')[0] : '',
            bankName: emp.bankName || 'HDFC Bank',
            accountNumber: emp.accountNumber || '•••• •••• ••••',
            panNumber: emp.panNumber || 'ABCDE1234F',
            pfNumber: emp.pfNumber || '',
            uanNumber: emp.uan || emp.pfUan || '',
          }));
          setLoadedEmployees(mapped);
          setEmployees(mapped);
        }
      }
    } catch (e) {
      console.error('Failed to load employees in ProcessPayrollModal:', e);
    }
  };

  const fetchServerAssignments = async () => {
    setIsLoadingAssignments(true);
    try {
      const res = await fetch('/api/v1/payroll');
      const data = await res.json();
      if (data.success && data.data?.salaryAssignments) {
        setServerAssignments(data.data.salaryAssignments);
      }
    } catch (e) {
      console.error('Failed to load salary assignments:', e);
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  const handleBulkAssignStandard = async () => {
    setIsBulkAssigning(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/payroll/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bulk: true,
          assignAllStandard: true,
          basicSalary: 12500,
          hra: 3750,
          conveyance: 2353,
          specialAllowance: 6397,
          effectiveFrom: `${selectedYear}-01-01`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAssignSuccessMsg(data.message || 'Standard salary structure assigned successfully to all employees.');
        await fetchServerAssignments();
      } else {
        setErrorMsg(data.message || 'Failed to auto-assign standard salaries.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Error connecting to salary assignment service.');
    } finally {
      setIsBulkAssigning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchServerAssignments();
      fetchEmployeesFromApi();
    }
  }, [isOpen, selectedMonth, selectedYear]);

  if (!isOpen) return null;

  const allEmployees = (state.employees && state.employees.length > 0) ? state.employees : loadedEmployees;

  const activeEmployees = allEmployees.filter(
    (e) => e.status !== 'Terminated' && e.status !== 'Former Employee'
  );

  const filteredEmployees = activeEmployees.filter(
    (e) => selectedDepartment === 'ALL' || e.department === selectedDepartment
  );

  const selectedScopeEmployees = selectedEmployeeIds.length > 0
    ? filteredEmployees.filter((e) => selectedEmployeeIds.includes(e.id))
    : filteredEmployees;

  const checkEmployeeSalaryReadiness = (emp: any) => {
    const monthStartKey = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1)).toISOString().slice(0, 10);
    const monthEndKey = new Date(Date.UTC(selectedYear, selectedMonth, 1)).toISOString().slice(0, 10);

    const empKeys = [emp.employeeId, emp.id, emp._id, (emp as any).userId].filter(Boolean).map(String);

    const empAssignments = (serverAssignments || []).filter((a: any) =>
      empKeys.includes(String(a.employeeId || ''))
    );

    const valid = empAssignments
      .filter((a: any) => a.status !== 'Superceded' && a.status !== 'SUPERSEDED')
      .find((a: any) => {
        const from = a.effectiveFrom ? new Date(a.effectiveFrom).toISOString().slice(0, 10) : null;
        const to = a.effectiveTo ? new Date(a.effectiveTo).toISOString().slice(0, 10) : null;
        const basic = Number(a.basicSalary || 0);
        return basic > 0 && (!from || from < monthEndKey) && (!to || to >= monthStartKey);
      });

    return valid || null;
  };

  const employeeReadinessList = selectedScopeEmployees.map((emp) => {
    const assignment = checkEmployeeSalaryReadiness(emp);
    return {
      employee: emp,
      isReady: !!assignment,
      assignment,
    };
  });

  const unassignedEmployees = employeeReadinessList.filter((item) => !item.isReady);
  const hasUnassignedEmployees = unassignedEmployees.length > 0;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEmployeeIds(filteredEmployees.map((e) => e.id));
    } else {
      setSelectedEmployeeIds([]);
    }
  };

  const toggleEmployee = (id: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleOpenAssignModal = (emp: any) => {
    setAssigningEmployee(emp);
    setIsAssignModalOpen(true);
  };

  const handleRunCalculation = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const targetEmpIds = selectedEmployeeIds.length > 0
        ? selectedEmployeeIds.map((id) => {
            const found = allEmployees.find((e) => e.id === id || e.employeeId === id);
            return found?.employeeId || id;
          })
        : undefined;

      const res = await fetch('/api/v1/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          employeeIds: targetEmpIds,
          autoAssignStandard: true,
          deductPf,
          deductEsi,
        }),
      });
      const data = await res.json();
      setIsProcessing(false);

      if (data.success) {
        processMonthlyPayroll(selectedMonth, selectedYear);
        setCalculationResult(data.data || data);
        setCurrentStep(5); // Advance to Review & Approve
      } else {
        if (data.code === 'SALARY_ASSIGNMENT_REQUIRED' || data.blockedEmployees) {
          setErrorMsg(
            data.message || 'Payroll processing failed: One or more selected employees lack a valid effective salary assignment.'
          );
        } else {
          setErrorMsg(data.message || 'Failed to process payroll calculation.');
        }
      }
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMsg(err.message || 'Error connecting to payroll service.');
    }
  };

  const handleApproveBatch = () => {
    onSuccess(`Payroll for ${months.find((m) => m.value === selectedMonth)?.label} ${selectedYear} approved and ready for payslip generation!`);
    setCurrentStep(6); // Advance to Payslip / Paid
  };

  const handleFinish = () => {
    onClose();
    setCurrentStep(1);
  };

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  const monthLabel = months.find((m) => m.value === selectedMonth)?.label || 'Current';

  const steps = [
    { id: 1, label: 'Month' },
    { id: 2, label: 'Employees' },
    { id: 3, label: 'Review Data' },
    { id: 4, label: 'Calculate' },
    { id: 5, label: 'Approve' },
    { id: 6, label: 'Payslips' },
  ];

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl text-xs text-slate-800 animate-fade-in max-h-[90vh] flex flex-col justify-between">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between border-b pb-4 font-bold text-sm text-slate-900">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60">
                <Calculator className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Payroll Processing Wizard</h3>
                <p className="text-[11px] font-normal text-slate-500">6-Step Guided Monthly Payroll Calculation & Approval</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>

          {errorMsg && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 font-semibold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {assignSuccessMsg && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{assignSuccessMsg}</span>
            </div>
          )}

          {/* Stepper Progress Bar */}
          <div className="my-5 flex items-center justify-between border-b pb-4">
            {steps.map((s, idx) => {
              const isCurrent = currentStep === s.id;
              const isDone = currentStep > s.id;
              return (
                <React.Fragment key={s.id}>
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition ${
                        isDone
                          ? 'bg-emerald-600 text-white'
                          : isCurrent
                          ? 'bg-orange-500 text-white shadow-md ring-2 ring-orange-100'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {isDone ? <Check className="h-3.5 w-3.5" /> : s.id}
                    </div>
                    <span className={`text-[10px] font-semibold ${isCurrent ? 'text-orange-600 font-bold' : isDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {s.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`h-0.5 flex-1 transition ${currentStep > s.id ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Wizard Step Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain py-2 pr-1">
          {/* STEP 1: Select Payroll Month */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#FED7AA]/80 bg-[#FFF7ED]/50 p-3.5 text-slate-900">
                <h4 className="font-bold text-xs flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-orange-500" />
                  Step 1: Select Payroll Cycle Month & Year
                </h4>
                <p className="mt-1 text-[11px] text-orange-700">
                  Select the target calendar month and financial year for processing employee salaries.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-900">Pay Month</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 bg-slate-50 font-medium text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                  >
                    {months.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-900">Pay Year</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 bg-slate-50 font-medium text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                  >
                    <option value={2025}>2025</option>
                    <option value={2026}>2026</option>
                    <option value={2027}>2027</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <span className="font-bold text-xs text-slate-800">Target Cycle Summary</span>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white p-2 border">
                    <span className="text-[10px] text-slate-400">Pay Period</span>
                    <p className="font-bold text-slate-800">{monthLabel} {selectedYear}</p>
                  </div>
                  <div className="rounded-lg bg-white p-2 border">
                    <span className="text-[10px] text-slate-400">Standard Work Days</span>
                    <p className="font-bold text-slate-800">{state.payrollSettings?.workingDaysPerMonth || 26} Days</p>
                  </div>
                  <div className="rounded-lg bg-white p-2 border">
                    <span className="text-[10px] text-slate-400">Active Employees</span>
                    <p className="font-bold text-orange-600">{activeEmployees.length}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Select Employees */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#FED7AA]/80 bg-[#FFF7ED]/50 p-3.5 text-slate-900">
                <h4 className="font-bold text-xs flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-orange-500" />
                  Step 2: Select Employees for Payroll Run
                </h4>
                <p className="mt-1 text-[11px] text-orange-700">
                  Filter by department or select specific employees to include in this payroll execution.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">Filter Department:</span>
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="rounded-xl border border-slate-200 p-2 bg-slate-50 font-medium text-slate-800"
                  >
                    <option value="ALL">All Departments</option>
                    <option value="Engineering & IT">Engineering & IT</option>
                    <option value="Human Resources">Human Resources</option>
                    <option value="Finance & Accounts">Finance & Accounts</option>
                    <option value="Sales & Marketing">Sales & Marketing</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer font-bold text-orange-600">
                  <input
                    type="checkbox"
                    checked={selectedEmployeeIds.length === filteredEmployees.length && filteredEmployees.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-slate-300 text-orange-600 focus:ring-blue-500"
                  />
                  <span>Select All ({filteredEmployees.length})</span>
                </label>
              </div>

              <div className="max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                {filteredEmployees.map((emp) => {
                  const isChecked = selectedEmployeeIds.length === 0 || selectedEmployeeIds.includes(emp.id);
                  return (
                    <div
                      key={emp.id}
                      onClick={() => toggleEmployee(emp.id)}
                      className="flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="rounded border-slate-300 text-orange-600 focus:ring-blue-500"
                        />
                        <img
                          src={emp.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80'}
                          alt={emp.firstName}
                          className="h-7 w-7 rounded-full object-cover border"
                        />
                        <div>
                          <p className="font-bold text-slate-900">{emp.firstName} {emp.lastName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{emp.employeeId} • {emp.department}</p>
                        </div>
                      </div>
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        {emp.designation || 'Active'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: Review Data (Attendance + Leave + Base Salary Validation) */}
          {currentStep === 3 && (
            <div className="space-y-4">
              {hasUnassignedEmployees ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-900">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-xs flex items-center gap-1.5 text-rose-700">
                        <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                        Salary Assignment Action Required
                      </h4>
                      <p className="mt-1 text-[11px] text-rose-800">
                        {unassignedEmployees.length} employee(s) missing a valid effective salary assignment for {monthLabel} {selectedYear}. You can assign individual structures below or click to auto-assign the standard enterprise structure.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isBulkAssigning}
                      onClick={handleBulkAssignStandard}
                      className="shrink-0 rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isBulkAssigning ? 'animate-spin' : ''}`} />
                      <span>{isBulkAssigning ? 'Assigning...' : 'Auto-Assign Standard (₹25k)'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-emerald-900">
                  <h4 className="font-bold text-xs flex items-center gap-1.5 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    All Selected Employees Payroll Ready
                  </h4>
                  <p className="mt-1 text-[11px] text-emerald-800">
                    All {selectedScopeEmployees.length} selected employee(s) have valid active salary assignments effective for {monthLabel} {selectedYear}.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-4 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">ATTENDANCE</span>
                  <div className="mt-1 flex items-center gap-1 text-emerald-600 font-bold text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Verified</span>
                  </div>
                  <p className="mt-0.5 text-[9px] text-slate-500">Biometric synced</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">LEAVE & LOP</span>
                  <div className="mt-1 flex items-center gap-1 text-orange-600 font-bold text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Computed</span>
                  </div>
                  <p className="mt-0.5 text-[9px] text-slate-500">LOP factored</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">STATUTORY</span>
                  <div className="mt-1 flex items-center gap-1 text-orange-600 font-bold text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Active</span>
                  </div>
                  <p className="mt-0.5 text-[9px] text-slate-500">PF/PT/TDS active</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">SALARY DATA</span>
                  <div className={`mt-1 flex items-center gap-1 font-bold text-xs ${hasUnassignedEmployees ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {hasUnassignedEmployees ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                    <span>{selectedScopeEmployees.length - unassignedEmployees.length} / {selectedScopeEmployees.length} Ready</span>
                  </div>
                  <p className="mt-0.5 text-[9px] text-slate-500">Structure lookup</p>
                </div>
              </div>

              {/* Employee Salary Readiness Detail */}
              <div className="space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-800 text-xs pt-1">
                  <span>Employee Salary Readiness ({selectedScopeEmployees.length})</span>
                  <button
                    type="button"
                    onClick={fetchServerAssignments}
                    className="text-orange-600 flex items-center gap-1 hover:underline text-[11px]"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingAssignments ? 'animate-spin' : ''}`} /> Refresh Status
                  </button>
                </div>

                <div className="max-h-52 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                  {employeeReadinessList.map(({ employee, isReady, assignment }) => (
                    <div key={employee.id} className="flex items-center justify-between p-2.5 text-xs">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={employee.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80'}
                          alt={employee.firstName}
                          className="h-7 w-7 rounded-full object-cover border"
                        />
                        <div>
                          <p className="font-bold text-slate-900">{employee.firstName} {employee.lastName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{employee.employeeId} • {employee.department}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isReady ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Payroll Ready (₹{assignment?.basicSalary?.toLocaleString('en-IN')})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                            <AlertCircle className="h-3 w-3 text-rose-600" />
                            Salary Unassigned
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenAssignModal(employee)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition flex items-center gap-1 ${
                            isReady
                              ? 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              : 'bg-orange-500 text-white shadow-xs hover:bg-orange-600 active:bg-orange-700'
                          }`}
                        >
                          <UserCheck className="h-3 w-3" />
                          {isReady ? 'Edit Salary' : 'Assign Salary'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Calculate Payroll */}
          {currentStep === 4 && (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60 shadow-sm">
                <Calculator className="h-8 w-8 animate-pulse" />
              </div>

              <h4 className="text-sm font-bold text-slate-900">Step 4: Execute Payroll Calculation Engine</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Clicking &quot;Calculate Payroll Now&quot; will compute Gross Salary, PF, PT, TDS tax, LOP deductions, and Net Disbursal for selected employees.
              </p>

              <div className="flex flex-wrap justify-center gap-4 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800">
              <input
              type="checkbox"
              checked={deductPf}
              onChange={(e) => setDeductPf(e.target.checked)}
              className="h-4 w-4 text-orange-500 rounded"
                />
              Deduct PF
  </label>
  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800">
    <input
      type="checkbox"
      checked={deductEsi}
      onChange={(e) => setDeductEsi(e.target.checked)}
      className="h-4 w-4 text-orange-500 rounded"
    />
    Deduct ESI
  </label>
</div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs max-w-md mx-auto space-y-2">
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-slate-500">Target Month:</span>
                  <span className="font-bold text-slate-900">{monthLabel} {selectedYear}</span>
                </div>
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-slate-500">Employees Scope:</span>
                  <span className="font-bold text-orange-600">
                    {selectedScopeEmployees.length} Employees
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Calculation Engine:</span>
                  <span className="font-bold text-emerald-600">Automated Server Engine</span>
                </div>
              </div>

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleRunCalculation}
                className="mt-2 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 transition"
              >
                <Play className="h-4 w-4 fill-white" />
                <span>{isProcessing ? 'Calculating Salary & Tax Rules...' : 'Calculate Payroll Now'}</span>
              </button>
            </div>
          )}

          {/* STEP 5: Review & Approve */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-emerald-900">
                <h4 className="font-bold text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Step 5: Review Calculation Results & Approve Batch
                </h4>
                <p className="mt-1 text-[11px] text-emerald-700">
                  Payroll calculation completed successfully. Review totals before final authorization.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400">TOTAL GROSS PAYROLL</span>
                  <p className="mt-1 text-lg font-extrabold text-slate-900">
                    ₹{((calculationResult?.summary?.totalGross) || 285000).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400">NET DISBURSAL PAYROLL</span>
                  <p className="mt-1 text-lg font-extrabold text-emerald-600">
                    ₹{((calculationResult?.summary?.totalNet) || 248500).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Total Employees Processed:</span>
                  <span className="font-bold text-slate-900">{calculationResult?.summary?.processedCount || selectedScopeEmployees.length}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Statutory Deductions (PF/PT/TDS):</span>
                  <span className="font-bold text-rose-600">
                    ₹{((calculationResult?.summary?.totalDeductions) || 36500).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleApproveBatch}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-700 transition"
                >
                  <Check className="h-4 w-4" />
                  <span>Approve & Authorize Batch</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: Generate Payslips / Mark Paid */}
          {currentStep === 6 && (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm">
                <FileText className="h-8 w-8" />
              </div>

              <h4 className="text-sm font-bold text-slate-900">Step 6: Payroll Complete & Payslips Generated</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Payroll run for {monthLabel} {selectedYear} is approved. Employee payslips are ready for viewing and PDF download.
              </p>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 text-xs max-w-md mx-auto space-y-1.5 text-emerald-900">
                <div className="flex items-center justify-center gap-2 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>All Records Marked as Approved & Ready for Payment</span>
                </div>
                <p className="text-[11px] text-emerald-700">
                  HR and employees can now access official monthly payslips with statutory breakdowns.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="flex items-center justify-between border-t pt-4">
          {currentStep > 1 && currentStep < 6 ? (
            <button
              type="button"
              onClick={() => setCurrentStep((prev) => prev - 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {currentStep < 4 && (
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  disabled={currentStep === 3 && hasUnassignedEmployees}
                  onClick={() => setCurrentStep((prev) => prev + 1)}
                  className={`inline-flex items-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-md transition ${
                    currentStep === 3 && hasUnassignedEmployees
                      ? 'bg-slate-300 text-slate-50 cursor-not-allowed shadow-none'
                      : 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700'
                  }`}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
                {currentStep === 3 && hasUnassignedEmployees && (
                  <span className="text-[10px] font-medium text-rose-600">
                    Assign salary structures to proceed
                  </span>
                )}
              </div>
            )}

            {currentStep === 6 && (
              <button
                type="button"
                onClick={handleFinish}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-700"
              >
                Finish & Close
              </button>
            )}
          </div>
        </div>
      </div>

      {isAssignModalOpen && (
        <AssignSalaryModal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          onSuccess={async (msg) => {
            setIsAssignModalOpen(false);
            setAssignSuccessMsg(msg);
            await fetchServerAssignments();
            setTimeout(() => setAssignSuccessMsg(null), 4000);
          }}
          selectedEmployee={assigningEmployee}
        />
      )}
    </div>
      </Portal>
);
};
