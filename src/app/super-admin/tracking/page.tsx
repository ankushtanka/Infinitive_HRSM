'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { SuperAdminLayout } from '@/components/layout/SuperAdminLayout';
import { Radio, ClipboardCheck, Route, Settings2, UserMinus, FileClock, Building2 } from 'lucide-react';
import { LiveAttendanceBoard } from '@/components/attendance/LiveAttendanceBoard';
import { AttendanceVerification } from '@/components/tracking/AttendanceVerification';
import { TrackingReports } from '@/components/tracking/TrackingReports';
import { OrgTrackingPolicy } from '@/components/tracking/OrgTrackingPolicy';
import { EmployeeExemptions } from '@/components/tracking/EmployeeExemptions';
import { TrackingAuditLog } from '@/components/tracking/TrackingAuditLog';
import { withOrg } from '@/lib/trackingClient';

type Tab = 'live' | 'attendance' | 'reports' | 'policy' | 'exemptions' | 'audit';

interface OrgOption {
  organizationId: string;
  name: string;
  status: string;
  employeeCount: number;
}

export default function SuperAdminTrackingPage() {
  const [tab, setTab] = useState<Tab>('live');
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  // Empty string = the Super Admin's own organization (no override sent to the API)
  const [organizationId, setOrganizationId] = useState('');
  const [geofence, setGeofence] = useState<{ lat: number; lng: number; radiusMeters: number } | null>(null);
  const [trailTarget, setTrailTarget] = useState<{ employeeId: string; date: string } | null>(null);

  useEffect(() => {
    fetch('/api/v1/super-admin/organizations?limit=100', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => d?.success && setOrgs(d.data?.organizations || []))
      .catch(() => {});
  }, []);

  // Geofence for the trail map follows the selected organization
  useEffect(() => {
    setGeofence(null);
    fetch(withOrg('/api/v1/tracking/live', organizationId), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => d?.success && setGeofence(d.geofence || null))
      .catch(() => {});
  }, [organizationId]);

  const changeOrg = (value: string) => {
    setOrganizationId(value);
    setTrailTarget(null);
  };

  const openTrail = useCallback((employeeId: string, date: string) => {
    setTrailTarget({ employeeId, date });
    setTab('reports');
  }, []);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'live', label: 'Live Employee Map', icon: <Radio className="h-3.5 w-3.5" /> },
    { key: 'attendance', label: 'Attendance Monitoring', icon: <ClipboardCheck className="h-3.5 w-3.5" /> },
    { key: 'reports', label: 'Reports & History', icon: <Route className="h-3.5 w-3.5" /> },
    { key: 'policy', label: 'Tracking Policy', icon: <Settings2 className="h-3.5 w-3.5" /> },
    { key: 'exemptions', label: 'Exemptions', icon: <UserMinus className="h-3.5 w-3.5" /> },
    { key: 'audit', label: 'Audit Log', icon: <FileClock className="h-3.5 w-3.5" /> },
  ];

  const orgParam = organizationId || undefined;
  const selectedOrg = orgs.find((o) => o.organizationId === organizationId);

  return (
    <SuperAdminLayout pageTitle="Live Tracking" breadcrumbs={[{ label: 'Live Tracking', href: '/super-admin/tracking' }]}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Live Tracking</h2>
          <p className="text-xs text-slate-500">
            Live locations, attendance monitoring, reports and tracking controls for any organization on the platform.
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Building2 className="h-3 w-3" /> Organization
          </span>
          <select
            value={organizationId}
            onChange={(e) => changeOrg(e.target.value)}
            className="min-w-[240px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 cursor-pointer"
          >
            <option value="">My organization</option>
            {orgs.map((o) => (
              <option key={o.organizationId} value={o.organizationId}>
                {o.name} · {o.employeeCount} employees{o.status === 'Inactive' ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold cursor-pointer ${
              tab === t.key ? 'bg-orange-500 text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200 hover:bg-[#FFF7ED] hover:text-orange-600'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {(tab === 'live' || tab === 'reports') && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          GPS location appears only for employees who allowed location access on their device and are not exempted, and only
          while tracking is switched on for {selectedOrg ? selectedOrg.name : 'the organization'} (Tracking Policy tab).
        </p>
      )}

      {/* Keyed by organization so each view starts fresh when the selection changes */}
      <div key={organizationId || 'own'}>
        {tab === 'live' && <LiveAttendanceBoard organizationId={orgParam} />}
        {tab === 'attendance' && <AttendanceVerification organizationId={orgParam} onViewTrail={openTrail} />}
        {tab === 'reports' && (
          <TrackingReports
            key={trailTarget ? `${trailTarget.employeeId}-${trailTarget.date}` : 'blank'}
            initialEmployeeId={trailTarget?.employeeId}
            initialDate={trailTarget?.date}
            geofence={geofence}
            organizationId={orgParam}
          />
        )}
        {tab === 'policy' && <OrgTrackingPolicy organizationId={orgParam} />}
        {tab === 'exemptions' && <EmployeeExemptions organizationId={orgParam} />}
        {tab === 'audit' && <TrackingAuditLog organizationId={orgParam} />}
      </div>
    </SuperAdminLayout>
  );
}
