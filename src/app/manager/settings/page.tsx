'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  User,
  ShieldCheck,
  Lock,
  Bell,
  SlidersHorizontal,
  Camera,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  Loader2,
  Building2,
  Mail,
  Phone,
  Calendar,
  Laptop,
  Smartphone,
  Globe,
  LogOut,
  KeyRound,
  ShieldAlert,
  Info,
  Check,
  X,
  Clock,
  Sparkles,
  MapPin,
  Radio,
  Navigation,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { LiveMap } from '@/components/attendance/LiveMap';
import { OfficeMapModal, OfficeLocationData } from '@/components/modals/OfficeMapModal';

interface OfficeLocationRules {
  lat: number;
  lng: number;
  radiusMeters: number;
  name: string;
  geofenceEnabled: boolean;
  geofenceEnforce: boolean;
  workStartTime?: string;
  workEndTime?: string;
  gracePeriodMinutes?: number;
  workingDaysPerWeek?: number;
  autoCheckoutEnabled?: boolean;
  autoCheckoutTime?: string;
}

interface ManagerProfile {
  userId: string;
  employeeId: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  phone: string;
  avatar: string;
  profilePhotoId: string | null;
  joiningDate: string;
  status: string;
  role: string;
}

interface ManagerSecurity {
  isTwoFactorEnabled: boolean;
  lastPasswordChange: string | null;
}

interface NotificationPreferences {
  emailNotifications: boolean;
  inAppNotifications: boolean;
  teamAttendanceAlerts: boolean;
  leaveRequestAlerts: boolean;
  goalKpiUpdates: boolean;
  performanceReviewReminders: boolean;
  importantTeamUpdates: boolean;
}

interface WorkspacePreferences {
  teamAttendanceAlerts: boolean;
  goalKpiUpdates: boolean;
  leaveRequestNotifications: boolean;
  weeklyTeamSummary: boolean;
  performanceReviewReminders: boolean;
  defaultDashboardView: 'OVERVIEW' | 'TEAM' | 'ATTENDANCE' | 'PERFORMANCE';
  recordsPerPage: number;
}

interface ActiveSession {
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

type SettingsTab = 'profile' | 'security' | 'sessions' | 'notifications' | 'workspace' | 'attendance';

export default function ManagerSettingsPage() {
  const { user, updateUserAvatar, updateUserProfile, syncUserFromServer } = useAuthStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // Loading, refreshing, error, and toast states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Profile Form State
  const [profile, setProfile] = useState<ManagerProfile>({
    userId: '',
    employeeId: 'MGR1001',
    name: '',
    email: '',
    department: 'Engineering & IT',
    designation: 'Engineering Manager',
    phone: '',
    avatar: '',
    profilePhotoId: null,
    joiningDate: '2024-08-01',
    status: 'Active',
    role: 'MANAGER',
  });
  const [originalProfile, setOriginalProfile] = useState<ManagerProfile | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const [isPhotoRemoving, setIsPhotoRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password & Security State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordStatusMsg, setPasswordStatusMsg] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 2FA & Sessions State
  const [security, setSecurity] = useState<ManagerSecurity>({
    isTwoFactorEnabled: false,
    lastPasswordChange: null,
  });
  const [isToggling2FA, setIsToggling2FA] = useState(false);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [isRevokingOtherSessions, setIsRevokingOtherSessions] = useState(false);

  // Notification Preferences State
  const [notifications, setNotifications] = useState<NotificationPreferences>({
    emailNotifications: true,
    inAppNotifications: true,
    teamAttendanceAlerts: true,
    leaveRequestAlerts: true,
    goalKpiUpdates: true,
    performanceReviewReminders: true,
    importantTeamUpdates: true,
  });
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  // Workspace Preferences State
  const [workspace, setWorkspace] = useState<WorkspacePreferences>({
    teamAttendanceAlerts: true,
    goalKpiUpdates: true,
    leaveRequestNotifications: true,
    weeklyTeamSummary: true,
    performanceReviewReminders: true,
    defaultDashboardView: 'OVERVIEW',
    recordsPerPage: 10,
  });
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);

  // Office Location & Team Attendance State (Admin Configured)
  const [officeLocation, setOfficeLocation] = useState<OfficeLocationRules | null>(null);
  const [isOfficeModalOpen, setIsOfficeModalOpen] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Stable ref for checking user name mismatch without re-triggering fetchSettings
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // 1. Fetch Manager Settings Data
  const fetchSettings = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setIsError(false);
    setErrorMessage(null);

    try {
      const [settingsRes, sessionsRes] = await Promise.all([
        fetch('/api/v1/manager/settings', { cache: 'no-store' }),
        fetch('/api/v1/auth/sessions', { cache: 'no-store' }).catch(() => null),
      ]);

      if (!settingsRes.ok) {
        throw new Error('Failed to load manager settings from server.');
      }

      const settingsData = await settingsRes.json();
      if (settingsData.success && settingsData.data) {
        const { profile: p, security: s, notifications: n, workspace: w, officeLocation: loc } = settingsData.data;
        setProfile(p);
        setOriginalProfile(p);
        if (s) setSecurity(s);
        if (n) setNotifications(n);
        if (w) setWorkspace(w);
        if (loc) setOfficeLocation(loc);

        const currentAuthUser = userRef.current;
        if (p?.name && (!currentAuthUser || currentAuthUser.name !== p.name)) {
          updateUserProfile({
            name: p.name,
            phone: p.phone,
            avatar: p.avatar,
            department: p.department,
            designation: p.designation,
            employeeId: p.employeeId,
          });
        }
      }

      if (sessionsRes && sessionsRes.ok) {
        const sessData = await sessionsRes.json();
        if (sessData.success && Array.isArray(sessData.data)) {
          setSessions(sessData.data);
        }
      }

      if (isManualRefresh) {
        showToast('Settings refreshed with live database data.');
      }
    } catch (err: any) {
      console.error('Error fetching manager settings:', err);
      setIsError(true);
      setErrorMessage(err.message || 'Network error fetching manager settings.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [updateUserProfile]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Profile Dirty Check
  const isProfileDirty = useMemo(() => {
    if (!originalProfile) return false;
    return (
      profile.name !== originalProfile.name ||
      profile.phone !== originalProfile.phone
    );
  }, [profile, originalProfile]);

  // Save Profile Changes
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = profile.name.trim();
    if (!cleanName) {
      showToast('Full name cannot be empty.', 'error');
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await fetch('/api/v1/manager/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'profile',
          data: {
            name: cleanName,
            phone: profile.phone.trim(),
          },
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        const savedName = resData.data?.name || resData.data?.profile?.name || cleanName;
        const savedPhone = resData.data?.phone || resData.data?.profile?.phone || profile.phone.trim();

        setProfile((prev) => ({ ...prev, name: savedName, phone: savedPhone }));
        setOriginalProfile((prev) => (prev ? { ...prev, name: savedName, phone: savedPhone } : null));

        // Synchronize auth store across all mounted components and persistent storage
        updateUserProfile({ name: savedName, phone: savedPhone });

        // Trigger authoritative sync from MongoDB in the background
        syncUserFromServer(true).catch(() => null);

        showToast(resData.message || 'Profile changes saved successfully!');
      } else {
        showToast(resData.message || 'Failed to update profile.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error updating profile.', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Photo Upload to GridFS
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    // Validate size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image file size must be less than 5 MB.', 'error');
      return;
    }

    // Validate MIME types
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      showToast('Only JPG, JPEG, PNG, and WEBP formats are supported.', 'error');
      return;
    }

    setIsPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (profile.profilePhotoId) {
        formData.append('previousFileId', profile.profilePhotoId);
      }

      const res = await fetch('/api/v1/settings/profile/photo', {
        method: 'POST',
        body: formData,
      });

      const resData = await res.json();
      if (res.ok && resData.success && resData.photoUrl) {
        setProfile((prev) => ({
          ...prev,
          avatar: resData.photoUrl,
          profilePhotoId: resData.fileId || null,
        }));
        updateUserAvatar(resData.photoUrl);
        showToast('Profile photo uploaded and saved successfully!');
      } else {
        showToast(resData.message || 'Failed to upload profile photo.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error uploading profile photo.', 'error');
    } finally {
      setIsPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Remove Photo from GridFS
  const handlePhotoRemove = async () => {
    if (!confirm('Are you sure you want to remove your profile photo?')) return;

    setIsPhotoRemoving(true);
    try {
      const res = await fetch('/api/v1/settings/profile/photo', {
        method: 'DELETE',
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        const defaultAvatar =
          resData.defaultAvatar ||
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80';
        setProfile((prev) => ({
          ...prev,
          avatar: defaultAvatar,
          profilePhotoId: null,
        }));
        updateUserAvatar(defaultAvatar);
        showToast('Profile photo removed.');
      } else {
        showToast(resData.message || 'Failed to remove profile photo.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error removing photo.', 'error');
    } finally {
      setIsPhotoRemoving(false);
    }
  };

  // Password Strength Calculation
  const passwordStrength = useMemo(() => {
    if (!newPassword) return { score: 0, label: '', color: 'bg-slate-200' };

    let score = 0;
    if (newPassword.length >= 8) score += 1;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score += 1;
    if (/[0-9]/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;

    switch (score) {
      case 1:
        return { score: 25, label: 'Weak', color: 'bg-rose-500' };
      case 2:
        return { score: 50, label: 'Fair', color: 'bg-amber-500' };
      case 3:
        return { score: 75, label: 'Good', color: 'bg-blue-500' };
      case 4:
        return { score: 100, label: 'Strong', color: 'bg-emerald-500' };
      default:
        return { score: 10, label: 'Very Weak', color: 'bg-rose-400' };
    }
  }, [newPassword]);

  // Handle Password Update Submission
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatusMsg(null);

    if (!currentPassword) {
      setPasswordStatusMsg({ message: 'Current password is required.', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordStatusMsg({ message: 'New password must be at least 6 characters.', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatusMsg({ message: 'New password and confirmation do not match.', type: 'error' });
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordStatusMsg({ message: 'New password must be different from current password.', type: 'error' });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        setPasswordStatusMsg({
          message: 'Password changed successfully! Other sessions have been signed out for security.',
          type: 'success',
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        showToast('Password updated successfully!');
      } else {
        setPasswordStatusMsg({
          message: resData.message || 'Failed to update password. Check your current password.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setPasswordStatusMsg({
        message: err.message || 'Network error updating password.',
        type: 'error',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Toggle Two-Factor Authentication
  const handleToggle2FA = async () => {
    setIsToggling2FA(true);
    const newStatus = !security.isTwoFactorEnabled;

    try {
      const res = await fetch('/api/v1/manager/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'security',
          data: { isTwoFactorEnabled: newStatus },
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        setSecurity((prev) => ({ ...prev, isTwoFactorEnabled: newStatus }));
        showToast(resData.message || `2FA has been ${newStatus ? 'enabled' : 'disabled'}.`);
      } else {
        showToast(resData.message || 'Failed to toggle 2FA.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error updating 2FA.', 'error');
    } finally {
      setIsToggling2FA(false);
    }
  };

  // Revoke Single Session
  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('Log out this active device session?')) return;

    setRevokingSessionId(sessionId);
    try {
      const res = await fetch(`/api/v1/auth/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        showToast('Session logged out successfully.');
      } else {
        showToast(resData.message || 'Failed to revoke session.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error revoking session.', 'error');
    } finally {
      setRevokingSessionId(null);
    }
  };

  // Revoke All Other Sessions
  const handleRevokeAllOtherSessions = async () => {
    if (!confirm('Are you sure you want to log out from all other devices and active sessions?')) return;

    setIsRevokingOtherSessions(true);
    try {
      const res = await fetch('/api/v1/manager/settings?action=revokeOtherSessions', {
        method: 'DELETE',
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(resData.message || 'All other device sessions logged out.');
        setSessions((prev) => prev.filter((s) => s.isCurrent));
      } else {
        showToast(resData.message || 'Failed to revoke other sessions.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error revoking other sessions.', 'error');
    } finally {
      setIsRevokingOtherSessions(false);
    }
  };

  // Save Notification Preferences
  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingNotifications(true);

    try {
      const res = await fetch('/api/v1/manager/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'notifications',
          data: notifications,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(resData.message || 'Notification preferences saved!');
      } else {
        showToast(resData.message || 'Failed to save notifications.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving notifications.', 'error');
    } finally {
      setIsSavingNotifications(false);
    }
  };

  // Save Workspace Preferences
  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingWorkspace(true);

    try {
      const res = await fetch('/api/v1/manager/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'workspace',
          data: workspace,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(resData.message || 'Workspace preferences saved!');
      } else {
        showToast(resData.message || 'Failed to save workspace preferences.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving workspace preferences.', 'error');
    } finally {
      setIsSavingWorkspace(false);
    }
  };

  // Helper to parse session user-agent
  const getDeviceIcon = (ua: string) => {
    const uaLower = ua.toLowerCase();
    if (uaLower.includes('mobile') || uaLower.includes('android') || uaLower.includes('iphone')) {
      return <Smartphone className="h-5 w-5 text-indigo-500" />;
    }
    if (uaLower.includes('mac') || uaLower.includes('windows') || uaLower.includes('linux')) {
      return <Laptop className="h-5 w-5 text-indigo-500" />;
    }
    return <Globe className="h-5 w-5 text-slate-400" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed right-6 top-20 z-50 flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-semibold text-white shadow-2xl transition-all animate-in fade-in-50 slide-in-from-top-2 ${
            toast.type === 'success'
              ? 'bg-slate-900 border border-emerald-500/40'
              : 'bg-rose-950 border border-rose-500/40'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-950">Manager Settings</h1>
            <span className="rounded-full bg-indigo-50 px-3 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-200">
              Personal & Team Preferences
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure your manager profile, security credentials, active sessions, and team notification channels.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchSettings(true)}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {isError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMessage || 'Unable to load settings. Please try again.'}</span>
          </div>
          <button
            onClick={() => fetchSettings(true)}
            className="rounded-xl bg-rose-600 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-rose-700 transition-all cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tab Navigation Pill Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 pb-1 scrollbar-none">
        {[
          { id: 'profile', label: 'Profile & Account', icon: User },
          { id: 'security', label: 'Password & Security', icon: Lock },
          { id: 'sessions', label: '2FA & Sessions', icon: ShieldCheck },
          { id: 'notifications', label: 'Notification Channels', icon: Bell },
          { id: 'workspace', label: 'Workspace Preferences', icon: SlidersHorizontal },
          { id: 'attendance', label: 'Office Location & Shifts', icon: MapPin },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="space-y-6 animate-pulse">
          <div className="h-64 rounded-2xl bg-slate-200/80" />
          <div className="h-48 rounded-2xl bg-slate-200/80" />
        </div>
      ) : (
        <div>
          {/* ======================================================== */}
          {/* TAB 1: Profile & Account */}
          {/* ======================================================== */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left Column: Avatar & Quick Summary Card (4 cols) */}
              <div className="lg:col-span-4 space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs text-center">
                  <div className="relative mx-auto h-28 w-28">
                    {profile.avatar ? (
                      <img
                        src={profile.avatar}
                        alt={profile.name}
                        className="h-28 w-28 rounded-2xl object-cover ring-4 ring-indigo-50 shadow-md"
                      />
                    ) : (
                      <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 font-extrabold text-2xl uppercase border-2 border-indigo-200">
                        {profile.name.slice(0, 2)}
                      </div>
                    )}

                    {isPhotoUploading && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/60 backdrop-blur-xs text-white">
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <h3 className="text-base font-extrabold text-slate-900">{profile.name}</h3>
                    <p className="text-xs font-semibold text-indigo-600 mt-0.5">{profile.designation}</p>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{profile.status}</span>
                    </div>
                  </div>

                  {/* Photo Actions */}
                  <div className="mt-6 flex flex-col gap-2 pt-4 border-t border-slate-100">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handlePhotoUpload}
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isPhotoUploading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3 py-2 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Upload New Photo</span>
                    </button>

                    {profile.profilePhotoId && (
                      <button
                        type="button"
                        onClick={handlePhotoRemove}
                        disabled={isPhotoRemoving}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isPhotoRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        <span>Remove Photo</span>
                      </button>
                    )}
                  </div>

                  <p className="mt-4 text-[10px] text-slate-400">
                    Accepts JPG, PNG, WEBP (Max 5MB). Persisted securely in MongoDB GridFS.
                  </p>
                </div>

                {/* Manager Scope Info Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-indigo-600">
                    <ShieldCheck className="h-4 w-4" />
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">Manager Scope</h4>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    You have managerial authority over assigned direct reports, shift attendances, performance reviews, and leave approvals.
                  </p>
                  <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 space-y-1 border border-slate-100">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Role:</span>
                      <span className="font-bold text-slate-800">Engineering Manager</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Department:</span>
                      <span className="font-bold text-slate-800">{profile.department}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Joined:</span>
                      <span className="font-mono text-slate-700">{profile.joiningDate}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Profile Information Form (8 cols) */}
              <div className="lg:col-span-8">
                <form onSubmit={handleSaveProfile} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">Personal & Official Details</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Official organizational credentials are managed by HR. Personal contact numbers may be updated directly.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">
                      ID: {profile.employeeId}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                    {/* Full Name */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={profile.name}
                          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                          placeholder="Your full name"
                        />
                      </div>
                    </div>

                    {/* Employee ID (HR Read-only) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-slate-700 font-bold">Employee ID</label>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                          <Lock className="h-3 w-3 text-slate-400" />
                          <span>HR Managed</span>
                        </span>
                      </div>
                      <input
                        type="text"
                        disabled
                        value={profile.employeeId}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 font-mono cursor-not-allowed"
                      />
                    </div>

                    {/* Work Email (HR Read-only) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-slate-700 font-bold">Official Work Email</label>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                          <Lock className="h-3 w-3 text-slate-400" />
                          <span>HR Managed</span>
                        </span>
                      </div>
                      <div className="relative">
                        <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          disabled
                          value={profile.email}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-slate-500 cursor-not-allowed font-mono"
                        />
                      </div>
                    </div>

                    {/* Contact Phone (Editable) */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Contact Phone / Mobile
                      </label>
                      <div className="relative">
                        <Phone className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={profile.phone}
                          onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                          placeholder="+91 98765 43210"
                          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    {/* Department (HR Read-only) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-slate-700 font-bold">Department</label>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                          <Lock className="h-3 w-3 text-slate-400" />
                          <span>HR Managed</span>
                        </span>
                      </div>
                      <div className="relative">
                        <Building2 className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          disabled
                          value={profile.department}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-slate-500 cursor-not-allowed"
                        />
                      </div>
                    </div>

                    {/* Designation (HR Read-only) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-slate-700 font-bold">Designation</label>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                          <Lock className="h-3 w-3 text-slate-400" />
                          <span>HR Managed</span>
                        </span>
                      </div>
                      <input
                        type="text"
                        disabled
                        value={profile.designation}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Form Actions Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <p className="text-[11px] text-slate-400">
                      {isProfileDirty ? 'You have unsaved changes.' : 'All profile fields are up to date.'}
                    </p>
                    <button
                      type="submit"
                      disabled={!isProfileDirty || isSavingProfile}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      <span>Save Profile Changes</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: Password & Security */}
          {/* ======================================================== */}
          {activeTab === 'security' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2 text-indigo-600">
                    <KeyRound className="h-5 w-5" />
                    <h3 className="text-sm font-extrabold text-slate-900">Change Password</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Update your account login password. When changed, existing sessions on other devices are automatically terminated.
                  </p>
                </div>

                {passwordStatusMsg && (
                  <div
                    className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
                      passwordStatusMsg.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {passwordStatusMsg.type === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    )}
                    <span>{passwordStatusMsg.message}</span>
                  </div>
                )}

                <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs">
                  {/* Current Password */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Current Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                        placeholder="Enter current account password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      New Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                        placeholder="Enter new strong password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Password Strength Meter */}
                    {newPassword && (
                      <div className="mt-2.5 space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className="text-slate-500">Strength:</span>
                          <span className={passwordStrength.score >= 75 ? 'text-emerald-600' : 'text-amber-600'}>
                            {passwordStrength.label}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${passwordStrength.color} transition-all duration-300`}
                            style={{ width: `${passwordStrength.score}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Confirm New Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                        placeholder="Re-enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Requirements Checklist */}
                  <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 text-[11px] text-slate-500 space-y-1">
                    <p className="font-bold text-slate-700 mb-1">Password Requirements:</p>
                    <div className="flex items-center gap-1.5">
                      <Check className={`h-3.5 w-3.5 ${newPassword.length >= 8 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`} />
                      <span>At least 8 characters long</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check className={`h-3.5 w-3.5 ${/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) ? 'text-emerald-600 font-bold' : 'text-slate-300'}`} />
                      <span>Contains uppercase & lowercase letters</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check className={`h-3.5 w-3.5 ${/[0-9]/.test(newPassword) ? 'text-emerald-600 font-bold' : 'text-slate-300'}`} />
                      <span>Contains at least one number</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex justify-end">
                    <button
                      type="submit"
                      disabled={isUpdatingPassword || !currentPassword || !newPassword}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isUpdatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                      <span>Update Password</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: 2FA & Active Sessions */}
          {/* ======================================================== */}
          {activeTab === 'sessions' && (
            <div className="space-y-6">
              {/* 2FA Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`rounded-xl p-3 ${
                        security.isTwoFactorEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-extrabold text-slate-900">Two-Factor Authentication (2FA)</h3>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                            security.isTwoFactorEnabled
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {security.isTwoFactorEnabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 max-w-xl">
                        Protects your manager portal by requiring a secure 6-digit email OTP each time you log in from a new or unverified device.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleToggle2FA}
                    disabled={isToggling2FA}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50 shrink-0 ${
                      security.isTwoFactorEnabled
                        ? 'border border-rose-200 bg-white text-rose-600 hover:bg-rose-50'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {isToggling2FA ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : security.isTwoFactorEnabled ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    <span>{security.isTwoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA (Email OTP)'}</span>
                  </button>
                </div>
              </div>

              {/* Active Sessions Card */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <div className="border-b border-slate-100 p-5 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Active Login Sessions</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Devices currently authorized with active access tokens to your manager account.
                    </p>
                  </div>

                  {sessions.filter((s) => !s.isCurrent).length > 0 && (
                    <button
                      onClick={handleRevokeAllOtherSessions}
                      disabled={isRevokingOtherSessions}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-600 shadow-2xs hover:bg-rose-50 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {isRevokingOtherSessions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                      <span>Log Out From All Other Devices</span>
                    </button>
                  )}
                </div>

                <div className="p-5">
                  {sessions.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      <Laptop className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p>No active sessions found.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {sessions.map((sess) => (
                        <div key={sess.id} className="py-3.5 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600 shrink-0">
                              {getDeviceIcon(sess.userAgent)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-bold text-slate-900 truncate max-w-sm">
                                  {sess.userAgent}
                                </p>
                                {sess.isCurrent && (
                                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                    Current Session
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                IP: {sess.ipAddress} · Logged in: {new Date(sess.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          {!sess.isCurrent && (
                            <button
                              onClick={() => handleRevokeSession(sess.id)}
                              disabled={revokingSessionId === sess.id}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                            >
                              {revokingSessionId === sess.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                'Log out'
                              )}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: Notification Channels */}
          {/* ======================================================== */}
          {activeTab === 'notifications' && (
            <form onSubmit={handleSaveNotifications} className="max-w-3xl mx-auto space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-sm font-extrabold text-slate-900">Notification Channels & Delivery</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select how and when you receive automated alerts regarding your direct reports.
                  </p>
                </div>

                {/* Section A: Delivery Methods */}
                <div className="space-y-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                    Delivery Gateways
                  </span>

                  {/* Email Notifications */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50/50">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-indigo-600" />
                        <span className="text-xs font-bold text-slate-900">Email Notifications</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Receive automated notifications and event summaries directly to your registered email.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifications.emailNotifications}
                        onChange={(e) =>
                          setNotifications({ ...notifications, emailNotifications: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                    </label>
                  </div>

                  {/* In-App Notifications */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50/50">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-indigo-600" />
                        <span className="text-xs font-bold text-slate-900">In-App Notifications</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Display unread counters and live notification bell popups within the manager header.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifications.inAppNotifications}
                        onChange={(e) =>
                          setNotifications({ ...notifications, inAppNotifications: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                    </label>
                  </div>
                </div>

                {/* Section B: Event Triggers */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                    Manager Team Event Triggers
                  </span>

                  {[
                    {
                      key: 'teamAttendanceAlerts',
                      label: 'Team Attendance Alerts',
                      desc: 'Notify when team members are marked late, absent, or miss shift clock-out.',
                    },
                    {
                      key: 'leaveRequestAlerts',
                      label: 'Leave Request Notifications',
                      desc: 'Instant alerts when a direct report applies for annual, sick, or half-day leave.',
                    },
                    {
                      key: 'goalKpiUpdates',
                      label: 'Goal & OKR Progress Updates',
                      desc: 'Alerts when team members complete goals, achieve milestones, or change OKR metrics.',
                    },
                    {
                      key: 'performanceReviewReminders',
                      label: 'Performance Review Reminders',
                      desc: 'Reminders for upcoming review cycle deadlines and pending appraisals.',
                    },
                    {
                      key: 'importantTeamUpdates',
                      label: 'Important Team Updates & Broadcasts',
                      desc: 'Company-wide notices, shift policy changes, and urgent team communications.',
                    },
                  ].map((evt) => (
                    <div
                      key={evt.key}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-slate-800">{evt.label}</span>
                        <p className="text-[11px] text-slate-500">{evt.desc}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                        <input
                          type="checkbox"
                          checked={(notifications as any)[evt.key]}
                          onChange={(e) =>
                            setNotifications({
                              ...notifications,
                              [evt.key]: e.target.checked,
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingNotifications}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSavingNotifications ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span>Save Notification Preferences</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* TAB 5: Workspace Preferences */}
          {/* ======================================================== */}
          {activeTab === 'workspace' && (
            <form onSubmit={handleSaveWorkspace} className="max-w-3xl mx-auto space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-sm font-extrabold text-slate-900">Manager Workspace Preferences</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Customize your daily manager workspace layout, default views, and automated summary digests.
                  </p>
                </div>

                {/* Section A: Team Alerts & Digests */}
                <div className="space-y-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                    Automation & Digests
                  </span>

                  {[
                    {
                      key: 'teamAttendanceAlerts',
                      label: 'High-Priority Team Attendance Alerts',
                      desc: 'Highlight late arrivals and unscheduled absences on your dashboard banner.',
                    },
                    {
                      key: 'goalKpiUpdates',
                      label: 'Live Goal & KPI Progress Widgets',
                      desc: 'Show real-time goal completion percentages and OKR metrics on workspace cards.',
                    },
                    {
                      key: 'leaveRequestNotifications',
                      label: 'Leave Request Action Items',
                      desc: 'Flag pending team leave approvals in the Needs Attention section.',
                    },
                    {
                      key: 'weeklyTeamSummary',
                      label: 'Weekly Team Summary Digest',
                      desc: 'Receive an automated weekly performance and attendance summary report.',
                    },
                    {
                      key: 'performanceReviewReminders',
                      label: 'Upcoming Appraisal Reminders',
                      desc: 'Display active review cycles with due dates in your manager quick actions.',
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50/50"
                    >
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-slate-800">{item.label}</span>
                        <p className="text-[11px] text-slate-500">{item.desc}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                        <input
                          type="checkbox"
                          checked={(workspace as any)[item.key]}
                          onChange={(e) =>
                            setWorkspace({
                              ...workspace,
                              [item.key]: e.target.checked,
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                      </label>
                    </div>
                  ))}
                </div>

                {/* Section B: Default Views */}
                <div className="space-y-4 pt-4 border-t border-slate-100 text-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                    Display & View Defaults
                  </span>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Default Dashboard View */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Default Dashboard View
                      </label>
                      <select
                        value={workspace.defaultDashboardView}
                        onChange={(e) =>
                          setWorkspace({
                            ...workspace,
                            defaultDashboardView: e.target.value as any,
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 font-semibold focus:border-indigo-500 focus:outline-hidden cursor-pointer"
                      >
                        <option value="OVERVIEW">Overview & KPI Summary</option>
                        <option value="TEAM">My Team Directory</option>
                        <option value="ATTENDANCE">Team Attendance Logs</option>
                        <option value="PERFORMANCE">Performance & Goals</option>
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">
                        First section opened when navigating to Manager Dashboard.
                      </p>
                    </div>

                    {/* Table Records Per Page */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Default Table Records Per Page
                      </label>
                      <select
                        value={workspace.recordsPerPage}
                        onChange={(e) =>
                          setWorkspace({
                            ...workspace,
                            recordsPerPage: Number(e.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 font-semibold focus:border-indigo-500 focus:outline-hidden cursor-pointer"
                      >
                        <option value={10}>10 Records</option>
                        <option value={25}>25 Records</option>
                        <option value={50}>50 Records</option>
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Applied across Team Directory, Attendance, and Leave tables.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingWorkspace}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSavingWorkspace ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span>Save Workspace Preferences</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* TAB 6: Office Location & Shift Rules */}
          {/* ======================================================== */}
          {activeTab === 'attendance' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Info notice banner */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs text-indigo-900 flex items-start gap-3 shadow-2xs">
                <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-slate-900">
                    Centrally Managed Organization Parameters
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    Official office geofence coordinates, allowed clock-in radius, and standard work shift timings are established in Admin Settings. As a Manager, your team attendance records are automatically evaluated against these verified parameters.
                  </p>
                </div>
              </div>

              {/* 4 Clean Parameter Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Office Name & Location */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Office Location</span>
                    <MapPin className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-extrabold text-sm text-slate-900 truncate">{officeLocation?.name || 'Head Office HQ'}</p>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      {(officeLocation?.lat ?? 24.5845).toFixed(4)}° N, {(officeLocation?.lng ?? 73.7314).toFixed(4)}° E
                    </p>
                  </div>
                </div>

                {/* Geofence Radius */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Geofence Boundary</span>
                    <Radio className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-extrabold text-sm text-slate-900">{officeLocation?.radiusMeters || 200} Meters</p>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {officeLocation?.geofenceEnforce ? 'Enforce GPS Lock' : 'Standard Boundary'}
                    </span>
                  </div>
                </div>

                {/* Shift Hours */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Standard Shift</span>
                    <Clock className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-extrabold text-sm text-slate-900 font-mono">
                      {officeLocation?.workStartTime || '09:00 AM'} - {officeLocation?.workEndTime || '06:00 PM'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {officeLocation?.workingDaysPerWeek || 5} working days / week
                    </p>
                  </div>
                </div>

                {/* Grace Period */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grace Period</span>
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-extrabold text-sm text-slate-900">
                      {officeLocation?.gracePeriodMinutes || 15} Minutes
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Late mark threshold
                    </p>
                  </div>
                </div>
              </div>

              {/* Live Geofence Map Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      {officeLocation?.name || 'Head Office HQ'} · Geofence Radius Map
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Visual boundary marker indicating verified attendance presence zone.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fetchSettings(true)}
                      disabled={isRefreshing}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Sync Latest Location from Admin"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
                      <span>Sync Location</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsOfficeModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Open Fullscreen Map</span>
                    </button>
                  </div>
                </div>

                <div className="h-80 w-full rounded-xl overflow-hidden border border-slate-200">
                  <LiveMap
                    rows={[]}
                    geofence={
                      officeLocation
                        ? {
                            lat: officeLocation.lat,
                            lng: officeLocation.lng,
                            radiusMeters: officeLocation.radiusMeters || 200,
                            enforce: officeLocation.geofenceEnforce,
                          }
                        : null
                    }
                    height={320}
                    officeTitle={officeLocation?.name || 'Head Office HQ'}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Coordinates: Lat {officeLocation?.lat.toFixed(6) ?? '24.584526'}, Lng {officeLocation?.lng.toFixed(6) ?? '73.731426'}</span>
                  <span>Geofence Radius: {officeLocation?.radiusMeters || 200}m</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Office Location & Geofence Fullscreen Modal */}
      <OfficeMapModal
        isOpen={isOfficeModalOpen}
        onClose={() => setIsOfficeModalOpen(false)}
        officeLocation={officeLocation}
        title="Organization Office Location & Geofence Map"
        onRefresh={() => fetchSettings(true)}
        isRefreshing={isRefreshing}
      />
    </div>
  );
}

