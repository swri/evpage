-- ============================================================
-- Migration: 20261027020000_payment_proof_bucket_limits.sql
-- Server-side limits for the private payment-proofs bucket, matching
-- src/lib/payment-proof.ts (5 MB; JPG/PNG/WEBP/PDF). The client checks the
-- same rules, but uploads go straight to Storage with the anon key.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
BEGIN
    -- Columns exist on Supabase Storage; skipped on plain Postgres test stubs
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types'
    ) THEN
        EXECUTE $sql$
            UPDATE storage.buckets
            SET file_size_limit = 5242880,
                allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
            WHERE id = 'payment-proofs'
        $sql$;
    END IF;
END;
$$;
