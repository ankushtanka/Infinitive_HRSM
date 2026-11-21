'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Crosshair, ExternalLink, Loader2, MapPin, Plus, Save, Trash2 } from 'lucide-react';
import { requestPosition } from '@/lib/clientGeo';

interface OfficeRow {
  id: string;
  name: string;
  lat: string;
  lng: string;
  radiusMeters: string;
}

const MAX_OFFICES = 10;

const newRow = (index: number, name = ''): OfficeRow => ({
  id: `office-${Date.now().toString(36)}-${index}`,
  name,
  lat: '',
  lng: '',
  radiusMeters: '200',
});

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500';

/**
 * Settings → Attendance: office locations used by "Office" check-in, and the switch that makes
 * office check-in work only inside an office area. Saves on its own (separate from the shift rules form).
 */
export function OfficeLocationsSettings() {
  const [rows, setRows] = useState<OfficeRow[]>([]);
  const [requireLocation, setRequireLocation] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [locatingId, setLocatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/settings/attendance/offices', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((json) => {
        if (cancelled) return;
        if (!json?.success) {
          setNotice({ type: 'error', text: json?.message || 'Could not load office locations.' });
          return;
        }
        const offices: any[] = Array.isArray(json.data?.offices) ? json.data.offices : [];
        setRows(
          offices.length > 0
            ? offices.map((o, i) => ({
                id: String(o.id || `office-${i + 1}`),
                name: String(o.name || ''),
                lat: String(o.lat ?? ''),
                lng: String(o.lng ?? ''),
                radiusMeters: String(o.radiusMeters ?? 200),
              }))
            : [newRow(0, 'Udaipur Office')]
        );
        setRequireLocation(Boolean(json.data?.requireOfficeLocation));
      })
      .catch(() => !cancelled && setNotice({ type: 'error', text: 'Could not load office locations.' }))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (id: string, patch: Partial<OfficeRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setNotice(null);
  };

  const fillCurrentLocation = async (id: string) => {
    setLocatingId(id);
    setNotice({ type: 'info', text: 'Getting your current location… allow location if the browser asks.' });
    const result = await requestPosition(15000);
    setLocatingId(null);
    if (!result.ok) {
      setNotice({
        type: 'error',
        text:
          result.reason === 'denied'
            ? 'Location permission is blocked for this site. Allow Location in the browser and try again.'
            : 'Your location could not be found. Turn on location / GPS and try again.',
      });
      return;
    }
    const { lat, lng, accuracy } = result.geo;
    update(id, { lat: lat.toFixed(7), lng: lng.toFixed(7) });
    setNotice({
      type: accuracy > 100 ? 'error' : 'success',
      text:
        accuracy > 100
          ? `Location filled, but it is not very accurate (±${Math.round(accuracy)} m). For the best result do this on a phone with GPS, standing inside the office.`
          : `Location filled (accurate to about ±${Math.round(accuracy)} m). Click "Save Office Locations" to keep it.`,
    });
  };

  const save = async () => {
    setIsSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/v1/settings/attendance/offices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requireOfficeLocation: requireLocation,
          offices: rows.map((r) => ({
            id: r.id,
            name: r.name,
            lat: r.lat.trim() === '' ? '' : Number(r.lat),
            lng: r.lng.trim() === '' ? '' : Number(r.lng),
            radiusMeters: Number(r.radiusMeters),
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setNotice({ type: 'error', text: json?.message || `Could not save (HTTP ${res.status}).` });
        return;
      }
      setNotice({ type: 'success', text: json.message || 'Office locations saved.' });
    } catch {
      setNotice({ type: 'error', text: 'Server connection error. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="mb-6 space-y-4 rounded-2xl border border-orange-200 bg-orange-50/30 p-4 sm:p-5 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orange-100 pb-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <MapPin className="h-4 w-4 text-orange-600" aria-hidden="true" /> Office Locations
          </h3>
          <p className="text-slate-500">
            When someone checks in as <span className="font-semibold">Office</span>, their location is matched with these offices.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" aria-hidden="true" /> Loading office locations…
        </div>
      ) : (
        <>
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={requireLocation}
              onChange={(e) => {
                setRequireLocation(e.target.checked);
                setNotice(null);
              }}
              className="mt-0.5 h-4 w-4 rounded text-orange-500"
            />
            <span>
              <span className="block font-bold text-slate-900">Office check-in only inside the office area</span>
              <span className="block text-slate-500">
                When on, &quot;Office&quot; check-in is refused if the person is farther than the radius from every office.
                Work From Home check-in is never blocked by location.
              </span>
            </span>
          </label>

          <div className="space-y-3">
            {rows.map((row, index) => {
              const hasPoint = row.lat.trim() !== '' && row.lng.trim() !== '';
              return (
                <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <label htmlFor={`${row.id}-name`} className="font-bold text-slate-900">Office name</label>
                      <input id={`${row.id}-name`} type="text" maxLength={60} value={row.name}
                        onChange={(e) => update(row.id, { name: e.target.value })} placeholder="e.g. Udaipur Office" className={inputClass} />
                    </div>
                    <div className="sm:col-span-3">
                      <label htmlFor={`${row.id}-lat`} className="font-bold text-slate-900">Latitude</label>
                      <input id={`${row.id}-lat`} type="text" inputMode="decimal" value={row.lat}
                        onChange={(e) => update(row.id, { lat: e.target.value })} placeholder="24.5845267" className={inputClass} />
                    </div>
                    <div className="sm:col-span-3">
                      <label htmlFor={`${row.id}-lng`} className="font-bold text-slate-900">Longitude</label>
                      <input id={`${row.id}-lng`} type="text" inputMode="decimal" value={row.lng}
                        onChange={(e) => update(row.id, { lng: e.target.value })} placeholder="73.7314268" className={inputClass} />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`${row.id}-radius`} className="font-bold text-slate-900">Radius (m)</label>
                      <input id={`${row.id}-radius`} type="number" min={50} max={2000} step={10} value={row.radiusMeters}
                        onChange={(e) => update(row.id, { radiusMeters: e.target.value })} className={inputClass} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fillCurrentLocation(row.id)}
                      disabled={locatingId !== null || isSaving}
                      className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50 cursor-pointer"
                    >
                      {locatingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />}
                      Use my current location
                    </button>
                    {hasPoint && (
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(row.lat.trim())},${encodeURIComponent(row.lng.trim())}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Check on Google Maps
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setRows((prev) => prev.filter((r) => r.id !== row.id));
                        setNotice(null);
                      }}
                      disabled={isSaving}
                      className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                      aria-label={`Remove ${row.name || `office ${index + 1}`}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                    </button>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-slate-500">
                No office added. Office check-in will not check location.
              </p>
            )}
          </div>

          {notice && (
            <div
              role={notice.type === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-2 rounded-xl border p-3 font-semibold ${
                notice.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : notice.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {notice.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <span>{notice.text}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setRows((prev) => [...prev, newRow(prev.length)]);
                setNotice(null);
              }}
              disabled={rows.length >= MAX_OFFICES || isSaving}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add another office
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving || locatingId !== null}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2 font-bold text-white shadow-md hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              Save Office Locations
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default OfficeLocationsSettings;