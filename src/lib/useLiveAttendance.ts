'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { withOrg } from '@/lib/trackingClient';

export interface LiveLocation {
  lat: number;
  lng: number;
  accuracy: number | null;
  lastPingAt: string | null;
  withinGeofence: boolean | null;
  distanceMeters: number | null;
  outsideMinutes: number;
  stale: boolean;
}

export interface LiveRow {
  employeeId: string;
  name: string;
  department: string;
  designation: string;
  photoUrl: string | null;
  state: 'WORKING' | 'CHECKED_OUT' | 'ON_LEAVE' | 'NOT_MARKED';
  trackingStatus: 'ACTIVE' | 'NOT_STARTED' | 'EXEMPT' | 'DISABLED' | 'TURNED_OFF';
  attendanceStatus: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  workingHours: number | null;
  method: string | null;
  location: LiveLocation | null;
}

export interface LiveSnapshot {
  serverTime: string;
  date: string;
  trackingEnabled: boolean;
  pingIntervalSeconds: number;
  geofence: { lat: number; lng: number; radiusMeters: number; enforce: boolean } | null;
  alerts: { employeeId: string; name: string; stoppedAt: string | null }[];
  kpis: {
    total: number;
    working: number;
    checkedOut: number;
    onLeave: number;
    notMarked: number;
    late: number;
    outsideOffice: number;
    staleSignal: number;
    trackingActive: number;
  };
  rows: LiveRow[];
}

/** Polls /api/v1/tracking/live. Pauses while the tab is hidden and refreshes when it becomes visible. */
export function useLiveAttendance(pollMs = 10000, enabled = true, organizationId?: string) {
  const [data, setData] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timer = useRef<number | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const res = await fetch(withOrg('/api/v1/tracking/live', organizationId), { signal: controller.signal, cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load live attendance.');
      setData(json);
      setError(null);
      setLastUpdated(new Date());
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setError(e?.message || 'Failed to load live attendance.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      timer.current = window.setTimeout(async () => {
        if (!document.hidden) await load();
        schedule();
      }, pollMs);
    };

    const onVisible = () => {
      if (!document.hidden) load();
    };

    load().then(schedule);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
      inFlight.current?.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, pollMs, enabled]);

  return { data, error, isLoading, lastUpdated, refresh: load };
}
