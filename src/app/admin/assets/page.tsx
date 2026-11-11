'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  Laptop,
  Monitor,
  Smartphone,
  Keyboard,
  Mouse,
  CreditCard,
  Radio,
  Package,
  Plus,
  RefreshCw,
  Download,
  Search,
  Filter,
  Eye,
  Edit3,
  Trash2,
  UserPlus,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Key,
  ShieldCheck,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  X,
  Layers,
  Building2,
  Clock,
  FileText,
  UserCheck,
  HelpCircle,
} from 'lucide-react';

interface AssetRecord {
  _id: string;
  organizationId: string;
  assetTag: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber?: string;
  specifications?: Record<string, any>;
  purchaseDate?: string;
  purchaseCost?: number;
  currency?: string;
  warrantyExpiry?: string;
  vendor?: string;
  invoiceNumber?: string;
  condition: string;
  status: string;
  location: string;
  notes?: string;
  assignedTo?: {
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    assignedAt: string;
    expectedReturnDate?: string;
    assignmentNotes?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface SoftwareLicense {
  _id: string;
  name: string;
  vendor: string;
  licenseType: string;
  licenseKey?: string;
  totalSeats: number;
  assignedSeats: number;
  allocations?: Array<{
    allocationId: string;
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    assignedAt: string;
    notes?: string;
  }>;
  purchaseDate?: string;
  expiryDate?: string;
  renewalStatus: string;
  cost?: number;
  currency?: string;
  notes?: string;
  status: string;
}

interface AssignmentHistory {
  _id: string;
  assetTag: string;
  assetName: string;
  category: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  assignedAt: string;
  assignedByName?: string;
  expectedReturnDate?: string;
  conditionAtAssignment: string;
  assignmentNotes?: string;
  returnedAt?: string | null;
  returnedByName?: string | null;
  conditionAtReturn?: string | null;
  returnNotes?: string | null;
  status: string;
}

interface EmployeeOption {
  employeeId: string;
  fullName: string;
  email: string;
  department?: string;
  designation?: string;
}

export default function AdminAssetsPage() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'licenses' | 'history'>('inventory');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data states
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [licenses, setLicenses] = useState<SoftwareLicense[]>([]);
  const [metrics, setMetrics] = useState<any>({
    totalAssets: 0,
    assignedAssets: 0,
    availableAssets: 0,
    maintenanceAssets: 0,
    expiringWarranties: 0,
    expiringLicenses: 0,
  });
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // Filtering & Pagination
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAddLicenseModal, setShowAddLicenseModal] = useState(false);
  const [showManageLicenseModal, setShowManageLicenseModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);

  // Application-wide background scroll lock whenever any asset or license modal is active
  const isAnyAssetModalOpen = Boolean(
    showAddModal ||
    showEditModal ||
    showAssignModal ||
    showReturnModal ||
    showDetailsModal ||
    showAddLicenseModal ||
    showManageLicenseModal ||
    showReassignModal
  );
  useBodyScrollLock(isAnyAssetModalOpen);

  // Active item in modal
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [assetDetailsHistory, setAssetDetailsHistory] = useState<AssignmentHistory[]>([]);
  const [selectedLicense, setSelectedLicense] = useState<SoftwareLicense | null>(null);

  // Form states
  const [formData, setFormData] = useState<any>({
    category: 'Laptop',
    name: '',
    brand: '',
    model: '',
    serialNumber: '',
    assetTag: '',
    condition: 'GOOD',
    status: 'AVAILABLE',
    location: 'Headquarters',
    purchaseDate: '',
    purchaseCost: '',
    currency: 'INR',
    warrantyExpiry: '',
    vendor: '',
    invoiceNumber: '',
    notes: '',
    specifications: {},
    assignedToEmployeeId: '',
    assignmentDate: '',
    expectedReturnDate: '',
    assignmentNotes: '',
  });

  const [assignForm, setAssignForm] = useState({
    employeeId: '',
    expectedReturnDate: '',
    conditionAtAssignment: 'GOOD',
    notes: '',
  });

  const [returnForm, setReturnForm] = useState({
    returnDate: '',
    returnCondition: 'GOOD',
    newStatus: 'AVAILABLE',
    returnNotes: '',
  });

  const [reassignForm, setReassignForm] = useState({
    newEmployeeId: '',
    assignmentDate: '',
    expectedReturnDate: '',
    notes: '',
    previousReturnCondition: 'GOOD',
    previousReturnNotes: '',
  });

  const [licenseForm, setLicenseForm] = useState({
    name: '',
    vendor: '',
    licenseType: 'SUBSCRIPTION',
    licenseKey: '',
    totalSeats: 5,
    purchaseDate: '',
    expiryDate: '',
    renewalStatus: 'ACTIVE',
    cost: '',
    currency: 'INR',
    notes: '',
  });

  const [licenseAssignForm, setLicenseAssignForm] = useState({
    employeeId: '',
    notes: '',
  });

  // Fetch employees for assignment pickers
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/employees?limit=300');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data)) {
        setEmployees(
          data.data.map((emp: any) => ({
            employeeId: emp.employeeId || emp._id,
            fullName: emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email,
            email: emp.email || '',
            department: emp.department || '',
            designation: emp.designation || '',
          }))
        );
      }
    } catch (e) {
      console.warn('Failed to fetch employees list for picker:', e);
    }
  }, []);

  // Fetch Assets & Metrics
  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search.trim()) params.set('search', search.trim());
      if (selectedCategory !== 'All') params.set('category', selectedCategory);
      if (selectedStatus !== 'All') params.set('status', selectedStatus);

      const res = await fetch(`/api/v1/assets?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setAssets(data.data || []);
        if (data.metrics) setMetrics(data.metrics);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalCount(data.pagination.total || 0);
        }
      } else {
        setError(data.message || 'Failed to fetch assets');
      }
    } catch (err: any) {
      setError(err?.message || 'Error communicating with server');
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedCategory, selectedStatus]);

  // Fetch Software Licenses
  const fetchLicenses = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/assets/licenses');
      const data = await res.json();
      if (res.ok && data.success) {
        setLicenses(data.data || []);
      }
    } catch (e) {
      console.warn('Failed to fetch software licenses:', e);
    }
  }, []);

  // Global Assignment History state
  const [globalHistory, setGlobalHistory] = useState<AssignmentHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('All');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);

  const fetchAssignmentHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(historyPage),
        limit: '20',
      });
      if (historySearch.trim()) params.set('search', historySearch.trim());
      if (historyStatus !== 'All') params.set('status', historyStatus);

      const res = await fetch(`/api/v1/assets/history?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setGlobalHistory(data.data || []);
        if (data.pagination) {
          setHistoryTotalPages(data.pagination.totalPages || 1);
          setHistoryTotalCount(data.pagination.total || 0);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch assignment history:', e);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage, historySearch, historyStatus]);

  useEffect(() => {
    fetchAssets();
    fetchLicenses();
    fetchEmployees();
  }, [fetchAssets, fetchLicenses, fetchEmployees]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchAssignmentHistory();
    }
  }, [activeTab, fetchAssignmentHistory]);

  // Handle Export CSV
  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (selectedCategory !== 'All') params.set('category', selectedCategory);
    if (selectedStatus !== 'All') params.set('status', selectedStatus);
    window.open(`/api/v1/assets/export?${params.toString()}`, '_blank');
  };

  // Open Details Modal & Fetch Assignment History
  const handleViewDetails = async (asset: AssetRecord) => {
    setSelectedAsset(asset);
    setShowDetailsModal(true);
    try {
      const res = await fetch(`/api/v1/assets/${asset._id}`);
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setSelectedAsset(data.data);
        setAssetDetailsHistory(data.data.history || []);
      }
    } catch (e) {
      console.warn('Failed to load asset details history:', e);
    }
  };

  // Open Assign Modal
  const handleOpenAssign = (asset: AssetRecord) => {
    setSelectedAsset(asset);
    setAssignForm({
      employeeId: '',
      expectedReturnDate: '',
      conditionAtAssignment: asset.condition || 'GOOD',
      notes: '',
    });
    setShowAssignModal(true);
  };

  // Submit Assign
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    if (!assignForm.employeeId) {
      alert('Please select an employee');
      return;
    }

    try {
      const res = await fetch(`/api/v1/assets/${selectedAsset._id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || 'Asset assigned successfully');
        setShowAssignModal(false);
        fetchAssets();
        fetchAssignmentHistory();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        alert(data.message || 'Failed to assign asset');
      }
    } catch (err: any) {
      alert(err?.message || 'Error assigning asset');
    }
  };

  // Open Return Modal
  const handleOpenReturn = (asset: AssetRecord) => {
    setSelectedAsset(asset);
    setReturnForm({
      returnDate: new Date().toISOString().split('T')[0],
      returnCondition: asset.condition || 'GOOD',
      newStatus: 'AVAILABLE',
      returnNotes: '',
    });
    setShowReturnModal(true);
  };

  // Open Reassign Modal
  const handleOpenReassign = (asset: AssetRecord) => {
    setSelectedAsset(asset);
    setReassignForm({
      newEmployeeId: '',
      assignmentDate: new Date().toISOString().split('T')[0],
      expectedReturnDate: '',
      notes: '',
      previousReturnCondition: asset.condition || 'GOOD',
      previousReturnNotes: '',
    });
    setShowReassignModal(true);
  };

  // Submit Reassign
  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    if (!reassignForm.newEmployeeId) {
      alert('Please select the employee to reassign to');
      return;
    }

    try {
      const res = await fetch(`/api/v1/assets/${selectedAsset._id}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reassignForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || 'Asset reassigned successfully');
        setShowReassignModal(false);
        fetchAssets();
        fetchAssignmentHistory();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        alert(data.message || 'Failed to reassign asset');
      }
    } catch (err: any) {
      alert(err?.message || 'Error reassigning asset');
    }
  };

  // Quick Action: Send to Maintenance
  const handleSendToMaintenance = async (asset: AssetRecord) => {
    if (!confirm(`Mark asset ${asset.assetTag} (${asset.name}) as Under Maintenance?`)) return;
    try {
      const res = await fetch(`/api/v1/assets/${asset._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'UNDER_MAINTENANCE' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`Asset ${asset.assetTag} moved to Maintenance`);
        fetchAssets();
        fetchAssignmentHistory();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        alert(data.message || 'Failed to update asset status');
      }
    } catch (err: any) {
      alert(err?.message || 'Error updating asset status');
    }
  };

  // Quick Action: Complete Maintenance (Return to Available stock)
  const handleCompleteMaintenance = async (asset: AssetRecord) => {
    if (!confirm(`Complete maintenance for asset ${asset.assetTag} and return to Available stock?`)) return;
    try {
      const res = await fetch(`/api/v1/assets/${asset._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'AVAILABLE', condition: 'GOOD' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`Asset ${asset.assetTag} returned to Available stock`);
        fetchAssets();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        alert(data.message || 'Failed to update asset status');
      }
    } catch (err: any) {
      alert(err?.message || 'Error updating asset status');
    }
  };

  // Submit Return
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;

    try {
      const res = await fetch(`/api/v1/assets/${selectedAsset._id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(returnForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || 'Asset returned successfully');
        setShowReturnModal(false);
        fetchAssets();
        fetchAssignmentHistory();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        alert(data.message || 'Failed to return asset');
      }
    } catch (err: any) {
      alert(err?.message || 'Error returning asset');
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (asset: AssetRecord) => {
    setSelectedAsset(asset);
    setFormData({
      category: asset.category,
      name: asset.name,
      brand: asset.brand || '',
      model: asset.model || '',
      serialNumber: asset.serialNumber || '',
      assetTag: asset.assetTag,
      condition: asset.condition,
      status: asset.status,
      location: asset.location || 'Headquarters',
      purchaseDate: asset.purchaseDate || '',
      purchaseCost: asset.purchaseCost !== undefined ? String(asset.purchaseCost) : '',
      currency: asset.currency || 'INR',
      warrantyExpiry: asset.warrantyExpiry || '',
      vendor: asset.vendor || '',
      invoiceNumber: asset.invoiceNumber || '',
      notes: asset.notes || '',
      specifications: asset.specifications || {},
    });
    setShowEditModal(true);
  };

  // Submit Edit Asset
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;

    try {
      const res = await fetch(`/api/v1/assets/${selectedAsset._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg('Asset updated successfully');
        setShowEditModal(false);
        fetchAssets();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        alert(data.message || 'Failed to update asset');
      }
    } catch (err: any) {
      alert(err?.message || 'Error updating asset');
    }
  };

  // Handle Archive / Delete Asset
  const handleDeleteAsset = async (asset: AssetRecord) => {
    if (!confirm(`Are you sure you want to archive asset ${asset.assetTag} (${asset.name})?`)) return;

    try {
      const res = await fetch(`/api/v1/assets/${asset._id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || 'Asset archived successfully');
        fetchAssets();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        alert(data.message || 'Failed to archive asset');
      }
    } catch (err: any) {
      alert(err?.message || 'Error archiving asset');
    }
  };

  // Submit Add Asset
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || 'Asset created successfully');
        setShowAddModal(false);
        fetchAssets();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        alert(data.message || 'Failed to create asset');
      }
    } catch (err: any) {
      alert(err?.message || 'Error creating asset');
    }
  };

  // Submit Add License
  const handleAddLicenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/assets/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(licenseForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg('Software license added successfully');
        setShowAddLicenseModal(false);
        fetchLicenses();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        alert(data.message || 'Failed to add software license');
      }
    } catch (err: any) {
      alert(err?.message || 'Error adding software license');
    }
  };

  // Open Manage License Allocations Modal
  const handleOpenManageLicense = (lic: SoftwareLicense) => {
    setSelectedLicense(lic);
    setLicenseAssignForm({ employeeId: '', notes: '' });
    setShowManageLicenseModal(true);
  };

  // Assign Seat to Employee
  const handleLicenseAssignSeat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLicense || !licenseAssignForm.employeeId) {
      alert('Please select an employee');
      return;
    }

    try {
      const res = await fetch(`/api/v1/assets/licenses/${selectedLicense._id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(licenseAssignForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedLicense(data.data);
        fetchLicenses();
        setLicenseAssignForm({ employeeId: '', notes: '' });
      } else {
        alert(data.message || 'Failed to assign seat');
      }
    } catch (err: any) {
      alert(err?.message || 'Error assigning seat');
    }
  };

  // Revoke Seat from Employee
  const handleLicenseRevokeSeat = async (allocationId: string, employeeName: string) => {
    if (!selectedLicense) return;
    if (!confirm(`Revoke software license seat from ${employeeName}?`)) return;

    try {
      const res = await fetch(`/api/v1/assets/licenses/${selectedLicense._id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocationId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedLicense(data.data);
        fetchLicenses();
      } else {
        alert(data.message || 'Failed to revoke seat');
      }
    } catch (err: any) {
      alert(err?.message || 'Error revoking seat');
    }
  };

  // Category Icon Helper
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Laptop':
        return <Laptop className="h-4 w-4 text-orange-500" />;
      case 'Desktop':
        return <Monitor className="h-4 w-4 text-sky-600" />;
      case 'Monitor':
        return <Monitor className="h-4 w-4 text-orange-500" />;
      case 'Mobile':
        return <Smartphone className="h-4 w-4 text-emerald-600" />;
      case 'Keyboard':
        return <Keyboard className="h-4 w-4 text-amber-600" />;
      case 'Mouse':
        return <Mouse className="h-4 w-4 text-orange-500" />;
      case 'ID Card':
        return <CreditCard className="h-4 w-4 text-rose-600" />;
      case 'SIM':
        return <Radio className="h-4 w-4 text-teal-600" />;
      default:
        return <Package className="h-4 w-4 text-slate-600" />;
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Available</span>;
      case 'ASSIGNED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF7ED] text-orange-700 border border-[#FED7AA]">Assigned</span>;
      case 'UNDER_MAINTENANCE':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Maintenance</span>;
      case 'LOST':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Lost</span>;
      case 'RETIRED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">Retired</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  // Condition Badge Helper
  const getConditionBadge = (condition: string) => {
    switch (condition) {
      case 'NEW':
      case 'EXCELLENT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">{condition}</span>;
      case 'GOOD':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">Good</span>;
      case 'FAIR':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200">Fair</span>;
      case 'DAMAGED':
      case 'DEFECTIVE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200">{condition}</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-600 bg-slate-50 border border-slate-200">{condition}</span>;
    }
  };

  return (
    <AdminLayout
      pageTitle="Enterprise Asset Management"
      breadcrumbs={[
        { label: 'Assets', href: '/admin/assets' },
      ]}
    >
      <div className="space-y-6">
        {/* Top Header Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Enterprise Asset Management</h2>
            <p className="text-xs text-slate-500">
              Hardware inventory, employee check-in/out, software seat tracking, and audit compliance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              <Download className="h-4 w-4 text-slate-500" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => {
                fetchAssets();
                fetchLicenses();
              }}
              className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
              title="Refresh Inventory"
            >
              <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowAddLicenseModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-3.5 py-2 text-xs font-semibold text-orange-700 shadow-xs hover:bg-[#FFEDD5] transition-colors"
            >
              <Key className="h-4 w-4 text-orange-500" />
              <span>Add License</span>
            </button>
            <button
              onClick={() => {
                setFormData({
                  category: 'Laptop',
                  name: '',
                  brand: '',
                  model: '',
                  serialNumber: '',
                  assetTag: '',
                  condition: 'GOOD',
                  status: 'AVAILABLE',
                  location: 'Headquarters',
                  purchaseDate: '',
                  purchaseCost: '',
                  currency: 'INR',
                  warrantyExpiry: '',
                  vendor: '',
                  invoiceNumber: '',
                  notes: '',
                  specifications: {},
                  assignedToEmployeeId: '',
                  assignmentDate: '',
                  expectedReturnDate: '',
                  assignmentNotes: '',
                });
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-orange-600 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Add Asset</span>
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-medium">{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Navigation Sub-Tabs */}
        <div className="flex border-b border-slate-200 text-xs font-bold gap-6">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex items-center gap-1.5 pb-3 border-b-2 transition ${
              activeTab === 'inventory'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Laptop className="h-4 w-4" />
            <span>Hardware Inventory ({totalCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('licenses')}
            className={`flex items-center gap-1.5 pb-3 border-b-2 transition ${
              activeTab === 'licenses'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Key className="h-4 w-4" />
            <span>Software Licenses ({licenses.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 pb-3 border-b-2 transition ${
              activeTab === 'history'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Global Assignment Log</span>
          </button>
        </div>

        {/* Summary Metrics (6 KPI Cards) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">TOTAL ASSETS</span>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{metrics.totalAssets || 0}</p>
            <span className="text-[10px] text-slate-400">Tracked in system</span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">ASSIGNED</span>
            <p className="mt-2 text-2xl font-extrabold text-orange-600">{metrics.assignedAssets || 0}</p>
            <span className="text-[10px] text-slate-400">With employees</span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">AVAILABLE</span>
            <p className="mt-2 text-2xl font-extrabold text-emerald-600">{metrics.availableAssets || 0}</p>
            <span className="text-[10px] text-slate-400">Ready for checkout</span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">MAINTENANCE</span>
            <p className="mt-2 text-2xl font-extrabold text-amber-600">{metrics.maintenanceAssets || 0}</p>
            <span className="text-[10px] text-slate-400">Repair / Damaged</span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">WARRANTIES</span>
            <p className="mt-2 text-2xl font-extrabold text-amber-600">{metrics.expiringWarranties || 0}</p>
            <span className="text-[10px] text-slate-400">Expiring in 30 days</span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">LICENSES</span>
            <p className="mt-2 text-2xl font-extrabold text-orange-600">{licenses.length}</p>
            <span className="text-[10px] text-slate-400">{metrics.expiringLicenses || 0} expiring soon</span>
          </div>
        </div>

        {/* Tab 1: Hardware Inventory */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            {/* Filters & Search Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-sm text-xs">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by asset tag, name, employee, or ID..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-4 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl border border-slate-200 p-2 bg-slate-50 font-medium text-slate-700 text-xs"
                >
                  <option value="All">All Categories</option>
                  <option value="Laptop">Laptop</option>
                  <option value="Desktop">Desktop</option>
                  <option value="Monitor">Monitor</option>
                  <option value="Mobile">Mobile</option>
                  <option value="Keyboard">Keyboard</option>
                  <option value="Mouse">Mouse</option>
                  <option value="ID Card">ID Card</option>
                  <option value="SIM">SIM</option>
                  <option value="Other">Other</option>
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl border border-slate-200 p-2 bg-slate-50 font-medium text-slate-700 text-xs"
                >
                  <option value="All">All Statuses</option>
                  <option value="AVAILABLE">Available (In Stock)</option>
                  <option value="ASSIGNED">Assigned to Employee</option>
                  <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                  <option value="LOST">Lost</option>
                  <option value="RETIRED">Retired</option>
                </select>
              </div>
            </div>

            {/* Inventory Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 font-semibold">
                      <th className="px-4 py-3.5">Asset Tag</th>
                      <th className="px-4 py-3.5">Asset Name & Brand</th>
                      <th className="px-4 py-3.5">Category</th>
                      <th className="px-4 py-3.5">Assigned Employee</th>
                      <th className="px-4 py-3.5">Employee ID</th>
                      <th className="px-4 py-3.5">Assignment Date</th>
                      <th className="px-4 py-3.5">Storage Location</th>
                      <th className="px-4 py-3.5">Asset Status</th>
                      <th className="px-4 py-3.5">Warranty Expiry</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="py-16 text-center text-slate-400">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-orange-500 mb-2" />
                          <span>Loading assets inventory...</span>
                        </td>
                      </tr>
                    ) : assets.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-16 text-center">
                          <div className="flex flex-col items-center justify-center text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                              <Laptop className="h-6 w-6" />
                            </div>
                            <h4 className="mt-3 text-sm font-bold text-slate-800">
                              {search || selectedCategory !== 'All' || selectedStatus !== 'All'
                                ? 'No assets matching criteria'
                                : 'No assets registered yet'}
                            </h4>
                            <p className="mt-1 max-w-xs text-xs text-slate-500">
                              {search || selectedCategory !== 'All' || selectedStatus !== 'All'
                                ? 'Try clearing your search keyword or resetting filters.'
                                : 'Click "Add Asset" to register your first hardware device.'}
                            </p>
                            {!(search || selectedCategory !== 'All' || selectedStatus !== 'All') && (
                              <button
                                onClick={() => {
                                  setFormData({
                                    category: 'Laptop',
                                    name: '',
                                    brand: '',
                                    model: '',
                                    serialNumber: '',
                                    assetTag: '',
                                    condition: 'GOOD',
                                    status: 'AVAILABLE',
                                    location: 'Headquarters',
                                    purchaseDate: '',
                                    purchaseCost: '',
                                    currency: 'INR',
                                    warrantyExpiry: '',
                                    vendor: '',
                                    invoiceNumber: '',
                                    notes: '',
                                    specifications: {},
                                    assignedToEmployeeId: '',
                                    assignmentDate: '',
                                    expectedReturnDate: '',
                                    assignmentNotes: '',
                                  });
                                  setShowAddModal(true);
                                }}
                                className="mt-4 flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-orange-600 transition"
                              >
                                <Plus className="h-4 w-4" />
                                <span>Add Asset</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      assets.map((asset) => (
                        <tr key={asset._id} className="hover:bg-slate-50/60 transition">
                          {/* 1. Asset Tag */}
                          <td className="px-4 py-3.5 font-mono font-bold text-orange-600">
                            <div>{asset.assetTag}</div>
                            {asset.serialNumber && (
                              <div className="text-[10px] font-normal text-slate-400">SN: {asset.serialNumber}</div>
                            )}
                          </td>

                          {/* 2. Asset Name & Brand */}
                          <td className="px-4 py-3.5">
                            <p className="font-bold text-slate-900">{asset.name}</p>
                            <p className="text-[10px] text-slate-400">
                              {[asset.brand, asset.model].filter(Boolean).join(' ') || 'Standard Asset'}
                            </p>
                          </td>

                          {/* 3. Category */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 font-medium text-slate-700">
                              {getCategoryIcon(asset.category)}
                              <span>{asset.category}</span>
                            </div>
                          </td>

                          {/* 4. Assigned Employee */}
                          <td className="px-4 py-3.5">
                            {asset.assignedTo ? (
                              <div className="flex items-center gap-2">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFF7ED] text-orange-700 font-bold text-[10px] border border-[#FED7AA]">
                                  {asset.assignedTo.employeeName.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-bold text-slate-900 text-xs">
                                  {asset.assignedTo.employeeName}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                                Unassigned
                              </span>
                            )}
                          </td>

                          {/* 5. Employee ID */}
                          <td className="px-4 py-3.5 font-mono">
                            {asset.assignedTo?.employeeId ? (
                              <span className="font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                {asset.assignedTo.employeeId}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono">-</span>
                            )}
                          </td>

                          {/* 6. Assignment Date */}
                          <td className="px-4 py-3.5 text-slate-600">
                            {asset.assignedTo?.assignedAt ? (
                              <span>{new Date(asset.assignedTo.assignedAt).toLocaleDateString()}</span>
                            ) : (
                              <span className="text-slate-400 font-mono">-</span>
                            )}
                          </td>

                          {/* 7. Storage Location */}
                          <td className="px-4 py-3.5 text-slate-700">
                            {asset.location || 'Headquarters'}
                          </td>

                          {/* 8. Asset Status */}
                          <td className="px-4 py-3.5">
                            {getStatusBadge(asset.status)}
                          </td>

                          {/* 9. Warranty Expiry */}
                          <td className="px-4 py-3.5 text-slate-600">
                            {asset.warrantyExpiry ? (
                              <span>{new Date(asset.warrantyExpiry).toLocaleDateString()}</span>
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                          </td>

                          {/* 10. Actions */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* View Details */}
                              <button
                                onClick={() => handleViewDetails(asset)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-orange-600 hover:bg-orange-50 transition"
                                title="View Details & History"
                              >
                                <Eye className="h-4 w-4" />
                              </button>

                              {/* Assign (when AVAILABLE) */}
                              {asset.status === 'AVAILABLE' && (
                                <>
                                  <button
                                    onClick={() => handleOpenAssign(asset)}
                                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition"
                                    title="Assign to Employee"
                                  >
                                    <UserPlus className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleSendToMaintenance(asset)}
                                    className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition"
                                    title="Send to Maintenance"
                                  >
                                    <AlertTriangle className="h-4 w-4" />
                                  </button>
                                </>
                              )}

                              {/* Reassign & Return (when ASSIGNED) */}
                              {asset.status === 'ASSIGNED' && (
                                <>
                                  <button
                                    onClick={() => handleOpenReassign(asset)}
                                    className="p-1.5 rounded-lg text-orange-600 hover:bg-orange-50 transition"
                                    title="Reassign to Another Employee"
                                  >
                                    <UserCheck className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleOpenReturn(asset)}
                                    className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition"
                                    title="Return Asset"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </button>
                                </>
                              )}

                              {/* Complete Maintenance (when UNDER_MAINTENANCE) */}
                              {asset.status === 'UNDER_MAINTENANCE' && (
                                <button
                                  onClick={() => handleCompleteMaintenance(asset)}
                                  className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition"
                                  title="Complete Maintenance (Return to Stock)"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>
                              )}

                              {/* Edit Asset */}
                              <button
                                onClick={() => handleOpenEdit(asset)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-orange-600 hover:bg-orange-50 transition"
                                title="Edit Asset"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>

                              {/* Archive / Delete (only when not assigned) */}
                              {asset.status !== 'ASSIGNED' && (
                                <button
                                  onClick={() => handleDeleteAsset(asset)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                  title="Archive Asset"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing page {page} of {totalPages} ({totalCount} total assets)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-semibold text-slate-800 px-2">{page}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {/* Tab 2: Software Licenses */}
        {activeTab === 'licenses' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Software Licenses Catalog</h3>
                <p className="text-xs text-slate-500">Manage seats purchased, allocations, and expiry renewals.</p>
              </div>
              <button
                onClick={() => setShowAddLicenseModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:bg-orange-600 transition"
              >
                <Plus className="h-4 w-4" />
                <span>Add Software License</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {licenses.map((lic) => {
                const total = lic.totalSeats || 1;
                const assigned = lic.assignedSeats || 0;
                const pct = Math.min(100, Math.round((assigned / total) * 100));

                return (
                  <div key={lic._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60">
                          <Key className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-xs">{lic.name}</h4>
                          <p className="text-[10px] text-slate-400">{lic.vendor} &bull; {lic.licenseType}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        lic.renewalStatus === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : lic.renewalStatus === 'EXPIRING_SOON'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {lic.renewalStatus}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600">Seat Utilization</span>
                        <span className="font-bold text-slate-900">
                          {assigned} / {total} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-orange-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-100 pt-2.5">
                      <div>
                        <span>Expiry: </span>
                        <span className="font-semibold text-slate-700">{lic.expiryDate || 'Perpetual'}</span>
                      </div>
                      {lic.cost && (
                        <div>
                          <span>Cost: </span>
                          <span className="font-semibold text-slate-700">{lic.currency} {lic.cost}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                      <button
                        onClick={() => handleOpenManageLicense(lic)}
                        className="flex items-center gap-1 text-xs font-semibold text-orange-700 hover:bg-[#FFEDD5] bg-[#FFF7ED] px-3 py-1.5 rounded-xl border border-[#FED7AA] transition"
                      >
                        <UserPlus className="h-3.5 w-3.5 text-orange-500" />
                        <span>Manage Seats ({assigned})</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Global Assignment Log */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {/* Filter and Search Bar for History */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-sm text-xs">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search asset, employee, agent, notes..."
                  value={historySearch}
                  onChange={(e) => {
                    setHistorySearch(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-4 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={historyStatus}
                  onChange={(e) => {
                    setHistoryStatus(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="rounded-xl border border-slate-200 p-2 bg-slate-50 font-medium text-slate-700 text-xs"
                >
                  <option value="All">All Events</option>
                  <option value="ACTIVE">Active Checkouts</option>
                  <option value="RETURNED">Returned Items</option>
                </select>

                <button
                  onClick={fetchAssignmentHistory}
                  className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
                  title="Refresh History"
                >
                  <RefreshCw className={`h-4 w-4 text-slate-500 ${historyLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* History Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 font-semibold">
                      <th className="px-4 py-3.5">Asset</th>
                      <th className="px-4 py-3.5">Employee</th>
                      <th className="px-4 py-3.5">Checkout Details</th>
                      <th className="px-4 py-3.5">Condition Out</th>
                      <th className="px-4 py-3.5">Check-In Details</th>
                      <th className="px-4 py-3.5">Condition In</th>
                      <th className="px-4 py-3.5">Return Remarks</th>
                      <th className="px-4 py-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyLoading ? (
                      <tr>
                        <td colSpan={10} className="py-16 text-center text-slate-400">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-orange-500 mb-2" />
                          <span>Loading assignment history logs...</span>
                        </td>
                      </tr>
                    ) : globalHistory.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-16 text-center">
                          <div className="flex flex-col items-center justify-center text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                              <Clock className="h-6 w-6" />
                            </div>
                            <h4 className="mt-3 text-sm font-bold text-slate-800">
                              {historySearch || historyStatus !== 'All'
                                ? 'No assignment events found'
                                : 'No assignment history yet'}
                            </h4>
                            <p className="mt-1 max-w-xs text-xs text-slate-500">
                              {historySearch || historyStatus !== 'All'
                                ? 'Try adjusting your search criteria.'
                                : 'When assets are checked out and returned, chronological logs will appear here.'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      globalHistory.map((h) => (
                        <tr key={h._id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3.5">
                            <p className="font-mono font-bold text-orange-600">{h.assetTag}</p>
                            <div className="flex items-center gap-1 text-[10px] text-slate-500">
                              {getCategoryIcon(h.category)}
                              <span className="font-medium truncate max-w-[140px]">{h.assetName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-bold text-slate-900">{h.employeeName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{h.employeeId}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-slate-800">{new Date(h.assignedAt).toLocaleDateString()}</p>
                            <p className="text-[10px] text-slate-400">By: {h.assignedByName || 'Admin'}</p>
                          </td>
                          <td className="px-4 py-3.5">{getConditionBadge(h.conditionAtAssignment)}</td>
                          <td className="px-4 py-3.5">
                            {h.returnedAt ? (
                              <div>
                                <p className="font-semibold text-slate-800">{new Date(h.returnedAt).toLocaleDateString()}</p>
                                <p className="text-[10px] text-slate-400">By: {h.returnedByName || 'Admin'}</p>
                              </div>
                            ) : (
                              <span className="text-amber-600 font-semibold text-[10px] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Currently Checked Out</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">{h.conditionAtReturn ? getConditionBadge(h.conditionAtReturn) : <span className="text-slate-400">-</span>}</td>
                          <td className="px-4 py-3.5 text-slate-600 max-w-[200px] truncate">{h.returnNotes || <span className="text-slate-400 italic">None</span>}</td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              h.status === 'ACTIVE'
                                ? 'bg-[#FFF7ED] text-orange-700 border border-[#FED7AA]'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}>
                              {h.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination for History */}
            {historyTotalPages > 1 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing page {historyPage} of {historyTotalPages} ({historyTotalCount} total logs)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-semibold text-slate-800 px-2">{historyPage}</span>
                  <button
                    onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                    disabled={historyPage === historyTotalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= MODAL: ADD ASSET ================= */}
      {showAddModal && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Laptop className="h-5 w-5 text-orange-500" />
                <h3 className="font-bold text-slate-900 text-lg">Add New Hardware Asset</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Asset Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    required
                  >
                    <option value="Laptop">Laptop</option>
                    <option value="Desktop">Desktop</option>
                    <option value="Monitor">Monitor</option>
                    <option value="Mobile">Mobile</option>
                    <option value="Keyboard">Keyboard</option>
                    <option value="Mouse">Mouse</option>
                    <option value="ID Card">ID Card</option>
                    <option value="SIM">SIM</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Asset Name / Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. MacBook Pro 16 M3 Max, Dell 27 4K"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Asset Tag (Optional)</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if left blank (e.g. AST-LPT-0001)"
                    value={formData.assetTag}
                    onChange={(e) => setFormData({ ...formData, assetTag: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Brand & Manufacturer</label>
                  <input
                    type="text"
                    placeholder="e.g. Apple, Dell, Lenovo, Samsung, Airtel"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Model / Series</label>
                  <input
                    type="text"
                    placeholder="e.g. A2991, XPS 15 9530, Galaxy S24"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Serial Number</label>
                  <input
                    type="text"
                    placeholder="Unique device serial number"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono"
                  />
                </div>

                {/* Category Dynamic Specifications */}
                {formData.category === 'Mobile' && (
                  <>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">IMEI 1 (Mobile)</label>
                      <input
                        type="text"
                        placeholder="15-digit primary IMEI"
                        value={formData.specifications?.imei || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            specifications: { ...formData.specifications, imei: e.target.value },
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">IMEI 2 (Optional)</label>
                      <input
                        type="text"
                        placeholder="Secondary IMEI"
                        value={formData.specifications?.imei2 || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            specifications: { ...formData.specifications, imei2: e.target.value },
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono"
                      />
                    </div>
                  </>
                )}

                {formData.category === 'SIM' && (
                  <>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Carrier & Operator</label>
                      <input
                        type="text"
                        placeholder="e.g. Airtel, Jio, Vodafone"
                        value={formData.specifications?.carrier || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            specifications: { ...formData.specifications, carrier: e.target.value },
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                      <input
                        type="text"
                        placeholder="e.g. +91 9876543210"
                        value={formData.specifications?.phoneNumber || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            specifications: { ...formData.specifications, phoneNumber: e.target.value },
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">SIM Number / ICCID</label>
                      <input
                        type="text"
                        placeholder="20-digit SIM ICCID"
                        value={formData.specifications?.simNumber || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            specifications: { ...formData.specifications, simNumber: e.target.value },
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono"
                      />
                    </div>
                  </>
                )}

                {formData.category === 'ID Card' && (
                  <>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Card Identifier / Badge #</label>
                      <input
                        type="text"
                        placeholder="e.g. IDC-998812"
                        value={formData.specifications?.cardIdentifier || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            specifications: { ...formData.specifications, cardIdentifier: e.target.value },
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Access Level</label>
                      <input
                        type="text"
                        placeholder="e.g. All Floors, Server Room, Standard"
                        value={formData.specifications?.accessLevel || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            specifications: { ...formData.specifications, accessLevel: e.target.value },
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                      />
                    </div>
                  </>
                )}

                {(formData.category === 'Laptop' || formData.category === 'Desktop') && (
                  <>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">RAM / Memory</label>
                      <input
                        type="text"
                        placeholder="e.g. 16GB Unified, 32GB DDR5"
                        value={formData.specifications?.ram || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            specifications: { ...formData.specifications, ram: e.target.value },
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Storage / SSD</label>
                      <input
                        type="text"
                        placeholder="e.g. 512GB NVMe SSD, 1TB"
                        value={formData.specifications?.storage || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            specifications: { ...formData.specifications, storage: e.target.value },
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Initial Condition</label>
                  <select
                    value={formData.condition}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800"
                  >
                    <option value="NEW">New (Brand New in Box)</option>
                    <option value="EXCELLENT">Excellent</option>
                    <option value="GOOD">Good</option>
                    <option value="FAIR">Fair</option>
                    <option value="DAMAGED">Damaged</option>
                    <option value="DEFECTIVE">Defective</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Storage Location</label>
                  <input
                    type="text"
                    placeholder="e.g. HQ - IT Room, Remote, Mumbai"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Purchase Date</label>
                  <input
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Warranty Expiry Date</label>
                  <input
                    type="date"
                    value={formData.warrantyExpiry}
                    onChange={(e) => setFormData({ ...formData, warrantyExpiry: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Purchase Cost</label>
                  <input
                    type="number"
                    placeholder="e.g. 85000"
                    value={formData.purchaseCost}
                    onChange={(e) => setFormData({ ...formData, purchaseCost: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vendor / Supplier</label>
                  <input
                    type="text"
                    placeholder="e.g. Croma, Apple Direct, Dell Enterprise"
                    value={formData.vendor}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 text-xs">Internal Notes</label>
                <textarea
                  rows={2}
                  placeholder="Asset provenance, warranty notes, special instructions..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>

              {/* Assign to Employee (Optional) Section */}
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-xs">
                    Assign to Employee (Optional)
                  </label>
                  <select
                    value={formData.assignedToEmployeeId || ''}
                    onChange={(e) => {
                      const empId = e.target.value;
                      setFormData({
                        ...formData,
                        assignedToEmployeeId: empId,
                        assignmentDate: empId ? (formData.assignmentDate || new Date().toISOString().split('T')[0]) : '',
                      });
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    <option value="">-- Unassigned / Inventory (In Stock) --</option>
                    {employees.map((emp) => (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.fullName} ({emp.employeeId}){emp.department ? ` • ${emp.department}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Leave unassigned to store in inventory, or select an active employee to assign immediately.
                  </p>
                </div>

                {Boolean(formData.assignedToEmployeeId) && (
                  <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED]/60 p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-orange-600" />
                        <span className="font-bold text-slate-900 text-xs">Assignment Preview & Details</span>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF7ED] text-orange-700 border border-[#FED7AA]">
                        Status: ASSIGNED
                      </span>
                    </div>

                    {(() => {
                      const selectedEmp = employees.find((e) => e.employeeId === formData.assignedToEmployeeId);
                      return (
                        <div className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-orange-100 text-xs">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF7ED] text-orange-700 font-bold border border-[#FED7AA]">
                            {selectedEmp?.fullName?.charAt(0) || 'E'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{selectedEmp?.fullName || formData.assignedToEmployeeId}</p>
                            <p className="text-[11px] text-slate-500">
                              ID: <span className="font-mono font-semibold">{selectedEmp?.employeeId}</span> &bull; {selectedEmp?.department || 'Staff'} {selectedEmp?.designation ? `(${selectedEmp.designation})` : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Assignment Date *</label>
                        <input
                          type="date"
                          value={formData.assignmentDate || new Date().toISOString().split('T')[0]}
                          onChange={(e) => setFormData({ ...formData, assignmentDate: e.target.value })}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800"
                          required={Boolean(formData.assignedToEmployeeId)}
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Expected Return Date</label>
                        <input
                          type="date"
                          value={formData.expectedReturnDate || ''}
                          onChange={(e) => setFormData({ ...formData, expectedReturnDate: e.target.value })}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 text-xs">Assignment Notes</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Primary workstation for onboarding, delivered with charger and accessories..."
                        value={formData.assignmentNotes || ''}
                        onChange={(e) => setFormData({ ...formData, assignmentNotes: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2.5 text-xs bg-white text-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-500 text-xs font-semibold text-white hover:bg-orange-600 shadow-xs"
                >
                  Create Asset
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* ================= MODAL: EDIT ASSET ================= */}
      {showEditModal && selectedAsset && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Edit Asset: {selectedAsset.assetTag}</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Asset Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Model</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Condition</label>
                  <select
                    value={formData.condition}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white"
                  >
                    <option value="NEW">New</option>
                    <option value="EXCELLENT">Excellent</option>
                    <option value="GOOD">Good</option>
                    <option value="FAIR">Fair</option>
                    <option value="DAMAGED">Damaged</option>
                    <option value="DEFECTIVE">Defective</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Internal Notes</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-500 text-xs font-semibold text-white hover:bg-orange-600 shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* ================= MODAL: ASSIGN ASSET ================= */}
      {showAssignModal && selectedAsset && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-orange-500" />
                <h3 className="font-bold text-slate-900 text-base">Assign Asset to Employee</h3>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1">
              <p className="font-bold text-slate-900">{selectedAsset.name}</p>
              <p className="font-mono text-orange-600 font-semibold">{selectedAsset.assetTag}</p>
              <p className="text-slate-500">{selectedAsset.category} &bull; Condition: {selectedAsset.condition}</p>
            </div>

            <form onSubmit={handleAssignSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Employee *</label>
                <select
                  value={assignForm.employeeId}
                  onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800"
                  required
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.employeeId} value={emp.employeeId}>
                      {emp.fullName} ({emp.employeeId}) &bull; {emp.department || 'Staff'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Expected Return Date</label>
                <input
                  type="date"
                  value={assignForm.expectedReturnDate}
                  onChange={(e) => setAssignForm({ ...assignForm, expectedReturnDate: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assignment Condition</label>
                <select
                  value={assignForm.conditionAtAssignment}
                  onChange={(e) => setAssignForm({ ...assignForm, conditionAtAssignment: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800"
                >
                  <option value="NEW">New</option>
                  <option value="EXCELLENT">Excellent</option>
                  <option value="GOOD">Good</option>
                  <option value="FAIR">Fair</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assignment Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Handed over with charger and laptop sleeve..."
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-500 text-xs font-semibold text-white hover:bg-orange-600 shadow-xs"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* ================= MODAL: RETURN ASSET ================= */}
      {showReturnModal && selectedAsset && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-base">Check In / Return Asset</h3>
              </div>
              <button onClick={() => setShowReturnModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1">
              <p className="font-bold text-slate-900">{selectedAsset.name}</p>
              <p className="font-mono text-orange-600 font-semibold">{selectedAsset.assetTag}</p>
              <p className="text-slate-500">
                Returning from: <span className="font-semibold text-slate-800">{selectedAsset.assignedTo?.employeeName}</span> ({selectedAsset.assignedTo?.employeeId})
              </p>
            </div>

            <form onSubmit={handleReturnSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Actual Return Date *</label>
                <input
                  type="date"
                  value={returnForm.returnDate || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setReturnForm({ ...returnForm, returnDate: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Return Condition *</label>
                <select
                  value={returnForm.returnCondition}
                  onChange={(e) => {
                    const cond = e.target.value;
                    const nextStat = ['DAMAGED', 'DEFECTIVE'].includes(cond) ? 'UNDER_MAINTENANCE' : 'AVAILABLE';
                    setReturnForm({ ...returnForm, returnCondition: cond, newStatus: nextStat });
                  }}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800"
                  required
                >
                  <option value="NEW">New (Unused condition)</option>
                  <option value="EXCELLENT">Excellent</option>
                  <option value="GOOD">Good (Normal wear)</option>
                  <option value="FAIR">Fair</option>
                  <option value="DAMAGED">Damaged (Needs repair)</option>
                  <option value="DEFECTIVE">Defective (Non-functional)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Destination Status</label>
                <select
                  value={returnForm.newStatus}
                  onChange={(e) => setReturnForm({ ...returnForm, newStatus: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800"
                >
                  <option value="AVAILABLE">Available (Stock)</option>
                  <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                  <option value="RETIRED">Retired</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Return Inspection Notes</label>
                <textarea
                  rows={2}
                  placeholder="Scratch on lid, missing HDMI adapter, reset completed..."
                  value={returnForm.returnNotes}
                  onChange={(e) => setReturnForm({ ...returnForm, returnNotes: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700 shadow-xs"
                >
                  Confirm Return
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* ================= MODAL: REASSIGN ASSET ================= */}
      {showReassignModal && selectedAsset && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-orange-500" />
                <h3 className="font-bold text-slate-900 text-base">Reassign Hardware Asset</h3>
              </div>
              <button onClick={() => setShowReassignModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1">
              <p className="font-bold text-slate-900">{selectedAsset.name}</p>
              <p className="font-mono text-orange-600 font-semibold">{selectedAsset.assetTag}</p>
              <p className="text-slate-500">{selectedAsset.category} &bull; Model: {selectedAsset.model || 'N/A'}</p>
            </div>

            {/* Current Assignee Card */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">Current Assignee</span>
              <p className="font-bold text-slate-900">{selectedAsset.assignedTo?.employeeName || 'Unknown'}</p>
              <p className="text-slate-600 font-mono text-[11px]">
                ID: {selectedAsset.assignedTo?.employeeId} &bull; Assigned since: {selectedAsset.assignedTo?.assignedAt ? new Date(selectedAsset.assignedTo.assignedAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>

            <form onSubmit={handleReassignSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Assignee (Employee) *</label>
                <select
                  value={reassignForm.newEmployeeId}
                  onChange={(e) => setReassignForm({ ...reassignForm, newEmployeeId: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  required
                >
                  <option value="">-- Choose New Assignee --</option>
                  {employees
                    .filter((emp) => emp.employeeId !== selectedAsset.assignedTo?.employeeId)
                    .map((emp) => (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.fullName} ({emp.employeeId}){emp.department ? ` • ${emp.department}` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {Boolean(reassignForm.newEmployeeId) && (() => {
                const newEmp = employees.find((e) => e.employeeId === reassignForm.newEmployeeId);
                return (
                  <div className="flex items-center gap-2.5 bg-[#FFF7ED]/70 p-2.5 rounded-xl border border-[#FED7AA] text-xs">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFF7ED] text-orange-700 font-bold text-xs border border-[#FED7AA]">
                      {newEmp?.fullName?.charAt(0) || 'N'}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{newEmp?.fullName}</p>
                      <p className="text-[11px] text-slate-500">
                        {newEmp?.employeeId} &bull; {newEmp?.department || 'Staff'} {newEmp?.designation ? `(${newEmp.designation})` : ''}
                      </p>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Reassignment Date *</label>
                  <input
                    type="date"
                    value={reassignForm.assignmentDate}
                    onChange={(e) => setReassignForm({ ...reassignForm, assignmentDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expected Return Date</label>
                  <input
                    type="date"
                    value={reassignForm.expectedReturnDate}
                    onChange={(e) => setReassignForm({ ...reassignForm, expectedReturnDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Previous Employee Return Condition
                  </label>
                  <select
                    value={reassignForm.previousReturnCondition}
                    onChange={(e) => setReassignForm({ ...reassignForm, previousReturnCondition: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800"
                  >
                    <option value="NEW">New</option>
                    <option value="EXCELLENT">Excellent</option>
                    <option value="GOOD">Good (Normal Wear)</option>
                    <option value="FAIR">Fair</option>
                    <option value="DAMAGED">Damaged</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Previous Return Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Condition notes when handed over by previous employee..."
                    value={reassignForm.previousReturnNotes}
                    onChange={(e) => setReassignForm({ ...reassignForm, previousReturnNotes: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    New Assignment Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Instructions, purpose of transfer, accessories included..."
                    value={reassignForm.notes}
                    onChange={(e) => setReassignForm({ ...reassignForm, notes: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-500 text-xs font-semibold text-white hover:bg-orange-600 shadow-xs"
                >
                  Confirm Reassignment
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* ================= MODAL: ASSET DETAILS & AUDIT DRAWER ================= */}
      {showDetailsModal && selectedAsset && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF7ED] text-orange-500 border border-[#FED7AA]/60">
                  <Laptop className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{selectedAsset.name}</h3>
                  <p className="font-mono text-xs text-orange-600 font-semibold">{selectedAsset.assetTag}</p>
                </div>
              </div>
              <button onClick={() => setShowDetailsModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Specifications & Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-slate-400 text-[11px] block">Category</span>
                <span className="font-semibold text-slate-800">{selectedAsset.category}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Brand / Model</span>
                <span className="font-semibold text-slate-800">{selectedAsset.brand} {selectedAsset.model}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Serial Number</span>
                <span className="font-mono font-semibold text-slate-800">{selectedAsset.serialNumber || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Condition</span>
                <span className="font-semibold text-slate-800">{selectedAsset.condition}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Current Status</span>
                <span className="font-semibold text-slate-800">{selectedAsset.status}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Location</span>
                <span className="font-semibold text-slate-800">{selectedAsset.location}</span>
              </div>
              {selectedAsset.specifications?.imei && (
                <div>
                  <span className="text-slate-400 text-[11px] block">IMEI</span>
                  <span className="font-mono font-semibold text-slate-800">{selectedAsset.specifications.imei}</span>
                </div>
              )}
              {selectedAsset.specifications?.simNumber && (
                <div>
                  <span className="text-slate-400 text-[11px] block">SIM ICCID</span>
                  <span className="font-mono font-semibold text-slate-800">{selectedAsset.specifications.simNumber}</span>
                </div>
              )}
              {selectedAsset.specifications?.phoneNumber && (
                <div>
                  <span className="text-slate-400 text-[11px] block">Phone #</span>
                  <span className="font-mono font-semibold text-slate-800">{selectedAsset.specifications.phoneNumber}</span>
                </div>
              )}
              {selectedAsset.warrantyExpiry && (
                <div>
                  <span className="text-slate-400 text-[11px] block">Warranty Expiry</span>
                  <span className="font-semibold text-orange-700">{selectedAsset.warrantyExpiry}</span>
                </div>
              )}
              {selectedAsset.purchaseCost && (
                <div>
                  <span className="text-slate-400 text-[11px] block">Purchase Cost</span>
                  <span className="font-semibold text-slate-800">{selectedAsset.currency} {selectedAsset.purchaseCost}</span>
                </div>
              )}
              {selectedAsset.vendor && (
                <div>
                  <span className="text-slate-400 text-[11px] block">Vendor</span>
                  <span className="font-semibold text-slate-800">{selectedAsset.vendor}</span>
                </div>
              )}
            </div>

            {/* Current Assignment Details */}
            {selectedAsset.assignedTo ? (
              <div className="rounded-xl border border-[#FED7AA]/80 bg-[#FFF7ED]/50 p-4 space-y-1.5 text-xs">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-orange-500" />
                  Currently Assigned Personnel
                </h4>
                <p className="font-bold text-slate-900 text-sm">{selectedAsset.assignedTo.employeeName}</p>
                <p className="text-slate-600">Employee ID: <span className="font-mono font-semibold">{selectedAsset.assignedTo.employeeId}</span></p>
                <p className="text-slate-600">Assigned Date: {new Date(selectedAsset.assignedTo.assignedAt).toLocaleDateString()}</p>
                {selectedAsset.assignedTo.expectedReturnDate && (
                  <p className="text-slate-600">Expected Return: <span className="font-semibold text-amber-700">{selectedAsset.assignedTo.expectedReturnDate}</span></p>
                )}
                {selectedAsset.assignedTo.assignmentNotes && (
                  <p className="text-slate-500 italic mt-1">&ldquo;{selectedAsset.assignedTo.assignmentNotes}&rdquo;</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-emerald-800">
                <span className="font-bold">Currently in Stock.</span> Ready to be checked out to an employee.
              </div>
            )}

            {/* Assignment History Log */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                Asset Checkout & Return History
              </h4>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                {assetDetailsHistory.length === 0 ? (
                  <p className="p-4 text-center text-slate-400">No checkout history recorded for this asset yet.</p>
                ) : (
                  assetDetailsHistory.map((h, i) => (
                    <div key={i} className="p-3 hover:bg-slate-50/50 space-y-1">
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span>{h.employeeName} ({h.employeeId})</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${h.status === 'ACTIVE' ? 'bg-[#FFF7ED] text-orange-700 border border-[#FED7AA]' : 'bg-slate-100 text-slate-600'}`}>
                          {h.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-4">
                        <span>Assigned: {new Date(h.assignedAt).toLocaleDateString()}</span>
                        <span>Condition Out: {h.conditionAtAssignment}</span>
                        {h.returnedAt && <span>Returned: {new Date(h.returnedAt).toLocaleDateString()}</span>}
                        {h.conditionAtReturn && <span>Condition In: {h.conditionAtReturn}</span>}
                      </div>
                      {h.returnNotes && (
                        <p className="text-[11px] text-slate-600 italic">Notes: {h.returnNotes}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ================= MODAL: ADD SOFTWARE LICENSE ================= */}
      {showAddLicenseModal && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-orange-500" />
                <h3 className="font-bold text-slate-900 text-base">Add Software License</h3>
              </div>
              <button onClick={() => setShowAddLicenseModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddLicenseSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Software Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. JetBrains, Figma, Slack"
                    value={licenseForm.name}
                    onChange={(e) => setLicenseForm({ ...licenseForm, name: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vendor *</label>
                  <input
                    type="text"
                    placeholder="e.g. Adobe, Microsoft"
                    value={licenseForm.vendor}
                    onChange={(e) => setLicenseForm({ ...licenseForm, vendor: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">License Type</label>
                  <select
                    value={licenseForm.licenseType}
                    onChange={(e) => setLicenseForm({ ...licenseForm, licenseType: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white"
                  >
                    <option value="SUBSCRIPTION">Subscription</option>
                    <option value="PERPETUAL">Perpetual</option>
                    <option value="ENTERPRISE">Enterprise</option>
                    <option value="PER_SEAT">Per Seat</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Total Seats *</label>
                  <input
                    type="number"
                    min={1}
                    value={licenseForm.totalSeats}
                    onChange={(e) => setLicenseForm({ ...licenseForm, totalSeats: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">License Key / Secret</label>
                <input
                  type="text"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={licenseForm.licenseKey}
                  onChange={(e) => setLicenseForm({ ...licenseForm, licenseKey: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Purchase Date</label>
                  <input
                    type="date"
                    value={licenseForm.purchaseDate}
                    onChange={(e) => setLicenseForm({ ...licenseForm, purchaseDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={licenseForm.expiryDate}
                    onChange={(e) => setLicenseForm({ ...licenseForm, expiryDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Renewal Status</label>
                  <select
                    value={licenseForm.renewalStatus}
                    onChange={(e) => setLicenseForm({ ...licenseForm, renewalStatus: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="EXPIRING_SOON">Expiring Soon</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="AUTO_RENEW">Auto-Renew</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cost (INR)</label>
                  <input
                    type="number"
                    placeholder="e.g. 45000"
                    value={licenseForm.cost}
                    onChange={(e) => setLicenseForm({ ...licenseForm, cost: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddLicenseModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-500 text-xs font-semibold text-white hover:bg-orange-600 shadow-xs"
                >
                  Save License
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* ================= MODAL: MANAGE LICENSE SEATS ================= */}
      {showManageLicenseModal && selectedLicense && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">{selectedLicense.name}</h3>
                <p className="text-xs text-slate-500">
                  {selectedLicense.vendor} &bull; {selectedLicense.assignedSeats} of {selectedLicense.totalSeats} seats assigned
                </p>
              </div>
              <button onClick={() => setShowManageLicenseModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Allocate New Seat Form */}
            {selectedLicense.assignedSeats < selectedLicense.totalSeats ? (
              <form onSubmit={handleLicenseAssignSeat} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2.5 text-xs">
                <span className="font-bold text-slate-800 block">Allocate Seat to Employee</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={licenseAssignForm.employeeId}
                    onChange={(e) => setLicenseAssignForm({ ...licenseAssignForm, employeeId: e.target.value })}
                    className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs bg-white text-slate-800"
                    required
                  >
                    <option value="">-- Select Employee --</option>
                    {employees.map((emp) => (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.fullName} ({emp.employeeId})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Notes (e.g. Project Apollo)"
                    value={licenseAssignForm.notes}
                    onChange={(e) => setLicenseAssignForm({ ...licenseAssignForm, notes: e.target.value })}
                    className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-orange-500 text-white rounded-xl text-xs font-semibold hover:bg-orange-600"
                  >
                    Assign Seat
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-semibold">
                All {selectedLicense.totalSeats} seats have been assigned. Revoke an existing seat or edit license to add more capacity.
              </div>
            )}

            {/* Active Allocations List */}
            <div className="space-y-2 text-xs">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">Current Seat Allocations</span>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {(selectedLicense.allocations || []).length === 0 ? (
                  <p className="p-4 text-center text-slate-400">No employees assigned to this license yet.</p>
                ) : (
                  selectedLicense.allocations?.map((alloc) => (
                    <div key={alloc.allocationId} className="p-3 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <p className="font-semibold text-slate-900">{alloc.employeeName}</p>
                        <p className="text-[11px] text-slate-400">{alloc.employeeId} &bull; Assigned: {new Date(alloc.assignedAt).toLocaleDateString()}</p>
                        {alloc.notes && <p className="text-[11px] text-slate-500 italic">{alloc.notes}</p>}
                      </div>
                      <button
                        onClick={() => handleLicenseRevokeSeat(alloc.allocationId, alloc.employeeName)}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <button
                onClick={() => setShowManageLicenseModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </AdminLayout>
  );
}
