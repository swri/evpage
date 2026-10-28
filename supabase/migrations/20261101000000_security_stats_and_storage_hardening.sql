-- ============================================================
-- Migration: 20261101000000_security_stats_and_storage_hardening.sql
-- 1. Fix Cross-Tenant IDOR on RPC get_event_admin_stats
-- 2. Tighten form-attachments Storage UPDATE & DELETE policies to owners / event managers
-- 3. Reset wa_number database DEFAULT from dummy to empty string
-- ============================================================

-- 1. Restrict get_event_admin_stats to authorized members / platform admins
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
    WHERE e.id = ANY(p_event_ids)
      AND (public.is_platform_admin() OR public.is_org_member(e.organization_id));
$$;

GRANT EXECUTE ON FUNCTION public.get_event_admin_stats(UUID[]) TO authenticated;

-- 2. Tighten Storage Policies for form-attachments
DROP POLICY IF EXISTS "Authenticated users update form attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users update form attachments" ON storage.objects;
CREATE POLICY "Authorized users update form attachments" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'form-attachments'
        AND (
            public.is_platform_admin()
            OR owner = auth.uid()
            OR public.event_can(public.proof_event_id(name), 'events.manage')
        )
    )
    WITH CHECK (
        bucket_id = 'form-attachments'
        AND (
            public.is_platform_admin()
            OR owner = auth.uid()
            OR public.event_can(public.proof_event_id(name), 'events.manage')
        )
    );

DROP POLICY IF EXISTS "Authenticated users delete form attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users delete form attachments" ON storage.objects;
CREATE POLICY "Authorized users delete form attachments" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'form-attachments'
        AND (
            public.is_platform_admin()
            OR owner = auth.uid()
            OR public.event_can(public.proof_event_id(name), 'events.manage')
        )
    );

-- 3. Reset wa_number DEFAULT from dummy '6281234567890' to empty string
ALTER TABLE public.organizations ALTER COLUMN wa_number SET DEFAULT '';
UPDATE public.organizations SET wa_number = '' WHERE wa_number = '6281234567890';
