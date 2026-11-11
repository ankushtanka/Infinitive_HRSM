'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ClientGeo {
  lat: number;
  lng: number;
  accuracy: number;
}

export type PositionResult =
  | { ok: true; geo: ClientGeo }
  | { ok: false; reason: 'denied' | 'unavailable' | 'timeout' };

/** One-shot high-accuracy position. Tells the caller why it failed (permission vs. no signal). */
export function requestPosition(timeoutMs = 10000): Promise<PositionResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return resolve({ ok: false, reason: 'unavailable' });
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          geo: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        }),
      (err) =>
        resolve({
          ok: false,
          reason: err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable',
        }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/** Convenience for check-in / check-out: the position, or null when unavailable or denied. */
export async function getCurrentPositionOnce(timeoutMs = 10000): Promise<ClientGeo | null> {
  const r = await requestPosition(timeoutMs);
  return r.ok ? r.geo : null;
}

export type TrackingStatus =
  | 'loading'
  | 'disabled' // organization (or this employee) has tracking switched off
  | 'idle' // allowed, not running
  | 'starting'
  | 'active' // session running, location being sent
  | 'denied' // browser location permission blocked
  | 'error';

export interface TrackingPolicyInfo {
  enabled: boolean;
  requireConsent: boolean;
  exempted: boolean;
  pingIntervalSeconds: number;
  retentionDays: number;
}

/**
 * Client controller for live tracking. All rules are enforced on the server; this hook only
 * drives the browser: permission prompt, start/stop calls, and periodic location updates
 * while a session is running. Browsers only deliver GPS while the page is open.
 */
export function useTracking(checkedIn: boolean) {
  const [status, setStatus] = useState<TrackingStatus>('loading');
  const [policy, setPolicy] = useState<TrackingPolicyInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [withinGeofence, setWithinGeofence] = useState<boolean | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);

  const latest = useRef<ClientGeo | null>(null);
  const autoTried = useRef(false);
  const pingSeconds = policy?.pingIntervalSeconds ?? 30;

  const halt = useCallback((next: TrackingStatus, msg: string | null = null) => {
    setRunning(false);
    latest.current = null;
    setStatus(next);
    setMessage(msg);
  }, []);

  // Load policy and resume an already-running session (e.g. after a page reload)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/tracking/permissions', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d?.success) {
          setStatus('error');
          setMessage(d?.message || 'Could not load tracking settings.');
          return;
        }
        const p = d.data.policy as TrackingPolicyInfo;
        setPolicy(p);
        if (!p.enabled) return setStatus('disabled');
        if (d.data.activeSession) {
          setStartedAt(new Date(d.data.activeSession.startedAt));
          setRunning(true);
          setStatus('active');
        } else {
          setStatus('idle');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
          setMessage('Could not load tracking settings.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Server ends the session on check-out; mirror that locally
  useEffect(() => {
    if (!checkedIn && running) halt('idle');
  }, [checkedIn, running, halt]);

  const send = useCallback(async () => {
    const pos = latest.current;
    if (!pos) return;
    try {
      const res = await fetch('/api/v1/tracking/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pos),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // NOT_CHECKED_IN, NO_ACTIVE_SESSION or TRACKING_DISABLED: server has closed the session
        halt(data.code === 'TRACKING_DISABLED' ? 'disabled' : 'idle', data.message || null);
        return;
      }
      if (!res.ok || !data.success) {
        setStatus('error');
        setMessage(data.message || 'Could not send your location. Retrying…');
        return;
      }
      if (!data.throttled) {
        setLastSentAt(new Date());
        setWithinGeofence(data.withinGeofence ?? null);
        setDistanceMeters(data.distanceMeters ?? null);
      }
      setStatus('active');
      setMessage(null);
    } catch {
      setStatus('error');
      setMessage('Network problem. Retrying…');
    }
  }, [halt]);

  // While running: watch the device position and post it on an interval
  useEffect(() => {
    if (!running) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      halt('error', 'This device does not support location.');
      return;
    }

    let firstFix = true;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setAccuracy(Math.round(pos.coords.accuracy));
        if (firstFix) {
          firstFix = false;
          send();
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) halt('denied', 'Location permission was blocked.');
        else {
          setStatus('error');
          setMessage('Waiting for a GPS signal…');
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    const timer = window.setInterval(send, Math.max(15, pingSeconds) * 1000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(timer);
    };
  }, [running, pingSeconds, send, halt]);

  const start = useCallback(
    async (consent: boolean) => {
      if (!checkedIn) {
        setMessage('Check in first. Tracking runs only while you are checked in.');
        return;
      }
      if (policy?.requireConsent && !consent) {
        setMessage('Please accept the location-sharing notice first.');
        return;
      }
      setStatus('starting');
      setMessage(null);

      const pos = await requestPosition();
      if (!pos.ok) {
        halt(
          pos.reason === 'denied' ? 'denied' : 'error',
          pos.reason === 'denied'
            ? 'Location permission is blocked. Allow location for this site in your browser settings.'
            : 'Could not get your location. Move to an open area and try again.'
        );
        return;
      }

      try {
        const res = await fetch('/api/v1/tracking/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consent, geo: pos.geo }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          halt(data.code === 'TRACKING_DISABLED' ? 'disabled' : 'idle', data.message || 'Could not start tracking.');
          return;
        }
        latest.current = pos.geo;
        setAccuracy(Math.round(pos.geo.accuracy));
        setStartedAt(new Date(data.session.startedAt));
        if (data.pingIntervalSeconds) {
          setPolicy((p) => (p ? { ...p, pingIntervalSeconds: data.pingIntervalSeconds } : p));
        }
        setRunning(true);
        setStatus('active');
      } catch {
        halt('error', 'Network problem. Please try again.');
      }
    },
    [checkedIn, policy?.requireConsent, halt]
  );

  // Auto-start: when the organization's policy does not require a consent click, tracking
  // begins on its own as soon as the employee is checked in (the server also starts the
  // session right at check-in; this just makes the browser begin sending its GPS updates).
  useEffect(() => {
    if (!checkedIn || running || autoTried.current) return;
    if (!policy || !policy.enabled || policy.exempted || policy.requireConsent) return;
    if (status !== 'idle') return;
    autoTried.current = true;
    start(true);
  }, [checkedIn, running, policy, status, start]);

  useEffect(() => {
    if (!checkedIn) autoTried.current = false;
  }, [checkedIn]);

  const stop = useCallback(async () => {
    halt('idle');
    try {
      await fetch('/api/v1/tracking/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch {
      /* the server also closes the session on check-out; nothing more to do here */
    }
  }, [halt]);

  return { status, policy, message, startedAt, lastSentAt, accuracy, withinGeofence, distanceMeters, start, stop };
}
