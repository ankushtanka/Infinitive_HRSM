'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Menu,
  Bell,
  Search,
  X,
  ChevronDown,
  Settings,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  Users,
  Clock,
  CalendarDays,
  TrendingUp,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { LogoutConfirmModal } from '@/components/modals/LogoutConfirmModal';

interface ManagerHeaderProps {
  onMenuClick: () => void;
  pageTitle?: string;
}

export const ManagerHeader: React.FC<ManagerHeaderProps> = ({
  onMenuClick,
  pageTitle,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();

  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch unread notifications count for authenticated manager
  useEffect(() => {
    let isMounted = true;
    const fetchUnreadCount = async () => {
      try {
        const res = await fetch('/api/v1/notifications?limit=20');
        if (res.ok) {
          const data = await res.json();
          if (data.success && isMounted) {
            if (typeof data.unreadCount === 'number') {
              setUnreadCount(data.unreadCount);
            } else if (Array.isArray(data.notifications)) {
              const count = data.notifications.filter((n: any) => !n.isRead).length;
              setUnreadCount(count);
            }
          }
        }
      } catch {
        // Silent catch for background notification poll
      }
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 45000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const userAny = user as any;
  const managerName =
    user?.name ||
    (userAny?.firstName && `${userAny.firstName} ${userAny.lastName}`) ||
    'Manager';
  const managerEmail = user?.email || 'manager@organization.com';
  const managerEmpId = user?.employeeId || 'Manager';
  const avatarUrl = userAny?.photo || userAny?.avatar;

  const quickNavItems = [
    { type: 'Page', title: 'Team Directory', subtitle: 'View direct reports and assignments', url: '/manager/team' },
    { type: 'Page', title: 'Attendance Overview', subtitle: 'Review team shifts and check-ins', url: '/manager/attendance' },
    { type: 'Page', title: 'Leave Approvals', subtitle: 'Approve or reject team leave requests', url: '/manager/leave' },
    { type: 'Page', title: 'Performance Reviews', subtitle: 'Team appraisals and goal tracking', url: '/manager/performance' },
    { type: 'Page', title: 'Helpdesk Escalations', subtitle: 'View support tickets from your team', url: '/manager/helpdesk' },
  ];

  const searchResults = searchQuery.trim()
    ? quickNavItems.filter((item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 sm:px-6 backdrop-blur-md shadow-2xs font-sans">
        {/* Left: Mobile Menu Toggle & Workspace Badge */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 lg:hidden cursor-pointer transition-colors"
            aria-label="Open Sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 font-bold text-indigo-600 text-xs border border-indigo-200">
              MW
            </span>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 hidden sm:block">
              {pageTitle || 'Manager Workspace'}
            </h1>
          </div>
        </div>

        {/* Center: Search Bar */}
        <div ref={searchRef} className="relative max-w-md flex-1 px-4 sm:px-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Search team, attendance, leaves, reviews..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-8 text-xs text-slate-800 placeholder-slate-400 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 font-medium"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Search Dropdown */}
          {isSearchOpen && searchQuery.trim() && (
            <div className="absolute left-4 right-4 sm:left-8 sm:right-8 mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl z-50 text-xs animate-in fade-in-50 duration-150">
              <div className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Quick Navigation
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 py-1">
                {searchResults.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs">
                    No matching pages found for &quot;{searchQuery}&quot;
                  </div>
                ) : (
                  searchResults.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setIsSearchOpen(false);
                        setSearchQuery('');
                        router.push(item.url);
                      }}
                      className="flex items-center justify-between p-2.5 transition cursor-pointer hover:bg-indigo-50/60 rounded-xl"
                    >
                      <div>
                        <p className="font-bold text-slate-800">{item.title}</p>
                        <p className="text-[11px] text-slate-500">{item.subtitle}</p>
                      </div>
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                        Go
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Notifications & Profile */}
        <div className="flex items-center gap-3">
          {/* Notifications Icon */}
          <Link
            href="/manager/notifications"
            className="relative rounded-xl border border-slate-200/80 bg-slate-50/50 p-2 text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white ring-2 ring-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-1.5 pr-2.5 hover:bg-slate-100 transition-all cursor-pointer"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={managerName}
                  className="h-8 w-8 rounded-lg object-cover border border-slate-200"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 font-extrabold text-xs uppercase border border-indigo-200">
                  {managerName.slice(0, 2)}
                </div>
              )}
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-slate-900 leading-tight truncate max-w-[120px]">
                  {managerName}
                </span>
                <span className="text-[10px] font-semibold text-indigo-600 leading-tight">
                  Manager ({managerEmpId})
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden sm:block" />
            </button>

            {/* Profile Popover */}
            {isProfileOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsProfileOpen(false)}
                />
                <div className="absolute right-0 mt-2 z-50 w-60 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-2xl animate-in fade-in-50 slide-in-from-top-2 duration-150 text-xs">
                  <div className="border-b border-slate-100 p-3">
                    <p className="font-bold text-slate-900 truncate">{managerName}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{managerEmail}</p>
                    <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-100">
                      <ShieldCheck className="h-3 w-3 text-indigo-600" />
                      <span>Manager Access</span>
                    </div>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/manager/team"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-700 hover:bg-slate-50 font-medium"
                    >
                      <Users className="h-4 w-4 text-slate-400" />
                      <span>My Team</span>
                    </Link>

                    <Link
                      href="/manager/settings"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-700 hover:bg-slate-50 font-medium"
                    >
                      <Settings className="h-4 w-4 text-slate-400" />
                      <span>Manager Settings</span>
                    </Link>
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      onClick={() => {
                        setIsProfileOpen(false);
                        setIsLogoutModalOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-rose-600 hover:bg-rose-50 font-bold transition-colors cursor-pointer"
                    >
                      <LogOut className="h-4 w-4 text-rose-500" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      <LogoutConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
      />
    </>
  );
};
