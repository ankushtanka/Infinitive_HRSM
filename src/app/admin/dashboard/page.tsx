'use client';

import React, { useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { WelcomeSection } from '@/components/dashboard/WelcomeSection';
import { QuickActionBar } from '@/components/dashboard/QuickActionBar';
import { StatCard } from '@/components/dashboard/StatCard';
import { AttendanceOverview } from '@/components/dashboard/AttendanceOverview';
import { EmployeeGrowthChart } from '@/components/dashboard/EmployeeGrowthChart';
import { LeaveRequestsTable } from '@/components/dashboard/LeaveRequestsTable';
import { UpcomingEvents } from '@/components/dashboard/UpcomingEvents';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { Announcements } from '@/components/dashboard/Announcements';
import { useEmsStore } from '@/store/emsStore';

import { AddEmployeeModal } from '@/components/employees/AddEmployeeModal';
import { AddDepartmentModal } from '@/components/modals/AddDepartmentModal';
import { AddDesignationModal } from '@/components/modals/AddDesignationModal';
import { AddHolidayModal } from '@/components/modals/AddHolidayModal';
import { CreateAnnouncementModal } from '@/components/modals/CreateAnnouncementModal';
import { AddLeaveTypeModal } from '@/components/modals/AddLeaveTypeModal';

import { Database, Trash2, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function AdminDashboardPage() {
  const {
    state,
    totalEmployeesCount,
    activeEmployeesCount,
    onLeaveCount,
    newEmployeesCount,
    addEmployee,
    addDepartment,
    addDesignation,
    addHoliday,
    createAnnouncement,
    addLeaveType,
    clearSeedData,
    resetToDemoData,
  } = useEmsStore();

  // Modals state
  const [isAddEmpOpen, setIsAddEmpOpen] = useState(false);
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);
  const [isAddDesgOpen, setIsAddDesgOpen] = useState(false);
  const [isAddHolidayOpen, setIsAddHolidayOpen] = useState(false);
  const [isAddAnnounceOpen, setIsAddAnnounceOpen] = useState(false);
  const [isAddLeaveTypeOpen, setIsAddLeaveTypeOpen] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const departmentNames = Array.from(
    new Set([
      'Engineering & IT',
      'Human Resources',
      'Finance & Accounts',
      'Sales & Marketing',
      'Operations',
      'Product Management',
      'Design & Creative',
      'Quality Assurance',
      'Legal & Compliance',
      'Customer Support',
      'Administration',
      'Executive Board',
      'General',
      ...state.departments.map((d) => d.name),
      ...state.employees.map((e) => e.department).filter(Boolean),
    ])
  );
  const designationNames = Array.from(
    new Set([
      'CEO/Founder',
      'Director',
      'Vice President',
      'Senior Software Engineer',
      'Software Engineer',
      'Frontend Developer',
      'Backend Developer',
      'Full Stack Developer',
      'DevOps Engineer',
      'QA / Test Engineer',
      'UI/UX Designer',
      'Product Manager',
      'HR Manager',
      'HR Executive',
      'Talent Acquisition Specialist',
      'Finance Manager',
      'Accountant',
      'Financial Analyst',
      'Sales Manager',
      'Sales Executive',
      'Business Development Manager',
      'Marketing Specialist',
      'Digital Marketing Lead',
      'Operations Lead',
      'Operations Executive',
      'System Administrator',
      'IT Support Specialist',
      'Customer Support Specialist',
      'Legal Counsel',
      'Office Administrator',
      'Staff',
      ...state.designations.map((d) => d.title),
      ...state.employees.map((e) => e.designation).filter(Boolean),
    ])
  );

  // Dynamic KPI Metrics calculated from the underlying EMS Data Store
  const dynamicKpiMetrics = [
    {
      id: 'total-employees',
      title: 'Total Employees',
      value: totalEmployeesCount.toLocaleString(),
      change: totalEmployeesCount > 0 ? '+100%' : '0%',
      isPositive: true,
      periodText: 'real count',
      iconName: 'users' as const,
    },
    {
      id: 'active-employees',
      title: 'Active Employees',
      value: activeEmployeesCount.toLocaleString(),
      change: activeEmployeesCount > 0 ? '+100%' : '0%',
      isPositive: true,
      periodText: 'real count',
      iconName: 'user-check' as const,
    },
    {
      id: 'on-leave',
      title: 'On Leave',
      value: onLeaveCount.toLocaleString(),
      change: '0%',
      isPositive: true,
      periodText: 'real count',
      iconName: 'user-minus' as const,
    },
    {
      id: 'new-employees',
      title: 'New Employees',
      value: newEmployeesCount.toLocaleString(),
      change: newEmployeesCount > 0 ? '+100%' : '0%',
      isPositive: true,
      periodText: 'last 60 days',
      iconName: 'user-plus' as const,
    },
  ];

  return (
    <AdminLayout pageTitle="Dashboard">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed right-6 top-20 z-50 flex items-center gap-2 rounded-xl bg-[#0F172A] px-4 py-2.5 text-xs text-white shadow-2xl animate-fade-in border border-[#FED7AA]/40">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}



      {/* Welcome Greeting with Quick Action Entry Buttons */}
      <WelcomeSection
        onAddEmployee={() => setIsAddEmpOpen(true)}
        onAddDepartment={() => setIsAddDeptOpen(true)}
        onAddDesignation={() => setIsAddDesgOpen(true)}
        onCreateAnnouncement={() => setIsAddAnnounceOpen(true)}
        onAddLeaveType={() => setIsAddLeaveTypeOpen(true)}
      />

      {/* Dynamic KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dynamicKpiMetrics.map((metric) => (
          <StatCard key={metric.id} metric={metric} />
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
        <div className="flex flex-col min-h-0 min-w-0 lg:col-span-5">
          <AttendanceOverview />
        </div>
        <div className="flex flex-col min-h-0 min-w-0 lg:col-span-7">
          <EmployeeGrowthChart />
        </div>
      </div>

      {/* Leave Requests & Upcoming Events */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
        <div className="flex flex-col min-h-0 min-w-0 lg:col-span-7">
          <LeaveRequestsTable />
        </div>
        <div className="flex flex-col min-h-0 min-w-0 lg:col-span-5">
          <UpcomingEvents />
        </div>
      </div>

      {/* Activity & Announcements Stream */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
        <div className="flex flex-col lg:col-span-6 min-h-0 min-w-0">
          <RecentActivity />
        </div>
        <div className="flex flex-col lg:col-span-6 min-h-0 min-w-0">
          <Announcements />
        </div>
      </div>

      {/* ADMIN DATA ENTRY MODALS */}
      <AddEmployeeModal
        isOpen={isAddEmpOpen}
        onClose={() => setIsAddEmpOpen(false)}
        departments={departmentNames}
        designations={designationNames}
        onSave={(emp) => {
          const res = addEmployee(emp);
          showToast(res.message);
          return res;
        }}
      />

      <AddDepartmentModal
        isOpen={isAddDeptOpen}
        onClose={() => setIsAddDeptOpen(false)}
        onSave={(dept) => {
          addDepartment(dept);
          showToast(`Department "${dept.name}" created successfully!`);
        }}
      />

      <AddDesignationModal
        isOpen={isAddDesgOpen}
        onClose={() => setIsAddDesgOpen(false)}
        departments={state.departments}
        onSave={(desg) => {
          addDesignation(desg);
          showToast(`Designation "${desg.title}" created successfully!`);
        }}
      />

      <AddHolidayModal
        isOpen={isAddHolidayOpen}
        onClose={() => setIsAddHolidayOpen(false)}
        onSave={(hol) => {
          addHoliday(hol);
          showToast(`Holiday "${hol.name}" added to calendar!`);
        }}
      />

      <CreateAnnouncementModal
        isOpen={isAddAnnounceOpen}
        onClose={() => setIsAddAnnounceOpen(false)}
        onSave={(ann) => {
          createAnnouncement(ann);
          showToast(`Announcement "${ann.title}" published!`);
        }}
      />

      <AddLeaveTypeModal
        isOpen={isAddLeaveTypeOpen}
        onClose={() => setIsAddLeaveTypeOpen(false)}
        onSave={(lt) => {
          addLeaveType(lt);
          showToast(`Leave type "${lt.name}" added successfully!`);
        }}
      />
    </AdminLayout>
  );
}
