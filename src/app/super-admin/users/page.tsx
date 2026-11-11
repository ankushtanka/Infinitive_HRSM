'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useCallback } from 'react';
import { SuperAdminLayout } from '@/components/layout/SuperAdminLayout';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { formatRoleLabel } from '@/lib/roleUtils';
import { AddNewAccountCard } from '@/components/accounts/AddNewAccountCard';
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  ShieldCheck,
  Building2,
  CheckCircle2,
  XCircle,
  Edit2,
  X,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Lock,
  Mail,
  AlertTriangle,
  Key,
  Globe,
  Clock,
  Eye,
  ShieldAlert,
  SlidersHorizontal,
  Check,
  UserPlus,
  AlertCircle,
  Trash2,
  Phone,
  Calendar,
  Copy,
  Briefcase,
} from 'lucide-react';

interface SystemUser {
  id: string;
  userId: string;
  employeeId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  role: string;
  organizationId: string;
  organizationName: string;
  organizationCode: string;
  department?: string;
  designation?: string;
  managerId?: string;
  joiningDate?: string;
  employmentType?: string;
  status: string;
  emailVerificationStatus: string;
  emailVerified: boolean;
  isTwoFactorEnabled: boolean;
  activeSessionsCount: number;
  avatar: string;
  lastLogin: string;
  createdAt: string;
}

interface UserSummary {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  pendingVerify: number;
  lockedAccounts: number;
  activeSessions: number;
}

interface OrgOption {
  id: string;
  name: string;
  code: string;
}

interface ManagerOption {
  employeeId: string;
  name: string;
  email: string;
  role: string;
  department: string;
  designation: string;
  organizationId: string;
}

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [summary, setSummary] = useState<UserSummary>({
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    pendingVerify: 0,
    lockedAccounts: 0,
    activeSessions: 0,
  });
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Controls
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [orgFilter, setOrgFilter] = useState('All');
  const [verificationFilter, setVerificationFilter] = useState('All');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFilteredUsers, setTotalFilteredUsers] = useState(0);

  // Modal States
  // 1. View Details
  const [viewingUser, setViewingUser] = useState<SystemUser | null>(null);
  const [viewingUserFullDetails, setViewingUserFullDetails] = useState<any | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  // 2. Full Edit User Modal
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'EMPLOYEE',
    organizationId: 'org-default',
    department: '',
    designation: '',
    managerId: '',
    joiningDate: '',
    status: 'Active',
    employmentType: 'Full-time',
  });

  // 3. Quick Status / Deactivate / Reactivate Modal
  const [statusTargetUser, setStatusTargetUser] = useState<SystemUser | null>(null);
  const [targetNewStatus, setTargetNewStatus] = useState<string>('Inactive');

  // 4. Password Reset Modal
  const [resetUser, setResetUser] = useState<SystemUser | null>(null);
  const [resetMode, setResetMode] = useState<'EMAIL_LINK' | 'TEMP_PASSWORD'>('EMAIL_LINK');
  const [generatedTempPass, setGeneratedTempPass] = useState<string | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  // 5. Delete User Modal
  const [deletingUser, setDeletingUser] = useState<SystemUser | null>(null);
  const [deleteBlockedInfo, setDeleteBlockedInfo] = useState<{
    code: string;
    message: string;
    records?: Record<string, number>;
  } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // 6. Active Sessions Modal
  const [sessionUser, setSessionUser] = useState<SystemUser | null>(null);
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);

  // 7. Add User Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Application-wide background scroll lock whenever any user modal is active
  useBodyScrollLock(Boolean(viewingUser || editingUser || statusTargetUser || resetUser || deletingUser || sessionUser || isAddModalOpen));
  const [addUserForm, setAddUserForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    employeeId: 'Auto-generating...',
    role: 'EMPLOYEE',
    organizationId: 'org-default',
    department: 'Engineering & IT',
    designation: 'Software Engineer',
    managerId: '',
    joiningDate: new Date().toISOString().split('T')[0],
    status: 'Active',
    employmentType: 'Full-time',
    location: 'Headquarters',
  });

  // Modal Action Feedback
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  // =========================================================================
  // DATA FETCHING
  // =========================================================================
  const fetchUsers = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setErrorMessage(null);

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: '15',
          search,
          role: roleFilter,
          status: statusFilter,
          organizationId: orgFilter,
          verification: verificationFilter,
        });

        const res = await fetch(`/api/v1/super-admin/users?${params.toString()}`);
        const result = await res.json();

        if (!res.ok || !result.success) {
          throw new Error(result.message || 'Failed to fetch system users.');
        }

        const data = result.data;
        setUsers(data.users || []);
        setSummary(data.summary || {});
        setOrganizations(data.organizations || []);
        setManagers(data.managers || []);
        setTotalPages(data.pagination.totalPages || 1);
        setTotalFilteredUsers(data.pagination.total || 0);
      } catch (err: any) {
        console.error('Error fetching users:', err);
        setErrorMessage(err.message || 'Unable to load system users.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, search, roleFilter, statusFilter, orgFilter, verificationFilter]
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('All');
    setStatusFilter('All');
    setOrgFilter('All');
    setVerificationFilter('All');
    setPage(1);
  };

  // =========================================================================
  // 1. ADD USER WORKFLOW
  // =========================================================================
  const fetchNextEmployeeId = (orgId: string, role?: string) => {
    setAddUserForm((prev) => ({ ...prev, employeeId: 'Auto-generating...' }));
    const roleQuery = role ? `&role=${encodeURIComponent(role)}` : '';
    fetch(`/api/v1/employees/next-id?organizationId=${encodeURIComponent(orgId)}${roleQuery}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.employeeId) {
          setAddUserForm((prev) => ({ ...prev, employeeId: data.data.employeeId }));
        }
      })
      .catch((err) => {
        console.warn('Could not fetch next employee ID preview:', err);
        setAddUserForm((prev) => ({ ...prev, employeeId: 'Auto-generated' }));
      });
  };

  const handleOpenAddModal = () => {
    const defaultOrg = organizations[0]?.id || 'org-default';
    setAddUserForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      employeeId: 'Auto-generating...',
      role: 'EMPLOYEE',
      organizationId: defaultOrg,
      department: 'Engineering & IT',
      designation: 'Software Engineer',
      managerId: '',
      joiningDate: new Date().toISOString().split('T')[0],
      status: 'Active',
      employmentType: 'Full-time',
      location: 'Headquarters',
    });
    setModalError(null);
    setModalSuccess(null);
    setIsAddModalOpen(true);

    fetchNextEmployeeId(defaultOrg, 'EMPLOYEE');
  };

  const handleAddUserOrgChange = (newOrgId: string) => {
    setAddUserForm((prev) => ({
      ...prev,
      organizationId: newOrgId,
      managerId: '',
    }));
    fetchNextEmployeeId(newOrgId, addUserForm.role);
  };

  const handleAddUserRoleChange = (newRole: string) => {
    let defaultDesig = addUserForm.designation;
    let defaultDept = addUserForm.department;
    if (newRole === 'SUPER_ADMIN') {
      defaultDesig = 'Platform Super Admin';
      defaultDept = 'Executive Governance';
    } else if (newRole === 'ADMIN') {
      defaultDesig = 'Organization Admin';
    } else if (newRole === 'HR') {
      defaultDesig = 'HR Specialist';
    } else if (newRole === 'MANAGER') {
      defaultDesig = 'Team Lead / Manager';
    } else if (newRole === 'EMPLOYEE') {
      defaultDesig = 'Software Engineer';
    }

    setAddUserForm((prev) => ({
      ...prev,
      role: newRole,
      designation: defaultDesig,
      department: defaultDept,
      managerId: newRole === 'SUPER_ADMIN' ? '' : prev.managerId,
    }));

    fetchNextEmployeeId(addUserForm.organizationId, newRole);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalSubmitting(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const res = await fetch('/api/v1/super-admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addUserForm),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to create user account.');
      }

      setModalSuccess(result.message || `Account created and invitation sent to ${addUserForm.email}.`);
      setTimeout(() => {
        setIsAddModalOpen(false);
        fetchUsers(true);
      }, 1500);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalSubmitting(false);
    }
  };

  // =========================================================================
  // 2. EDIT USER & EMPLOYEE WORKFLOW
  // =========================================================================
  const handleOpenEditModal = (u: SystemUser) => {
    setEditingUser(u);
    const nameParts = (u.name || '').split(' ');
    setEditForm({
      firstName: u.firstName || nameParts[0] || '',
      lastName: u.lastName || nameParts.slice(1).join(' ') || '',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role || 'EMPLOYEE',
      organizationId: u.organizationId || 'org-default',
      department: u.department || 'General',
      designation: u.designation || 'Staff',
      managerId: u.managerId || '',
      joiningDate: u.joiningDate || '',
      status: u.status || 'Active',
      employmentType: u.employmentType || 'Full-time',
    });
    setModalError(null);
    setModalSuccess(null);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setModalSubmitting(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const res = await fetch(`/api/v1/super-admin/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to update user profile.');
      }

      setModalSuccess(result.message || 'User profile updated successfully.');
      setTimeout(() => {
        setEditingUser(null);
        fetchUsers(true);
      }, 1200);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalSubmitting(false);
    }
  };

  // =========================================================================
  // 3. DEACTIVATE / REACTIVATE WORKFLOW
  // =========================================================================
  const handleOpenStatusModal = (u: SystemUser, nextStatus: string) => {
    setStatusTargetUser(u);
    setTargetNewStatus(nextStatus);
    setModalError(null);
    setModalSuccess(null);
  };

  const handleConfirmStatusChange = async () => {
    if (!statusTargetUser) return;
    setModalSubmitting(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const res = await fetch(`/api/v1/super-admin/users/${statusTargetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetNewStatus }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to update account status.');
      }

      setModalSuccess(result.message || `Account status changed to ${targetNewStatus}.`);
      setTimeout(() => {
        setStatusTargetUser(null);
        fetchUsers(true);
      }, 1000);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalSubmitting(false);
    }
  };

  // =========================================================================
  // 4. PASSWORD RESET WORKFLOW
  // =========================================================================
  const handleOpenResetPasswordModal = (u: SystemUser) => {
    setResetUser(u);
    setResetMode('EMAIL_LINK');
    setGeneratedTempPass(null);
    setCopiedPass(false);
    setModalError(null);
    setModalSuccess(null);
  };

  const handleExecuteResetPassword = async () => {
    if (!resetUser) return;
    setModalSubmitting(true);
    setModalError(null);
    setModalSuccess(null);
    setGeneratedTempPass(null);

    try {
      const res = await fetch(`/api/v1/super-admin/users/${resetUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: resetMode }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to initiate password reset.');
      }

      if (resetMode === 'TEMP_PASSWORD' && result.data?.tempPassword) {
        setGeneratedTempPass(result.data.tempPassword);
        setModalSuccess('Temporary password generated. Active sessions have been revoked.');
      } else {
        setModalSuccess(result.message || `Password reset link sent to ${resetUser.email}.`);
        setTimeout(() => {
          setResetUser(null);
          fetchUsers(true);
        }, 1500);
      }
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  // =========================================================================
  // 5. PERMANENT DELETION WORKFLOW (SAFEGUARDED)
  // =========================================================================
  const handleOpenDeleteModal = (u: SystemUser) => {
    setDeletingUser(u);
    setDeleteBlockedInfo(null);
    setDeleteConfirmText('');
    setModalError(null);
    setModalSuccess(null);
  };

  const handleConfirmDelete = async (force = false) => {
    if (!deletingUser) return;
    setModalSubmitting(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const url = `/api/v1/super-admin/users/${deletingUser.id}${force ? '?force=true' : ''}`;
      const res = await fetch(url, {
        method: 'DELETE',
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        if (res.status === 409) {
          // Blocked due to dependencies
          setDeleteBlockedInfo({
            code: result.code || 'DELETE_BLOCKED',
            message: result.message,
            records: result.protectedRecords,
          });
          return;
        }
        throw new Error(result.message || 'Failed to delete user account.');
      }

      setModalSuccess(result.message || 'Account permanently deleted.');
      setTimeout(() => {
        setDeletingUser(null);
        setDeleteBlockedInfo(null);
        fetchUsers(true);
      }, 1200);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalSubmitting(false);
    }
  };

  // =========================================================================
  // 6. VIEW DETAILS & SESSIONS
  // =========================================================================
  const handleOpenDetails = async (user: SystemUser) => {
    setViewingUser(user);
    setViewingUserFullDetails(null);
    setIsDetailsLoading(true);

    try {
      const res = await fetch(`/api/v1/super-admin/users/${user.id}`);
      const result = await res.json();
      if (res.ok && result.success) {
        setViewingUserFullDetails(result.data);
      } else {
        setViewingUserFullDetails(user);
      }
    } catch (err) {
      setViewingUserFullDetails(user);
    } finally {
      setIsDetailsLoading(false);
    }
  };

  const handleOpenSessions = async (user: SystemUser) => {
    setSessionUser(user);
    setIsSessionsLoading(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const res = await fetch(`/api/v1/super-admin/users/${user.id}`);
      const result = await res.json();
      if (res.ok && result.success && result.data.activeSessions) {
        setSessionsList(result.data.activeSessions);
      } else {
        setSessionsList([]);
      }
    } catch (err) {
      setSessionsList([]);
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId?: string, revokeAll = false) => {
    if (!sessionUser) return;
    setModalSubmitting(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const res = await fetch(`/api/v1/super-admin/users/${sessionUser.id}/revoke-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, revokeAll }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to revoke session.');
      }

      setModalSuccess(result.message);
      setTimeout(() => {
        handleOpenSessions(sessionUser);
        fetchUsers(true);
      }, 1000);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleResendVerification = async (user: SystemUser) => {
    setResendingUserId(user.id);
    setModalSubmitting(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const res = await fetch(`/api/v1/super-admin/users/${user.id}/resend-verification`, {
        method: 'POST',
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to resend verification.');
      }

      setModalSuccess(result.message || `Verification code generated and sent to ${user.email}.`);
      fetchUsers(true);
    } catch (err: any) {
      setModalError(`Error: ${err.message}`);
    } finally {
      setResendingUserId(null);
      setModalSubmitting(false);
    }
  };

  return (
    <SuperAdminLayout
      pageTitle="System Users & Global Access Management"
      breadcrumbs={[
        { label: 'Executive Dashboard', href: '/super-admin/dashboard' },
        { label: 'System Users', href: '/super-admin/users' },
      ]}
    >
      {/* 1. Account Creation Workflow Card */}
      <div className="mb-6">
        <AddNewAccountCard userRole="SUPER_ADMIN" onOpenModal={handleOpenAddModal} />
      </div>

      {/* 2. Header Title & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">System Users & Global Access Control</h2>
          <p className="text-xs font-medium text-slate-500">
            Super Admin authoritative control over users, roles, account lifecycle, deactivation, and permanent deletion.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-orange-600 transition-all cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>+ Add User</span>
          </button>
          <button
            onClick={() => fetchUsers(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-orange-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 3. Executive KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 mt-4">
        {/* Total Users */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Users</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFF7ED] text-orange-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.totalUsers}</p>
          <span className="mt-1 inline-block text-[10px] font-semibold text-orange-600 bg-[#FFF7ED] px-2 py-0.5 rounded">
            All Tenants
          </span>
        </div>

        {/* Active Users */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.activeUsers}</p>
          <span className="mt-1 inline-block text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
            Authenticated
          </span>
        </div>

        {/* Inactive Users */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Inactive</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <UserX className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.inactiveUsers}</p>
          <span className="mt-1 inline-block text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
            Disabled Access
          </span>
        </div>

        {/* Pending Verification */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pending Verify</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Mail className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.pendingVerify}</p>
          <span className="mt-1 inline-block text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
            Unverified
          </span>
        </div>

        {/* Locked Accounts */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Locked</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Lock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.lockedAccounts}</p>
          <span className="mt-1 inline-block text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
            Security Hold
          </span>
        </div>

        {/* Active Sessions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sessions</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFF7ED] text-orange-600">
              <Globe className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.activeSessions}</p>
          <span className="mt-1 inline-block text-[10px] font-semibold text-orange-600 bg-[#FFF7ED] px-2 py-0.5 rounded">
            Live Tokens
          </span>
        </div>
      </div>

      {/* 4. Search & Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs lg:flex-row lg:items-center lg:justify-between mt-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, employee ID, organization, or role..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Role Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500 font-medium hidden md:inline">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
            >
              <option value="All">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
              <option value="HR">HR Administrator</option>
              <option value="MANAGER">Manager</option>
              <option value="EMPLOYEE">Employee</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500 font-medium hidden md:inline">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Locked">Locked / Suspended</option>
              <option value="Pending Verification">Pending Verify</option>
            </select>
          </div>

          {/* Organization Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500 font-medium hidden md:inline">Org:</span>
            <select
              value={orgFilter}
              onChange={(e) => {
                setOrgFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
            >
              <option value="All">All Organizations</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          {/* Verification Status */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500 font-medium hidden md:inline">Verify:</span>
            <select
              value={verificationFilter}
              onChange={(e) => {
                setVerificationFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
            >
              <option value="All">All Verification</option>
              <option value="Verified">Verified</option>
              <option value="Pending">Pending</option>
            </select>
          </div>

          {/* Reset Filters */}
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            title="Reset Filters"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* 5. Users Data Table Container */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin text-orange-600" />
            <p className="mt-3 text-xs font-semibold">Loading system users...</p>
          </div>
        ) : errorMessage ? (
          <div className="flex flex-col items-center justify-center py-16 text-rose-600 px-4">
            <AlertCircle className="h-8 w-8" />
            <p className="mt-2 text-sm font-bold">{errorMessage}</p>
            <button onClick={() => fetchUsers(true)} className="mt-3 rounded-xl bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">
              Try Again
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 px-4 text-center">
            <Users className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700">No User Accounts Found</p>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your search keywords or filter criteria.</p>
            <button onClick={resetFilters} className="mt-4 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white hover:bg-orange-600">
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">User & Identity</th>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4">Invitation / Verification</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-center">Live Sessions</th>
                  <th className="py-3 px-4 text-right">Super Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* User Identity */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-orange-500 to-amber-600 text-white font-bold text-xs shadow-xs">
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="h-9 w-9 rounded-full object-cover" />
                          ) : (
                            user.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="truncate min-w-0">
                          <p className="font-extrabold text-slate-900 truncate">{user.name}</p>
                          <p className="text-slate-500 text-[11px] truncate flex items-center gap-1">
                            <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Employee ID */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 text-xs">
                      {user.employeeId !== 'N/A' ? (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 border border-slate-200 text-slate-800">
                          {user.employeeId}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">None</span>
                      )}
                    </td>

                    {/* Role */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                          user.role === 'SUPER_ADMIN'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : user.role === 'ADMIN'
                            ? 'bg-[#FFF7ED] text-orange-700 border border-[#FED7AA]'
                            : user.role === 'HR'
                            ? 'bg-[#FFF7ED] text-orange-700 border border-[#FED7AA]'
                            : user.role === 'MANAGER'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {user.role === 'SUPER_ADMIN' && <ShieldAlert className="h-3 w-3" />}
                        {formatRoleLabel(user.role)}
                      </span>
                    </td>

                    {/* Organization */}
                    <td className="py-3 px-4">
                      <div className="truncate max-w-[150px]">
                        <p className="font-bold text-slate-800 truncate">{user.organizationName}</p>
                        <span className="text-[10px] font-mono text-slate-400">{user.organizationCode}</span>
                      </div>
                    </td>

                    {/* Department & Designation */}
                    <td className="py-3 px-4">
                      <div className="truncate max-w-[160px]">
                        <p className="font-bold text-slate-800 truncate">{user.department || 'General'}</p>
                        <span className="text-[10px] text-slate-400 truncate block">{user.designation || 'Staff'}</span>
                      </div>
                    </td>

                    {/* Account Status */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          user.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : user.status === 'Locked'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {user.status === 'Active' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {user.status}
                      </span>
                    </td>

                    {/* Invitation / Verification */}
                    <td className="py-3 px-4">
                      {user.emailVerified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                          <Check className="h-3 w-3 text-emerald-600" /> Verified
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1 items-start">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                            <Clock className="h-3 w-3 text-amber-600" /> Pending
                          </span>
                          <button
                            onClick={() => handleResendVerification(user)}
                            disabled={resendingUserId === user.id}
                            className="text-[10px] text-amber-700 font-semibold underline hover:text-amber-800 disabled:opacity-50 cursor-pointer"
                            title="Resend Verification OTP"
                          >
                            {resendingUserId === user.id ? 'Resending...' : 'Resend Code'}
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Created Date */}
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                      {user.createdAt !== 'N/A' ? user.createdAt : 'N/A'}
                    </td>

                    {/* Live Sessions */}
                    <td className="py-3 px-4 text-center">
                      {user.activeSessionsCount > 0 ? (
                        <button
                          onClick={() => handleOpenSessions(user)}
                          className="inline-flex items-center gap-1 rounded-full bg-[#FFF7ED] px-2 py-0.5 text-[10px] font-bold text-orange-700 border border-[#FED7AA] hover:bg-[#FFEDD5] cursor-pointer"
                        >
                          <Globe className="h-3 w-3" />
                          {user.activeSessionsCount} Live
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">0 Sessions</span>
                      )}
                    </td>

                    {/* Super Admin Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* View Details */}
                        <button
                          onClick={() => handleOpenDetails(user)}
                          title="View Details"
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>

                        {/* Edit User & Employee */}
                        <button
                          onClick={() => handleOpenEditModal(user)}
                          title="Edit User Profile"
                          className="rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-1.5 text-orange-700 hover:bg-[#FFEDD5] cursor-pointer"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        {/* Resend Invitation (Dedicated Action Button) */}
                        {!user.emailVerified && (
                          <button
                            onClick={() => handleResendVerification(user)}
                            disabled={resendingUserId === user.id}
                            title="Resend Invitation Email & OTP"
                            className="rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-700 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                          >
                            {resendingUserId === user.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-700" />
                            ) : (
                              <Mail className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}

                        {/* Reset Password */}
                        <button
                          onClick={() => handleOpenResetPasswordModal(user)}
                          title="Reset Password / Issue Temp Password"
                          className="rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-700 hover:bg-amber-100 cursor-pointer"
                        >
                          <Key className="h-3.5 w-3.5" />
                        </button>

                        {/* Deactivate / Reactivate Quick Toggle */}
                        {user.status === 'Active' ? (
                          <button
                            onClick={() => handleOpenStatusModal(user, 'Inactive')}
                            title="Deactivate Account (Revokes Sessions)"
                            className="rounded-lg border border-orange-200 bg-orange-50 p-1.5 text-orange-700 hover:bg-orange-100 cursor-pointer"
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenStatusModal(user, 'Active')}
                            title="Reactivate Account"
                            className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Active Sessions */}
                        <button
                          onClick={() => handleOpenSessions(user)}
                          title="View & Revoke Active Sessions"
                          className="rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-1.5 text-orange-700 hover:bg-[#FFEDD5] cursor-pointer"
                        >
                          <Globe className="h-3.5 w-3.5" />
                        </button>

                        {/* Permanently Delete */}
                        <button
                          onClick={() => handleOpenDeleteModal(user)}
                          title="Permanently Delete Account"
                          className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs">
            <span className="text-slate-500">
              Showing <strong className="text-slate-900">{users.length}</strong> of <strong className="text-slate-900">{totalFilteredUsers}</strong> accounts
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="font-semibold text-slate-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODALS SECTION */}
      {/* ========================================================================= */}

      {/* 1. View User Account Details Modal */}
      {viewingUser && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-orange-600" />
                <h3 className="text-sm font-extrabold text-slate-900">User Account & Security Profile</h3>
              </div>
              <button onClick={() => setViewingUser(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {isDetailsLoading ? (
              <div className="py-8 text-center text-xs text-slate-500 animate-pulse">Fetching security profile...</div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="flex items-center gap-3.5 pb-3 border-b border-slate-100">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-orange-500 to-amber-600 text-white font-bold text-base shadow-sm">
                    {viewingUserFullDetails?.avatar ? (
                      <img src={viewingUserFullDetails.avatar} alt={viewingUser.name} className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      viewingUser.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">{viewingUserFullDetails?.name || viewingUser.name}</h4>
                    <p className="text-slate-500">{viewingUserFullDetails?.email || viewingUser.email}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-orange-700 bg-[#FFF7ED] px-1.5 py-0.5 rounded border border-[#FED7AA]">
                        {viewingUserFullDetails?.employeeId || viewingUser.employeeId}
                      </span>
                      <span className="font-bold text-orange-700 bg-[#FFF7ED] px-1.5 py-0.5 rounded border border-[#FED7AA]">
                        {formatRoleLabel(viewingUserFullDetails?.role || viewingUser.role)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Assigned Organization</span>
                    <span className="font-bold text-slate-800">
                      {viewingUserFullDetails?.organizationName || viewingUser.organizationName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Account Status</span>
                    <span
                      className={`font-bold ${
                        (viewingUserFullDetails?.status || viewingUser.status) === 'Active' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {viewingUserFullDetails?.status || viewingUser.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Department</span>
                    <span className="font-bold text-slate-800">
                      {viewingUserFullDetails?.department || 'General'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Designation</span>
                    <span className="font-bold text-slate-800">
                      {viewingUserFullDetails?.designation || 'Staff'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Phone</span>
                    <span className="font-bold text-slate-800">
                      {viewingUserFullDetails?.phone || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Reporting Manager</span>
                    <span className="font-bold text-slate-800">
                      {viewingUserFullDetails?.managerId || 'None'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Email Verification</span>
                    <span className="font-bold text-slate-800">
                      {viewingUserFullDetails?.emailVerificationStatus || viewingUser.emailVerificationStatus}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">2FA Security Status</span>
                    <span className="font-bold text-slate-800">
                      {viewingUserFullDetails?.isTwoFactorEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Account Created</span>
                    <span className="font-bold text-slate-800">{viewingUserFullDetails?.createdAt || viewingUser.createdAt}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Active Session Tokens</span>
                    <span className="font-bold text-orange-600">
                      {viewingUserFullDetails?.activeSessionsCount || viewingUser.activeSessionsCount} Live Token(s)
                    </span>
                  </div>
                </div>

                {!viewingUser.emailVerified && (
                  <div className="flex items-center justify-between rounded-xl bg-amber-50 p-3 border border-amber-200">
                    <span className="text-[11px] font-semibold text-amber-800">Email is pending verification.</span>
                    <button
                      onClick={() => handleResendVerification(viewingUser)}
                      className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700 cursor-pointer"
                    >
                      Resend Link
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingUser(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* 2. Full Edit User & Employee Modal */}
      {editingUser && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF7ED] text-orange-600">
                  <Edit2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Edit User & Employee Details</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Modify profile, role, department, reporting manager, or account status
                  </p>
                </div>
              </div>
              <button onClick={() => setEditingUser(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalError && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            {modalSuccess && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{modalSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.firstName}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.lastName}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Official Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Changing email will require re-verification and revoke current sessions.</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    System Role <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-semibold"
                  >
                    <option value="SUPER_ADMIN">SUPER_ADMIN (Platform Super Admin)</option>
                    <option value="ADMIN">ADMIN (Organization Admin)</option>
                    <option value="HR">HR Administrator</option>
                    <option value="MANAGER">Manager</option>
                    <option value="EMPLOYEE">Employee</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Account Status <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-semibold"
                  >
                    <option value="Active">Active (Full Access)</option>
                    <option value="Inactive">Inactive (Disabled)</option>
                    <option value="Locked">Locked (Security Hold)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Engineering & IT"
                    value={editForm.department}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, department: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Software Engineer"
                    value={editForm.designation}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, designation: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Reporting Manager Employee ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. EMP1001 (Optional)"
                    value={editForm.managerId}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, managerId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Organization <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editForm.organizationId}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, organizationId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-semibold"
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
                >
                  {modalSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* 3. Deactivate / Reactivate Confirmation Modal */}
      {statusTargetUser && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {targetNewStatus === 'Inactive' ? (
                  <UserX className="h-5 w-5 text-orange-600" />
                ) : (
                  <UserCheck className="h-5 w-5 text-emerald-600" />
                )}
                <h3 className="text-sm font-extrabold text-slate-900">
                  {targetNewStatus === 'Inactive' ? 'Deactivate Account' : 'Reactivate Account'}
                </h3>
              </div>
              <button onClick={() => setStatusTargetUser(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                {modalError}
              </div>
            )}

            {modalSuccess && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 border border-emerald-200">
                {modalSuccess}
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs space-y-1">
              <p className="font-bold text-slate-900">{statusTargetUser.name}</p>
              <p className="text-slate-500">{statusTargetUser.email}</p>
              <p className="text-[11px] text-slate-600">
                Employee ID: <strong className="text-slate-800">{statusTargetUser.employeeId}</strong> &bull; Role:{' '}
                <strong className="text-orange-700">{formatRoleLabel(statusTargetUser.role)}</strong>
              </p>
            </div>

            {targetNewStatus === 'Inactive' ? (
              <div className="rounded-xl bg-orange-50 p-3.5 border border-orange-200 text-xs text-orange-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                  Immediate Login Blocking & Session Revocation
                </p>
                <p className="text-[11px] leading-relaxed">
                  Deactivating this account will immediately revoke all active session tokens and prevent future login.
                </p>
                <p className="text-[11px] text-orange-700 font-medium">
                  All historical payroll, attendance, leave, performance, documents, and audit logs are securely preserved.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-emerald-50 p-3.5 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  Restore Active Access
                </p>
                <p className="text-[11px] leading-relaxed">
                  The user will be able to log in to their dashboard and access organizational services normally.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setStatusTargetUser(null)}
                className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStatusChange}
                disabled={modalSubmitting}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 cursor-pointer ${
                  targetNewStatus === 'Inactive'
                    ? 'bg-orange-600 hover:bg-orange-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {modalSubmitting
                  ? 'Updating...'
                  : targetNewStatus === 'Inactive'
                  ? 'Confirm Deactivation'
                  : 'Confirm Reactivation'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* 4. Password Reset Modal */}
      {resetUser && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-600" />
                <h3 className="text-sm font-extrabold text-slate-900">Reset User Password</h3>
              </div>
              <button onClick={() => setResetUser(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                {modalError}
              </div>
            )}

            {modalSuccess && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 border border-emerald-200">
                {modalSuccess}
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs space-y-1">
              <p className="font-bold text-slate-900">{resetUser.name}</p>
              <p className="text-slate-500">{resetUser.email}</p>
            </div>

            {!generatedTempPass ? (
              <div className="space-y-3 text-xs">
                <p className="text-slate-600 font-medium">Choose how you want to reset this user&apos;s password:</p>

                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="resetMode"
                      value="EMAIL_LINK"
                      checked={resetMode === 'EMAIL_LINK'}
                      onChange={() => setResetMode('EMAIL_LINK')}
                      className="mt-0.5 text-orange-600"
                    />
                    <div>
                      <strong className="block font-bold text-slate-900">Email Password Reset Link (Recommended)</strong>
                      <span className="text-[11px] text-slate-500">
                        Dispatches a secure 1-hour expiration link to {resetUser.email}.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="resetMode"
                      value="TEMP_PASSWORD"
                      checked={resetMode === 'TEMP_PASSWORD'}
                      onChange={() => setResetMode('TEMP_PASSWORD')}
                      className="mt-0.5 text-orange-600"
                    />
                    <div>
                      <strong className="block font-bold text-slate-900">Generate One-Time Temporary Password</strong>
                      <span className="text-[11px] text-slate-500">
                        Generates a strong temporary password and forces password change on next sign-in.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setResetUser(null)}
                    className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteResetPassword}
                    disabled={modalSubmitting}
                    className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
                  >
                    {modalSubmitting ? 'Processing...' : 'Execute Reset'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="rounded-xl bg-emerald-50 p-3.5 border border-emerald-200 space-y-2">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                    Temporary Password Created
                  </span>
                  <div className="flex items-center justify-between rounded-lg bg-white p-2.5 border border-emerald-300 font-mono text-sm font-extrabold text-slate-900">
                    <span>{generatedTempPass}</span>
                    <button
                      onClick={() => copyToClipboard(generatedTempPass)}
                      className="flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-200 cursor-pointer"
                    >
                      {copiedPass ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedPass ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-emerald-700 font-medium">
                    Please securely share this temporary password with the user. The user will be required to change it immediately upon login.
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setResetUser(null)}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </Portal>
      )}

      {/* 5. Permanent Deletion Modal (Safeguarded) */}
      {deletingUser && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-600">
                <Trash2 className="h-5 w-5" />
                <h3 className="text-sm font-extrabold text-slate-900">Permanently Delete Account</h3>
              </div>
              <button
                onClick={() => {
                  setDeletingUser(null);
                  setDeleteBlockedInfo(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                {modalError}
              </div>
            )}

            {modalSuccess && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 border border-emerald-200">
                {modalSuccess}
              </div>
            )}

            {/* Target Account Info */}
            <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 text-xs space-y-1">
              <p className="font-extrabold text-slate-900 text-sm">{deletingUser.name}</p>
              <p className="text-slate-600">Email: {deletingUser.email}</p>
              <div className="flex items-center gap-2 pt-1">
                <span className="font-mono text-[10px] font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                  {deletingUser.employeeId}
                </span>
                <span className="font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {formatRoleLabel(deletingUser.role)}
                </span>
                <span className="text-slate-500 text-[10px]">Org: {deletingUser.organizationName}</span>
              </div>
            </div>

            {/* If blocked due to historical compliance records */}
            {deleteBlockedInfo ? (
              <div className="space-y-3">
                {deleteBlockedInfo.code === 'FINANCIAL_RECORDS_PRESERVED' ? (
                  <div className="rounded-xl bg-amber-50 p-4 border border-amber-200 text-xs text-amber-900 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-amber-800">
                      <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
                      <span>Financial Compliance Retention Required</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      This account cannot be permanently deleted because historical payroll or compensation records exist in the system. Under statutory audit and financial compliance regulations, historical financial records must be retained.
                    </p>
                    {deleteBlockedInfo.records && (
                      <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200/80 text-[11px] grid grid-cols-2 gap-2 font-mono">
                        {Object.entries(deleteBlockedInfo.records).map(([key, count]) =>
                          count > 0 ? (
                            <div key={key}>
                              <span className="text-slate-500">{key}:</span> <strong>{count}</strong>
                            </div>
                          ) : null
                        )}
                      </div>
                    )}
                    <p className="text-[11px] font-bold text-amber-900 pt-1">
                      Recommended Action: Deactivate this user instead. Deactivation blocks login, revokes sessions, and preserves all financial records.
                    </p>
                    <div className="pt-2 flex gap-2">
                      <button
                        onClick={() => {
                          setDeletingUser(null);
                          setDeleteBlockedInfo(null);
                          handleOpenStatusModal(deletingUser, 'Inactive');
                        }}
                        className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 cursor-pointer"
                      >
                        Deactivate Account Instead
                      </button>
                      <button
                        onClick={() => {
                          setDeletingUser(null);
                          setDeleteBlockedInfo(null);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-rose-50 p-4 border border-rose-200 text-xs text-rose-900 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-rose-800">
                      <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                      <span>Associated Historical Records Detected</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      This user has linked records (attendance, leaves, documents, etc.). Deactivate the account, or confirm force delete to remove these non-financial records.
                    </p>
                    {deleteBlockedInfo.records && (
                      <div className="bg-white/80 p-2.5 rounded-lg border border-rose-200/80 text-[11px] grid grid-cols-2 gap-2 font-mono">
                        {Object.entries(deleteBlockedInfo.records).map(([key, count]) =>
                          count > 0 ? (
                            <div key={key}>
                              <span className="text-slate-500">{key}:</span> <strong>{count}</strong>
                            </div>
                          ) : null
                        )}
                      </div>
                    )}
                    <div className="pt-2 flex gap-2">
                      <button
                        onClick={() => handleConfirmDelete(true)}
                        disabled={modalSubmitting}
                        className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                      >
                        {modalSubmitting ? 'Deleting...' : 'Force Delete Non-Financial Records'}
                      </button>
                      <button
                        onClick={() => {
                          setDeletingUser(null);
                          setDeleteBlockedInfo(null);
                          handleOpenStatusModal(deletingUser, 'Inactive');
                        }}
                        className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 cursor-pointer"
                      >
                        Deactivate Instead
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="rounded-xl bg-rose-50 p-3.5 border border-rose-200 text-rose-800 space-y-1">
                  <strong className="block font-bold">Irreversible Action Warning</strong>
                  <p className="text-[11px] leading-relaxed">
                    Permanent deletion removes the user profile and linked employee record from MongoDB. Active session tokens will be purged immediately.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    To confirm deletion, please type <span className="font-mono text-rose-600 font-extrabold">{deletingUser.email}</span> below:
                  </label>
                  <input
                    type="text"
                    placeholder={deletingUser.email}
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 font-mono focus:border-rose-500 focus:bg-white focus:outline-hidden"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setDeletingUser(null);
                      setDeleteBlockedInfo(null);
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleConfirmDelete(false)}
                    disabled={modalSubmitting || deleteConfirmText.trim().toLowerCase() !== deletingUser.email.toLowerCase()}
                    className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                  >
                    {modalSubmitting ? 'Deleting...' : 'Permanently Delete User'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </Portal>
      )}

      {/* 6. Active Sessions Modal */}
      {sessionUser && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-orange-600" />
                <h3 className="text-sm font-extrabold text-slate-900">
                  Active Sessions: {sessionUser.name}
                </h3>
              </div>
              <button onClick={() => setSessionUser(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                {modalError}
              </div>
            )}

            {modalSuccess && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 border border-emerald-200">
                {modalSuccess}
              </div>
            )}

            {isSessionsLoading ? (
              <div className="py-8 text-center text-xs text-slate-500 animate-pulse">Loading active sessions...</div>
            ) : (sessionsList || []).length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">No active token sessions found for this user.</div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {(sessionsList || []).map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{s.userAgent}</p>
                      <p className="text-[10px] text-slate-500">IP: {s.ipAddress} &bull; Created: {new Date(s.createdAt).toLocaleString()}</p>
                    </div>

                    <button
                      onClick={() => handleRevokeSession(s.id, false)}
                      disabled={modalSubmitting}
                      className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              {sessionsList.length > 0 ? (
                <button
                  onClick={() => handleRevokeSession(undefined, true)}
                  disabled={modalSubmitting}
                  className="rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                >
                  Revoke All Sessions
                </button>
              ) : <div />}

              <button
                onClick={() => setSessionUser(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* 7. Add System User & Issue Invitation Modal */}
      {isAddModalOpen && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Create System User & Issue Invitation</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Create Super Admin, Admin, HR, Manager, or Employee accounts with cross-tenant authorization and 24-hr OTP setup.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Error Message */}
            {modalError && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3.5 text-xs font-semibold text-rose-700 border border-rose-200 animate-shake">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Success Message */}
            {modalSuccess && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{modalSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              {/* Section 1: User Identity */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold text-orange-700 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" /> Personal & Account Identity
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      First Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Aarav"
                      value={addUserForm.firstName}
                      onChange={(e) => setAddUserForm((prev) => ({ ...prev, firstName: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Last Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sharma"
                      value={addUserForm.lastName}
                      onChange={(e) => setAddUserForm((prev) => ({ ...prev, lastName: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Official Email Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. aarav.sharma@infinitivecloud.com"
                      value={addUserForm.email}
                      onChange={(e) => setAddUserForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Invitation code will be dispatched to this address</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      placeholder="+91 98765 43210"
                      value={addUserForm.phone}
                      onChange={(e) => setAddUserForm((prev) => ({ ...prev, phone: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Contact number for SMS & directory alerts</p>
                  </div>
                </div>
              </div>

              {/* Section 2: Role & Organization Access */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h4 className="text-[11px] font-bold text-orange-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> Role & Organization Assignment
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Access Role <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={addUserForm.role}
                      onChange={(e) => handleAddUserRoleChange(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-semibold"
                    >
                      <option value="SUPER_ADMIN">Super Admin (Platform Administrator)</option>
                      <option value="ADMIN">Admin (Organization Administrator)</option>
                      <option value="HR">HR (Human Resources Administrator)</option>
                      <option value="MANAGER">Manager (Team & Department Lead)</option>
                      <option value="EMPLOYEE">Employee (Individual Contributor)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {addUserForm.role === 'SUPER_ADMIN'
                        ? 'Super Admins possess cross-tenant platform administration and executive governance privileges'
                        : 'Enforces scoped role permissions within selected organization'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Organization <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={addUserForm.organizationId}
                      onChange={(e) => handleAddUserOrgChange(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-semibold"
                    >
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name} ({org.code})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">Enforces tenant isolation and scoped sequence</p>
                  </div>
                </div>
              </div>

              {/* Section 3: Professional & Employment Details */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h4 className="text-[11px] font-bold text-orange-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" /> Employment & Team Hierarchy
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Employee ID <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        required
                        value={addUserForm.employeeId}
                        onChange={(e) => setAddUserForm((prev) => ({ ...prev, employeeId: e.target.value.toUpperCase() }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => fetchNextEmployeeId(addUserForm.organizationId, addUserForm.role)}
                        title="Regenerate next sequence preview"
                        className="rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-2 text-slate-600 hover:bg-slate-200 text-xs font-semibold shrink-0 cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {addUserForm.role === 'SUPER_ADMIN'
                        ? 'Global Super Admin sequence (e.g. SUP0002)'
                        : 'Auto-incremented per organization (e.g. EMP101)'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      list="superAdminDeptList"
                      placeholder="e.g. Engineering & IT"
                      value={addUserForm.department}
                      onChange={(e) => setAddUserForm((prev) => ({ ...prev, department: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                    />
                    <datalist id="superAdminDeptList">
                      <option value="Engineering & IT" />
                      <option value="Human Resources" />
                      <option value="Finance & Accounting" />
                      <option value="Operations & Logistics" />
                      <option value="Sales & Marketing" />
                      <option value="Customer Support" />
                      <option value="Legal & Compliance" />
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Designation
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Senior Software Engineer"
                      value={addUserForm.designation}
                      onChange={(e) => setAddUserForm((prev) => ({ ...prev, designation: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Reporting Manager
                    </label>
                    <select
                      value={addUserForm.role === 'SUPER_ADMIN' ? '' : addUserForm.managerId}
                      disabled={addUserForm.role === 'SUPER_ADMIN'}
                      onChange={(e) => setAddUserForm((prev) => ({ ...prev, managerId: e.target.value }))}
                      className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium ${
                        addUserForm.role === 'SUPER_ADMIN' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-50'
                      }`}
                    >
                      {addUserForm.role === 'SUPER_ADMIN' ? (
                        <option value="">Not Applicable (Top-Level Platform Governance)</option>
                      ) : (
                        <>
                          <option value="">None / Top Level (No Manager)</option>
                          {managers
                            .filter((m) => m.organizationId === addUserForm.organizationId)
                            .map((m) => (
                              <option key={m.employeeId} value={m.employeeId}>
                                {m.name} ({m.employeeId} • {m.designation || m.role})
                              </option>
                            ))}
                        </>
                      )}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {addUserForm.role === 'SUPER_ADMIN'
                        ? 'Super Admins hold platform-wide authority and do not report to a manager'
                        : 'Managers within selected organization'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Joining Date
                    </label>
                    <input
                      type="date"
                      value={addUserForm.joiningDate}
                      onChange={(e) => setAddUserForm((prev) => ({ ...prev, joiningDate: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Employment Status
                    </label>
                    <select
                      value={addUserForm.status}
                      onChange={(e) => setAddUserForm((prev) => ({ ...prev, status: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-semibold"
                    >
                      <option value="Active">Active</option>
                      <option value="Probation">Probation</option>
                      <option value="Contract">Contract</option>
                      <option value="Intern">Intern</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Employment Type
                    </label>
                    <select
                      value={addUserForm.employmentType}
                      onChange={(e) => setAddUserForm((prev) => ({ ...prev, employmentType: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-semibold"
                    >
                      <option value="Full-time">Full-time</option>
                      <option value="Part-time">Part-time</option>
                      <option value="Contract">Contract</option>
                      <option value="Internship">Internship</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Work Location / Branch (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Headquarters (Mumbai), Remote, Bangalore Campus"
                    value={addUserForm.location}
                    onChange={(e) => setAddUserForm((prev) => ({ ...prev, location: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-medium"
                  />
                </div>
              </div>

              {/* Security & Activation Notice */}
              <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED]/50 p-3 flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-slate-600 leading-relaxed">
                  <span className="font-bold text-orange-950">Secure Invitation Architecture:</span> A single-use 6-digit OTP code (24-hour expiration) will be sent via Gmail SMTP to the user&apos;s official email address. The account will remain in <strong className="text-slate-800">Pending Verification</strong> until the user activates their account and configures their password.
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-orange-600 disabled:opacity-50 cursor-pointer transition-all"
                >
                  {modalSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Creating Account & Sending Invite...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Create Account & Send Invitation</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}
    </SuperAdminLayout>
  );
}
