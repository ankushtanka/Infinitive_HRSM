'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Radio, ShieldCheck, Route, UserMinus, Settings as SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { LiveAttendanceBoard } from '@/components/attendance/LiveAttendanceBoard';
import { AttendanceVerification } from '@/components/tracking/AttendanceVerification';
import { TrackingReports } from '@/components/tracking/TrackingReports';
import { EmployeeExemptions } from '@/components/tracking/EmployeeExemptions';

type Tab = 'live' | 'verify' | 'reports' | 'exemptions';

export default function AdminTrackingPage() {
  const [tab, setTab] = useState<Tab>('live');
  const [canManage, setCanManage] = useState(false);
  const [geofence, setGeofence] = useState<{ lat: number; lng: number; radiusMeters: number } | null>(null);
  const [trailTarget, setTrailTarget] = useState<{ employeeId: string; date: string } | null>(null);

  useEffect(() => {
    fetch('/api/v1/tracking/permissions', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => d?.success && setCanManage(Boolean(d.data.canManage)))
      .catch(() => {});
    fetch('/api/v1/tracking/live', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => d?.success && setGeofence(d.geofence || null))
      .catch(() => {});
  }, []);

  const openTrail = useCallback((employeeId: string, date: string) => {
    setTrailTarget({ employeeId, date });
    setTab('reports');
  }, []);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'live', label: 'Live Board', icon: <Radio className="h-3.5 w-3.5" /> },
    { key: 'verify', label: 'Attendance Monitoring', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
    { key: 'reports', label: 'Tracking Reports', icon: <Route className="h-3.5 w-3.5" /> },
    ...(canManage ? [{ key: 'exemptions' as Tab, label: 'Exemptions', icon: <UserMinus className="h-3.5 w-3.5" /> }] : []),
  ];

  return (
    <AdminLayout pageTitle="Live Tracking" breadcrumbs={[{ label: 'Live Tracking', href: '/admin/tracking' }]}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Employee Live Tracking</h2>
          <p className="text-xs text-slate-500">Real-time location, attendance verification and movement history for your organization.</p>
        </div>
        {canManage && (
          <Link
            href="/admin/settings"
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <SettingsIcon className="h-3.5 w-3.5" /> Geofence & tracking settings
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold cursor-pointer ${
              tab === t.key ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'live' && <LiveAttendanceBoard />}
      {tab === 'verify' && <AttendanceVerification onViewTrail={openTrail} />}
      {tab === 'reports' && (
        <TrackingReports
          key={trailTarget ? `${trailTarget.employeeId}-${trailTarget.date}` : 'blank'}
          initialEmployeeId={trailTarget?.employeeId}
          initialDate={trailTarget?.date}
          geofence={geofence}
        />
      )}
      {tab === 'exemptions' && canManage && <EmployeeExemptions />}
    </AdminLayout>
  );
}
