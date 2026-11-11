'use client';

import React, { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from '@/components/attendance/LiveMap';

export interface TrailPoint {
  id?: string;
  lat: number;
  lng: number;
  recordedAt: string;
  withinGeofence?: boolean | null;
}

interface Props {
  points: TrailPoint[];
  geofence?: { lat: number; lng: number; radiusMeters: number } | null;
  height?: number;
}

/** Draws one employee's movement for a day: route line, start (green) and end (red) markers, office geofence. */
export function TrackingTrailMap({ points, geofence, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    loadLeaflet()
      .then((L) => {
        if (disposed || !containerRef.current || mapRef.current) return;
        const map = L.map(containerRef.current).setView([20.5937, 78.9629], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !mapRef.current || !layerRef.current) return;
    const layer = layerRef.current;
    layer.clearLayers();
    const bounds: [number, number][] = [];

    if (geofence) {
      L.circle([geofence.lat, geofence.lng], {
        radius: geofence.radiusMeters,
        color: '#4f46e5',
        weight: 2,
        fillColor: '#6366f1',
        fillOpacity: 0.08,
      })
        .bindTooltip('Office geofence')
        .addTo(layer);
      bounds.push([geofence.lat, geofence.lng]);
    }

    if (points.length > 0) {
      const latlngs = points.map((p) => [p.lat, p.lng]) as [number, number][];
      L.polyline(latlngs, { color: '#6366f1', weight: 3, opacity: 0.7 }).addTo(layer);
      points.forEach((p) => {
        L.circleMarker([p.lat, p.lng], {
          radius: 3,
          color: p.withinGeofence === false ? '#e11d48' : '#4f46e5',
          fillOpacity: 1,
          weight: 1,
        }).addTo(layer);
        bounds.push([p.lat, p.lng]);
      });
      const label = (t: string, d: string) => {
        const el = document.createElement('div');
        el.textContent = `${t}: ${new Date(d).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}`;
        return el;
      };
      const first = points[0];
      const last = points[points.length - 1];
      L.circleMarker([first.lat, first.lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#059669', fillOpacity: 1 })
        .bindTooltip(label('Start', first.recordedAt))
        .addTo(layer);
      L.circleMarker([last.lat, last.lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#e11d48', fillOpacity: 1 })
        .bindTooltip(label('Last', last.recordedAt))
        .addTo(layer);
    }

    if (bounds.length > 0) mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
  }, [points, geofence, ready]);

  if (failed) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500" style={{ height }}>
        Map could not be loaded. Check your internet connection.
      </div>
    );
  }
  return <div ref={containerRef} className="z-0 w-full overflow-hidden rounded-xl border border-slate-200" style={{ height }} />;
}
