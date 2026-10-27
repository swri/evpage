-- ============================================================
-- Migration: 20261031000000_allow_authenticated_storage_uploads.sql
-- Allow authenticated admins/members to upload, update, and delete
-- assets (logos, QRIS, event banners, form files) in form-attachments
-- ============================================================

-- 1. Ensure bucket configuration allows public reading
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-attachments', 'form-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit'
    ) THEN
        EXECUTE $sql$
            UPDATE storage.buckets
            SET file_size_limit = 5242880,
                allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf']
            WHERE id = 'form-attachments'
        $sql$;
    END IF;
END;
$$;

-- 2. Allow authenticated users (admins) to upload to form-attachments
DROP POLICY IF EXISTS "Authenticated users upload form attachments" ON storage.objects;
CREATE POLICY "Authenticated users upload form attachments" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'form-attachments');

-- 3. Allow authenticated users (admins) to update form attachments
DROP POLICY IF EXISTS "Authenticated users update form attachments" ON storage.objects;
CREATE POLICY "Authenticated users update form attachments" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'form-attachments')
    WITH CHECK (bucket_id = 'form-attachments');

-- 4. Allow authenticated users (admins) to delete form attachments
DROP POLICY IF EXISTS "Authenticated users delete form attachments" ON storage.objects;
CREATE POLICY "Authenticated users delete form attachments" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'form-attachments');

-- 5. Keep participant policy for anonymous form attachments of open events
DROP POLICY IF EXISTS "Participants upload form attachments for open events" ON storage.objects;
CREATE POLICY "Participants upload form attachments for open events" ON storage.objects
    FOR INSERT TO anon
    WITH CHECK (
        bucket_id = 'form-attachments'
        AND public.is_event_open(public.proof_event_id(name))
    );
