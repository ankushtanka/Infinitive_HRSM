'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useEmsStore } from '@/store/emsStore';
import { AddEmployeeModal } from '@/components/employees/AddEmployeeModal';

export default function NewAccountPage() {
  const router = useRouter();
  const { state, addEmployee } = useEmsStore();
  const [isModalOpen, setIsModalOpen] = useState(true);

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

  return (
    <AdminLayout
      pageTitle="Add New Account"
      breadcrumbs={[
        { label: 'Employees & Accounts', href: '/admin/employees' },
        { label: 'New Account', href: '/admin/accounts/new' },
      ]}
    >
      <div className="space-y-6">
        <AddEmployeeModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            router.push('/admin/employees');
          }}
          onSave={async (emp) => {
            const res = addEmployee(emp);
            return res;
          }}
          departments={departmentNames}
          designations={designationNames}
        />
      </div>
    </AdminLayout>
  );
}
