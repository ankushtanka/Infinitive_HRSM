import type { Db } from 'mongodb';

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface GeofenceConfig {
  enabled: boolean;
  enforce: boolean;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface GeofenceResult {
  withinGeofence: boolean;
  distanceMeters: number;
}

/** GPS fixes worse than this are rejected when the geofence is enforced. */
export const MAX_ENFORCED_ACCURACY_METERS = 300;
/** Extra tolerance granted for GPS error, capped so a bad fix cannot widen the fence much. */
const MAX_ACCURACY_TOLERANCE_METERS = 100;

export function parseGeo(input: any): GeoPoint | null {
  if (!input || typeof input !== 'object') return null;
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const accuracy = Number(input.accuracy);
  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : undefined,
  };
}

/** Great-circle distance in meters (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function getGeofenceConfig(attRules: any): GeofenceConfig | null {
  if (!attRules?.geofenceEnabled) return null;
  const lat = Number(attRules.officeLat);
  const lng = Number(attRules.officeLng);
  const radius = Number(attRules.geofenceRadiusMeters);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) return null;
  return {
    enabled: true,
    enforce: Boolean(attRules.geofenceEnforce),
    lat,
    lng,
    radiusMeters: radius,
  };
}

export function evaluateGeofence(geo: GeoPoint, fence: GeofenceConfig): GeofenceResult {
  const distance = distanceMeters(geo, fence);
  const tolerance = Math.min(geo.accuracy ?? 0, MAX_ACCURACY_TOLERANCE_METERS);
  return {
    withinGeofence: distance <= fence.radiusMeters + tolerance,
    distanceMeters: Math.round(distance),
  };
}

export async function loadAttendanceRules(db: Db, orgId: string): Promise<any> {
  let org: any = await db.collection('organization_settings').findOne({
    organizationId: orgId,
    attendance: { $exists: true },
  });
  if (!org?.attendance && orgId && orgId !== 'org-default') {
    org = await db.collection('organization_settings').findOne({
      organizationId: 'org-default',
      attendance: { $exists: true },
    });
  }
  return org?.attendance || {};
}

export type GeoCheck =
  | { ok: true; geoDoc: Record<string, any> | null; result: GeofenceResult | null }
  | { ok: false; status: number; code: string; message: string };

/**
 * Validates a clock-in/out location against the org geofence.
 * - No geofence configured: location is stored if supplied, never blocks.
 * - Geofence enabled, not enforced: location is stored and flagged, never blocks.
 * - Geofence enforced: a missing, low-accuracy or out-of-range fix blocks the action.
 */
export async function evaluateAttendanceGeo(
  db: Db,
  orgId: string,
  rawGeo: any,
  now: Date = new Date()
): Promise<GeoCheck> {
  const rules = await loadAttendanceRules(db, orgId);
  const fence = getGeofenceConfig(rules);
  const geo = parseGeo(rawGeo);

  if (!fence) {
    return { ok: true, geoDoc: geo ? { ...geo, capturedAt: now } : null, result: null };
  }

  if (!geo) {
    if (fence.enforce) {
      return {
        ok: false,
        status: 400,
        code: 'GEO_REQUIRED',
        message: 'Location access is required to mark attendance. Please allow location permission and try again.',
      };
    }
    return { ok: true, geoDoc: null, result: null };
  }

  if (fence.enforce && (geo.accuracy ?? 0) > MAX_ENFORCED_ACCURACY_METERS) {
    return {
      ok: false,
      status: 400,
      code: 'GEO_LOW_ACCURACY',
      message: `Your location is too imprecise (±${geo.accuracy} m). Move to an open area or enable precise location, then retry.`,
    };
  }

  const result = evaluateGeofence(geo, fence);

  if (fence.enforce && !result.withinGeofence) {
    return {
      ok: false,
      status: 403,
      code: 'OUTSIDE_GEOFENCE',
      message: `You are about ${result.distanceMeters} m from the office. Attendance can only be marked within ${fence.radiusMeters} m.`,
    };
  }

  return {
    ok: true,
    geoDoc: {
      ...geo,
      capturedAt: now,
      withinGeofence: result.withinGeofence,
      distanceMeters: result.distanceMeters,
    },
    result,
  };
}
