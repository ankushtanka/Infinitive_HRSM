'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  Clock,
  CalendarDays,
  CreditCard,
  TrendingUp,
  FileText,
  UserPlus,
  MessageSquare,
  Bell,
  HelpCircle,
  BarChart3,
  Settings,
  ShieldAlert,
  Puzzle,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  User,
  Award,
  CheckSquare,
  Radio,
  Laptop,
} from 'lucide-react';

import { useEmsStore } from '@/store/emsStore';
import { useAuthStore } from '@/store/authStore';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavSection {
  category: string;
  items: NavItem[];
}

const adminNavSections: NavSection[] = [
  {
    category: 'MAIN',
    items: [
      { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
      { name: 'Approval Center', href: '/admin/approvals', icon: CheckSquare },
    ],
  },
  {
    category: 'PEOPLE',
    items: [
      { name: 'Employees', href: '/admin/employees', icon: Users },
      { name: 'Reminders & Alerts', href: '/admin/reminders', icon: Bell },
      { name: 'Organization', href: '/admin/organization', icon: Building2 },
    ],
  },
  {
    category: 'TIME',
    items: [
      { name: 'Attendance', href: '/admin/attendance', icon: Clock },
      { name: 'Attendance Alerts', href: '/admin/attendance/alerts', icon: ShieldAlert },
      { name: 'Live Tracking', href: '/admin/tracking', icon: Radio },
      { name: 'Leave', href: '/admin/leave', icon: CalendarDays, badge: '5' },
    ],
  },
  {
    category: 'FINANCE',
    items: [
      { name: 'Payroll', href: '/admin/payroll', icon: CreditCard },
    ],
  },
  {
    category: 'OPERATIONS',
    items: [
      { name: 'Assets', href: '/admin/assets', icon: Laptop },
    ],
  },
  {
    category: 'DEVELOPMENT',
    items: [
      { name: 'Performance', href: '/admin/performance', icon: TrendingUp },
      { name: 'Documents', href: '/admin/documents', icon: FileText },
    ],
  },
  {
    category: 'TALENT',
    items: [
      { name: 'Recruitment', href: '/admin/recruitment', icon: UserPlus },
      { name: 'Certificates', href: '/admin/recruitment/certificates', icon: Award },
      { name: 'Experience Cum Relieving', href: '/admin/experience-letters', icon: FileText },
    ],
  },
  {
    category: 'COMMUNICATION',
    items: [
      { name: 'Communication', href: '/admin/communication', icon: MessageSquare },
      { name: 'Notifications', href: '/admin/notifications', icon: Bell },
    ],
  },
  {
    category: 'INSIGHTS',
    items: [
      { name: 'Reports', href: '/admin/reports', icon: BarChart3 },
    ],
  },
  {
    category: 'SYSTEM',
    items: [
      { name: 'Helpdesk', href: '/admin/helpdesk', icon: HelpCircle },
      { name: 'Settings', href: '/admin/settings', icon: Settings },
      { name: 'Audit Logs', href: '/admin/audit-logs', icon: ShieldAlert },
    ],
  },
];

const managerNavSections: NavSection[] = [
  {
    category: 'MAIN',
    items: [
      { name: 'Dashboard', href: '/manager/dashboard', icon: LayoutDashboard },
      { name: 'Team Approvals', href: '/admin/approvals', icon: CheckSquare },
    ],
  },
  {
    category: 'MY TEAM',
    items: [
      { name: 'Team Directory', href: '/manager/team', icon: Building2 },
      { name: 'Team Employees', href: '/manager/employees', icon: Users },
    ],
  },
  {
    category: 'TIME & WORK',
    items: [
      { name: 'Team Attendance', href: '/manager/attendance', icon: Clock },
      { name: 'Team Leave', href: '/manager/leave', icon: CalendarDays },
      { name: 'Team Performance', href: '/manager/performance', icon: TrendingUp },
      { name: 'My Assets', href: '/employee/assets', icon: Laptop },
    ],
  },
  {
    category: 'COMMUNICATION',
    items: [
      { name: 'Communication', href: '/manager/communication', icon: MessageSquare },
      { name: 'Notifications', href: '/manager/notifications', icon: Bell },
      { name: 'Helpdesk', href: '/manager/helpdesk', icon: HelpCircle },
    ],
  },
];

const employeeNavSections: NavSection[] = [
  {
    category: 'MAIN',
    items: [
      { name: 'Dashboard', href: '/employee/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    category: 'MY WORK',
    items: [
      { name: 'My Profile', href: '/employee/profile', icon: User },
      { name: 'Attendance', href: '/employee/attendance', icon: Clock },
      { name: 'Leave', href: '/employee/leave', icon: CalendarDays },
      { name: 'Payroll', href: '/employee/payroll', icon: CreditCard },
      { name: 'Documents', href: '/employee/documents', icon: FileText },
      { name: 'Performance', href: '/employee/performance', icon: TrendingUp },
      { name: 'My Assets', href: '/employee/assets', icon: Laptop },
    ],
  },
  {
    category: 'COMMUNICATION',
    items: [
      { name: 'Messages', href: '/employee/messages', icon: MessageSquare },
      { name: 'Notifications', href: '/employee/notifications', icon: Bell },
    ],
  },
  {
    category: 'SUPPORT',
    items: [
      { name: 'Helpdesk', href: '/employee/helpdesk', icon: HelpCircle },
    ],
  },
  {
    category: 'SYSTEM',
    items: [
      { name: 'Settings', href: '/employee/settings', icon: Settings },
    ],
  },
];

// User-scoped in-memory badge cache to prevent duplicate badge API requests on page navigation
interface CachedBadgeEntry {
  userId: string;
  data: { unreadNotifications: number; pendingLeaves: number; openHelpdesk: number };
  timestamp: number;
}
let cachedBadges: CachedBadgeEntry | null = null;
let inFlightBadgesPromise: Promise<any> | null = null;

export function invalidateSidebarBadgeCache() {
  cachedBadges = null;
  inFlightBadgesPromise = null;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const pathname = usePathname();
  const { unreadNotificationsCount } = useEmsStore();
  const { user } = useAuthStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [helpdeskCount, setHelpdeskCount] = useState<number | null>(null);
  const [apiUnreadNotifCount, setApiUnreadNotifCount] = useState<number | null>(null);
  const [pendingLeaveCount, setPendingLeaveCount] = useState<number | null>(null);

  // Lock background scroll when mobile sidebar drawer is open
  useBodyScrollLock(isOpen);

  const roleStr = (user?.role || '').toUpperCase();
  const isManager = roleStr === 'MANAGER' || pathname.startsWith('/manager');
  const isEmployee = roleStr === 'EMPLOYEE' || pathname.startsWith('/employee');
  const isAdmin = !isManager && !isEmployee;
  const isAdminTheme = !isManager;

  const activeNavSections = isManager
    ? managerNavSections
    : isEmployee
    ? employeeNavSections
    : adminNavSections;

  useEffect(() => {
    let isMounted = true;
    const currentUserId = user?.id || user?.email || 'guest';

    const fetchBadges = async () => {
      // Check in-memory cache (45s TTL per user)
      if (
        cachedBadges &&
        cachedBadges.userId === currentUserId &&
        Date.now() - cachedBadges.timestamp < 45000
      ) {
        if (isMounted) {
          setApiUnreadNotifCount(cachedBadges.data.unreadNotifications);
          setPendingLeaveCount(cachedBadges.data.pendingLeaves);
          setHelpdeskCount(cachedBadges.data.openHelpdesk);
        }
        return;
      }

      try {
        if (!inFlightBadgesPromise) {
          inFlightBadgesPromise = fetch('/api/v1/layout/badges')
            .then((res) => (res.ok ? res.json() : null))
            .finally(() => {
              inFlightBadgesPromise = null;
            });
        }

        const result = await inFlightBadgesPromise;
        if (result && result.success && result.data && isMounted) {
          cachedBadges = {
            userId: currentUserId,
            data: {
              unreadNotifications: result.data.unreadNotifications ?? 0,
              pendingLeaves: result.data.pendingLeaves ?? 0,
              openHelpdesk: result.data.openHelpdesk ?? 0,
            },
            timestamp: Date.now(),
          };
          setApiUnreadNotifCount(result.data.unreadNotifications ?? 0);
          setPendingLeaveCount(result.data.pendingLeaves ?? 0);
          setHelpdeskCount(result.data.openHelpdesk ?? 0);
        }
      } catch {
        // Ignore background fetch errors
      }
    };

    fetchBadges();
    const interval = setInterval(fetchBadges, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user?.id, user?.email]);

  const getDynamicBadge = (item: NavItem) => {
    if (item.name === 'Notifications') {
      const count = apiUnreadNotifCount !== null ? apiUnreadNotifCount : unreadNotificationsCount;
      if (count <= 0) return null;
      if (count > 99) return '99+';
      return String(count);
    }
    if (item.name === 'Helpdesk') {
      if (helpdeskCount === null || helpdeskCount <= 0) return null;
      if (helpdeskCount > 99) return '99+';
      return String(helpdeskCount);
    }
    if (item.name === 'Leave' || item.name === 'Team Leave') {
      if (pendingLeaveCount === null || pendingLeaveCount <= 0) return null;
      if (pendingLeaveCount > 99) return '99+';
      return String(pendingLeaveCount);
    }
    return item.badge || null;
  };

  const homeHref = isManager ? '/manager/dashboard' : isEmployee ? '/employee/dashboard' : '/admin/dashboard';

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'w-[72px]' : 'w-[248px]'} ${
          isAdminTheme
            ? 'bg-[#FFF7ED] text-[#7C2D12] border-r border-[#FED7AA]'
            : 'bg-slate-950 text-slate-300 border-r border-slate-800/80'
        }`}
      >
        {/* Header Branding */}
        <div className={`flex h-16 items-center justify-between border-b px-3.5 ${
          isAdminTheme ? 'border-[#FED7AA]' : 'border-slate-800/80'
        }`}>
          <Link href={homeHref} className="flex items-center gap-3 overflow-hidden group">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl p-1 shadow-xs border transition-transform group-hover:scale-105 overflow-hidden ${
              isAdminTheme ? 'bg-white border-[#FED7AA]' : 'bg-white border-slate-200/20 shadow-sm'
            }`}>
              <Image
                src="/infinitive-cloud-icon.png"
                alt="Infinitive Cloud logo"
                width={36}
                height={36}
                className="h-full w-full object-contain"
                priority
              />
            </div>
            {!isCollapsed && (
              <div className="truncate min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-extrabold tracking-tight truncate ${
                    isAdminTheme ? 'text-[#0F172A]' : 'text-white'
                  }`}>
                    Infinitive Cloud
                  </span>
                </div>
                <p className={`text-[11px] font-semibold truncate ${
                  isAdminTheme ? 'text-[#C2410C]' : 'text-cyan-400 font-medium'
                }`}>
                  Enterprise HR Suite
                </p>
              </div>
            )}
          </Link>

          {/* Desktop Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`hidden rounded-lg p-1.5 transition-colors lg:flex cursor-pointer ${
              isAdminTheme
                ? 'text-[#7C2D12] hover:bg-[#FFF1E0] hover:text-[#9A3412]'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={onClose}
            className={`rounded-lg p-1.5 lg:hidden cursor-pointer ${
              isAdminTheme
                ? 'text-[#7C2D12] hover:bg-[#FFF1E0]'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            aria-label="Close Sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className={`flex-1 overflow-y-auto px-3 py-4 space-y-4 ${
          isAdminTheme ? 'hrms-scrollbar' : 'scrollbar-thin scrollbar-thumb-slate-800'
        }`}>
          {activeNavSections.map((sec) => (
            <div key={sec.category} className="space-y-1">
              {!isCollapsed ? (
                <div className={`px-3 text-[10px] font-bold uppercase tracking-wider mb-1 ${
                  isAdminTheme ? 'text-[#9A3412]' : 'text-slate-500'
                }`}>
                  {sec.category}
                </div>
              ) : (
                <div className={`h-1 border-t my-2 ${
                  isAdminTheme ? 'border-[#FED7AA]' : 'border-slate-800/60'
                }`}></div>
              )}

              {sec.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                const badgeText = getDynamicBadge(item);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive ? 'page' : undefined}
                    title={isCollapsed ? item.name : undefined}
                    className={`group relative flex items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
                      isAdminTheme
                        ? isActive
                          ? 'bg-[#FFEDD5] text-[#9A3412] font-semibold border-l-[3px] border-[#EA580C] shadow-2xs'
                          : 'text-[#7C2D12] hover:bg-[#FFF1E0] hover:text-[#9A3412]'
                        : isActive
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-semibold'
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                    } ${isCollapsed ? 'justify-center px-0 py-2.5' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`h-4.5 w-4.5 shrink-0 transition-colors ${
                          isAdminTheme
                            ? isActive
                              ? 'text-[#9A3412]'
                              : 'text-[#7C2D12] group-hover:text-[#9A3412]'
                            : isActive
                              ? 'text-white'
                              : 'text-slate-400 group-hover:text-slate-200'
                        }`}
                      />
                      {!isCollapsed && <span>{item.name}</span>}
                    </div>

                    {!isCollapsed && badgeText && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isAdminTheme
                            ? isActive
                              ? 'bg-[#EA580C] text-white'
                              : 'bg-[#FFEDD5] text-[#9A3412] group-hover:bg-[#FED7AA]'
                            : isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-800 text-indigo-400 group-hover:bg-slate-700'
                        }`}
                      >
                        {badgeText}
                      </span>
                    )}

                    {/* Tooltip on Collapsed Mode */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-3 z-50 hidden rounded-md bg-slate-900 px-2.5 py-1 text-xs text-white shadow-xl group-hover:block whitespace-nowrap border border-slate-700">
                        {item.name}
                        {badgeText && (
                          <span className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[9px] font-bold ${isAdminTheme ? "bg-[#EA580C] text-white" : "bg-indigo-600 text-white"}`}>
                            {badgeText}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer Status Panel */}
        <div className={`border-t p-3 ${
          isAdminTheme ? 'border-[#FED7AA]' : 'border-slate-800/80'
        }`}>
          {!isCollapsed ? (
            <div className={`rounded-xl p-2.5 border text-xs ${
              isAdminTheme
                ? 'bg-[#FFF7ED] border-[#FED7AA] text-[#0F172A]'
                : 'bg-slate-900/80 border-slate-800 text-slate-200'
            }`}>
              <div className={`flex items-center gap-2 font-semibold ${
                isAdminTheme ? 'text-[#0F172A]' : 'text-slate-200'
              }`}>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{isManager ? 'Manager Panel' : isEmployee ? 'Employee Portal' : 'HR Master Panel'}</span>
              </div>
              <p className={`mt-0.5 text-[10px] font-medium ${
                isAdminTheme ? 'text-[#7C2D12]' : 'text-slate-400'
              }`}>Enterprise Edition</p>
            </div>
          ) : (
            <div className="flex justify-center" title="Enterprise HR Active">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
