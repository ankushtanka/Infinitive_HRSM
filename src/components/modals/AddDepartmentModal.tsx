'use client';
import { Portal } from './Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState } from 'react';
import { X, Building2 } from 'lucide-react';

import { Employee } from '@/types/admin';

interface AddDepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees?: Employee[];
  onSave: (dept: { name: string; head?: string; description?: string }) => void;
}

export const AddDepartmentModal: React.FC<AddDepartmentModalProps> = ({
  isOpen,
  onClose,
  employees = [],
  onSave,
}) => {
  useBodyScrollLock(isOpen);

  const [name, setName] = useState('');
  const [head, setHead] = useState('Unassigned');
  const [isCustomHead, setIsCustomHead] = useState(false);
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), head: head.trim() || 'Unassigned', description: description.trim() });
    setName('');
    setHead('Unassigned');
    setDescription('');
    onClose();
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl text-xs text-slate-800 animate-fade-in">
        <div className="flex items-center justify-between border-b pb-3 font-bold text-sm text-slate-900">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-orange-500" />
            <span>Add Department</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="font-bold text-slate-900">Department Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Information Technology"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white font-medium"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-900">Department Head (Optional)</label>
              <button
                type="button"
                onClick={() => setIsCustomHead(!isCustomHead)}
                className="text-[10px] text-orange-500 hover:underline font-semibold"
              >
                {isCustomHead ? 'Select from employees' : 'Type custom name'}
              </button>
            </div>
            {isCustomHead ? (
              <input
                type="text"
                placeholder="e.g. Suryabhan Singh Rathore"
                value={head}
                onChange={(e) => setHead(e.target.value)}
                className="mt-1 w-full rounded-xl border p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
              />
            ) : (
              <select
                value={head}
                onChange={(e) => setHead(e.target.value)}
                className="mt-1 w-full rounded-xl border p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white font-medium"
              >
                <option value="Unassigned">Unassigned</option>
                {employees.map((emp) => {
                  const empName = `${emp.firstName} ${emp.lastName}`;
                  return (
                    <option key={emp.id} value={empName}>
                      {empName} ({emp.employeeId} - {emp.designation || 'Staff'})
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          <div>
            <label className="font-bold text-slate-900">Description</label>
            <textarea
              placeholder="Brief description of department scope..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border p-2.5 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 border-t pt-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-orange-500 px-4 py-1.5 font-bold text-white shadow-xs hover:bg-orange-600 active:bg-orange-700"
            >
              Save Department
            </button>
          </div>
        </form>
      </div>
    </div>
      </Portal>
);
};
