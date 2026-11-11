'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuthStore } from '@/store/authStore';

interface AdminLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  allowedRoles?: string[];
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  breadcrumbs = [],
  allowedRoles,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const rolesToGuard = allowedRoles || ['HR/Admin', 'Super Admin', 'ADMIN', 'HR', 'SUPER_ADMIN'];

  const pathname = usePathname() || '';
  const { user } = useAuthStore();
  const roleStr = (user?.role || '').toUpperCase();
  const isEmployeeRole = roleStr === 'EMPLOYEE' || pathname.startsWith('/employee');
  const isManagerRole = roleStr === 'MANAGER' || pathname.startsWith('/manager');
  const isAdminTheme = !isManagerRole;

  const homeHref = isEmployeeRole ? '/employee/dashboard' : isManagerRole ? '/manager/dashboard' : '/admin/dashboard';
  const homeLabel = isEmployeeRole ? 'Employee' : isManagerRole ? 'Manager' : 'Admin';

  return (
    <AuthGuard allowedRoles={rolesToGuard}>
      <div className={`flex h-screen w-full overflow-hidden font-sans antialiased ${
        isAdminTheme ? 'bg-[#FFFBF7] text-[#0F172A] admin-theme' : 'bg-slate-50 text-slate-800'
      }`}>
        {/* Sidebar */}
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        {/* Main Workspace Container */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top Header */}
          <Header onMenuClick={() => setIsSidebarOpen(true)} />

          {/* Breadcrumb Bar */}
          {breadcrumbs.length > 0 && (
            <div className={`flex items-center gap-2 border-b px-4 sm:px-6 py-2 text-xs shadow-2xs ${
              isAdminTheme
                ? 'border-[#F0E4D6] bg-white text-[#64748B]'
                : 'border-slate-200/80 bg-white text-slate-500'
            }`}>
              <Link
                href={homeHref}
                className={`flex items-center gap-1 font-medium transition-colors ${
                  isAdminTheme ? 'hover:text-[#EA580C]' : 'hover:text-indigo-600'
                }`}
              >
                <Home className={`h-3.5 w-3.5 ${isAdminTheme ? 'text-[#C2410C]' : 'text-slate-400'}`} />
                <span>{homeLabel}</span>
              </Link>
              {breadcrumbs.map((bc, idx) => (
                <React.Fragment key={idx}>
                  <ChevronRight className={`h-3 w-3 shrink-0 ${isAdminTheme ? 'text-[#FED7AA]' : 'text-slate-400'}`} />
                  {bc.href ? (
                    <Link
                      href={bc.href}
                      className={`font-medium transition-colors ${
                        isAdminTheme ? 'hover:text-[#EA580C] text-[#64748B]' : 'hover:text-indigo-600 text-slate-500'
                      }`}
                    >
                      {bc.label}
                    </Link>
                  ) : (
                    <span className={`font-semibold ${isAdminTheme ? 'text-[#0F172A]' : 'text-slate-900'}`}>{bc.label}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Scrollable Content View */}
          <main className={`flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 ${isAdminTheme ? 'hrms-scrollbar' : ''}`}>
            <div className="mx-auto max-w-7xl space-y-5">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
};
