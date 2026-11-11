'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { LiveRow } from '@/lib/useLiveAttendance';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, Compass, Navigation } from 'lucide-react';

interface Props {
  rows: LiveRow[];
  geofence: { lat: number; lng: number; radiusMeters: number; enforce?: boolean } | null;
  height?: number | string;
  /** Employee to highlight and pan to; null shows everyone. */
  focusId?: string | null;
  onSelect?: (employeeId: string) => void;
  officeTitle?: string;
  editableOffice?: boolean;
  onOfficeChange?: (lat: number, lng: number) => void;
}

const MARKER_COLORS = {
  live: '#059669',
  outside: '#e11d48',
  stale: '#91a0b5',
  office: '#4f46e5',
};

function agoLabel(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

export async function loadLeaflet(): Promise<any> {
  const leafletModule = await import('leaflet');
  const L = leafletModule.default || leafletModule;
  if (typeof window !== 'undefined') {
    (window as any).L = L;
  }
  return L;
}

export function LiveMap({
  rows,
  geofence,
  height = 340,
  focusId = null,
  onSelect,
  officeTitle,
  editableOffice = false,
  onOfficeChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const fittedRef = useRef(false);
  const lastFocusRef = useRef<string | null>(null);
  const lastGeofenceRef = useRef<{ lat: number; lng: number; radiusMeters: number } | null>(null);
  const boundsRef = useRef<[number, number][]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onOfficeChangeRef = useRef(onOfficeChange);
  onOfficeChangeRef.current = onOfficeChange;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Initialize Leaflet cleanly from local npm module
  useEffect(() => {
    let disposed = false;
    let mapInstance: any = null;

    import('leaflet')
      .then((leafletModule) => {
        if (disposed || !containerRef.current) return;
        const L = leafletModule.default || leafletModule;

        // Clean any existing map instance and _leaflet_id to avoid "Map container is already initialized"
        if (mapRef.current) {
          try {
            mapRef.current.remove();
          } catch {}
          mapRef.current = null;
        }
        if (containerRef.current && (containerRef.current as any)._leaflet_id) {
          delete (containerRef.current as any)._leaflet_id;
        }

        const defaultLat = geofence && Number.isFinite(geofence.lat) && geofence.lat !== 0 ? geofence.lat : 24.58465;
        const defaultLng = geofence && Number.isFinite(geofence.lng) && geofence.lng !== 0 ? geofence.lng : 73.73155;

        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView([defaultLat, defaultLng], 15);

        if (editableOffice) {
          map.on('click', (e: any) => {
            if (onOfficeChangeRef.current) {
              onOfficeChangeRef.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
            }
          });
        }

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const layer = L.layerGroup().addTo(map);
        layerRef.current = layer;
        mapRef.current = map;
        mapInstance = map;
        setReady(true);

        // Invalidate size once DOM layout settles (handles modals, collapsible sections, tab switches)
        [50, 150, 300, 600, 1000].forEach((delay) => {
          setTimeout(() => {
            if (!disposed && map) {
              map.invalidateSize();
            }
          }, delay);
        });
      })
      .catch((err) => {
        console.warn('Leaflet initialization failed:', err);
        setFailed(true);
      });

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch {}
      }
      mapRef.current = null;
      layerRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  const fitAll = () => {
    if (mapRef.current && boundsRef.current.length > 0) {
      if (boundsRef.current.length === 1) {
        mapRef.current.setView(boundsRef.current[0], 15);
      } else {
        mapRef.current.fitBounds(boundsRef.current, { padding: [40, 40], maxZoom: 16 });
      }
    }
  };

  // Redraw markers whenever data changes
  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current) return;

    import('leaflet').then((leafletModule) => {
      const L = leafletModule.default || leafletModule;
      const layer = layerRef.current;
      if (!layer || !mapRef.current) return;

      layer.clearLayers();
      const bounds: [number, number][] = [];

      // Draw Office Geofence Circle & Hub Marker
      if (geofence && Number.isFinite(geofence.lat) && Number.isFinite(geofence.lng) && (geofence.lat !== 0 || geofence.lng !== 0)) {
        // Geofence boundary circle
        L.circle([geofence.lat, geofence.lng], {
          radius: geofence.radiusMeters || 100,
          color: MARKER_COLORS.office,
          weight: 2,
          fillColor: '#6366f1',
          fillOpacity: 0.12,
        })
          .bindTooltip(`Office Geofence (${geofence.radiusMeters || 100}m radius)`, { permanent: false, direction: 'top' })
          .addTo(layer);

        // Office Marker Outer Halo Ring
        L.circleMarker([geofence.lat, geofence.lng], {
          radius: 14,
          color: '#4f46e5',
          weight: 1.5,
          fillColor: '#818cf8',
          fillOpacity: 0.25,
        }).addTo(layer);

        // Office Marker Core
        const officeMarker = L.circleMarker([geofence.lat, geofence.lng], {
          radius: 8,
          color: '#ffffff',
          weight: 2.5,
          fillColor: MARKER_COLORS.office,
          fillOpacity: 1,
        });

        const tooltipHtml = `
          <div style="font-family: inherit; font-size: 11px; line-height: 1.4; color: #0f172a; padding: 2px;">
            <div style="font-weight: 800; font-size: 12px; color: #1e1b4b;">
              🏢 ${officeTitle || 'Head Office HQ'}
            </div>
            <div style="color: #4f46e5; font-weight: 600; margin-top: 2px;">
              Configured Geofence Center
            </div>
            <div style="font-family: monospace; font-size: 10px; color: #475569; margin-top: 2px;">
              Lat: ${geofence.lat.toFixed(6)}, Lng: ${geofence.lng.toFixed(6)}
            </div>
            <div style="font-size: 10px; font-weight: 700; color: #059669; margin-top: 2px;">
              Radius: ${geofence.radiusMeters || 100}m
            </div>
          </div>
        `;

        officeMarker.bindTooltip(tooltipHtml, {
          direction: 'top',
          permanent: rows.length === 0,
          offset: [0, -8],
        });

        officeMarker.addTo(layer);
        bounds.push([geofence.lat, geofence.lng]);
      }

      let focusLatLng: [number, number] | null = null;

      // Draw Employee Markers
      rows.forEach((r) => {
        const loc = r.location;
        if (!loc) return;
        const isFocused = focusId === r.employeeId;
        const color = loc.stale
          ? MARKER_COLORS.stale
          : loc.withinGeofence === false
          ? MARKER_COLORS.outside
          : MARKER_COLORS.live;

        const marker = L.circleMarker([loc.lat, loc.lng], {
          radius: isFocused ? 12 : 8,
          color: isFocused ? '#1e1b4b' : '#ffffff',
          weight: isFocused ? 3 : 2,
          fillColor: color,
          fillOpacity: focusId && !isFocused ? 0.5 : 1,
        });

        if (isFocused && loc.accuracy && loc.accuracy > 0) {
          L.circle([loc.lat, loc.lng], {
            radius: loc.accuracy,
            color,
            weight: 1,
            fillColor: color,
            fillOpacity: 0.1,
            interactive: false,
          }).addTo(layer);
        }

        const div = document.createElement('div');
        div.className = 'text-xs p-1 text-slate-800 font-sans';
        const strong = document.createElement('strong');
        strong.className = 'block font-bold text-slate-900';
        strong.textContent = r.name;
        div.appendChild(strong);

        const sub = document.createElement('div');
        sub.className = 'text-[10px] text-slate-500 font-medium mt-0.5';
        const status = loc.stale
          ? 'Signal lost'
          : loc.withinGeofence === false
          ? 'Outside office area'
          : 'At office / Live';
        const ago = agoLabel(loc.lastPingAt);
        sub.textContent = ago ? `${status} · ${ago}` : status;
        div.appendChild(sub);

        marker.bindTooltip(div, { direction: 'top', permanent: isFocused });
        marker.on('click', () => onSelectRef.current?.(r.employeeId));
        marker.addTo(layer);

        if (isFocused) {
          marker.bringToFront();
          focusLatLng = [loc.lat, loc.lng];
        }
        bounds.push([loc.lat, loc.lng]);
      });

      boundsRef.current = bounds;

      const geofenceChanged =
        geofence &&
        (!lastGeofenceRef.current ||
          lastGeofenceRef.current.lat !== geofence.lat ||
          lastGeofenceRef.current.lng !== geofence.lng ||
          lastGeofenceRef.current.radiusMeters !== geofence.radiusMeters);

      if (geofenceChanged) {
        lastGeofenceRef.current = { lat: geofence.lat, lng: geofence.lng, radiusMeters: geofence.radiusMeters };
      }

      if (focusId !== lastFocusRef.current) {
        lastFocusRef.current = focusId;
        if (focusLatLng) {
          mapRef.current.flyTo(focusLatLng, Math.max(mapRef.current.getZoom(), 16), { duration: 0.6 });
        } else if (bounds.length > 0) {
          if (bounds.length === 1) {
            mapRef.current.setView(bounds[0], 15);
          } else {
            mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
          }
        }
        fittedRef.current = bounds.length > 0;
      } else if (geofenceChanged && bounds.length > 0) {
        if (bounds.length === 1 && geofence) {
          mapRef.current.flyTo([geofence.lat, geofence.lng], 15, { duration: 0.7 });
        } else {
          mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        }
        fittedRef.current = true;
      } else if (bounds.length > 0 && !fittedRef.current) {
        if (bounds.length === 1) {
          mapRef.current.setView(bounds[0], 15);
        } else {
          mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        }
        fittedRef.current = true;
      }

      [50, 150, 300, 600].forEach((delay) => {
        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.invalidateSize();
          }
        }, delay);
      });
    });
  }, [rows, geofence, ready, focusId]);

  // Fallback: Rich vector radar view if WebGL / Canvas / Tiles fail
  if (failed) {
    return (
      <div
        className="relative flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 text-white overflow-hidden shadow-inner"
        style={{ height }}
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="h-64 w-64 rounded-full border border-orange-400/60" />
          <div className="absolute h-48 w-48 rounded-full border border-orange-400/60" />
          <div className="absolute h-32 w-32 rounded-full border border-orange-400/60" />
          <div className="absolute h-16 w-16 rounded-full border border-orange-400/60" />
          <div className="absolute h-full w-px bg-orange-400/30" />
          <div className="absolute w-full h-px bg-orange-400/30" />
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 shadow-lg shadow-orange-500/40">
            <Compass className="h-5 w-5 text-white animate-spin-slow" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
          </div>
          <span className="mt-2 text-xs font-bold tracking-wider text-orange-200 uppercase">Office Geofence Hub</span>
          <span className="text-[10px] text-slate-400 font-mono">
            {geofence
              ? `${geofence.lat.toFixed(4)}° N, ${geofence.lng.toFixed(4)}° E (${geofence.radiusMeters}m radius)`
              : 'No geofence configured'}
          </span>
        </div>

        <div className="relative z-10 mt-4 flex flex-wrap items-center justify-center gap-2 max-w-lg">
          {rows.slice(0, 6).map((r, i) => (
            <div
              key={r.employeeId || i}
              onClick={() => onSelect?.(r.employeeId)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-xs border border-white/15 hover:bg-white/20 cursor-pointer transition-colors"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  r.location?.withinGeofence === false
                    ? 'bg-rose-400 animate-pulse'
                    : 'bg-emerald-400'
                }`}
              />
              <span className="text-slate-100">{r.name}</span>
              <span className="text-[9px] text-orange-300 font-mono">
                {r.location?.withinGeofence === false ? 'Outside' : 'At Office'}
              </span>
            </div>
          ))}
        </div>

        <div className="absolute bottom-2 right-3 z-10 text-[10px] text-slate-400 font-mono">
          Radar Telemetry View (Live Active)
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" style={{ height }}>
      {/* Loading Skeleton */}
      {!ready && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-100/90 backdrop-blur-xs text-xs text-slate-500 font-medium"
          style={{ height }}
        >
          <div className="flex items-center gap-2 text-orange-500 mb-1">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-bold">Loading Live Team Location Map...</span>
          </div>
          <p className="text-[11px] text-slate-400">Connecting to OpenStreetMap telemetry</p>
        </div>
      )}

      {/* Map DOM Canvas */}
      <div ref={containerRef} className="h-full w-full z-0" />

      {ready && (
        <>
          <div className="pointer-events-none absolute bottom-2 left-2 z-[400] flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-white/95 backdrop-blur-xs px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 shadow-md border border-slate-200/80">
            {[
              { label: 'At office / live', color: MARKER_COLORS.live },
              { label: 'Outside geofence', color: MARKER_COLORS.outside },
              { label: 'Signal lost', color: MARKER_COLORS.stale },
              ...(geofence ? [{ label: 'Office Geofence', color: MARKER_COLORS.office }] : []),
            ].map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full border border-white" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>

          <div className="absolute right-2 top-2 z-[400] flex items-center gap-1.5">
            {geofence && Number.isFinite(geofence.lat) && Number.isFinite(geofence.lng) && (
              <button
                type="button"
                onClick={() => {
                  if (mapRef.current && geofence) {
                    mapRef.current.flyTo([geofence.lat, geofence.lng], 16, { duration: 0.6 });
                  }
                }}
                className="rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-orange-700 shadow-sm hover:bg-[#FFF7ED] border-[#FED7AA] cursor-pointer flex items-center gap-1"
                title="Center on Office HQ"
              >
                <MapPin className="h-3 w-3 text-orange-500" />
                <span>Office HQ</span>
              </button>
            )}
            <button
              type="button"
              onClick={fitAll}
              className="rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
            >
              Fit all
            </button>
          </div>
        </>
      )}
    </div>
  );
}
