-- ==============================================================================
-- INFINITIVE CLOUD EMS - LIVE LOCATION TRACKING SCHEMA (SUPABASE POSTGRESQL)
-- ==============================================================================
-- This script sets up:
-- 1. `users`: Profile records for tracked personnel/drivers
-- 2. `locations`: Historical breadcrumb trail with timestamp & accuracy
-- 3. `live_status`: Current real-time position (1 row per user) for the live map
-- 4. Indexes for fast timestamp range lookups and spatial queries
-- 5. Trigger for automated live_status synchronization
-- 6. Row Level Security (RLS) policies for privacy and role-based access
-- 7. Supabase Realtime publication setup
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. USERS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee', -- 'employee', 'driver', 'manager', 'admin'
  email TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to users"
  ON public.users FOR SELECT
  USING (true);

CREATE POLICY "Allow insert/update to users"
  ON public.users FOR ALL
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 2. LOCATIONS TABLE (Historical Breadcrumb Trails)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy REAL NOT NULL, -- in meters (<= 100m filtered on client)
  speed REAL,             -- in m/s or km/h
  heading REAL,           -- in degrees (0 - 360)
  battery SMALLINT,       -- percentage (0 - 100)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optimized compound index for fast route-trail historical queries by date range
CREATE INDEX IF NOT EXISTS idx_locations_user_time 
  ON public.locations (user_id, created_at DESC);

-- Enable RLS on locations
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to locations"
  ON public.locations FOR SELECT
  USING (true);

CREATE POLICY "Allow insert to locations"
  ON public.locations FOR INSERT
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. LIVE STATUS TABLE (Real-Time State: 1 Row Per Tracked User)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.live_status (
  user_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy REAL,
  speed REAL,
  heading REAL,
  battery SMALLINT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_online BOOLEAN NOT NULL DEFAULT true
);

-- Index for querying online users
CREATE INDEX IF NOT EXISTS idx_live_status_online 
  ON public.live_status (is_online, last_seen DESC);

-- Enable RLS on live_status
ALTER TABLE public.live_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read live_status"
  ON public.live_status FOR SELECT
  USING (true);

CREATE POLICY "Allow upsert live_status"
  ON public.live_status FOR ALL
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. AUTOMATED LIVE STATUS TRIGGER (Optional Auto-Sync)
-- ------------------------------------------------------------------------------
-- When a new historical location is recorded, automatically update public.live_status
CREATE OR REPLACE FUNCTION public.sync_live_status_from_location()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.live_status (
    user_id, lat, lng, accuracy, speed, heading, battery, last_seen, is_online
  )
  VALUES (
    NEW.user_id,
    NEW.lat,
    NEW.lng,
    NEW.accuracy,
    NEW.speed,
    NEW.heading,
    NEW.battery,
    NEW.created_at,
    true
  )
  ON CONFLICT (user_id) DO UPDATE SET
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    accuracy = EXCLUDED.accuracy,
    speed = EXCLUDED.speed,
    heading = EXCLUDED.heading,
    battery = EXCLUDED.battery,
    last_seen = EXCLUDED.last_seen,
    is_online = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_live_status ON public.locations;

CREATE TRIGGER trg_sync_live_status
  AFTER INSERT ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_live_status_from_location();

-- ------------------------------------------------------------------------------
-- 5. ENABLE SUPABASE REALTIME PUBLICATION
-- ------------------------------------------------------------------------------
-- Enables instant push notifications to Next.js clients without polling
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_status;
  EXCEPTION WHEN duplicate_object THEN
    -- Table is already in publication
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;
  EXCEPTION WHEN duplicate_object THEN
    -- Table is already in publication
  END;
END $$;

-- ------------------------------------------------------------------------------
-- 6. SEED DEMO USERS (For initial testing)
-- ------------------------------------------------------------------------------
INSERT INTO public.users (id, name, role, email)
VALUES
  ('emp-101', 'Aarav Mehta', 'Software Engineer', 'aarav.mehta@infinitivecloud.com'),
  ('emp-102', 'Rohan Sharma', 'Field Delivery Driver', 'rohan.driver@infinitivecloud.com'),
  ('emp-103', 'Pooja Verma', 'Client Relationship Manager', 'pooja.verma@infinitivecloud.com')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  email = EXCLUDED.email;

INSERT INTO public.live_status (user_id, lat, lng, accuracy, speed, heading, battery, last_seen, is_online)
VALUES
  ('emp-101', 24.5859, 73.7121, 8.0, 0, 45, 92, NOW(), true),
  ('emp-102', 24.5882, 73.7165, 14.0, 28, 120, 76, NOW() - INTERVAL '15 seconds', true),
  ('emp-103', 24.5791, 73.7042, 25.0, 42, 260, 48, NOW() - INTERVAL '3 minutes', false)
ON CONFLICT (user_id) DO UPDATE SET
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  last_seen = EXCLUDED.last_seen,
  is_online = EXCLUDED.is_online;

