'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminLayout } from '@/components/layout/AdminLayout';
import {
  Laptop,
  Monitor,
  Smartphone,
  Keyboard,
  Mouse,
  CreditCard,
  Radio,
  Package,
  Key,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Layers,
  Clock,
  HelpCircle,
  Hash,
  Cpu,
  HardDrive,
  UserCheck,
} from 'lucide-react';

interface AssignedAsset {
  _id: string;
  assetTag: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber?: string;
  condition: string;
  status: string;
  location: string;
  specifications?: Record<string, any>;
  warrantyExpiry?: string;
  assignedTo?: {
    employeeId: string;
    employeeName: string;
    assignedAt: string;
    expectedReturnDate?: string;
    assignmentNotes?: string;
  };
}

interface AssignedLicense {
  _id: string;
  name: string;
  vendor: string;
  licenseType: string;
  assignedAt?: string;
  expiryDate?: string;
  renewalStatus: string;
  notes?: string;
}

interface PastAssignment {
  _id: string;
  assetTag: string;
  assetName: string;
  category: string;
  assignedAt: string;
  returnedAt: string;
  conditionAtAssignment: string;
  conditionAtReturn?: string;
  returnNotes?: string;
}

export default function EmployeeAssetsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAssets, setActiveAssets] = useState<AssignedAsset[]>([]);
  const [licenses, setLicenses] = useState<AssignedLicense[]>([]);
  const [pastAssignments, setPastAssignments] = useState<PastAssignment[]>([]);

  const fetchMyAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/assets/my-assets');
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setActiveAssets(data.data.activeAssets || []);
        setLicenses(data.data.softwareLicenses || []);
        setPastAssignments(data.data.pastAssignments || []);
      } else {
        setError(data.message || 'Failed to load assigned assets');
      }
    } catch (err: any) {
      setError(err?.message || 'Error connecting to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyAssets();
  }, [fetchMyAssets]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Laptop':
        return <Laptop className="h-5 w-5 text-[#C2410C]" />;
      case 'Desktop':
        return <Monitor className="h-5 w-5 text-sky-600" />;
      case 'Monitor':
        return <Monitor className="h-5 w-5 text-[#C2410C]" />;
      case 'Mobile':
        return <Smartphone className="h-5 w-5 text-emerald-600" />;
      case 'Keyboard':
        return <Keyboard className="h-5 w-5 text-amber-600" />;
      case 'Mouse':
        return <Mouse className="h-5 w-5 text-orange-600" />;
      case 'ID Card':
        return <CreditCard className="h-5 w-5 text-rose-600" />;
      case 'SIM':
        return <Radio className="h-5 w-5 text-teal-600" />;
      default:
        return <Package className="h-5 w-5 text-slate-600" />;
    }
  };

  const getConditionBadge = (condition: string) => {
    switch (condition) {
      case 'NEW':
      case 'EXCELLENT':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">{condition}</span>;
      case 'GOOD':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA]">Good</span>;
      case 'FAIR':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Fair</span>;
      case 'DAMAGED':
      case 'DEFECTIVE':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">{condition}</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-[#F0E4D6]">{condition}</span>;
    }
  };

  return (
    <AdminLayout
      pageTitle="My Assets"
      breadcrumbs={[{ label: 'My Assets', href: '/employee/assets' }]}
      allowedRoles={['Employee', 'Manager', 'HR', 'Admin', 'Super Admin', 'EMPLOYEE', 'MANAGER', 'ADMIN', 'HR', 'SUPER_ADMIN']}
    >
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">My Assigned Assets & Tools</h2>
            <p className="text-xs text-slate-500">
              Track company hardware, device specifications, software seat allocations, and repair history.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchMyAssets}
              className="flex items-center gap-1.5 rounded-xl border border-[#F0E4D6] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-[#FFFBF7] transition"
            >
              <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              href="/employee/helpdesk"
              className="flex items-center gap-1.5 rounded-xl bg-[#F97316] px-3.5 py-2 text-xs font-bold text-[#081220] shadow-sm hover:bg-[#EA580C] transition"
            >
              <HelpCircle className="h-4 w-4 text-white" />
              <span>Request Repair / Support</span>
            </Link>
          </div>
        </div>

        {/* Summary Metrics (3 KPI Cards) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#F0E4D6] bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">ASSIGNED HARDWARE</span>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{activeAssets.length}</p>
            <span className="text-[10px] text-slate-400">Physical devices in custody</span>
          </div>

          <div className="rounded-xl border border-[#F0E4D6] bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">SOFTWARE LICENSES</span>
            <p className="mt-2 text-2xl font-extrabold text-[#C2410C]">{licenses.length}</p>
            <span className="text-[10px] text-slate-400">Active tooling seats</span>
          </div>

          <div className="rounded-xl border border-[#F0E4D6] bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">HISTORICAL CHECK-INS</span>
            <p className="mt-2 text-2xl font-extrabold text-emerald-600">{pastAssignments.length}</p>
            <span className="text-[10px] text-slate-400">Returned assets on record</span>
          </div>
        </div>

        {/* Section 1: Active Assigned Hardware Devices */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Laptop className="h-4 w-4 text-[#C2410C]" />
              <span>Active Hardware Devices</span>
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {activeAssets.length} {activeAssets.length === 1 ? 'device' : 'devices'} assigned
            </span>
          </div>

          {loading ? (
            <div className="rounded-xl border border-[#F0E4D6] bg-white p-16 text-center text-xs text-slate-400 shadow-sm">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-[#C2410C] mb-2" />
              <span>Loading your assigned devices...</span>
            </div>
          ) : activeAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-[#F0E4D6] bg-white shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Laptop className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-sm font-bold text-slate-800">No hardware devices currently assigned</h4>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                If you have been issued a company laptop, monitor, mobile device, or accessories, please contact your IT Admin or HR.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeAssets.map((asset) => (
                <div key={asset._id} className="rounded-xl border border-[#F0E4D6] bg-white p-4 shadow-sm space-y-3 flex flex-col justify-between text-xs">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFFBF7] border border-[#F0E4D6]">
                          {getCategoryIcon(asset.category)}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-xs leading-snug">{asset.name}</h4>
                          <p className="font-mono text-xs font-bold text-[#C2410C]">{asset.assetTag}</p>
                        </div>
                      </div>
                      {getConditionBadge(asset.condition)}
                    </div>

                    <div className="space-y-1 text-xs text-slate-600 bg-[#FFFBF7] p-3 rounded-xl border border-[#F0E4D6]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Brand / Model:</span>
                        <span className="font-medium text-slate-800">{asset.brand} {asset.model}</span>
                      </div>
                      {asset.serialNumber && (
                        <div className="flex justify-between font-mono text-[11px]">
                          <span className="text-slate-400">Serial No:</span>
                          <span className="font-semibold text-slate-800">{asset.serialNumber}</span>
                        </div>
                      )}
                      {asset.specifications?.imei && (
                        <div className="flex justify-between font-mono text-[11px]">
                          <span className="text-slate-400">IMEI:</span>
                          <span className="font-semibold text-slate-800">{asset.specifications.imei}</span>
                        </div>
                      )}
                      {asset.specifications?.phoneNumber && (
                        <div className="flex justify-between font-mono text-[11px]">
                          <span className="text-slate-400">Phone #:</span>
                          <span className="font-semibold text-slate-800">{asset.specifications.phoneNumber}</span>
                        </div>
                      )}
                      {asset.specifications?.cardIdentifier && (
                        <div className="flex justify-between font-mono text-[11px]">
                          <span className="text-slate-400">Badge ID:</span>
                          <span className="font-semibold text-slate-800">{asset.specifications.cardIdentifier}</span>
                        </div>
                      )}
                      {asset.specifications?.ram && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">RAM:</span>
                          <span className="font-medium text-slate-800">{asset.specifications.ram}</span>
                        </div>
                      )}
                      {asset.specifications?.storage && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Storage:</span>
                          <span className="font-medium text-slate-800">{asset.specifications.storage}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 text-xs text-slate-500 pt-1">
                      <div className="flex items-center justify-between">
                        <span>Issued On:</span>
                        <span className="font-semibold text-slate-700">
                          {asset.assignedTo?.assignedAt ? new Date(asset.assignedTo.assignedAt).toLocaleDateString() : '—'}
                        </span>
                      </div>
                      {asset.assignedTo?.expectedReturnDate && (
                        <div className="flex items-center justify-between">
                          <span>Expected Return:</span>
                          <span className="font-semibold text-amber-700">{asset.assignedTo.expectedReturnDate}</span>
                        </div>
                      )}
                      {asset.assignedTo?.assignmentNotes && (
                        <p className="text-[11px] text-slate-500 italic mt-1">&ldquo;{asset.assignedTo.assignmentNotes}&rdquo;</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#F0E4D6] flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Location: {asset.location || 'Remote'}</span>
                    <Link
                      href={`/employee/helpdesk?assetTag=${encodeURIComponent(asset.assetTag)}&title=${encodeURIComponent(`Issue with ${asset.name} (${asset.assetTag})`)}`}
                      className="flex items-center gap-1 text-xs font-semibold text-[#C2410C] hover:bg-[#FFEDD5] bg-[#FFF7ED] px-3 py-1.5 rounded-xl border border-[#FED7AA] font-bold transition"
                    >
                      <HelpCircle className="h-3.5 w-3.5 text-[#C2410C]" />
                      <span>Report Issue</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Allocated Software Licenses */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Key className="h-4 w-4 text-sky-600" />
              <span>Software Licenses & Developer Tooling</span>
            </h3>
            <span className="text-xs text-slate-500 font-medium">{licenses.length} active licenses</span>
          </div>

          {licenses.length === 0 ? (
            <div className="rounded-xl border border-[#F0E4D6] bg-white p-8 text-center text-xs text-slate-400 shadow-sm">
              No software licenses are currently assigned to your account.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {licenses.map((lic) => (
                <div key={lic._id} className="rounded-xl border border-[#F0E4D6] bg-white p-4 shadow-sm space-y-2 text-xs">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 border border-sky-100">
                        <Key className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">{lic.name}</h4>
                        <p className="text-[10px] text-slate-400">{lic.vendor} &bull; {lic.licenseType}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Active
                    </span>
                  </div>

                  <div className="pt-2 border-t border-[#F0E4D6] flex items-center justify-between text-[10px] text-slate-500">
                    <span>Allocated: {lic.assignedAt ? new Date(lic.assignedAt).toLocaleDateString() : 'Active'}</span>
                    {lic.expiryDate && <span>Expires: {lic.expiryDate}</span>}
                  </div>
                  {lic.notes && <p className="text-[11px] text-slate-500 italic">&ldquo;{lic.notes}&rdquo;</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 3: Past Asset Assignment History */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-600" />
            <span>Previous Asset History</span>
          </h3>

          <div className="overflow-hidden rounded-xl border border-[#F0E4D6] bg-white shadow-sm">
            {pastAssignments.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No past asset checkout or return records found.
              </div>
            ) : (
              <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-[#FFFBF7] backdrop-blur-xs">
                    <tr className="border-b border-[#F0E4D6] bg-[#FFFBF7] text-slate-700 font-semibold">
                      <th className="px-4 py-3.5">Asset Tag</th>
                      <th className="px-4 py-3.5">Device Name</th>
                      <th className="px-4 py-3.5">Category</th>
                      <th className="px-4 py-3.5">Checked Out</th>
                      <th className="px-4 py-3.5">Returned On</th>
                      <th className="px-4 py-3.5">Condition Out</th>
                      <th className="px-4 py-3.5">Condition In</th>
                      <th className="px-4 py-3.5">Return Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0E4D6]">
                    {pastAssignments.map((p) => (
                      <tr key={p._id} className="hover:bg-[#FFF7ED]/30">
                        <td className="px-4 py-3.5 font-mono font-bold text-[#C2410C]">{p.assetTag}</td>
                        <td className="px-4 py-3.5 font-semibold text-slate-900">{p.assetName}</td>
                        <td className="px-4 py-3.5 text-slate-700">{p.category}</td>
                        <td className="px-4 py-3.5 text-slate-700">{new Date(p.assignedAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3.5 text-slate-700">{p.returnedAt ? new Date(p.returnedAt).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3.5">{getConditionBadge(p.conditionAtAssignment)}</td>
                        <td className="px-4 py-3.5">{p.conditionAtReturn ? getConditionBadge(p.conditionAtReturn) : '—'}</td>
                        <td className="px-4 py-3.5 text-slate-500 italic">{p.returnNotes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
