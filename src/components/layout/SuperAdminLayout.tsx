'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { SuperAdminSidebar } from './SuperAdminSidebar';
import { SuperAdminHeader } from './SuperAdminHeader';
import { ChevronRight, Home } from 'lucide-react';

interface SuperAdminLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  allowedRoles?: string[];
}

export const SuperAdminLayout: React.FC<SuperAdminLayoutProps> = ({
  children,
  pageTitle = 'Super Admin Control Center',
  breadcrumbs = [],
  allowedRoles = ['Super Admin', 'SUPER_ADMIN'],
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <AuthGuard allowedRoles={allowedRoles}>
      <div className="flex h-screen w-full overflow-hidden font-sans antialiased bg-[#FFFBF7] text-[#0F172A] admin-theme">
        {/* Super Admin Sidebar */}
        <SuperAdminSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main Workspace Container */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top Header */}
          <SuperAdminHeader
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            pageTitle={pageTitle}
            breadcrumbs={breadcrumbs}
          />

          {/* Breadcrumb Bar */}
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-2 border-b border-[#F0E4D6] bg-white px-4 sm:px-6 py-2 text-xs text-[#64748B] shadow-2xs">
              <Link href="/super-admin/dashboard" className="flex items-center gap-1 font-medium transition-colors hover:text-[#EA580C]">
                <Home className="h-3.5 w-3.5 text-[#C2410C]" />
                <span>Super Admin</span>
              </Link>
              {breadcrumbs.map((bc, idx) => (
                <React.Fragment key={idx}>
                  <ChevronRight className="h-3 w-3 text-[#FED7AA] shrink-0" />
                  {bc.href ? (
                    <Link href={bc.href} className="font-medium transition-colors hover:text-[#EA580C] text-[#64748B]">
                      {bc.label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-[#0F172A]">{bc.label}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Scrollable Content View */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 hrms-scrollbar">
            <div className="mx-auto max-w-7xl space-y-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
};
