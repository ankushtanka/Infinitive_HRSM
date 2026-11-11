import React from 'react';
import { ManagerLayout } from '@/components/layout/ManagerLayout';

export const metadata = {
  title: 'Manager Performance & Team Workspace | EMS / HRMS',
  description: 'Enterprise Manager Portal for team management, performance, attendance, leave, communication, and helpdesk.',
};

export default function ManagerRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ManagerLayout>{children}</ManagerLayout>;
}
