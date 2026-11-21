/**
 * Office locations, shift timing and the "work from office / work from home" check-in rules.
 *
 * Office locations live in organization_settings.attendance.offices (a list, so more offices such as
 * Ahmedabad can be added later from Settings). The older single-office fields (officeLat, officeLng,
 * geofenceRadiusMeters) are kept in sync with the first office so the live tracking map keeps working.
 */
import type { Db } from 'mongodb';
import { distanceMeters, loadAttendanceRules, MAX_ENFORCED_ACCURACY_METERS, parseGeo } from '@/lib/geo';
import { parseTimeToMinutes } from '@/lib/attendanceAlerts';

/** Company shift defaults: 10:00 AM to 06:00 PM, late after a 15 minute grace period. */
export const DEFAULT_SHIFT_RULES = {
  workStartTime: '10:00 AM',
  workEndTime: '06:00 PM',
  gracePeriodMinutes: 15,
  lateMarkingEnabled: true,
};

export const MAX_OFFICES = 10;
export const MIN_OFFICE_RADIUS_METERS = 50;
export const MAX_OFFICE_RADIUS_METERS = 2000;
/** Extra distance allowed for normal GPS error, capped so a poor fix cannot widen the office area much. */
const MAX_ACCURACY_TOLERANCE_METERS = 100;

export type WorkMode = 'OFFICE' | 'WFH';

export interface OfficeLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export function normalizeWorkMode(value: unknown): WorkMode {
  const text = typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s_-]+/g, '') : '';
  return text === 'WFH' || text === 'WORKFROMHOME' || text === 'REMOTE' ? 'WFH' : 'OFFICE';
}

/** Attendance rules for the organization with the company shift defaults filled in. */
export async function loadShiftRules(db: Db, orgId: string): Promise<Record<string, any>> {
  const stored = await loadAttendanceRules(db, orgId);
  return { ...DEFAULT_SHIFT_RULES, ...(stored || {}) };
}

/** Minutes after midnight for the shift start, or 10:00 AM when the stored value cannot be read. */
export function shiftStartMinutes(rules: Record<string, any>): number {
  return parseTimeToMinutes(rules.workStartTime) ?? parseTimeToMinutes(DEFAULT_SHIFT_RULES.workStartTime)!;
}

/** True when a check-in at `checkInTime` (e.g. "10:16 AM") is after the shift start plus the grace period. */
export function isLateCheckIn(rules: Record<string, any>, checkInTime: string): boolean {
  if (rules.lateMarkingEnabled === false) return false;
  const checkIn = parseTimeToMinutes(checkInTime);
  if (checkIn === null) return false;
  const grace = Number.isFinite(Number(rules.gracePeriodMinutes)) ? Number(rules.gracePeriodMinutes) : DEFAULT_SHIFT_RULES.gracePeriodMinutes;
  return checkIn > shiftStartMinutes(rules) + grace;
}

function cleanOffice(raw: any, index: number): OfficeLocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  const radius = Number(raw.radiusMeters);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : `Office ${index + 1}`;
  const id = typeof raw.id === 'string' && /^[a-z0-9-]{1,40}$/i.test(raw.id) ? raw.id : `office-${index + 1}`;
  return {
    id,
    name,
    lat: Math.round(lat * 1e7) / 1e7,
    lng: Math.round(lng * 1e7) / 1e7,
    radiusMeters: Number.isFinite(radius) && radius > 0 ? Math.round(radius) : 200,
  };
}

/** Configured offices: the offices list, or the older single office fields when no list was saved yet. */
export function getOfficeLocations(rules: Record<string, any> | null | undefined): OfficeLocation[] {
  if (!rules) return [];
  if (Array.isArray(rules.offices) && rules.offices.length > 0) {
    return rules.offices.map(cleanOffice).filter((o: OfficeLocation | null): o is OfficeLocation => o !== null);
  }
  const legacy = cleanOffice(
    { name: 'Head Office', lat: rules.officeLat, lng: rules.officeLng, radiusMeters: rules.geofenceRadiusMeters },
    0
  );
  return rules.geofenceEnabled && legacy ? [legacy] : [];
}

/** Office check-in needs the person to be inside an office area only when this is switched on and an office exists. */
export function isOfficeLocationRequired(rules: Record<string, any> | null | undefined): boolean {
  return Boolean(rules?.geofenceEnabled && rules?.geofenceEnforce) && getOfficeLocations(rules).length > 0;
}

export type OfficeListValidation = { ok: true; value: OfficeLocation[] } | { ok: false; message: string };

/** Validates offices submitted from Settings. */
export function sanitizeOfficeLocations(input: unknown): OfficeListValidation {
  if (!Array.isArray(input)) return { ok: false, message: 'Office list is missing.' };
  if (input.length > MAX_OFFICES) return { ok: false, message: `You can add up to ${MAX_OFFICES} offices.` };

  const offices: OfficeLocation[] = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < input.length; i++) {
    const raw: any = input[i] || {};
    const label = typeof raw.name === 'string' && raw.name.trim() ? `"${raw.name.trim()}"` : `Office ${i + 1}`;
    if (typeof raw.name !== 'string' || !raw.name.trim()) return { ok: false, message: `Enter a name for office ${i + 1}.` };
    if (raw.name.trim().length > 60) return { ok: false, message: `${label}: name must be at most 60 characters.` };
    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    if (raw.lat === '' || raw.lng === '' || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
      return { ok: false, message: `${label}: enter a valid latitude and longitude (or use "Use my current location").` };
    }
    const radius = Number(raw.radiusMeters);
    if (!Number.isFinite(radius) || radius < MIN_OFFICE_RADIUS_METERS || radius > MAX_OFFICE_RADIUS_METERS) {
      return { ok: false, message: `${label}: radius must be between ${MIN_OFFICE_RADIUS_METERS} and ${MAX_OFFICE_RADIUS_METERS} meters.` };
    }
    let id = typeof raw.id === 'string' && /^[a-z0-9-]{1,40}$/i.test(raw.id) ? raw.id : '';
    if (!id || usedIds.has(id)) {
      let n = i + 1;
      while (usedIds.has(`office-${n}`)) n++;
      id = `office-${n}`;
    }
    usedIds.add(id);
    offices.push({
      id,
      name: raw.name.trim(),
      lat: Math.round(lat * 1e7) / 1e7,
      lng: Math.round(lng * 1e7) / 1e7,
      radiusMeters: Math.round(radius),
    });
  }
  return { ok: true, value: offices };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

export type OfficeCheckResult =
  | { ok: true; geoDoc: Record<string, any> | null; office: OfficeLocation | null }
  | { ok: false; status: number; code: string; message: string };

/**
 * Office check-in location rule.
 * - No office saved, or the rule switched off: never blocks; the location is stored when the browser sent one.
 * - Rule switched on: needs a location within the nearest office's radius (plus a little GPS tolerance).
 */
export function checkOfficeLocation(rules: Record<string, any>, rawGeo: unknown, now: Date = new Date()): OfficeCheckResult {
  const offices = getOfficeLocations(rules);
  const required = isOfficeLocationRequired(rules);
  const geo = parseGeo(rawGeo);

  if (!geo) {
    if (required) {
      return {
        ok: false,
        status: 400,
        code: 'GEO_REQUIRED',
        message: 'Location access is needed to check in from the office. Allow location for this site and try again.',
      };
    }
    return { ok: true, geoDoc: null, office: null };
  }

  if (offices.length === 0) {
    return { ok: true, geoDoc: { ...geo, capturedAt: now }, office: null };
  }

  let nearest = offices[0];
  let nearestDistance = distanceMeters(geo, nearest);
  for (const office of offices.slice(1)) {
    const d = distanceMeters(geo, office);
    if (d < nearestDistance) {
      nearest = office;
      nearestDistance = d;
    }
  }
  const tolerance = Math.min(geo.accuracy ?? 0, MAX_ACCURACY_TOLERANCE_METERS);
  const withinOffice = nearestDistance <= nearest.radiusMeters + tolerance;

  if (required && (geo.accuracy ?? 0) > MAX_ENFORCED_ACCURACY_METERS) {
    return {
      ok: false,
      status: 400,
      code: 'GEO_LOW_ACCURACY',
      message: `Your location is not accurate enough (±${formatDistance(geo.accuracy ?? 0)}). Turn on GPS / precise location (a phone works best) and try again.`,
    };
  }

  if (required && !withinOffice) {
    return {
      ok: false,
      status: 403,
      code: 'OUTSIDE_OFFICE',
      message: `You are about ${formatDistance(nearestDistance)} from ${nearest.name}. Office check-in works only within ${nearest.radiusMeters} m of the office. If you are working from home, choose Work From Home.`,
    };
  }

  return {
    ok: true,
    geoDoc: {
      ...geo,
      capturedAt: now,
      officeId: nearest.id,
      officeName: nearest.name,
      withinGeofence: withinOffice,
      distanceMeters: Math.round(nearestDistance),
    },
    office: withinOffice ? nearest : null,
  };
}

/** What listing APIs return about a punch location: the check result only, never raw coordinates. */
export function summarizePunchGeo(geoDoc: any): {
  withinGeofence: boolean | null;
  distanceMeters: number | null;
  accuracy: number | null;
  officeName: string | null;
} | null {
  if (!geoDoc || typeof geoDoc !== 'object') return null;
  return {
    withinGeofence: typeof geoDoc.withinGeofence === 'boolean' ? geoDoc.withinGeofence : null,
    distanceMeters: Number.isFinite(geoDoc.distanceMeters) ? geoDoc.distanceMeters : null,
    accuracy: Number.isFinite(geoDoc.accuracy) ? geoDoc.accuracy : null,
    officeName: typeof geoDoc.officeName === 'string' ? geoDoc.officeName : null,
  };
}