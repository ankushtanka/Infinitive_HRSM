'use client';
import { Portal } from './Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState } from 'react';
import { X, AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { PayrollRecord } from '@/types/admin';
import { useEmsStore } from '@/store/emsStore';

interface DeletePayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  record: PayrollRecord | null;
}

export const DeletePayrollModal: React.FC<DeletePayrollModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  record,
}) => {
  useBodyScrollLock(isOpen);

  const { deletePayrollRecord } = useEmsStore();
  const [reason, setReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !record) return null;

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsDeleting(true);

    try {
      const targetId = (record as any)._id || record.id || record.employeeId;
      const res = await fetch(`/api/v1/payroll/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || 'Admin deletion from frontend' }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        deletePayrollRecord(record.id || targetId, reason.trim() || 'Admin deletion from frontend');
        onSuccess(data.message || `Payroll record for ${record.employeeName} deleted successfully.`);
        setReason('');
        onClose();
      } else {
        setErrorMsg(data.message || 'Failed to delete payroll record.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred while deleting.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl text-xs text-slate-800 animate-fade-in">
        <div className="flex items-center justify-between border-b pb-3 font-bold text-sm text-rose-600">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>Confirm Delete Payroll Record</span>
          </div>
          <button
            onClick={() => {
              setErrorMsg(null);
              onClose();
            }}
            disabled={isDeleting}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleDelete} className="mt-4 space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-rose-900">
            <p className="font-bold text-xs">
              Are you sure you want to delete payroll for {record.employeeName} ({record.payPeriod})?
            </p>
            <p className="text-[11px] text-rose-700 mt-1">
              Net Amount: ₹{record.netSalary.toLocaleString('en-IN')} | Status: {record.status}
            </p>
          </div>

          <div>
            <label className="font-bold text-slate-900">Reason for Deletion (Optional)</label>
            <textarea
              rows={2}
              placeholder="e.g. Duplicate entry, recalculation needed, testing cleanup..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2.5 bg-slate-50 focus:border-rose-500 focus:bg-white text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                onClose();
              }}
              disabled={isDeleting}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDeleting}
              className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-rose-700 disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              <span>{isDeleting ? 'Deleting...' : 'Delete Payroll'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
      </Portal>
);
};
