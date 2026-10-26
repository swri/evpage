-- ============================================================
-- Migration: 20261027060000_notification_templates.sql
-- Per-event overrides for participant messages, keyed by NotificationKind
-- (src/lib/notifications.ts). Missing keys use the app defaults; the
-- existing wa_template stays the registration confirmation template.
-- ============================================================
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS notification_templates JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_notification_templates_is_object;
ALTER TABLE public.events
    ADD CONSTRAINT events_notification_templates_is_object CHECK (jsonb_typeof(notification_templates) = 'object');
