-- ============================================================
-- Migration: 20261030000000_event_admin_stats_and_storage.sql
-- 1. Aggregation RPC for admin event lists (avoids client full table scans)
-- 2. Storage bucket & RLS policies for custom form attachments
-- ============================================================

-- 1. Aggregation RPC for admin events list
CREATE OR REPLACE FUNCTION public.get_event_admin_stats(p_event_ids UUID[])
RETURNS TABLE (
    event_id UUID,
    slots_used INT,
    total_registrations INT,
    verified_registrations INT,
    pending_registrations INT,
    rejected_registrations INT,
    total_revenue BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        e.id,
        public.event_slots_used(e.id),
        (SELECT COUNT(*)::INT FROM public.registrations r WHERE r.event_id = e.id),
        (SELECT COUNT(*)::INT FROM public.registrations r WHERE r.event_id = e.id AND r.status = 'verified'),
        (SELECT COUNT(*)::INT FROM public.registrations r WHERE r.event_id = e.id AND r.status = 'pending'),
        (SELECT COUNT(*)::INT FROM public.registrations r WHERE r.event_id = e.id AND r.status = 'rejected'),
        COALESCE((SELECT SUM(r.total_amount)::BIGINT FROM public.registrations r WHERE r.event_id = e.id AND r.status = 'verified'), 0)
    FROM public.events e
    WHERE e.id = ANY(p_event_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_event_admin_stats(UUID[]) TO authenticated;

-- 2. Storage bucket for custom form file uploads (attachments)
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-attachments', 'form-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy: Participants can upload attachments for open events
DROP POLICY IF EXISTS "Participants upload form attachments for open events" ON storage.objects;
CREATE POLICY "Participants upload form attachments for open events" ON storage.objects
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        bucket_id = 'form-attachments'
        AND public.is_event_open(public.proof_event_id(name))
    );

-- Policy: Anyone can read form attachments
DROP POLICY IF EXISTS "Public can view form attachments" ON storage.objects;
CREATE POLICY "Public can view form attachments" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'form-attachments');

-- Policy: Event managers can delete form attachments of their events
DROP POLICY IF EXISTS "Event managers delete form attachments" ON storage.objects;
CREATE POLICY "Event managers delete form attachments" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'form-attachments'
        AND public.event_can(public.proof_event_id(name), 'events.manage')
    );
