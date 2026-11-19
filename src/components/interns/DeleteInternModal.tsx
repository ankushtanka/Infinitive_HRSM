'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Trash2, UserX } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface DeleteInternModalProps {
  /** Raw intern record from /api/v1/employees (null = closed). */
  intern: any | null;
  onClose: () => void;
  /** Called after delete / deactivate succeeds, with a short confirmation message. */
  onDone: (message: string) => void;
}

/**
 * Same flow as deleting an employee: delete when no HR records exist; otherwise offer
 * "Deactivate" (keeps history, blocks login) or "Force delete" (Admin / Super Admin only).
 */
export function DeleteInternModal({ intern, onClose, onDone }: DeleteInternModalProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setError(null);
    setIsBlocked(false);
  }, [intern]);
  useBodyScrollLock(Boolean(intern));

  if (!mounted || !intern) return null;

  const name = `${intern.firstName || ''} ${intern.lastName || ''}`.trim() || 'this intern';
  const targetId = intern._id ? String(intern._id) : intern.employeeId;

  const close = () => {
    if (!isWorking) onClose();
  };

  const run = async (request: () => Promise<Response>, okMessage: string, kind: 'delete' | 'deactivate' | 'force') => {
    setIsWorking(true);
    setError(null);
    try {
      const res = await request();
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        onDone(okMessage);
        onClose();
        return;
      }
      if (kind === 'delete' && (res.status === 409 || data?.code === 'EMPLOYEE_DELETE_BLOCKED')) {
        setIsBlocked(true);
        setError('This intern has HR records (attendance, leave, etc.), so they cannot be deleted directly. Deactivate them instead, or force delete to remove everything.');
      } else if (res.status === 403) {
        setError(kind === 'force' ? 'Only an Admin or Super Admin can force delete.' : 'You do not have permission to do this.');
      } else if (res.status === 404) {
        setError('Intern was not found. Refresh the page and try again.');
      } else {
        setError(data?.message || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Server connection error. Please try again.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleDelete = () =>
    run(() => fetch(`/api/v1/employees/${encodeURIComponent(targetId)}`, { method: 'DELETE' }), `${name} (${intern.employeeId}) deleted.`, 'delete');

  const handleDeactivate = () =>
    run(
      () =>
        fetch(`/api/v1/employees/${encodeURIComponent(targetId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Terminated' }),
        }),
      `${name} (${intern.employeeId}) has been deactivated.`,
      'deactivate'
    );

  const handleForceDelete = () =>
    run(
      () => fetch(`/api/v1/employees/${encodeURIComponent(targetId)}?force=true`, { method: 'DELETE' }),
      `${name} (${intern.employeeId}) and all their records were deleted permanently.`,
      'force'
    );

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4 md:p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-intern-title"
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-scale-in text-xs text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 text-rose-600 border-b pb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 id="delete-intern-title" className="text-base font-extrabold text-slate-900">Delete Intern?</h3>
            <p className="text-[11px] font-medium text-slate-500">Removes the intern and their login</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5 text-xs">
          <div className="flex justify-between border-b pb-1">
            <span className="font-bold text-slate-500">Intern Name:</span>
            <span className="font-extrabold text-slate-900">{name}</span>
          </div>
          <div className="flex justify-between border-b pb-1">
            <span className="font-bold text-slate-500">Intern ID:</span>
            <span className="font-bold text-orange-500 font-mono">{intern.employeeId}</span>
          </div>
          <div className="flex justify-between border-b pb-1">
            <span className="font-bold text-slate-500">Department:</span>
            <span className="font-bold text-slate-800">{intern.designation || 'Intern'} • {intern.department || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold text-slate-500">Current Status:</span>
            <span className="font-bold text-slate-800">{intern.status || 'Active'}</span>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 font-semibold text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {isBlocked ? (
          <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t">
            <button type="button" disabled={isWorking} onClick={close}
              className="w-full sm:w-auto rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
              Cancel
            </button>
            <button type="button" disabled={isWorking} onClick={handleDeactivate}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-amber-700 disabled:opacity-50 transition-colors cursor-pointer">
              <UserX className="h-4 w-4" aria-hidden="true" /> Deactivate Instead
            </button>
            <button type="button" disabled={isWorking} onClick={handleForceDelete}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 transition-colors cursor-pointer">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> {isWorking ? 'Deleting…' : 'Force Delete All Records'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2 pt-3 border-t">
            <button type="button" disabled={isWorking} onClick={close}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
              Cancel
            </button>
            <button type="button" disabled={isWorking} onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 transition-colors cursor-pointer">
              {isWorking ? 'Deleting…' : 'Delete Intern'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default DeleteInternModal;