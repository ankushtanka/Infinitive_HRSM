'use client';
import { Portal } from './Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState, useEffect } from 'react';
import { X, UserCheck } from 'lucide-react';
import { Employee, EmployeeSalaryAssignment } from '@/types/admin';
import { useEmsStore } from '@/store/emsStore';
import { calculateSalaryBreakdown, STANDARD_BREAKDOWN_25K } from '@/lib/salaryBreakdown';

interface AssignSalaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  selectedEmployee?: Employee | null;
  editingAssignment?: EmployeeSalaryAssignment | null;
}

export const AssignSalaryModal: React.FC<AssignSalaryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  selectedEmployee,
  editingAssignment,
}) => {
  useBodyScrollLock(isOpen);

  const { state, addSalaryAssignment, updateSalaryAssignment } = useEmsStore();

  const [employeeId, setEmployeeId] = useState<string>('');
  const [selectedStructureId, setSelectedStructureId] = useState<string>('struct-std');
  const [grossInput, setGrossInput] = useState<number>(25000);
  const [basicSalary, setBasicSalary] = useState<number>(12500);
  const [hra, setHra] = useState<number>(3750);
  const [conveyance, setConveyance] = useState<number>(2353);
  const [medical, setMedical] = useState<number>(0);
  const [specialAllowance, setSpecialAllowance] = useState<number>(6397);
  const [bonus, setBonus] = useState<number>(0);
  const [pfEnabled, setPfEnabled] = useState<boolean>(true);
  const [ptEnabled, setPtEnabled] = useState<boolean>(true);
  const [tdsPercent, setTdsPercent] = useState<number>(0);
  const [effectiveDate, setEffectiveDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [changeReason, setChangeReason] = useState<string>('Standard Salary Assignment (50% Basic, 30% HRA, ₹2,353 Conveyance)');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Bank & Statutory Details (Matching Image 4)
  const [bankName, setBankName] = useState<string>('HDFC Bank');
  const [bankAccountNo, setBankAccountNo] = useState<string>('N/A');
  const [panNumber, setPanNumber] = useState<string>('N/A');
  const [pfNo, setPfNo] = useState<string>('N/A');
  const [pfUan, setPfUan] = useState<string>('N/A');

  useEffect(() => {
    if (editingAssignment) {
      setEmployeeId(editingAssignment.employeeId);
      if (editingAssignment.structureId) {
        setSelectedStructureId(editingAssignment.structureId);
      }
      setBasicSalary(editingAssignment.basicSalary);
      setHra(editingAssignment.hra);
      setConveyance(editingAssignment.conveyance);
      setMedical(editingAssignment.medical);
      setSpecialAllowance(editingAssignment.specialAllowance);
      setBonus(editingAssignment.bonus || 0);
      setPfEnabled(editingAssignment.pfEnabled);
      setPtEnabled(editingAssignment.ptEnabled);
      setTdsPercent(editingAssignment.tdsPercent || 10);
      setEffectiveDate(editingAssignment.effectiveDate || new Date().toISOString().split('T')[0]);
      setChangeReason(editingAssignment.revisionReason || 'Salary structure updated');
    } else if (selectedEmployee) {
      setEmployeeId(selectedEmployee.employeeId || selectedEmployee.id || (selectedEmployee as any)._id || '');
    } else if (state.employees && state.employees.length > 0 && !employeeId) {
      setEmployeeId(state.employees[0].employeeId || state.employees[0].id);
    }

    const curEmp = state.employees.find((e) => e.id === employeeId || e.employeeId === employeeId || (e as any)._id === employeeId) || selectedEmployee;
    if (curEmp) {
      setBankName(curEmp.bankName || 'HDFC Bank');
      setBankAccountNo(curEmp.accountNumber || (curEmp as any).bankAccountNo || 'N/A');
      setPanNumber(curEmp.panNumber || 'N/A');
      setPfNo((curEmp as any).pfNumber || (curEmp as any).pfNo || 'N/A');
      setPfUan((curEmp as any).uan || (curEmp as any).pfUan || 'N/A');
    }
  }, [editingAssignment, selectedEmployee, state.employees, employeeId]);

  if (!isOpen) return null;

  const handleStructureSelect = (structId: string) => {
    setSelectedStructureId(structId);
    const struct = state.salaryStructures.find((s) => s.id === structId);
    if (struct) {
      setBasicSalary(struct.basicSalary);
      const computedHra = struct.hraType === 'PercentBasic' ? Math.round((struct.basicSalary * struct.hraValue) / 100) : struct.hraValue;
      setHra(computedHra);
      setConveyance(struct.conveyance);
      setMedical(struct.medical);
      setSpecialAllowance(struct.specialAllowance);
      setTdsPercent(struct.tdsPercent);
    }
  };

  const handleGrossSalaryChange = (val: number) => {
    setGrossInput(val);
    if (val > 0) {
      const b = calculateSalaryBreakdown(val);
      setBasicSalary(b.basicSalary);
      setHra(b.hra);
      setConveyance(b.conveyance);
      setMedical(0);
      setSpecialAllowance(b.specialAllowance);
    }
  };

  const handleBasicSalaryChange = (newBasic: number) => {
    setBasicSalary(newBasic);
    const struct = state.salaryStructures.find((s) => s.id === selectedStructureId);
    if (struct && struct.hraType === 'PercentBasic') {
      setHra(Math.round((newBasic * struct.hraValue) / 100));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const targetEmpId = employeeId || selectedEmployee?.employeeId || selectedEmployee?.id || (selectedEmployee as any)?._id || state.employees[0]?.employeeId || state.employees[0]?.id;
    if (!targetEmpId) {
      setErrorMsg('Please select a valid employee.');
      return;
    }

    const empObj = state.employees.find((e) => e.id === targetEmpId || e.employeeId === targetEmpId || (e as any)._id === targetEmpId) || selectedEmployee;
    const empName = empObj ? `${empObj.firstName || ''} ${empObj.lastName || ''}`.trim() : 'Employee';
    const structObj = state.salaryStructures.find((s) => s.id === selectedStructureId);

    try {
      const res = await fetch('/api/v1/payroll/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: empObj?.employeeId || targetEmpId,
          salaryStructureId: selectedStructureId,
          basicSalary: Number(basicSalary) || 0,
          hra: Number(hra) || 0,
          conveyance: Number(conveyance) || 0,
          medical: Number(medical) || 0,
          specialAllowance: Number(specialAllowance) || 0,
          bonus: Number(bonus) || 0,
          bankName: bankName.trim(),
          bankAccountNo: bankAccountNo.trim(),
          panNumber: panNumber.trim(),
          pfNo: pfNo.trim(),
          pfUan: pfUan.trim(),
          effectiveFrom: effectiveDate,
        }),
      });
      const data = await res.json();

      if (data.success) {
        addSalaryAssignment({
          employeeId: targetEmpId,
          employeeName: empName,
          structureId: selectedStructureId,
          structureTitle: structObj?.title || 'Custom Structure',
          basicSalary: Number(basicSalary) || 0,
          hra: Number(hra) || 0,
          conveyance: Number(conveyance) || 0,
          medical: Number(medical) || 0,
          specialAllowance: Number(specialAllowance) || 0,
          otherAllowances: 0,
          bonus: Number(bonus) || 0,
          pfEnabled,
          pfPercent: state.payrollSettings?.pfDefaultPercent || 12,
          ptEnabled,
          ptAmount: state.payrollSettings?.ptDefaultAmount || 200,
          tdsPercent,
          esiEnabled: false,
          esiPercent: 0,
          effectiveDate,
          status: 'Active',
          revisionReason: changeReason,
          createdBy: 'Admin',
        });
        onSuccess(editingAssignment ? `Salary updated successfully for ${empName}` : `Salary assigned successfully to ${empName}`);
        onClose();
      } else {
        setErrorMsg(data.message || 'Failed to assign salary structure.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error connecting to salary service.');
    }
  };

  const computedGross = Number(basicSalary) + Number(hra) + Number(conveyance) + Number(medical) + Number(specialAllowance) + Number(bonus);

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl text-xs text-slate-800 animate-fade-in max-h-[90vh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between border-b pb-3 font-bold text-sm text-slate-900">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-orange-500" />
            <span>{editingAssignment ? 'Edit Employee Salary Structure' : 'Assign / Change Employee Salary Structure'}</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 font-semibold">
              {errorMsg}
            </div>
          )}
          <div>
            <label className="font-bold text-slate-900">Select Employee *</label>
            <select
              value={employeeId}
              disabled={!!editingAssignment}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {state.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.employeeId}) - {e.department}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-900">Preset Salary Structure</label>
              <select
                value={selectedStructureId}
                onChange={(e) => handleStructureSelect(e.target.value)}
                className="mt-1 w-full rounded-xl border p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
              >
                {state.salaryStructures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-900">Effective Date *</label>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="mt-1 w-full rounded-xl border p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Quick Gross Salary Auto-Breakdown */}
          <div className="rounded-xl border border-[#FED7AA]/80 bg-[#FFF7ED]/50 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-900 text-xs">
                Quick Gross Salary Auto-Breakdown (₹)
              </label>
              <span className="text-[10px] text-orange-700 font-semibold bg-white/80 px-2 py-0.5 rounded-md border border-[#FED7AA]">
                Formula: Basic 50% | HRA 30% of Basic | Conveyance ₹2,353 | Special Allowance Remainder
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={500}
                placeholder="Enter Monthly Gross (e.g. 25000)"
                value={grossInput}
                onChange={(e) => handleGrossSalaryChange(Number(e.target.value))}
                className="w-1/2 rounded-xl border border-[#FED7AA] p-2 text-xs font-semibold bg-white focus:border-orange-500"
              />
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleGrossSalaryChange(25000)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    grossInput === 25000
                      ? 'bg-orange-500 text-white shadow-xs'
                      : 'bg-white border border-[#FED7AA] text-orange-800 hover:bg-[#FFF7ED]'
                  }`}
                >
                  ₹25,000 (Standard)
                </button>
                <button
                  type="button"
                  onClick={() => handleGrossSalaryChange(30000)}
                  className="px-2 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#FED7AA] text-orange-700 hover:bg-[#FFF7ED]"
                >
                  ₹30,000
                </button>
              </div>
            </div>

            {/* Visual Breakdown Table for User Verification */}
            <div className="mt-2 overflow-x-auto min-h-0 max-h-[260px] overflow-y-auto overscroll-contain pr-1 rounded-lg border border-[#FED7AA]/80 bg-white" style={{ scrollbarWidth: 'thin' }}>
              <table className="w-full text-[11px] text-slate-800">
                <thead className="sticky top-0 z-10 bg-[#FFF7ED] backdrop-blur-xs font-bold text-slate-900 border-b border-[#FED7AA]">
                  <tr>
                    <th className="text-left px-2 py-1">Salary Component</th>
                    <th className="text-right px-2 py-1">Monthly Amount</th>
                    <th className="text-right px-2 py-1">Percentage of Gross</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-2 py-1 font-semibold">Basic Salary</td>
                    <td className="text-right px-2 py-1 font-mono">₹{basicSalary.toLocaleString('en-IN')}</td>
                    <td className="text-right px-2 py-1 font-semibold text-slate-800">
                      {computedGross > 0 ? `${((basicSalary / computedGross) * 100).toFixed(0)}%` : '50%'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1 font-semibold">HRA (30% of Basic)</td>
                    <td className="text-right px-2 py-1 font-mono">₹{hra.toLocaleString('en-IN')}</td>
                    <td className="text-right px-2 py-1 font-semibold text-slate-800">
                      {computedGross > 0 ? `${((hra / computedGross) * 100).toFixed(0)}%` : '15%'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1 font-semibold">Conveyance</td>
                    <td className="text-right px-2 py-1 font-mono">₹{conveyance.toLocaleString('en-IN')}</td>
                    <td className="text-right px-2 py-1 font-semibold text-slate-800">
                      {computedGross > 0 ? `${((conveyance / computedGross) * 100).toFixed(2)}%` : '9.41%'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1 font-semibold">Special Allowance</td>
                    <td className="text-right px-2 py-1 font-mono">₹{specialAllowance.toLocaleString('en-IN')}</td>
                    <td className="text-right px-2 py-1 font-semibold text-slate-800">
                      {computedGross > 0 ? `${((specialAllowance / computedGross) * 100).toFixed(2)}%` : '25.59%'}
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                  <tr>
                    <td className="px-2 py-1 text-slate-900">Total Gross Salary</td>
                    <td className="text-right px-2 py-1 font-mono text-slate-900">₹{computedGross.toLocaleString('en-IN')}</td>
                    <td className="text-right px-2 py-1 text-slate-900">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-3">
            <h4 className="font-bold text-slate-900 border-b pb-1 text-xs text-orange-700">Detailed Component Overrides</h4>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-800">Basic Salary (₹)</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={basicSalary}
                  onChange={(e) => handleBasicSalaryChange(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800">House Rent Allowance (HRA ₹)</label>
                <input
                  type="number"
                  min={0}
                  value={hra}
                  onChange={(e) => setHra(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800">Conveyance (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={conveyance}
                  onChange={(e) => setConveyance(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800">Medical Allowance (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={medical}
                  onChange={(e) => setMedical(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800">Special Allowance (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={specialAllowance}
                  onChange={(e) => setSpecialAllowance(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800">Regular Monthly Bonus (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={bonus}
                  onChange={(e) => setBonus(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-white"
                />
              </div>
            </div>

            <div className="rounded-lg bg-emerald-100/60 p-2 text-right font-bold text-emerald-900 text-xs">
              Configured Monthly Gross: ₹{computedGross.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
            <h4 className="font-bold text-slate-900 border-b pb-1 text-xs text-rose-700">Deduction Options</h4>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={pfEnabled}
                  onChange={(e) => setPfEnabled(e.target.checked)}
                  className="h-4 w-4 text-orange-500 rounded"
                />
                Deduct PF (12%)
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={ptEnabled}
                  onChange={(e) => setPtEnabled(e.target.checked)}
                  className="h-4 w-4 text-orange-500 rounded"
                />
                Deduct Professional Tax (₹200)
              </label>
            </div>
          </div>

          {/* Bank & Statutory Details (Matching Image 4) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
            <h4 className="font-bold text-slate-900 border-b pb-1 text-xs text-orange-700">
              Employee Bank & Statutory Details (Salary Slip Output)
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-800 text-[11px]">Bank Name</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. HDFC Bank"
                  className="mt-1 w-full rounded-xl border p-2 bg-white text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-800 text-[11px]">Bank Account No</label>
                <input
                  type="text"
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value)}
                  placeholder="e.g. N/A"
                  className="mt-1 w-full rounded-xl border p-2 bg-white text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-800 text-[11px]">PAN Number</label>
                <input
                  type="text"
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. N/A"
                  className="mt-1 w-full rounded-xl border p-2 bg-white text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-800 text-[11px]">PF No</label>
                <input
                  type="text"
                  value={pfNo}
                  onChange={(e) => setPfNo(e.target.value)}
                  placeholder="e.g. N/A"
                  className="mt-1 w-full rounded-xl border p-2 bg-white text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="font-bold text-slate-800 text-[11px]">PF UAN</label>
                <input
                  type="text"
                  value={pfUan}
                  onChange={(e) => setPfUan(e.target.value)}
                  placeholder="e.g. N/A"
                  className="mt-1 w-full rounded-xl border p-2 bg-white text-xs"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-900">Revision Reason / Audit Note</label>
            <input
              type="text"
              required
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-orange-600 active:bg-orange-700"
            >
              {editingAssignment ? 'Update Salary Structure' : 'Assign Salary Structure'}
            </button>
          </div>
        </form>
      </div>
    </div>
      </Portal>
);
};

