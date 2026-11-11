'use client';
import { Portal } from './Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useEffect } from 'react';
import { X, MapPin, Navigation, ShieldCheck, RefreshCw, Radio } from 'lucide-react';
import { LiveMap } from '@/components/attendance/LiveMap';
import type { LiveRow } from '@/lib/useLiveAttendance';

export interface OfficeLocationData {
  lat: number;
  lng: number;
  radiusMeters?: number;
  name?: string;
  geofenceEnabled?: boolean;
  geofenceEnforce?: boolean;
}

interface OfficeMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  officeLocation: OfficeLocationData | null;
  rows?: LiveRow[];
  title?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function OfficeMapModal({
  isOpen,
  onClose,
  officeLocation,
  rows = [],
  title = 'Office HQ Geofence & Location Map',
  onRefresh,
  isRefreshing = false,
}: OfficeMapModalProps) {
  useBodyScrollLock(isOpen);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const lat = officeLocation && Number.isFinite(officeLocation.lat) ? officeLocation.lat : 24.5845267;
  const lng = officeLocation && Number.isFinite(officeLocation.lng) ? officeLocation.lng : 73.7314268;
  const radius = officeLocation?.radiusMeters || 200;
  const officeName = officeLocation?.name || 'Head Office HQ';
  const isEnforced = Boolean(officeLocation?.geofenceEnforce);

  const geofenceProp = {
    lat,
    lng,
    radiusMeters: radius,
    enforce: isEnforced,
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-[#FFF7ED] p-2 text-orange-500 border border-[#FED7AA]/60">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live GPS
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {officeName} · Official organization attendance coordinates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                title="Refresh Coordinates"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-orange-500' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close Map Modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Badges Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-5 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-mono font-medium text-slate-700">
              <Navigation className="h-3 w-3 text-slate-400" />
              Lat: {lat.toFixed(6)}, Lng: {lng.toFixed(6)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-[#FFF7ED] px-2.5 py-1 text-[11px] font-semibold text-orange-700 border border-[#FED7AA]">
              <Radio className="h-3 w-3 text-orange-500" />
              Radius: {radius}m
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-100">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              {isEnforced ? 'Geofence Enforced' : 'Standard Geofence'}
            </span>
          </div>

          <span className="text-[11px] text-slate-400 font-medium">
            Managed via Admin Settings
          </span>
        </div>

        {/* Map Viewport */}
        <div className="relative flex-1 min-h-[380px] sm:min-h-[460px] bg-slate-100">
          <LiveMap
            rows={rows}
            geofence={geofenceProp}
            height="100%"
            officeTitle={officeName}
          />
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <MapPin className="h-4 w-4 text-orange-500 shrink-0" />
            <span className="font-semibold text-slate-900">{officeName}:</span>
            <span className="text-[11px] text-slate-500">
              Attendance clock-ins are validated against this {radius}m circular boundary.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
          >
            Close Map
          </button>
        </div>
      </div>
    </div>
      </Portal>
);
}

