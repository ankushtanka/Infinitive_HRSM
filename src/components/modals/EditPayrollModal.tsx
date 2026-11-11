'use client';
import { Portal } from './Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState, useEffect } from 'react';
import { X, Edit3, ArrowRight, Save, Info, Loader2 } from 'lucide-react';
import { PayrollRecord } from '@/types/admin';
import { useEmsStore } from '@/store/emsStore';

interface EditPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  record: PayrollRecord | null;
}

export const EditPayrollModal: React.FC<EditPayrollModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  record,
}) => {
  useBodyScrollLock(isOpen);

  const { updatePayrollRecord } = useEmsStore();

  const [bonus, setBonus] = useState<number>(0);
  const [overtimePay, setOvertimePay] = useState<number>(0);
  const [otherEarnings, setOtherEarnings] = useState<number>(0);
  const [lopDeduction, setLopDeduction] = useState<number>(0);
  const [taxDeduction, setTaxDeduction] = useState<number>(0);
  const [otherDeductions, setOtherDeductions] = useState<number>(0);
  const [reason, setReason] = useState<string>('Performance bonus & manual adjustment');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (record) {
      setBonus(record.bonus || 0);
      setOvertimePay(record.overtimePay || 0);
      setOtherEarnings(record.otherEarnings || 0);
      setLopDeduction(record.lopDeduction || 0);
      setTaxDeduction(record.taxDeduction || (record as any).tds || 0);
      setOtherDeductions(record.otherDeductions || 0);
      setReason('Manual payroll adjustment');
      setErrorMsg(null);
    }
  }, [record, isOpen]);

  if (!isOpen || !record) return null;

  const basic = record.basicSalary || (record as any).basic || 0;
  const hra = record.hra || 0;
  const conveyance = record.conveyance || 0;
  const medical = record.medical || 0;
  const specialAllowance = record.specialAllowance || 0;
  const otherAllowances = record.otherAllowances || 0;
  const pf = record.pfDeduction || (record as any).pf || 0;
  const pt = record.ptDeduction || (record as any).pt || 0;
  const esi = record.esiDeduction || (record as any).esi || 0;
  const loan = record.loanDeduction || 0;

  const originalGross = record.grossSalary;
  const originalDeductions = record.totalDeductions;
  const originalNet = record.netSalary;

  const newGross = basic + hra + conveyance + medical + specialAllowance + otherAllowances + Number(overtimePay) + Number(bonus) + Number(otherEarnings);
  const newDeductions = Number(lopDeduction) + pf + pt + Number(taxDeduction) + esi + loan + Number(otherDeductions);
  const newNet = Math.max(0, newGross - newDeductions);

  const diffNet = newNet - originalNet;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const targetId = (record as any)._id || record.id || record.employeeId;
      const res = await fetch(`/api/v1/payroll/${encodeURIComponent(targetId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bonus: Number(bonus),
          overtimePay: Number(overtimePay),
          otherEarnings: Number(otherEarnings),
          lopDeduction: Number(lopDeduction),
          taxDeduction: Number(taxDeduction),
          otherDeductions: Number(otherDeductions),
          reason: reason.trim(),
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        updatePayrollRecord(
          record.id || targetId,
          {
            bonus: Number(bonus),
            overtimePay: Number(overtimePay),
            otherEarnings: Number(otherEarnings),
            lopDeduction: Number(lopDeduction),
            taxDeduction: Number(taxDeduction),
            otherDeductions: Number(otherDeductions),
          },
          reason.trim()
        );

        onSuccess(data.message || `Updated payroll for ${record.employeeName}. Net Salary: ₹${newNet.toLocaleString('en-IN')}`);
        onClose();
      } else {
        setErrorMsg(data.message || 'Failed to update payroll record.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating payroll record.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl text-xs text-slate-800 animate-fade-in max-h-[90vh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between border-b pb-3 font-bold text-sm text-slate-900">
          <div className="flex items-center gap-2">
            <Edit3 className="h-4 w-4 text-orange-500" />
            <span>Edit Payroll Entry: {record.employeeName} ({record.payPeriod})</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-[11px]">
            <div className="grid grid-cols-3 gap-2 text-center font-bold text-slate-700 border-b pb-2">
              <div>Metric</div>
              <div>Original</div>
              <div>Adjusted</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <span className="font-semibold text-slate-600 text-left">Gross Salary:</span>
              <span className="text-slate-500">₹{originalGross.toLocaleString('en-IN')}</span>
              <span className="font-bold text-orange-700">₹{newGross.toLocaleString('en-IN')}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <span className="font-semibold text-slate-600 text-left">Total Deductions:</span>
              <span className="text-slate-500">₹{originalDeductions.toLocaleString('en-IN')}</span>
              <span className="font-bold text-rose-700">₹{newDeductions.toLocaleString('en-IN')}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center font-extrabold pt-1 border-t">
              <span className="text-left text-slate-900">Net Salary:</span>
              <span className="text-slate-500">₹{originalNet.toLocaleString('en-IN')}</span>
              <span className="text-emerald-600">₹{newNet.toLocaleString('en-IN')}</span>
            </div>
            <div className="text-right text-[10px] font-bold">
              Difference:{' '}
              <span className={diffNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                {diffNet >= 0 ? `+₹${diffNet.toLocaleString('en-IN')}` : `-₹${Math.abs(diffNet).toLocaleString('en-IN')}`}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 border-b pb-1 text-xs text-orange-700">Adjustable Earnings</h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="font-bold text-slate-800">Bonus (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={bonus}
                  onChange={(e) => setBonus(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800">Overtime Pay (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={overtimePay}
                  onChange={(e) => setOvertimePay(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800">Other Earnings (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={otherEarnings}
                  onChange={(e) => setOtherEarnings(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:bg-white"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 border-b pb-1 text-xs text-rose-700">Adjustable Deductions</h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="font-bold text-slate-800">LOP Deduction (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={lopDeduction}
                  onChange={(e) => setLopDeduction(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800">TDS Income Tax (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={taxDeduction}
                  onChange={(e) => setTaxDeduction(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800">Other Deductions (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={otherDeductions}
                  onChange={(e) => setOtherDeductions(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:bg-white"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-900">Mandatory Adjustment Reason *</label>
            <input
              type="text"
              required
              placeholder="State rationale for modifying payroll figures"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !reason.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>{isSaving ? 'Saving...' : 'Save Adjustment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
      </Portal>
);
};
