'use client';
import { Portal } from '@/components/modals/Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState } from 'react';
import {
  X,
  UserMinus,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface TeamMember {
  id: string;
  employeeId: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  department: string;
  designation: string;
}

interface RemoveTeamMemberModalProps {
  member: TeamMember | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RemoveTeamMemberModal({
  member,
  onClose,
  onSuccess,
}: RemoveTeamMemberModalProps) {
  useBodyScrollLock(Boolean(member));

  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!member) return null;

  const handleRemove = async () => {
    setIsDeleting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/v1/manager/team/assign?employeeId=${encodeURIComponent(member.employeeId)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: 'Employee successfully removed from your team.' });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 800);
      } else {
        setFeedback({ type: 'error', message: data.message || 'Failed to remove employee.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Server connection error.' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-rose-50/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <UserMinus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Remove from Team</h2>
              <p className="text-xs text-slate-500">Unassign employee from direct reports</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {feedback && (
            <div
              className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 font-bold text-xs">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{member.name}</p>
              <p className="text-xs text-slate-500 truncate">
                {member.employeeId} • {member.designation}
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Are you sure you want to remove <span className="font-semibold text-slate-800">{member.name}</span> from your team? Their manager assignment will be unlinked, but their employee account will remain active.
          </p>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Removing...</span>
                </>
              ) : (
                <span>Remove Member</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}

