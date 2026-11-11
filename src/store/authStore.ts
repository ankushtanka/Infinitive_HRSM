'use client';

import { useState, useEffect } from 'react';
import {
  AuthUser,
  AuthSession,
  LoginPayload,
  LoginResponse,
  OtpVerifyPayload,
  ForgotPasswordPayload,
  ResetPasswordPayload,
  AuthActivityLog,
} from '@/types/auth';

const AUTH_STORAGE_KEY = 'ems_hrms_auth_state_v1';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  loginAttempts: number;
  isLockedOut: boolean;
  lockoutUntil: number | null;
  twoFactorToken: string | null;
  pendingOtpEmail: string | null;
  authActivityLogs: AuthActivityLog[];
}

const initialAuthState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  loginAttempts: 0,
  isLockedOut: false,
  lockoutUntil: null,
  twoFactorToken: null,
  pendingOtpEmail: null,
  authActivityLogs: [],
};

// Global singleton state and listener set
let globalState: AuthState = initialAuthState;
let isHydratedGlobal = false;
const listeners = new Set<() => void>();

function updateGlobalState(updater: (prev: AuthState) => AuthState) {
  globalState = updater(globalState);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        ...globalState,
        accessToken: null,
        refreshToken: null,
        twoFactorToken: null,
      }));
    } catch {
      // Storage error fallback
    }
  }
  listeners.forEach((listener) => listener());
}

export function updateUserAvatar(avatarUrl: string) {
  updateGlobalState((prev) => {
    if (!prev.user) return prev;
    return {
      ...prev,
      user: {
        ...prev.user,
        avatar: avatarUrl,
      },
    };
  });
}

export function updateUserProfile(updates: Partial<AuthUser>) {
  updateGlobalState((prev) => {
    const baseUser: AuthUser = prev.user || {
      id: updates.id || 'usr-mgr-01',
      employeeId: updates.employeeId || 'MGR1001',
      name: updates.name || 'Manager',
      email: updates.email || 'manager@organization.com',
      avatar: updates.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80',
      role: updates.role || 'MANAGER',
    };
    return {
      ...prev,
      isAuthenticated: true,
      user: {
        ...baseUser,
        ...updates,
      },
    };
  });
}

let syncInFlightPromise: Promise<AuthUser | null> | null = null;
let lastSyncTimestamp = 0;
const SYNC_COOLDOWN_MS = 10000;

export async function syncUserFromServer(force: boolean = false): Promise<AuthUser | null> {
  const now = Date.now();
  if (!force && now - lastSyncTimestamp < SYNC_COOLDOWN_MS) {
    return globalState.user;
  }
  if (syncInFlightPromise) {
    return syncInFlightPromise;
  }

  syncInFlightPromise = (async () => {
    try {
      let response = await fetch('/api/v1/auth/me', { cache: 'no-store' });

      // If 401, attempt silent refresh via POST /api/v1/auth/refresh once
      if (response.status === 401) {
        try {
          const refreshRes = await fetch('/api/v1/auth/refresh', { method: 'POST', cache: 'no-store' });
          if (refreshRes.ok) {
            response = await fetch('/api/v1/auth/me', { cache: 'no-store' });
          }
        } catch {
          // Refresh call failed
        }
      }

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          lastSyncTimestamp = Date.now();
          updateGlobalState((prev) => ({
            ...prev,
            isAuthenticated: true,
            user: {
              ...(prev.user || ({} as AuthUser)),
              ...data.user,
            },
          }));
          return data.user as AuthUser;
        }
      } else if (response.status === 401 || response.status === 403) {
        // Prevent premature eviction if user recently logged in or verified OTP within 15s grace window
        const recentlyLoggedIn = Date.now() - lastSyncTimestamp < 15000;
        if (recentlyLoggedIn && globalState.isAuthenticated) {
          return globalState.user;
        }

        // Genuinely unauthenticated: clear stale localStorage user
        lastSyncTimestamp = Date.now();
        updateGlobalState((prev) => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          accessToken: null,
          refreshToken: null,
        }));
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
          } catch {}
          const publicRoutes = ['/login', '/forgot-password', '/reset-password', '/verify-otp', '/complete-account', '/verify-email', '/careers'];
          const isPublic = publicRoutes.some((route) => window.location.pathname.startsWith(route));
          if (!isPublic) {
            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
          }
        }
        return null;
      }
      return null;
    } catch {
      return null;
    } finally {
      syncInFlightPromise = null;
    }
  })();

  return syncInFlightPromise;
}

export function useAuthStore() {
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    // Hydrate client state after initial mount to avoid React SSR hydration mismatches (#418 & #423)
    if (!isHydratedGlobal && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(AUTH_STORAGE_KEY);
        if (saved) {
          const parsed: AuthState = JSON.parse(saved);
          if (parsed.isLockedOut && parsed.lockoutUntil && Date.now() > parsed.lockoutUntil) {
            parsed.isLockedOut = false;
            parsed.lockoutUntil = null;
            parsed.loginAttempts = 0;
          }
          globalState = {
            ...parsed,
            accessToken: null,
            refreshToken: null,
            twoFactorToken: null,
          };
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(globalState));
        }
      } catch {
        // Fallback
      } finally {
        isHydratedGlobal = true;
      }
    }

    setIsHydrated(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_STORAGE_KEY && event.newValue) {
        try {
          const parsed: AuthState = JSON.parse(event.newValue);
          globalState = {
            ...parsed,
            accessToken: null,
            refreshToken: null,
            twoFactorToken: null,
          };
          listeners.forEach((l) => l());
        } catch {
          // ignore parsing error
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }

    // Sync with server on mount to ensure freshness and hydrate cookie-authenticated sessions
    syncUserFromServer().catch(() => null);

    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    };
  }, []);

  const recordActivity = (
    action: AuthActivityLog['action'],
    details: string,
    userEmail?: string
  ) => {
    const log: AuthActivityLog = {
      id: `act-auth-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      userEmail: userEmail || globalState.user?.email || 'Guest',
      userId: globalState.user?.id,
      action,
      details,
      ipAddress: '127.0.0.1 (Client)',
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Server',
      timestamp: new Date().toISOString(),
    };

    updateGlobalState((prev) => ({
      ...prev,
      authActivityLogs: [log, ...(prev.authActivityLogs || []).slice(0, 49)],
    }));
  };

  const login = async (payload: LoginPayload): Promise<LoginResponse> => {
    if (globalState.isLockedOut) {
      if (globalState.lockoutUntil && Date.now() < globalState.lockoutUntil) {
        const minsLeft = Math.ceil((globalState.lockoutUntil - Date.now()) / (60 * 1000));
        return {
          success: false,
          message: `Account is temporarily locked due to repeated failed login attempts. Please try again in ${minsLeft} minute(s).`,
        };
      } else {
        updateGlobalState((prev) => ({ ...prev, isLockedOut: false, lockoutUntil: null, loginAttempts: 0 }));
      }
    }

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: LoginResponse = await response.json();

      if (!response.ok || !data.success) {
        const newAttempts = globalState.loginAttempts + 1;
        let isLocked = false;
        let lockUntil: number | null = null;

        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          isLocked = true;
          lockUntil = Date.now() + LOCKOUT_DURATION_MS;
          recordActivity('ACCOUNT_LOCKED', `Account locked after ${MAX_LOGIN_ATTEMPTS} failed attempts`, payload.identifier);
        } else {
          recordActivity('LOGIN_FAILED', `Failed login attempt for ${payload.identifier}`, payload.identifier);
        }

        updateGlobalState((prev) => ({
          ...prev,
          loginAttempts: newAttempts,
          isLockedOut: isLocked,
          lockoutUntil: lockUntil,
        }));

        return data;
      }

      // Check if 2FA is required
      if (data.requiresTwoFactor && data.twoFactorToken) {
        updateGlobalState((prev) => ({
          ...prev,
          twoFactorToken: data.twoFactorToken || null,
        }));
        return data;
      }

      // Successful login
      if (data.session) {
        lastSyncTimestamp = Date.now();
        updateGlobalState((prev) => ({
          ...prev,
          user: data.session!.user,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: true,
          loginAttempts: 0,
          isLockedOut: false,
          lockoutUntil: null,
          twoFactorToken: null,
          pendingOtpEmail: null,
        }));

        recordActivity('LOGIN_SUCCESS', `Successfully logged in as ${data.session.user.role}`, data.session.user.email);
      }

      return data;
    } catch {
      recordActivity('LOGIN_FAILED', `Network error during login for ${payload.identifier}`, payload.identifier);
      return { success: false, message: 'Network error. Please check your connection and try again.' };
    }
  };

  const requestOtp = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const response = await fetch('/api/v1/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await response.json();
      if (data.success) {
        updateGlobalState((prev) => ({ ...prev, pendingOtpEmail: cleanEmail }));
        recordActivity('OTP_REQUESTED', `OTP verification code requested for ${cleanEmail}`, cleanEmail);
      }
      return data;
    } catch {
      return { success: false, message: 'Network error requesting OTP verification code.' };
    }
  };

  const verifyOtp = async (
    otpCode: string,
    email?: string,
    twoFactorTokenOverride?: string
  ): Promise<LoginResponse> => {
    try {
      const targetEmail = email || globalState.pendingOtpEmail || undefined;
      const targetToken = twoFactorTokenOverride || globalState.twoFactorToken || undefined;
      const response = await fetch('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail,
          twoFactorToken: targetToken,
          otpCode,
        }),
      });

      const data: LoginResponse = await response.json();

      if (!response.ok || !data.success) {
        recordActivity('LOGIN_FAILED', `Invalid OTP verification attempt`);
        return data;
      }

      if (data.session) {
        lastSyncTimestamp = Date.now();
        updateGlobalState((prev) => ({
          ...prev,
          user: data.session!.user,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: true,
          loginAttempts: 0,
          isLockedOut: false,
          lockoutUntil: null,
          twoFactorToken: null,
          pendingOtpEmail: null,
        }));

        recordActivity('OTP_VERIFIED', 'OTP verified successfully', data.session.user.email);
      }

      return data;
    } catch {
      return { success: false, message: 'Network error during OTP verification.' };
    }
  };

  const resendOtp = async (
    email?: string,
    twoFactorToken?: string
  ): Promise<{ success: boolean; message: string; twoFactorToken?: string }> => {
    const targetEmail = email || globalState.pendingOtpEmail || undefined;
    const targetToken = twoFactorToken || globalState.twoFactorToken || undefined;
    try {
      const response = await fetch('/api/v1/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail,
          twoFactorToken: targetToken,
        }),
      });
      const data = await response.json();
      if (data.success && data.twoFactorToken) {
        updateGlobalState((prev) => ({ ...prev, twoFactorToken: data.twoFactorToken }));
      }
      return data;
    } catch {
      return { success: false, message: 'Failed to resend OTP.' };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors during logout
    } finally {
      recordActivity('LOGOUT', 'User logged out and session cleared', globalState.user?.email);
      updateGlobalState((prev) => ({
        ...initialAuthState,
        authActivityLogs: prev.authActivityLogs,
      }));
      if (typeof window !== 'undefined') {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
  };

  const forgotPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      recordActivity('PASSWORD_RESET_REQUESTED', `Password reset link requested for ${email}`, email);
      return data;
    } catch {
      return { success: false, message: 'Network error processing request.' };
    }
  };

  const resetPassword = async (payload: ResetPasswordPayload): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.success) {
        recordActivity('PASSWORD_RESET_SUCCESS', 'Password reset completed');
      }
      return data;
    } catch {
      return { success: false, message: 'Network error resetting password.' };
    }
  };

  const getRoleDashboardRoute = (role?: AuthUser['role']): string => {
    const rawRole = role || globalState.user?.role || '';
    const norm = rawRole.toUpperCase().replace(/[\s_\-\/]+/g, '');
    if (norm === 'SUPERADMIN') return '/super-admin/dashboard';
    if (norm === 'ADMIN' || norm === 'HR' || norm === 'HRADMIN' || norm === 'HRMANAGER') return '/admin/dashboard';
    if (norm === 'MANAGER') return '/manager/dashboard';
    if (norm === 'EMPLOYEE') return '/employee/dashboard';
    return '/login';
  };

  return {
    state: globalState,
    isHydrated: isHydratedGlobal,
    user: globalState.user,
    isAuthenticated: globalState.isAuthenticated,
    isLockedOut: globalState.isLockedOut,
    loginAttempts: globalState.loginAttempts,
    lockoutUntil: globalState.lockoutUntil,
    pendingOtpEmail: globalState.pendingOtpEmail,
    authActivityLogs: globalState.authActivityLogs || [],
    login,
    requestOtp,
    verifyOtp,
    resendOtp,
    logout,
    forgotPassword,
    resetPassword,
    getRoleDashboardRoute,
    updateUserAvatar,
    updateUserProfile,
    syncUserFromServer,
  };
}
