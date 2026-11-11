'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  Clock,
  CalendarDays,
  TrendingUp,
  MessageSquare,
  Bell,
  HelpCircle,
  Settings,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Laptop,
} from 'lucide-react';
import { useEmsStore } from '@/store/emsStore';
import { useAuthStore } from '@/store/authStore';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface ManagerSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badgeKey?: 'notifications' | 'leave' | 'helpdesk';
}

interface NavSection {
  category: string;
  items: NavItem[];
}

const managerNavSections: NavSection[] = [
  {
    category: 'WORKSPACE',
    items: [
      { name: 'Dashboard', href: '/manager/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    category: 'PEOPLE',
    items: [
      { name: 'My Team', href: '/manager/team', icon: Users },
      { name: 'Team Reminders', href: '/admin/reminders', icon: Bell },
    ],
  },
  {
    category: 'TIME & ATTENDANCE',
    items: [
      { name: 'Attendance', href: '/manager/attendance', icon: Clock },
      { name: 'Attendance Alerts', href: '/admin/attendance/alerts', icon: ShieldAlert },
      { name: 'Leave', href: '/manager/leave', icon: CalendarDays, badgeKey: 'leave' },
    ],
  },
  {
    category: 'DEVELOPMENT',
    items: [
      { name: 'Performance', href: '/manager/performance', icon: TrendingUp },
      { name: 'My Assets', href: '/employee/assets', icon: Laptop },
    ],
  },
  {
    category: 'COMMUNICATION',
    items: [
      { name: 'Messages', href: '/manager/communication', icon: MessageSquare },
      { name: 'Notifications', href: '/manager/notifications', icon: Bell, badgeKey: 'notifications' },
      { name: 'Helpdesk', href: '/manager/helpdesk', icon: HelpCircle, badgeKey: 'helpdesk' },
    ],
  },
  {
    category: 'SYSTEM',
    items: [
      { name: 'Settings', href: '/manager/settings', icon: Settings },
    ],
  },
];

// In-memory badge cache to reduce API calls on navigation
interface CachedBadgeEntry {
  userId: string;
  data: { unreadNotifications: number; pendingLeaves: number; openHelpdesk: number };
  timestamp: number;
}
let cachedBadges: CachedBadgeEntry | null = null;
let inFlightBadgesPromise: Promise<any> | null = null;

export const ManagerSidebar: React.FC<ManagerSidebarProps> = ({ isOpen, onClose }) => {
  const pathname = usePathname();
  const { unreadNotificationsCount } = useEmsStore();
  const { user } = useAuthStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [helpdeskCount, setHelpdeskCount] = useState<number | null>(null);
  const [apiUnreadNotifCount, setApiUnreadNotifCount] = useState<number | null>(null);
  const [pendingLeaveCount, setPendingLeaveCount] = useState<number | null>(null);

  // Lock background scroll when mobile sidebar drawer is open
  useBodyScrollLock(isOpen);

  const isLinkActive = (href: string) => {
    if (href === '/manager/dashboard') {
      return pathname === '/manager/dashboard';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  useEffect(() => {
    let isMounted = true;
    const currentUserId = user?.id || user?.email || 'manager';

    const fetchBadges = async () => {
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

  const getBadgeValue = (badgeKey?: 'notifications' | 'leave' | 'helpdesk') => {
    if (!badgeKey) return null;
    if (badgeKey === 'notifications') {
      const count = apiUnreadNotifCount !== null ? apiUnreadNotifCount : unreadNotificationsCount;
      if (count <= 0) return null;
      return count > 99 ? '99+' : String(count);
    }
    if (badgeKey === 'leave') {
      if (pendingLeaveCount === null || pendingLeaveCount <= 0) return null;
      return pendingLeaveCount > 99 ? '99+' : String(pendingLeaveCount);
    }
    if (badgeKey === 'helpdesk') {
      if (helpdeskCount === null || helpdeskCount <= 0) return null;
      return helpdeskCount > 99 ? '99+' : String(helpdeskCount);
    }
    return null;
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-slate-950 text-slate-300 font-sans">
      {/* Top Section */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Branding Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 px-4">
          <Link href="/manager/dashboard" onClick={onClose} className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white shadow-md shadow-indigo-600/30">
              <Building2 className="h-5 w-5" />
            </div>
            {!isCollapsed && (
              <div className="truncate">
                <div className="flex items-center gap-1">
                  <span className="text-base font-extrabold tracking-tight text-white">EMS</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">/ HRMS</span>
                </div>
                <p className="text-[10px] text-indigo-300 font-semibold truncate">
                  Manager Workspace
                </p>
              </div>
            )}
          </Link>

          {/* Desktop Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:flex cursor-pointer transition-colors"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden cursor-pointer transition-colors"
            aria-label="Close Sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin scrollbar-thumb-slate-800">
          {managerNavSections.map((sec) => (
            <div key={sec.category} className="space-y-1">
              {!isCollapsed ? (
                <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {sec.category}
                </div>
              ) : (
                <div className="h-1 border-t border-slate-800/60 my-2" />
              )}

              {sec.items.map((item) => {
                const Icon = item.icon;
                const active = isLinkActive(item.href);
                const badgeText = getBadgeValue(item.badgeKey);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    title={isCollapsed ? item.name : undefined}
                    className={`group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                      active
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
                      {!isCollapsed && <span>{item.name}</span>}
                    </div>

                    {!isCollapsed && badgeText && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          active
                            ? 'bg-white text-indigo-700'
                            : 'bg-indigo-950 text-indigo-300 border border-indigo-800/50'
                        }`}
                      >
                        {badgeText}
                      </span>
                    )}

                    {/* Collapsed Badge Dot Indicator */}
                    {isCollapsed && badgeText && (
                      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-slate-950" />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="border-t border-slate-800/80 px-4 py-3 text-[11px] text-slate-500 flex items-center justify-between">
        {!isCollapsed ? (
          <>
            <span className="truncate">Manager Workspace</span>
            <span className="font-mono text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-400">
              v2.4
            </span>
          </>
        ) : (
          <div className="mx-auto flex justify-center w-full">
            <span className="font-mono text-[9px] text-slate-500">v2.4</span>
          </div>
        )}
      </div>
    </div>
  );

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
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-slate-950 text-slate-300 border-r border-slate-800/80 transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'w-20' : 'w-64'}`}
      >
        {sidebarContent}
      </aside>
    </>
  );
};
