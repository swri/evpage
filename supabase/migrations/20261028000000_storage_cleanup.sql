-- ============================================================
-- Migration: 20261028000000_storage_cleanup.sql
-- Keeps the payment-proofs bucket small (Supabase free tier has a storage cap).
--
-- Supabase does not allow deleting Storage files with SQL; files are removed
-- by the app through the Storage API. These functions only decide WHICH files
-- may go and clear the database references, then return the paths:
--   * purge_event_payment_proofs(event): after an event is finished (closed or
--     start date passed), event managers clear every proof of that event;
--     platform admins may do it any time.
--   * list_orphan_payment_proofs(event?): files no registration points to
--     (upload succeeded but registration failed, or spam uploads), older than
--     one hour so in-flight registrations are not touched.
--   * event_storage_files / organization_storage_files: files to remove
--     before deleting an event / organization.
--   * platform_overview(): usage per organization and event, admins only.
--   * purge_expired_invitations(): admins only.
-- ============================================================

ALTER TABLE public.registrations
    ADD COLUMN IF NOT EXISTS payment_proof_purged_at TIMESTAMPTZ;

-- Event managers (and platform admins) may delete proof files of their events;
-- platform admins also files whose event no longer exists
DROP POLICY IF EXISTS "Event managers delete payment proofs" ON storage.objects;
CREATE POLICY "Event managers delete payment proofs" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'payment-proofs' AND public.event_can(public.proof_event_id(name), 'events.manage'));

CREATE OR REPLACE FUNCTION public.is_event_finished(p_event UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.events
        WHERE id = p_event AND (status = 'closed' OR (starts_at IS NOT NULL AND starts_at < NOW()))
    );
$$;

CREATE OR REPLACE FUNCTION public.purge_event_payment_proofs(p_event_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_paths TEXT[];
BEGIN
    IF NOT public.event_can(p_event_id, 'events.manage') THEN
        RAISE EXCEPTION 'Event tidak ditemukan';
    END IF;
    IF NOT public.is_platform_admin() AND NOT public.is_event_finished(p_event_id) THEN
        RAISE EXCEPTION 'Bukti bayar baru bisa dibersihkan setelah event selesai (ditutup atau tanggal mulai lewat)';
    END IF;

    -- Every file in the event folder, including orphans
    SELECT COALESCE(array_agg(o.name), ARRAY[]::TEXT[]) INTO v_paths
    FROM storage.objects o
    WHERE o.bucket_id = 'payment-proofs' AND public.proof_event_id(o.name) = p_event_id;

    -- Clear references first: if file removal fails later the files become
    -- orphans and are picked up by list_orphan_payment_proofs
    UPDATE public.registrations
    SET payment_proof_path = '', payment_proof_purged_at = NOW()
    WHERE event_id = p_event_id AND COALESCE(payment_proof_path, '') <> '';

    RETURN v_paths;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_orphan_payment_proofs(p_event_id UUID DEFAULT NULL)
RETURNS TABLE (name TEXT, event_id UUID, size_bytes BIGINT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT o.name, public.proof_event_id(o.name), COALESCE((o.metadata ->> 'size')::BIGINT, 0), o.created_at
    FROM storage.objects o
    WHERE o.bucket_id = 'payment-proofs'
      AND o.created_at < NOW() - INTERVAL '1 hour'
      AND (p_event_id IS NULL OR public.proof_event_id(o.name) = p_event_id)
      AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.payment_proof_path = o.name)
      AND public.event_can(public.proof_event_id(o.name), 'events.manage');
$$;

CREATE OR REPLACE FUNCTION public.event_storage_files(p_event_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.event_can(p_event_id, 'events.manage') THEN
        RAISE EXCEPTION 'Event tidak ditemukan';
    END IF;
    RETURN (
        SELECT COALESCE(array_agg(o.name), ARRAY[]::TEXT[]) FROM storage.objects o
        WHERE o.bucket_id = 'payment-proofs' AND public.proof_event_id(o.name) = p_event_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.organization_storage_files(p_org UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.org_role(p_org) = 'owner' OR public.is_platform_admin()) THEN
        RAISE EXCEPTION 'Organisasi tidak ditemukan';
    END IF;
    RETURN (
        SELECT COALESCE(array_agg(o.name), ARRAY[]::TEXT[]) FROM storage.objects o
        JOIN public.events e ON e.id = public.proof_event_id(o.name)
        WHERE o.bucket_id = 'payment-proofs' AND e.organization_id = p_org
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Hanya super admin';
    END IF;

    RETURN jsonb_build_object(
        'storage', (
            SELECT jsonb_build_object(
                'files', COUNT(*),
                'bytes', COALESCE(SUM((metadata ->> 'size')::BIGINT), 0)
            )
            FROM storage.objects WHERE bucket_id = 'payment-proofs'
        ),
        'organizations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', org.id,
                'name', org.name,
                'created_at', org.created_at,
                'members', (SELECT COUNT(*) FROM public.organization_members m WHERE m.organization_id = org.id),
                'events', (SELECT COUNT(*) FROM public.events e WHERE e.organization_id = org.id)
            ) ORDER BY org.created_at DESC)
            FROM public.organizations org
        ), '[]'::jsonb),
        'events', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', e.id,
                'title', e.title,
                'slug', e.slug,
                'status', e.status,
                'starts_at', e.starts_at,
                'organization_id', e.organization_id,
                'finished', public.is_event_finished(e.id),
                'registrations', (SELECT COUNT(*) FROM public.registrations r WHERE r.event_id = e.id),
                'files', (SELECT COUNT(*) FROM storage.objects o
                          WHERE o.bucket_id = 'payment-proofs' AND public.proof_event_id(o.name) = e.id),
                'bytes', (SELECT COALESCE(SUM((o.metadata ->> 'size')::BIGINT), 0) FROM storage.objects o
                          WHERE o.bucket_id = 'payment-proofs' AND public.proof_event_id(o.name) = e.id)
            ) ORDER BY e.created_at DESC)
            FROM public.events e
        ), '[]'::jsonb),
        'expired_invitations', (
            SELECT COUNT(*) FROM public.organization_invitations
            WHERE accepted_at IS NULL AND expires_at < NOW()
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_invitations()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Hanya super admin';
    END IF;
    DELETE FROM public.organization_invitations WHERE accepted_at IS NULL AND expires_at < NOW();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
