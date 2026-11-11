import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : (null as unknown as ReturnType<typeof createClient>);

export interface TrackedUser {
  id: string;
  name: string;
  role: 'admin' | 'employee' | 'driver' | string;
  email?: string;
  avatar_url?: string;
}

export interface LocationRecord {
  id?: string;
  user_id: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  created_at?: string;
}

export interface LiveStatusRecord {
  user_id: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  battery?: number | null;
  last_seen: string;
  is_online: boolean;
  user?: TrackedUser;
}

export interface GeofenceZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  alertOnExit?: boolean;
  alertOnEnter?: boolean;
}

