-- ============================================================
-- Migration: 20261029000000_event_location_url.sql
-- Optional map link (e.g. a Google Maps share URL) for an event's location.
-- The app only renders http(s) values as links.
-- ============================================================
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS location_url TEXT;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_location_url_http;
ALTER TABLE public.events
    ADD CONSTRAINT events_location_url_http
    CHECK (location_url IS NULL OR location_url ~* '^https?://');
