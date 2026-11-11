'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ChevronRight } from 'lucide-react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { ManagerSidebar } from './ManagerSidebar';
import { ManagerHeader } from './ManagerHeader';

interface ManagerLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  showBreadcrumbs?: boolean;
  contentClassName?: string;
  allowedRoles?: string[];
}

export const ManagerLayout: React.FC<ManagerLayoutProps> = ({
  children,
  pageTitle,
  breadcrumbs = [],
  showBreadcrumbs,
  contentClassName,
  allowedRoles = ['MANAGER', 'SUPER_ADMIN', 'ADMIN', 'HR'],
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Derive title if not explicitly provided
  const routeLabels: Record<string, string> = {
    '/manager/dashboard': 'Dashboard',
    '/manager/team': 'My Team',
    '/manager/employees': 'Team Employees',
    '/manager/attendance': 'Attendance',
    '/manager/leave': 'Leave Management',
    '/manager/performance': 'Performance',
    '/manager/communication': 'Messages',
    '/manager/notifications': 'Notifications',
    '/manager/helpdesk': 'Helpdesk',
    '/manager/settings': 'Settings',
  };

  const currentLabel =
    pageTitle ||
    routeLabels[pathname] ||
    pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') ||
    'Dashboard';

  const hasExplicitBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;
  const shouldRenderBreadcrumbs =
    showBreadcrumbs !== undefined ? showBreadcrumbs : hasExplicitBreadcrumbs;

  return (
    <AuthGuard allowedRoles={allowedRoles}>
      <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans text-slate-800 antialiased">
        {/* Shared Manager Sidebar */}
        <ManagerSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main Workspace Container */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Shared Manager Header */}
          <ManagerHeader
            onMenuClick={() => setIsSidebarOpen(true)}
            pageTitle={pageTitle || currentLabel}
          />

          {/* Breadcrumb Sub-bar (rendered only when explicitly passed or requested) */}
          {shouldRenderBreadcrumbs && hasExplicitBreadcrumbs && (
            <div className="flex items-center gap-2 border-b border-slate-200/80 bg-white px-4 sm:px-6 py-2 text-xs text-slate-500 shadow-2xs">
              <Link
                href="/manager/dashboard"
                className="flex items-center gap-1 hover:text-indigo-600 font-medium transition-colors"
              >
                <Home className="h-3.5 w-3.5 text-slate-400" />
                <span>Manager</span>
              </Link>
              {breadcrumbs.map((bc, idx) => (
                <React.Fragment key={idx}>
                  <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                  {bc.href ? (
                    <Link
                      href={bc.href}
                      className="hover:text-indigo-600 font-medium transition-colors"
                    >
                      {bc.label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-slate-900">{bc.label}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Scrollable Content View with clean, compact top spacing */}
          <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-8">
            <div className={contentClassName || "mx-auto max-w-7xl space-y-5"}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
};
