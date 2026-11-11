'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  Mail,
  Phone,
  Building2,
  CheckCircle2,
  Clock,
  UserCheck,
  UserX,
  ChevronRight,
  Eye,
  RotateCcw,
  Calendar,
  Briefcase,
  ChevronLeft,
  Shield,
  User,
  AlertCircle,
  MoreVertical,
  MoreHorizontal,
  Plus,
  Download,
  Share2,
  Network,
  List,
  LayoutGrid,
  TrendingUp,
  Edit2,
  CalendarCheck,
  Send,
  Trash2,
  UserMinus,
  Check,
  FileSpreadsheet,
  FileText,
  Printer,
  ChevronDown,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import AddTeamMemberModal from '@/components/manager/AddTeamMemberModal';
import EditTeamMemberModal from '@/components/manager/EditTeamMemberModal';
import TeamMemberProfileModal from '@/components/manager/TeamMemberProfileModal';
import TeamMemberAttendanceModal from '@/components/manager/TeamMemberAttendanceModal';
import TeamMemberLeaveModal from '@/components/manager/TeamMemberLeaveModal';
import RemoveTeamMemberModal from '@/components/manager/RemoveTeamMemberModal';
import TeamHierarchyView from '@/components/manager/TeamHierarchyView';

interface TodayAttendance {
  date: string;
  status: 'Present' | 'Late' | 'Half Day' | 'Absent' | 'On Leave' | 'Not Marked' | string;
  clockIn: string | null;
  clockOut: string | null;
  workHours: string | null;
}

export interface TeamMember {
  id: string;
  employeeId: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  phone?: string;
  department: string;
  designation: string;
  status: string;
  joiningDate?: string;
  managerId?: string;
  reportingTo?: string;
  photoUrl?: string | null;
  todayAttendance: TodayAttendance;
}

interface TeamKPIs {
  totalTeamMembers: number;
  activeMembersCount: number;
  presentTodayCount: number;
  onLeaveTodayCount: number;
  pendingLeavesCount: number;
}

interface AvailableFilters {
  departments: string[];
  designations: string[];
  statuses: string[];
}

export default function ManagerTeamPage() {
  const { user } = useAuthStore();

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [allTeamMembers, setAllTeamMembers] = useState<TeamMember[]>([]);
  const [kpis, setKpis] = useState<TeamKPIs>({
    totalTeamMembers: 0,
    activeMembersCount: 0,
    presentTodayCount: 0,
    onLeaveTodayCount: 0,
    pendingLeavesCount: 0,
  });
  const [filters, setFilters] = useState<AvailableFilters>({
    departments: [],
    designations: [],
    statuses: [],
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tab & View Switcher State
  const [activeTab, setActiveTab] = useState<'team' | 'hierarchy'>('team');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');


  // Filter States
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [designationFilter, setDesignationFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [attendanceFilter, setAttendanceFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const hasLoadedAllRef = useRef(false);

  // Debounce search input by 300ms to avoid excessive API requests
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Action Menu Dropdown State
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  // Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [profileMember, setProfileMember] = useState<TeamMember | null>(null);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [attendanceMember, setAttendanceMember] = useState<TeamMember | null>(null);
  const [leaveMember, setLeaveMember] = useState<TeamMember | null>(null);
  const [removeMember, setRemoveMember] = useState<TeamMember | null>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setIsExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const fetchTeamData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: '10',
        search: debouncedSearch.trim(),
        department: departmentFilter,
        designation: designationFilter,
        status: statusFilter,
        attendanceStatus: attendanceFilter,
      });

      const res = await fetch(`/api/v1/manager/team?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access Denied: You do not have permission to view team members.');
        }
        throw new Error(`Failed to load team members (HTTP ${res.status}).`);
      }

      const json = await res.json();
      if (json.success && json.data) {
        setTeamMembers(json.data.teamMembers || []);
        if (json.data.kpis) setKpis(json.data.kpis);
        if (json.data.filters) setFilters(json.data.filters);
        if (json.data.pagination) setPagination(json.data.pagination);
      } else {
        throw new Error(json.message || 'Failed to parse team response.');
      }

      // Fetch all team members for hierarchy tree if not yet loaded or on manual refresh
      if (!hasLoadedAllRef.current || showRefreshing) {
        const allRes = await fetch('/api/v1/manager/team?limit=200');
        const allJson = await allRes.json();
        if (allJson.success && allJson.data?.teamMembers) {
          setAllTeamMembers(allJson.data.teamMembers);
          hasLoadedAllRef.current = true;
        }
      }
    } catch (err: any) {
      console.error('Error fetching manager team data:', err);
      setErrorMsg(err.message || 'Unable to connect to server.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentPage, debouncedSearch, departmentFilter, designationFilter, statusFilter, attendanceFilter]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  const handleResetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setDepartmentFilter('All');
    setDesignationFilter('All');
    setStatusFilter('All');
    setAttendanceFilter('All');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(
    search.trim() !== '' ||
    departmentFilter !== 'All' ||
    designationFilter !== 'All' ||
    statusFilter !== 'All' ||
    attendanceFilter !== 'All'
  );


  const handleExportCSV = () => {
    setIsExportOpen(false);
    const headers = [
      'Employee ID',
      'Name',
      'Email',
      'Phone',
      'Department',
      'Designation',
      'Status',
      'Joining Date',
      'Today Attendance',
      'Clock In',
      'Clock Out',
      'Work Hours',
    ];
    const rows = teamMembers.map((m) => [
      m.employeeId,
      `"${m.name}"`,
      m.email,
      m.phone || '',
      `"${m.department}"`,
      `"${m.designation}"`,
      m.status,
      m.joiningDate || '',
      m.todayAttendance?.status || 'Not Marked',
      m.todayAttendance?.clockIn || '',
      m.todayAttendance?.clockOut || '',
      m.todayAttendance?.workHours || '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `My_Team_Report_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    setIsExportOpen(false);
    handleExportCSV();
  };

  const handlePrint = () => {
    setIsExportOpen(false);
    window.print();
  };

  const getAttendanceBadgeClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'present':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'late':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'half day':
      case 'half_day':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'on leave':
      case 'leave':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'absent':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getEmploymentStatusBadgeClass = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s === 'on leave' || s === 'leave') return 'bg-purple-50 text-purple-700 border-purple-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const managerDisplayName = user?.name || 'Manager';
  const managerEmpId = user?.employeeId || user?.id || '';

  const presentPercent =
    kpis.totalTeamMembers > 0
      ? Math.round((kpis.presentTodayCount / kpis.totalTeamMembers) * 100)
      : 0;

  return (
    <div className="space-y-4 font-sans">
      {/* 1. Header Toolbar: Heading & Description on Left; 4 Dropdown Filters, Export & Add Member on Right */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="shrink-0">
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            My Team Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage, evaluate, and monitor direct reports across your assigned departments.
          </p>
        </div>

        {/* 4 Dropdown Filters, Export Dropdown, and Add Team Member Button */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* All Departments */}
          <select
            value={departmentFilter}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
          >
            <option value="All">All Departments</option>
            {filters.departments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>

          {/* All Designations */}
          <select
            value={designationFilter}
            onChange={(e) => {
              setDesignationFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
          >
            <option value="All">All Designations</option>
            {filters.designations.map((des) => (
              <option key={des} value={des}>{des}</option>
            ))}
          </select>

          {/* All Status */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
          >
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="On Leave">On Leave</option>
            <option value="Inactive">Inactive</option>
          </select>

          {/* All Attendance */}
          <select
            value={attendanceFilter}
            onChange={(e) => {
              setAttendanceFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
          >
            <option value="All">All Attendance</option>
            <option value="Present">Present</option>
            <option value="Half Day">Half Day</option>
            <option value="Late">Late</option>
            <option value="On Leave">On Leave</option>
            <option value="Absent">Absent</option>
          </select>

          {/* Reset button when filters are active */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              title="Reset all filters"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}

          {/* Hierarchy Toggle Shortcut */}
          <button
            onClick={() => setActiveTab(activeTab === 'hierarchy' ? 'team' : 'hierarchy')}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
              activeTab === 'hierarchy'
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Network className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">{activeTab === 'hierarchy' ? 'Directory' : 'Hierarchy'}</span>
          </button>

          {/* Export Dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Export</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {isExportOpen && (
              <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-30 text-xs font-medium">
                <button
                  onClick={handleExportCSV}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors text-left cursor-pointer"
                >
                  <FileText className="h-4 w-4 text-indigo-600" />
                  <span>Export as CSV</span>
                </button>
                <button
                  onClick={handleExportExcel}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors text-left cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>Export as Excel</span>
                </button>
                <button
                  onClick={handlePrint}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors text-left cursor-pointer"
                >
                  <Printer className="h-4 w-4 text-slate-600" />
                  <span>Print Directory</span>
                </button>
              </div>
            )}
          </div>

          {/* Add Team Member (Purple Accent) */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Team Member</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => fetchTeamData()}
            className="rounded-lg bg-rose-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-rose-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. Top 4 Clean KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* TOTAL TEAM MEMBERS */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
              TOTAL TEAM
            </span>
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600 border border-indigo-100">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-1.5">
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {isLoading ? '...' : kpis.totalTeamMembers}
            </p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Authorized direct reports
            </p>
          </div>
        </div>

        {/* PRESENT TODAY */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
              PRESENT TODAY
            </span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 border border-emerald-100">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-1.5">
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {isLoading ? '...' : kpis.presentTodayCount}
            </p>
            <p className="text-xs text-emerald-600 font-medium mt-0.5">
              {presentPercent}% attendance rate
            </p>
          </div>
        </div>

        {/* ON LEAVE TODAY */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
              ON LEAVE TODAY
            </span>
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600 border border-blue-100">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-1.5">
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {isLoading ? '...' : kpis.onLeaveTodayCount}
            </p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Approved team leaves
            </p>
          </div>
        </div>

        {/* PENDING APPROVALS */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
              PENDING APPROVALS
            </span>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600 border border-amber-100">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-1.5">
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {isLoading ? '...' : kpis.pendingLeavesCount || 0}
            </p>
            <p className="text-xs text-amber-600 font-medium mt-0.5">
              Requires manager action
            </p>
          </div>
        </div>
      </div>

      {/* 3. Team Tabs, Search & View Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pt-0.5 pb-2">
        {/* Left: Tabs */}
        <div className="flex items-center gap-5 sm:gap-6 shrink-0">
          <button
            onClick={() => setActiveTab('team')}
            className={`pb-2 text-xs sm:text-sm font-bold transition-all relative cursor-pointer ${
              activeTab === 'team'
                ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-[9px]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            My Team ({kpis.totalTeamMembers})
          </button>
          <button
            onClick={() => setActiveTab('hierarchy')}
            className={`pb-2 text-xs sm:text-sm font-semibold transition-all relative cursor-pointer ${
              activeTab === 'hierarchy'
                ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-[9px]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Team Hierarchy
          </button>
        </div>

        {/* Right: Search & View Mode Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-end max-w-xl">
          {activeTab === 'team' && (
            <div className="relative flex-1 max-w-xs sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search team members by name, email, ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setDebouncedSearch(search);
                    setCurrentPage(1);
                  }
                }}
                className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors font-medium shadow-2xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setDebouncedSearch('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200/60 transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {activeTab === 'team' && (
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg shrink-0">
              <button
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="List View"
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Grid</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. Main Content Area */}
      {activeTab === 'hierarchy' ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs p-4">
          <TeamHierarchyView
            managerName={managerDisplayName}
            managerEmpId={managerEmpId}
            teamMembers={allTeamMembers.length > 0 ? allTeamMembers : teamMembers}
            onSelectMember={(member) => setProfileMember(member)}
          />
        </div>
      ) : viewMode === 'grid' ? (
        <div className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-44 rounded-2xl bg-white border border-slate-200 p-5 animate-pulse" />
              ))}
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center text-slate-400">
              <Users className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No team members match your criteria</p>
              <p className="text-xs text-slate-400 mt-1">Try resetting the filters or add a new direct report.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {teamMembers.map((member) => {
                const initials = member.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <div
                    key={member.id || member.employeeId}
                    className="relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 font-bold text-xs text-white shadow-xs">
                            {initials}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 truncate">
                              {member.name}
                            </h3>
                            <p className="text-xs text-slate-400 truncate">{member.email}</p>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${getEmploymentStatusBadgeClass(
                            member.status
                          )}`}
                        >
                          <span className="h-1 w-1 rounded-full bg-current" />
                          {member.status}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">ID:</span>
                          <span className="font-mono font-medium text-slate-700">{member.employeeId}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Department:</span>
                          <span className="font-medium text-slate-700">{member.department}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Designation:</span>
                          <span className="font-medium text-slate-700">{member.designation}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${getAttendanceBadgeClass(
                          member.todayAttendance?.status || 'Not Marked'
                        )}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {member.todayAttendance?.status || 'Not Marked'}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setProfileMember(member)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                          title="View Profile"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditMember(member)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                          title="Edit Details"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 pl-5 pr-4">EMPLOYEE</th>
                  <th className="py-2.5 px-4">EMPLOYEE ID</th>
                  <th className="py-2.5 px-4">DEPARTMENT</th>
                  <th className="py-2.5 px-4">DESIGNATION</th>
                  <th className="py-2.5 px-4">STATUS</th>
                  <th className="py-2.5 px-4">ATTENDANCE (TODAY)</th>
                  <th className="py-2.5 pr-5 pl-2 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="py-4 px-4 text-center">
                        <div className="h-6 bg-slate-100 rounded-lg w-full" />
                      </td>
                    </tr>
                  ))
                ) : teamMembers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-700">No team members found</p>
                      <p className="text-xs text-slate-400 mt-1">Try clearing filters or add direct reports.</p>
                    </td>
                  </tr>
                ) : (
                  teamMembers.map((member) => {
                    const initials = member.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2);

                    const isMenuOpen = activeMenuId === (member.id || member.employeeId);

                    return (
                      <tr
                        key={member.id || member.employeeId}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-2.5 pl-5 pr-4">
                          <div className="flex items-center gap-2.5">
                            {member.photoUrl ? (
                              <img
                                src={member.photoUrl}
                                alt={member.name}
                                className="h-8 w-8 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs border border-indigo-100">
                                {initials}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 leading-tight truncate">
                                {member.name}
                              </p>
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                {member.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-4 font-mono font-medium text-slate-600">
                          {member.employeeId}
                        </td>

                        <td className="py-2.5 px-4 font-medium text-slate-700">
                          {member.department}
                        </td>

                        <td className="py-2.5 px-4 font-medium text-slate-700">
                          {member.designation}
                        </td>

                        <td className="py-2.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${getEmploymentStatusBadgeClass(
                              member.status
                            )}`}
                          >
                            <span className="h-1 w-1 rounded-full bg-current" />
                            {member.status}
                          </span>
                        </td>

                        <td className="py-2.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${getAttendanceBadgeClass(
                              member.todayAttendance?.status || 'Not Marked'
                            )}`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {member.todayAttendance?.status || 'Not Marked'}
                          </span>
                        </td>

                        <td className="py-2.5 pr-5 pl-2 text-right relative">
                          <div className="inline-block text-left" ref={isMenuOpen ? menuRef : null}>
                            <button
                              onClick={() =>
                                setActiveMenuId(
                                  isMenuOpen ? null : member.id || member.employeeId
                                )
                              }
                              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>

                            {isMenuOpen && (
                              <div className="absolute right-0 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-30 text-left">
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setProfileMember(member);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors text-xs font-semibold cursor-pointer"
                                >
                                  <Eye className="h-3.5 w-3.5 text-indigo-600" />
                                  <span>View Profile</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setEditMember(member);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors text-xs font-semibold cursor-pointer"
                                >
                                  <Edit2 className="h-3.5 w-3.5 text-indigo-600" />
                                  <span>Edit Details</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setAttendanceMember(member);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors text-xs font-semibold cursor-pointer"
                                >
                                  <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Manage Attendance</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setLeaveMember(member);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors text-xs font-semibold cursor-pointer"
                                >
                                  <Send className="h-3.5 w-3.5 text-purple-600" />
                                  <span>Request Leave</span>
                                </button>

                                <div className="my-1 border-t border-slate-100" />

                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setRemoveMember(member);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors text-xs font-semibold cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                  <span>Remove Member</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3 border-t border-slate-100 bg-slate-50/50 text-xs">
              <span className="text-slate-500">
                Showing{' '}
                <span className="font-semibold text-slate-700">
                  {(currentPage - 1) * pagination.limit + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-slate-700">
                  {Math.min(currentPage * pagination.limit, pagination.total)}
                </span>{' '}
                of <span className="font-semibold text-slate-700">{pagination.total}</span> members
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Prev</span>
                </button>
                <span className="text-xs font-bold text-slate-700 px-2">
                  {currentPage} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={currentPage === pagination.totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AddTeamMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => fetchTeamData(true)}
      />

      <TeamMemberProfileModal
        member={profileMember}
        managerName={managerDisplayName}
        onClose={() => setProfileMember(null)}
        onOpenEdit={() => {
          if (profileMember) setEditMember(profileMember);
        }}
        onOpenAttendance={() => {
          if (profileMember) setAttendanceMember(profileMember);
        }}
        onOpenLeave={() => {
          if (profileMember) setLeaveMember(profileMember);
        }}
      />

      <EditTeamMemberModal
        member={editMember}
        departments={filters.departments}
        designations={filters.designations}
        onClose={() => setEditMember(null)}
        onSuccess={() => fetchTeamData(true)}
      />

      <TeamMemberAttendanceModal
        member={attendanceMember}
        onClose={() => setAttendanceMember(null)}
        onSuccess={() => fetchTeamData(true)}
      />

      <TeamMemberLeaveModal
        member={leaveMember}
        onClose={() => setLeaveMember(null)}
        onSuccess={() => fetchTeamData(true)}
      />

      <RemoveTeamMemberModal
        member={removeMember}
        onClose={() => setRemoveMember(null)}
        onSuccess={() => fetchTeamData(true)}
      />
    </div>
  );
}