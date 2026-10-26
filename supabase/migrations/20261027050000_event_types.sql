-- ============================================================
-- Migration: 20261027050000_event_types.sql
-- Events reference an event-type module defined in code
-- (src/lib/event-types). type_config holds per-event, data-only overrides
-- (labels, grouping on/off, default group count, allowed strategies).
-- Unknown ids fall back to 'general' in the app, so no CHECK constraint:
-- new modules can ship without a migration.
-- ============================================================
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS type_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_type_config_is_object;
ALTER TABLE public.events
    ADD CONSTRAINT events_type_config_is_object CHECK (jsonb_typeof(type_config) = 'object');
