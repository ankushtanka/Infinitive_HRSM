'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { ViewPayslipModal } from '@/components/modals/ViewPayslipModal';
import { DeletePayrollModal } from '@/components/modals/DeletePayrollModal';
import { EditPayrollModal } from '@/components/modals/EditPayrollModal';
import { SalaryBreakdownCard } from '@/components/payroll/SalaryBreakdownCard';
import { PayrollRecord } from '@/types/admin';
import {
  FileText,
  Search,
  Filter,
  Eye,
  Download,
  Mail,
  Building2,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Calendar,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Sliders,
  Trash2,
  Edit3,
} from 'lucide-react';

export default function PayslipsDirectoryPage() {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [showBreakdownCard, setShowBreakdownCard] = useState(true);

  // Selected Payslip for Modal
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<PayrollRecord | null>(null);
  const [recordToEdit, setRecordToEdit] = useState<PayrollRecord | null>(null);

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/payroll');
      const data = await res.json();
      if (data.success && data.data?.payrollRecords) {
        setRecords(data.data.payrollRecords);
      }
    } catch (e) {
      console.error('Failed to load payslips directory:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // Filtered Records (Only include PROCESSED, APPROVED, PAID records)
  const availablePayslips = records.filter((r) => {
    const valid = ['APPROVED', 'PAID', 'Approved', 'Paid', 'PROCESSED', 'Processed'].includes(r.status);
    return valid;
  });

  const filteredRecords = availablePayslips.filter((r) => {
    const nameMatch =
      r.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    const deptMatch = departmentFilter === 'ALL' || r.department === departmentFilter;
    const statMatch = statusFilter === 'ALL' || r.status.toUpperCase() === statusFilter.toUpperCase();
    const yearMatch = yearFilter === 'ALL' || String(r.payYear) === yearFilter;
    return nameMatch && deptMatch && statMatch && yearMatch;
  });

  // Unique filters
  const departments = Array.from(new Set(availablePayslips.map((r) => r.department).filter(Boolean)));
  const years = Array.from(new Set(availablePayslips.map((r) => String(r.payYear)).filter(Boolean)));

  // Metrics
  const totalNetDisbursed = filteredRecords.reduce((sum, r) => sum + (r.netSalary || 0), 0);
  const totalGrossDisbursed = filteredRecords.reduce((sum, r) => sum + (r.grossSalary || 0), 0);
  const totalDeductions = filteredRecords.reduce((sum, r) => sum + (r.totalDeductions || 0), 0);

  return (
    <AuthGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']}>
      <AdminLayout>
        <div className="space-y-6">
          
          {/* Header Title & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <FileText className="h-6 w-6 text-orange-500" />
                <span>Salary Slips Directory</span>
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Generate, view, download, and dispatch official Infinitive Cloud payslips.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setShowBreakdownCard(!showBreakdownCard)}
                className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors shadow-2xs ${
                  showBreakdownCard
                    ? 'border-orange-500 bg-[#FFF7ED] text-orange-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Sliders className="h-4 w-4" />
                <span>{showBreakdownCard ? 'Hide Salary Card' : 'Salary Breakdown Card'}</span>
              </button>
              <button
                onClick={fetchRecords}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <RefreshCw className={`h-4 w-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <Link
                href="/admin/payroll"
                className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-orange-600 transition-colors"
              >
                <span>Payroll Processing</span>
              </Link>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Total Payslips</span>
                <span className="rounded-xl bg-[#FFF7ED] p-2 text-orange-500 border border-[#FED7AA]/60">
                  <FileText className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
                {filteredRecords.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Eligible for download & dispatch</div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Net Disbursed</span>
                <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                  <DollarSign className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-600 mt-2 font-mono">
                ₹{totalNetDisbursed.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Total deposited net pay</div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Gross Earnings</span>
                <span className="rounded-xl bg-[#FFF7ED] p-2 text-orange-500 border border-[#FED7AA]/60">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-orange-500 mt-2 font-mono">
                ₹{totalGrossDisbursed.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Before statutory deductions</div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Total Withholdings</span>
                <span className="rounded-xl bg-rose-50 p-2 text-rose-600">
                  <ShieldCheck className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-rose-600 mt-2 font-mono">
                ₹{totalDeductions.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">PF, PT, TDS, ESI & LOP</div>
            </div>
          </div>

          {/* Interactive Standard Salary Breakdown & Bank Details Card */}
          {showBreakdownCard && (
            <SalaryBreakdownCard
              onSuccess={() => fetchRecords()}
              defaultEmployeeId="EMP1004"
            />
          )}

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by employee name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white"
              >
                <option value="ALL">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>

              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white"
              >
                <option value="ALL">All Years</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="PAID">Paid</option>
                <option value="APPROVED">Approved</option>
                <option value="PROCESSED">Processed</option>
              </select>
            </div>
          </div>

          {/* Payslips Table */}
          <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3.5">Employee</th>
                    <th className="px-4 py-3.5">Department & Role</th>
                    <th className="px-4 py-3.5">Pay Period</th>
                    <th className="px-4 py-3.5 text-right">Gross (₹)</th>
                    <th className="px-4 py-3.5 text-right">Deductions (₹)</th>
                    <th className="px-4 py-3.5 text-right font-bold text-slate-700">Net Payable (₹)</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin text-orange-500" />
                          <span>Loading salary slips directory...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400">
                        <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                        <span>No payslips found matching the filters.</span>
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((record) => {
                      const recId = (record as any)._id || record.id || record.employeeId;
                      return (
                        <tr key={recId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              {record.avatar ? (
                                <img
                                  src={record.avatar}
                                  alt={record.employeeName}
                                  className="h-8 w-8 rounded-full object-cover border border-slate-200"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-[10px]">
                                  {record.employeeName.charAt(0)}
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-slate-900">{record.employeeName}</div>
                                <div className="font-mono text-[10px] text-slate-400">{record.employeeId}</div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="text-slate-800 font-medium">{record.designation}</div>
                            <div className="text-[11px] text-slate-400">{record.department}</div>
                          </td>

                          <td className="px-4 py-3.5 font-semibold text-slate-700">
                            {record.payPeriod}
                          </td>

                          <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                            ₹{record.grossSalary.toLocaleString('en-IN')}
                          </td>

                          <td className="px-4 py-3.5 text-right font-mono text-rose-600 font-medium">
                            -₹{record.totalDeductions.toLocaleString('en-IN')}
                          </td>

                          <td className="px-4 py-3.5 text-right font-mono font-black text-emerald-600 text-sm">
                            ₹{record.netSalary.toLocaleString('en-IN')}
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                record.status.toUpperCase() === 'PAID'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-[#FFF7ED] text-orange-700 border border-[#FED7AA]'
                              }`}
                            >
                              {record.status}
                            </span>
                          </td>

                          <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => setSelectedRecord(record)}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                              title="View & Download Payslip"
                            >
                              <Eye className="h-3.5 w-3.5 text-orange-500" />
                              <span>View Slip</span>
                            </button>

                            <button
                              onClick={() => setRecordToEdit(record)}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs"
                              title="Edit Adjustments"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-amber-600" />
                              <span>Edit</span>
                            </button>

                            <button
                              onClick={() => setRecordToDelete(record)}
                              className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-2.5 py-1 font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors shadow-2xs"
                              title="Delete Record"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>

                            <Link
                              href={`/admin/payroll/payslips/${encodeURIComponent(recId)}`}
                              className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                              title="Open Full Page View"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* View Payslip Modal */}
        <ViewPayslipModal
          isOpen={Boolean(selectedRecord)}
          onClose={() => setSelectedRecord(null)}
          record={selectedRecord}
          payslipId={(selectedRecord as any)?._id || selectedRecord?.id || selectedRecord?.employeeId}
        />

        {/* Edit Payroll Modal */}
        <EditPayrollModal
          isOpen={Boolean(recordToEdit)}
          onClose={() => setRecordToEdit(null)}
          onSuccess={() => {
            fetchRecords();
          }}
          record={recordToEdit}
        />

        {/* Delete Payroll Modal */}
        <DeletePayrollModal
          isOpen={Boolean(recordToDelete)}
          onClose={() => setRecordToDelete(null)}
          onSuccess={() => {
            fetchRecords();
          }}
          record={recordToDelete}
        />
      </AdminLayout>
    </AuthGuard>
  );
}
