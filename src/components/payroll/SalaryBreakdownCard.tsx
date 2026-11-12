'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Building,
  CheckCircle2,
  Save,
  RotateCcw,
  Eye,
  Percent,
  Sparkles,
  Info,
  DollarSign,
  User,
  Shield,
} from 'lucide-react';
import { calculateSalaryBreakdown, STANDARD_BREAKDOWN_25K } from '@/lib/salaryBreakdown';
import { useEmsStore } from '@/store/emsStore';
import { ViewPayslipModal } from '@/components/modals/ViewPayslipModal';
import { PayrollRecord } from '@/types/admin';

interface SalaryBreakdownCardProps {
  onSuccess?: (msg: string) => void;
  className?: string;
  defaultEmployeeId?: string;
}

export const SalaryBreakdownCard: React.FC<SalaryBreakdownCardProps> = ({
  onSuccess,
  className = '',
  defaultEmployeeId,
}) => {
  const { state, addSalaryAssignment } = useEmsStore();

  const [selectedEmpId, setSelectedEmpId] = useState<string>(defaultEmployeeId || '');
  const [grossSalary, setGrossSalary] = useState<number>(25000);

  // Breakdown components
  const [basicSalary, setBasicSalary] = useState<number>(12500);
  const [hra, setHra] = useState<number>(3750);
  const [conveyance, setConveyance] = useState<number>(2353);
  const [specialAllowance, setSpecialAllowance] = useState<number>(6397);

  // Bank & Statutory Information (Image 4)
  const [bankName, setBankName] = useState<string>('HDFC Bank');
  const [bankAccountNo, setBankAccountNo] = useState<string>('N/A');
  const [panNumber, setPanNumber] = useState<string>('N/A');
  const [pfNo, setPfNo] = useState<string>('N/A');
  const [pfUan, setPfUan] = useState<string>('N/A');

  // UI state
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPayslipPreviewOpen, setIsPayslipPreviewOpen] = useState<boolean>(false);
  const [previewPayrollRecord, setPreviewPayrollRecord] = useState<PayrollRecord | null>(null);

  // Initialize selected employee
  useEffect(() => {
    if (!selectedEmpId && state.employees && state.employees.length > 0) {
      setSelectedEmpId(state.employees[0].employeeId || state.employees[0].id);
    }
  }, [state.employees, selectedEmpId]);

  // Load employee bank details when employee changes
  useEffect(() => {
    if (!selectedEmpId) return;
    const emp = state.employees.find((e) => e.employeeId === selectedEmpId || e.id === selectedEmpId);
    if (emp) {
      setBankName(emp.bankName || 'HDFC Bank');
      setBankAccountNo(emp.accountNumber || (emp as any).bankAccountNo || 'N/A');
      setPanNumber(emp.panNumber || 'N/A');
      setPfNo((emp as any).pfNumber || (emp as any).pfNo || 'N/A');
      setPfUan((emp as any).uan || (emp as any).pfUan || 'N/A');
    }
  }, [selectedEmpId, state.employees]);

  // Recalculate components based on gross
  const applyStandardCalculation = (grossVal: number) => {
    setGrossSalary(grossVal);
    if (grossVal === 25000) {
      setBasicSalary(12500);
      setHra(3750);
      setConveyance(2353);
      setSpecialAllowance(6397);
    } else {
      const b = calculateSalaryBreakdown(grossVal);
      setBasicSalary(b.basicSalary);
      setHra(b.hra);
      setConveyance(b.conveyance);
      setSpecialAllowance(b.specialAllowance);
    }
  };

  const handleGrossChange = (val: number) => {
    applyStandardCalculation(val);
  };

  const currentTotal = Number(basicSalary) + Number(hra) + Number(conveyance) + Number(specialAllowance);

  // Save to database
  const handleSave = async () => {
    setIsSaving(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/v1/payroll/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmpId,
          salaryStructureId: 'struct-standard-25k',
          basicSalary: Number(basicSalary),
          hra: Number(hra),
          conveyance: Number(conveyance),
          specialAllowance: Number(specialAllowance),
          bankName: bankName.trim(),
          bankAccountNo: bankAccountNo.trim(),
          panNumber: panNumber.trim(),
          pfNo: pfNo.trim(),
          pfUan: pfUan.trim(),
          effectiveFrom: '2026-01-01',
                }),
      });

      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({
          type: 'success',
          text: `Salary breakdown & bank details saved successfully for ${selectedEmpId}!`,
        });
        if (onSuccess) onSuccess(`Salary breakdown updated for ${selectedEmpId}`);
      } else {
        setFeedbackMsg({
          type: 'error',
          text: data.message || 'Failed to update salary breakdown.',
        });
      }
    } catch (e: any) {
      setFeedbackMsg({
        type: 'error',
        text: e.message || 'Network error updating salary breakdown.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Preview Salary Slip
  const handlePreviewSlip = () => {
    const emp = state.employees.find((e) => e.employeeId === selectedEmpId || e.id === selectedEmpId);
    const mockRecord: PayrollRecord = {
      id: `rec-${selectedEmpId}-${Date.now()}`,
      employeeId: selectedEmpId || 'EMP1004',
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Sumit Choudhary',
      avatar: emp?.avatar || '',
      department: emp?.department || 'Executive Board',
      designation: emp?.designation || 'Technical Director',
      joiningDate: emp?.joiningDate || '25 Aug 2025',
      payPeriod: 'June 2026',
      payMonth: 6,
      payYear: 2026,
      workingDays: 30,
      presentDays: 30,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      overtimeHours: 0,
      overtimeRate: 0,
      basicSalary: Number(basicSalary),
      hra: Number(hra),
      conveyance: Number(conveyance),
      medical: 0,
      specialAllowance: Number(specialAllowance),
      otherAllowances: 0,
      overtimePay: 0,
      bonus: 0,
      otherEarnings: 0,
      grossSalary: currentTotal,
      lopDeduction: 0,
      pfDeduction: 0,
      ptDeduction: 0,
      taxDeduction: 0,
      esiDeduction: 0,
      loanDeduction: 0,
      otherDeductions: 0,
      totalDeductions: 0,
      netSalary: currentTotal,
      status: 'Approved',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setPreviewPayrollRecord(mockRecord);
    setIsPayslipPreviewOpen(true);
  };

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}>
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/20 border border-orange-400/40 text-orange-400 shadow-inner">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Salary Breakdown & Bank Details Configuration
                </h3>
                <span className="rounded-full bg-orange-500/20 border border-orange-400/30 px-2.5 py-0.5 text-[10px] font-bold text-orange-200 uppercase tracking-wider">
                  Standard Formula
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Standard ₹25,000 Gross Salary calculation with employee banking and statutory details
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => applyStandardCalculation(25000)}
              className="flex items-center gap-1.5 rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-200 hover:bg-orange-500/20 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Standard ₹25k</span>
            </button>
            <button
              type="button"
              onClick={handlePreviewSlip}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Preview Salary Slip</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Feedback Message */}
        {feedbackMsg && (
          <div
            className={`flex items-center gap-2 rounded-xl p-3 text-xs font-semibold ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <Info className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Section 1: Employee & Target Gross */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-500" />
              <span>Target Employee *</span>
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-hidden"
            >
              {state.employees.map((e) => (
                <option key={e.id || e.employeeId} value={e.employeeId || e.id}>
                  {e.firstName} {e.lastName} ({e.employeeId}) — {e.designation || e.department}
                </option>
              ))}
              {(!state.employees || state.employees.length === 0) && (
                <option value="EMP1004">Sumit Choudhary (EMP1004) — Technical Director</option>
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                <span>Monthly Gross Salary (₹) *</span>
              </label>
              <span className="text-[10px] text-slate-500 font-medium">Standard: ₹25,000</span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step={500}
                value={grossSalary}
                onChange={(e) => handleGrossChange(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-hidden"
                placeholder="25000"
              />
              <button
                type="button"
                onClick={() => applyStandardCalculation(25000)}
                className="shrink-0 px-3 py-2 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-orange-700 hover:bg-[#FFEDD5] text-xs font-bold transition-colors"
              >
                ₹25k Default
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Salary Component Breakdown Table (Exact calculation requested) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Percent className="h-3.5 w-3.5 text-orange-500" />
              <span>Earnings Component Breakdown</span>
            </h4>
            <span className="text-[11px] text-slate-500">
              Calculation: Basic (50%) + HRA (30% of Basic) + Conveyance (₹2,353) + Special Allowance (Remainder)
            </span>
          </div>

          <div className="overflow-x-auto min-h-0 max-h-[400px] overflow-y-auto overscroll-contain pr-1 rounded-xl border border-slate-200 bg-slate-50/50" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5">Salary Component</th>
                  <th className="px-3 py-2.5">Calculation Rule</th>
                  <th className="px-3 py-2.5 text-right w-36">Monthly Amount (₹)</th>
                  <th className="px-3 py-2.5 text-right w-28">Percentage of Gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {/* 1. Basic Salary */}
                <tr className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-bold text-slate-900">Basic Salary</td>
                  <td className="px-3 py-2 text-slate-500">₹{grossSalary.toLocaleString('en-IN')} × 50%</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      value={basicSalary}
                      onChange={(e) => setBasicSalary(Number(e.target.value))}
                      className="w-32 text-right rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-orange-700">
                    {currentTotal > 0 ? `${((basicSalary / currentTotal) * 100).toFixed(0)}%` : '50%'}
                  </td>
                </tr>

                {/* 2. HRA */}
                <tr className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-bold text-slate-900">HRA</td>
                  <td className="px-3 py-2 text-slate-500">30% of Basic Salary (₹{basicSalary.toLocaleString('en-IN')} × 30%)</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      value={hra}
                      onChange={(e) => setHra(Number(e.target.value))}
                      className="w-32 text-right rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-orange-700">
                    {currentTotal > 0 ? `${((hra / currentTotal) * 100).toFixed(0)}%` : '15%'}
                  </td>
                </tr>

                {/* 3. Conveyance */}
                <tr className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-bold text-slate-900">Conveyance</td>
                  <td className="px-3 py-2 text-slate-500">Fixed travel allowance (retained at ₹2,353)</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      value={conveyance}
                      onChange={(e) => setConveyance(Number(e.target.value))}
                      className="w-32 text-right rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-orange-700">
                    {currentTotal > 0 ? `${((conveyance / currentTotal) * 100).toFixed(2)}%` : '9.41%'}
                  </td>
                </tr>

                {/* 4. Special Allowance */}
                <tr className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-bold text-slate-900">Special Allowance</td>
                  <td className="px-3 py-2 text-slate-500">Balancing allowance (Gross − Basic − HRA − Conveyance)</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      value={specialAllowance}
                      onChange={(e) => setSpecialAllowance(Number(e.target.value))}
                      className="w-32 text-right rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-orange-700">
                    {currentTotal > 0 ? `${((specialAllowance / currentTotal) * 100).toFixed(2)}%` : '25.59%'}
                  </td>
                </tr>
              </tbody>
              <tfoot className="bg-slate-100 font-bold text-slate-900 border-t border-slate-200">
                <tr>
                  <td className="px-3 py-2.5">Total Gross Salary</td>
                  <td className="px-3 py-2.5 text-slate-500">Sum of All Components</td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm text-emerald-700">
                    ₹{currentTotal.toLocaleString('en-IN')}
                  </td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Section 3: Bank & Statutory Details (Matching Image 4) */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Building className="h-3.5 w-3.5 text-orange-500" />
              <span>Employee Bank & Statutory Details (As Rendered in Salary Slip)</span>
            </h4>
            <span className="text-[11px] text-slate-500">
              Reference: Employee No, Bank Name, Bank Account No, PAN Number, PF No, PF UAN
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Bank Name */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Bank Name</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. HDFC Bank"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* Bank Account Number */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Bank Account No (or &quot;N/A&quot;)
              </label>
              <input
                type="text"
                value={bankAccountNo}
                onChange={(e) => setBankAccountNo(e.target.value)}
                placeholder="e.g. N/A or 50100012345678"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* PAN Number */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                PAN Number (or &quot;N/A&quot;)
              </label>
              <input
                type="text"
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                placeholder="e.g. N/A or ABCDE1234F"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* PF Number */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                PF No (or &quot;N/A&quot;)
              </label>
              <input
                type="text"
                value={pfNo}
                onChange={(e) => setPfNo(e.target.value)}
                placeholder="e.g. N/A or RJ/UDR/123456"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* PF UAN */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                PF UAN (or &quot;N/A&quot;)
              </label>
              <input
                type="text"
                value={pfUan}
                onChange={(e) => setPfUan(e.target.value)}
                placeholder="e.g. N/A or 100912345678"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* Employee No (Read-Only Preview) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Employee No (Preview)
              </label>
              <input
                type="text"
                readOnly
                value={selectedEmpId || 'EMP1004'}
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Actions Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
          <div className="text-[11px] text-slate-500">
            Changes update employee records in MongoDB and sync directly with the official Salary Slip Generator.
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handlePreviewSlip}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Eye className="h-4 w-4 text-orange-500" />
              <span>Preview Salary Slip</span>
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 px-5 py-2 text-xs font-bold text-white shadow-md transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? 'Saving...' : 'Save & Apply Breakdown'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Salary Slip Preview Modal */}
      {isPayslipPreviewOpen && previewPayrollRecord && (
        <ViewPayslipModal
          isOpen={isPayslipPreviewOpen}
          onClose={() => setIsPayslipPreviewOpen(false)}
          record={previewPayrollRecord}
          initialData={{
            id: `preview-${selectedEmpId}`,
            payslipNumber: `PAY-2026-06-${selectedEmpId || 'EMP1004'}`,
            payPeriod: 'June 2026',
            payPeriodTitle: 'Payslip for the month of June 2026',
            status: 'APPROVED',
            paidAt: new Date().toISOString(),
            company: {
              name: 'INFINITIVE CLOUD PRIVATE LIMITED',
              tagline: 'Limitless Solution for Cloud and Web Hosting',
              registeredOffice: 'Kankroli,Rajasthan,313324',
              officeAddress: 'Udaipur Rajasthan,313001',
              phone: '+91 8690393087',
              email: 'cloudinfinitive@gmail.com',
              cin: 'U62020RJ2025PTC109151',
              logoUrl: '/infinitive_cloud_logo.png',
            },
            employee: {
              name: previewPayrollRecord.employeeName,
              employeeNo: selectedEmpId || 'EMP1004',
              joiningDate: '25 Aug 2025',
              designation: previewPayrollRecord.designation || 'Staff',
              department: previewPayrollRecord.department || 'General',
              location: 'Udaipur',
              effectiveWorkDays: 30,
              paidDays: 30,
              lop: 0,
              bankName: bankName || 'HDFC Bank',
              bankAccountNo: bankAccountNo || 'N/A',
              panNumber: panNumber || 'N/A',
              pfNo: pfNo || 'N/A',
              pfUan: pfUan || 'N/A',
            },
            salary: {
              earnings: [
                { name: 'BASIC', master: Number(basicSalary), actual: Number(basicSalary) },
                { name: 'HRA', master: Number(hra), actual: Number(hra) },
                { name: 'CONVEYANCE', master: Number(conveyance), actual: Number(conveyance) },
                { name: 'SPECIAL ALLOWANCE', master: Number(specialAllowance), actual: Number(specialAllowance) },
              ],
              deductions: [],
              totalEarningsMaster: currentTotal,
              totalEarningsActual: currentTotal,
              totalDeductionsActual: 0,
              netPay: currentTotal,
              netPayInWords: 'Twenty Five Thousand',
            },
            payrollRecord: previewPayrollRecord,
          }}
        />
      )}
    </div>
  );
};
export default SalaryBreakdownCard;
