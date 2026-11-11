'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useEmsStore } from '@/store/emsStore';
import { Employee, EmploymentStatus, EmploymentType } from '@/types/admin';
import { AddEmployeeModal } from '@/components/employees/AddEmployeeModal';
import { EditEmployeeModal } from '@/components/employees/EditEmployeeModal';
import { ImportEmployeesModal } from '@/components/employees/ImportEmployeesModal';
import { AddNewAccountCard } from '@/components/accounts/AddNewAccountCard';
import {
  Search,
  Filter,
  UserPlus,
  FileSpreadsheet,
  Eye,
  Pencil,
  Lock,
  X,
  CheckCircle2,
  Trash2,
  UserX,
  Sparkles,
  FileText,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Loader2,
} from 'lucide-react';

export default function EmployeesPage() {
  const {
    state,
    addEmployee,
    updateEmployee,
    setEmployees,
    deactivateEmployee,
    removeEmployeeFromStore,
    importEmployees,
  } = useEmsStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'personal' | 'employment' | 'emergency' | 'bank' | 'govt' | 'documents'>('personal');

  // Edit Employee Modal State
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Delete Confirmation Modal State
  const [deleteConfirmEmp, setDeleteConfirmEmp] = useState<Employee | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleteBlocked, setIsDeleteBlocked] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock scrolling when viewing profile or delete confirmation modal
  useBodyScrollLock(Boolean(selectedEmployee || isDeleteModalOpen));

  const fetchEmployees = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const res = await fetch('/api/v1/employees?limit=500');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const mapped: Employee[] = json.data.map((emp: any) => ({
            id: String(emp._id || emp.id || emp.employeeId),
            employeeId: String(emp.employeeId || '').trim(),
            firstName: emp.firstName || '',
            lastName: emp.lastName || '',
            email: emp.email || emp.personalEmail || '',
            phone: emp.phone || '',
            avatar: emp.avatar || '',
            photo: emp.photo,
            profilePhoto: emp.profilePhoto,
            dateOfBirth: emp.dateOfBirth || '1995-01-01',
            gender: emp.gender || 'Male',
            bloodGroup: emp.bloodGroup || 'O+',
            address: emp.address || '',
            city: emp.city || '',
            state: emp.state || '',
            country: emp.country || 'India',
            department: emp.department || 'General',
            designation: emp.designation || 'Staff',
            manager: emp.manager || emp.managerId || emp.reportingTo || '',
            location: emp.location || 'Headquarters',
            employmentType: (emp.employmentType || 'Full-time') as EmploymentType,
            joiningDate: emp.joiningDate ? String(emp.joiningDate).split('T')[0] : '',
            status: (emp.status || emp.employmentStatus || 'Active') as EmploymentStatus,
            shift: emp.shift || 'Standard (09:00 - 18:00)',
            grade: emp.grade || 'Grade A3',
            emergencyContactName: emp.emergencyContactName || '',
            emergencyRelationship: emp.emergencyRelationship || '',
            emergencyPhone: emp.emergencyPhone || '',
            emergencyAddress: emp.emergencyAddress || '',
            bankName: emp.bankName || '',
            accountNumber: emp.accountNumber || '',
            ifscCode: emp.ifscCode || '',
            accountHolder: emp.accountHolder || '',
            panNumber: emp.panNumber || '',
            aadhaarNo: emp.aadhaarNo || '',
            passportNo: emp.passportNo || '',
          }));

          // Set employees directly from authoritative, organization-scoped API response
          setEmployees(mapped);
        }
      }
    } catch (err) {
      console.error('Failed to fetch employees from API:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [setEmployees]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmEmp) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const targetId = deleteConfirmEmp.id || deleteConfirmEmp.employeeId;
      const res = await fetch(`/api/v1/employees/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      setIsDeleting(false);

      if (res.ok && data.success) {
        showToast('Employee deleted successfully.');
        setIsDeleteModalOpen(false);
        setIsDeleteBlocked(false);
        removeEmployeeFromStore(deleteConfirmEmp.id);
        removeEmployeeFromStore(deleteConfirmEmp.employeeId);
        setDeleteConfirmEmp(null);
        await fetchEmployees(true);
      } else {
        if (res.status === 409 || data.code === 'EMPLOYEE_DELETE_BLOCKED') {
          setIsDeleteBlocked(true);
          setDeleteError('Employee cannot be deleted because historical HR records exist. Deactivate the employee instead, or confirm force delete to remove all associated records.');
        } else if (res.status === 403) {
          setDeleteError('You do not have permission to delete employees.');
        } else if (res.status === 404) {
          setDeleteError('Employee was not found. Refresh the page and try again.');
        } else {
          setDeleteError(data.message || 'Unable to delete employee. Please try again.');
        }
      }
    } catch (err: any) {
      setIsDeleting(false);
      setDeleteError('Unable to delete employee. Please try again.');
    }
  };

  const handleDeactivateEmployee = async () => {
    if (!deleteConfirmEmp) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const targetId = deleteConfirmEmp.id || deleteConfirmEmp.employeeId;
      const res = await fetch(`/api/v1/employees/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Terminated' }),
      });
      const data = await res.json();
      setIsDeleting(false);

      if (res.ok && data.success) {
        showToast(`Employee ${deleteConfirmEmp.firstName} ${deleteConfirmEmp.lastName} (${deleteConfirmEmp.employeeId}) has been deactivated.`);
        setIsDeleteModalOpen(false);
        setIsDeleteBlocked(false);
        setDeleteConfirmEmp(null);
        await fetchEmployees(true);
      } else {
        setDeleteError(data.message || 'Unable to deactivate employee. Please try again.');
      }
    } catch (err: any) {
      setIsDeleting(false);
      setDeleteError('Failed to deactivate employee.');
    }
  };

  const handleForceDeleteEmployee = async () => {
    if (!deleteConfirmEmp) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const targetId = deleteConfirmEmp.id || deleteConfirmEmp.employeeId;
      const res = await fetch(`/api/v1/employees/${encodeURIComponent(targetId)}?force=true`, {
        method: 'DELETE',
      });
      const data = await res.json();
      setIsDeleting(false);

      if (res.ok && data.success) {
        showToast('Employee and all associated records deleted permanently.');
        setIsDeleteModalOpen(false);
        setIsDeleteBlocked(false);
        removeEmployeeFromStore(deleteConfirmEmp.id);
        removeEmployeeFromStore(deleteConfirmEmp.employeeId);
        setDeleteConfirmEmp(null);
        await fetchEmployees(true);
      } else {
        setDeleteError(data.message || 'Unable to force delete employee.');
      }
    } catch (err: any) {
      setIsDeleting(false);
      setDeleteError('Unable to delete employee. Please try again.');
    }
  };

  const departmentNames = Array.from(
    new Set([
      'Engineering & IT',
      'Human Resources',
      'Finance & Accounts',
      'Sales & Marketing',
      'Operations',
      'Product Management',
      'Design & Creative',
      'Quality Assurance',
      'Legal & Compliance',
      'Customer Support',
      'Administration',
      'Executive Board',
      'General',
      ...state.departments.map((d) => d.name),
      ...state.employees.map((e) => e.department).filter(Boolean),
    ])
  );
  const designationNames = Array.from(
    new Set([
      'CEO/Founder',
      'Director',
      'Vice President',
      'Senior Software Engineer',
      'Software Engineer',
      'Frontend Developer',
      'Backend Developer',
      'Full Stack Developer',
      'DevOps Engineer',
      'QA / Test Engineer',
      'UI/UX Designer',
      'Product Manager',
      'HR Manager',
      'HR Executive',
      'Talent Acquisition Specialist',
      'Finance Manager',
      'Accountant',
      'Financial Analyst',
      'Sales Manager',
      'Sales Executive',
      'Business Development Manager',
      'Marketing Specialist',
      'Digital Marketing Lead',
      'Operations Lead',
      'Operations Executive',
      'System Administrator',
      'IT Support Specialist',
      'Customer Support Specialist',
      'Legal Counsel',
      'Office Administrator',
      'Staff',
      ...state.designations.map((d) => d.title),
      ...state.employees.map((e) => e.designation).filter(Boolean),
    ])
  );
  const existingEmployeeIds = new Set(state.employees.map((e) => e.employeeId.trim().toLowerCase()));

  const filteredEmployees = state.employees.filter((emp) => {
    const matchesSearch =
      emp.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = selectedDept === 'All' || emp.department === selectedDept;
    const matchesStatus = selectedStatus === 'All' || emp.status === selectedStatus;
    return matchesSearch && matchesDept && matchesStatus;
  });

  const getStatusBadge = (status: EmploymentStatus | string) => {
    switch (status) {
      case 'Active':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Probation':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Intern':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'On Leave':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Not Joined':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Absconded':
      case 'Terminated':
      case 'Suspended':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Resigned':
      case 'Former Employee':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getInitials = (emp: Employee) => {
    const f = emp.firstName.trim().charAt(0).toUpperCase();
    const l = emp.lastName.trim().charAt(0).toUpperCase();
    return f && l ? `${f}${l}` : f || 'EMP';
  };

  return (
    <AdminLayout
      pageTitle="Employee Management"
      breadcrumbs={[{ label: 'Employees', href: '/admin/employees' }]}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed right-6 top-20 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs text-white shadow-xl animate-fade-in border border-slate-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ADD NEW ACCOUNT CARD */}
      <div className="mb-6">
        <AddNewAccountCard
          onOpenModal={() => setIsAddModalOpen(true)}
          userRole="ADMIN"
        />
      </div>

      {/* Action Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Employee Master Directory</h2>
          <p className="text-xs text-slate-500">
            Source of Truth for organization staff ({filteredEmployees.length} total registered)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsRefreshing(true);
              fetchEmployees();
            }}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
            title="Refresh employee directory from server database"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${isRefreshing || isLoading ? 'animate-spin text-orange-500' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 active:scale-95 transition-all cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add New Employee</span>
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Import CSV</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, ID, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none font-medium"
          />
        </div>

        {/* Department Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none font-semibold"
          >
            <option value="All">All Departments</option>
            {departmentNames.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none font-semibold"
          >
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Probation">Probation</option>
            <option value="Resigned">Resigned</option>
            <option value="Terminated">Terminated</option>
            <option value="Intern">Intern</option>
            <option value="Absconded">Absconded</option>
            <option value="Not Joined">Not Joined</option>
          </select>
        </div>
      </div>

      {/* Employees Data Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {filteredEmployees.length > 0 ? (
          <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500">
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Department & Role</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Location</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Joining Date</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        {emp.avatar ? (
                          <img
                            src={emp.avatar}
                            alt={emp.firstName}
                            className="h-9 w-9 rounded-full object-cover ring-2 ring-orange-500/20 shadow-xs shrink-0"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 font-extrabold text-white text-xs shadow-xs">
                            {getInitials(emp)}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-slate-900">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">{emp.employeeId} • {emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-800">{emp.designation}</p>
                      <p className="text-[10px] text-slate-400">{emp.department}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 font-medium">{emp.location}</td>
                    <td className="px-4 py-3.5 text-slate-700 font-medium">{emp.joiningDate}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getStatusBadge(
                          emp.status
                        )}`}
                      >
                        {emp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedEmployee(emp)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-orange-50 hover:text-orange-600 transition-colors cursor-pointer"
                          title="View Employee"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditEmployee(emp);
                            setIsEditModalOpen(true);
                          }}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition-colors cursor-pointer"
                          title="Edit Employee"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteConfirmEmp(emp);
                            setDeleteError(null);
                            setIsDeleteBlocked(false);
                            setIsDeleteModalOpen(true);
                          }}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Delete Employee"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : isLoading && state.employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500 mb-3" />
            <p className="text-xs font-semibold text-slate-700">Loading organization employees from database...</p>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-500">
            No employees registered yet. Click &quot;Add New Employee&quot; or &quot;Import CSV&quot; to populate your database.
          </div>
        )}
      </div>

      {/* ADD EMPLOYEE MODAL */}
      <AddEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          fetchEmployees(true);
        }}
        onSave={async (newEmp) => {
          const res = addEmployee(newEmp);
          if (res.success) {
            showToast(res.message);
          }
          await fetchEmployees(true);
          return res;
        }}
        departments={departmentNames}
        designations={designationNames}
      />

      {/* EDIT EMPLOYEE MODAL */}
      <EditEmployeeModal
        isOpen={isEditModalOpen}
        employee={editEmployee}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditEmployee(null);
        }}
        onSuccess={(updatedEmp) => {
          updateEmployee(updatedEmp.id || updatedEmp.employeeId, updatedEmp);
          showToast(`Employee ${updatedEmp.firstName} ${updatedEmp.lastName} (${updatedEmp.employeeId}) updated successfully.`);
          fetchEmployees(true);
        }}
        departments={departmentNames}
        designations={designationNames}
      />

      {/* IMPORT EMPLOYEES MODAL */}
      <ImportEmployeesModal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          fetchEmployees(true);
        }}
        onConfirmImport={(incoming) => {
          const res = importEmployees(incoming);
          showToast(res.message);
          fetchEmployees(true);
          return res;
        }}
        existingEmployeeIds={existingEmployeeIds}
      />

      {/* VIEW PROFILE & EXTRACTED PHOTO MODAL */}
      {mounted && selectedEmployee && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-4 md:p-6 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedEmployee(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-fade-in text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Photo & Source Badge */}
            <div className="shrink-0 flex items-center justify-between border-b border-[#FED7AA]/60 bg-white p-4 text-slate-900">
              <div className="flex items-center gap-3">
                {selectedEmployee.avatar ? (
                  <img
                    src={selectedEmployee.avatar}
                    alt={selectedEmployee.firstName}
                    className="h-12 w-12 rounded-full object-cover ring-2 ring-orange-500/40 shadow-md"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 font-extrabold text-white text-base ring-2 ring-white/20 shadow-md">
                    {getInitials(selectedEmployee)}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold">
                      {selectedEmployee.firstName} {selectedEmployee.lastName}
                    </h3>
                    <span className="flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 border border-orange-200">
                      <Sparkles className="h-3 w-3 text-orange-500" />
                      {selectedEmployee.profilePhoto?.source === 'document-extraction'
                        ? 'Photo from identity document'
                        : 'Uploaded profile photo'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    {selectedEmployee.employeeId} • {selectedEmployee.designation} ({selectedEmployee.department})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmployee(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                aria-label="Close profile"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="shrink-0 flex border-b border-slate-200 bg-slate-50 px-4 text-xs font-semibold overflow-x-auto">
              {[
                { key: 'personal', label: 'Personal Info' },
                { key: 'employment', label: 'Employment' },
                { key: 'emergency', label: 'Emergency Contact' },
                { key: 'bank', label: 'Bank Details' },
                { key: 'govt', label: 'Govt Identity' },
                { key: 'documents', label: 'Identity Documents' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`border-b-2 px-4 py-3 transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === tab.key
                      ? 'border-orange-500 text-orange-600 font-bold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 text-xs text-slate-700">
              {activeTab === 'personal' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="font-bold text-slate-900">Date of Birth:</span> {selectedEmployee.dateOfBirth}</div>
                  <div><span className="font-bold text-slate-900">Gender:</span> {selectedEmployee.gender}</div>
                  <div><span className="font-bold text-slate-900">Blood Group:</span> {selectedEmployee.bloodGroup}</div>
                  <div><span className="font-bold text-slate-900">Phone:</span> {selectedEmployee.phone}</div>
                  <div className="col-span-2"><span className="font-bold text-slate-900">Address:</span> {selectedEmployee.address}, {selectedEmployee.city}, {selectedEmployee.state}, {selectedEmployee.country}</div>
                </div>
              )}

              {activeTab === 'employment' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="font-bold text-slate-900">Department:</span> {selectedEmployee.department}</div>
                  <div><span className="font-bold text-slate-900">Designation:</span> {selectedEmployee.designation}</div>
                  <div><span className="font-bold text-slate-900">Reporting Manager:</span> {selectedEmployee.manager}</div>
                  <div><span className="font-bold text-slate-900">Location:</span> {selectedEmployee.location}</div>
                  <div><span className="font-bold text-slate-900">Shift:</span> {selectedEmployee.shift}</div>
                  <div><span className="font-bold text-slate-900">Grade:</span> {selectedEmployee.grade}</div>
                </div>
              )}

              {activeTab === 'emergency' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="font-bold text-slate-900">Contact Person:</span> {selectedEmployee.emergencyContactName}</div>
                  <div><span className="font-bold text-slate-900">Relationship:</span> {selectedEmployee.emergencyRelationship}</div>
                  <div><span className="font-bold text-slate-900">Phone:</span> {selectedEmployee.emergencyPhone}</div>
                  <div className="col-span-2"><span className="font-bold text-slate-900">Address:</span> {selectedEmployee.emergencyAddress}</div>
                </div>
              )}

              {activeTab === 'bank' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <div className="flex items-center gap-2 font-bold text-amber-900 mb-2">
                    <Lock className="h-4 w-4 text-amber-600" />
                    <span>Confidential Bank Information</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-slate-800">
                    <div><span className="font-bold">Bank Name:</span> {selectedEmployee.bankName}</div>
                    <div><span className="font-bold">Account Number:</span> {selectedEmployee.accountNumber}</div>
                    <div><span className="font-bold">IFSC Code:</span> {selectedEmployee.ifscCode}</div>
                    <div><span className="font-bold">Account Holder:</span> {selectedEmployee.accountHolder}</div>
                  </div>
                </div>
              )}

              {activeTab === 'govt' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="font-bold text-slate-900">PAN Number:</span> {selectedEmployee.panNumber}</div>
                  <div><span className="font-bold text-slate-900">Aadhaar Number:</span> {selectedEmployee.aadhaarNo}</div>
                  <div><span className="font-bold text-slate-900">Passport Number:</span> {selectedEmployee.passportNo}</div>
                </div>
              )}

              {activeTab === 'documents' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-orange-500" />
                      <span className="font-bold text-slate-900">Identity Document (Source)</span>
                    </div>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                      Verified
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs">
                    Original identity document uploaded during onboarding. Profile photograph was extracted from this file.
                  </p>
                </div>
              )}
            </div>

            <div className="shrink-0 flex justify-end border-t border-slate-100 p-4">
              <button
                onClick={() => setSelectedEmployee(null)}
                className="rounded-xl bg-slate-950 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-900 transition-colors cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* DELETE EMPLOYEE CONFIRMATION MODAL */}
      {mounted && isDeleteModalOpen && deleteConfirmEmp && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4 md:p-6 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              setIsDeleteModalOpen(false);
              setDeleteConfirmEmp(null);
              setDeleteError(null);
              setIsDeleteBlocked(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-scale-in text-xs text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-600 border-b pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Delete Employee?</h3>
                <p className="text-[11px] font-medium text-slate-500">Permanent Record Removal</p>
              </div>
            </div>

            <p className="text-slate-600 font-medium">Are you sure you want to permanently delete this employee?</p>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between border-b pb-1">
                <span className="font-bold text-slate-500">Employee Name:</span>
                <span className="font-extrabold text-slate-900">{deleteConfirmEmp.firstName} {deleteConfirmEmp.lastName}</span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="font-bold text-slate-500">Employee ID:</span>
                <span className="font-bold text-orange-500 font-mono">{deleteConfirmEmp.employeeId}</span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="font-bold text-slate-500">Department & Role:</span>
                <span className="font-bold text-slate-800">{deleteConfirmEmp.designation} • {deleteConfirmEmp.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Current Status:</span>
                <span className="font-bold text-slate-800">{deleteConfirmEmp.status}</span>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>This action permanently removes the employee account only when no protected HR records exist.</span>
            </div>

            {deleteError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 font-semibold text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            {isDeleteBlocked ? (
              <div className="space-y-3 pt-2 border-t">
                <p className="text-[11px] text-slate-500 font-medium">
                  Choose how you want to proceed with this employee record:
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => {
                      setIsDeleteModalOpen(false);
                      setDeleteConfirmEmp(null);
                      setDeleteError(null);
                      setIsDeleteBlocked(false);
                    }}
                    className="w-full sm:w-auto rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleDeactivateEmployee}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-amber-700 disabled:opacity-50 transition-colors cursor-pointer"
                    title="Safely deactivate employee while preserving historical audit records"
                  >
                    <UserX className="h-4 w-4" />
                    <span>Deactivate Instead</span>
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleForceDeleteEmployee}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 transition-colors cursor-pointer"
                    title="Force delete employee and purge all associated records"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>{isDeleting ? 'Deleting...' : 'Force Delete All Records'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setDeleteConfirmEmp(null);
                    setDeleteError(null);
                    setIsDeleteBlocked(false);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Employee'}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </AdminLayout>
  );
}
