-- ============================================================
-- Form Pendaftaran Event yang Dapat Dikustomisasi (EvPage)
-- Supabase Postgres Schema, RLS, Functions & Storage Setup
-- ============================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Table: admins
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Table: organizations (settings)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL DEFAULT 'EvPage Organizer',
    logo_url TEXT,
    accent_color TEXT DEFAULT '#171717',
    wa_number TEXT DEFAULT '6281234567890',
    payment_info JSONB DEFAULT '{
        "bank_name": "BCA",
        "account_number": "1234567890",
        "account_holder": "Panitia Event",
        "qris_url": "",
        "instructions": "Transfer sesuai nominal. Simpan dan unggah bukti transfer di form ini."
    }'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Table: events
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    location TEXT,
    starts_at TIMESTAMPTZ,
    registration_deadline TIMESTAMPTZ,
    quota INT DEFAULT 50,
    price_type TEXT DEFAULT 'fixed' CHECK (price_type IN ('free', 'fixed', 'per_participant')),
    price_amount NUMERIC DEFAULT 0,
    prefix_code TEXT DEFAULT 'EVT',
    form_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
    wa_template TEXT DEFAULT 'Halo Admin, saya telah mendaftar di *{event}*.\n\nKode Pendaftaran: *{kode}*\nNama Kontak: *{nama}*\nTotal Bayar: *Rp {total}*\nBukti Pembayaran: {bukti}\n\nMohon diverifikasi, terima kasih!',
    success_message TEXT DEFAULT 'Terima kasih telah mendaftar! Mohon segera konfirmasi pembayaran melalui WhatsApp.',
    status TEXT DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Table: registrations
CREATE TABLE IF NOT EXISTS public.registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC DEFAULT 0,
    payment_proof_path TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    admin_note TEXT,
    contact_name TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES public.admins(id) ON DELETE SET NULL
);

-- Create Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_events_slug ON public.events(slug);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON public.registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_code ON public.registrations(code);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON public.registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_contact_phone ON public.registrations(contact_phone);

-- 5. Atomic Registration Function (Prevents overselling / race condition & generates sequential code)
CREATE OR REPLACE FUNCTION public.create_registration_atomic(
    p_event_id UUID,
    p_answers JSONB,
    p_schema_snapshot JSONB,
    p_total_amount NUMERIC,
    p_payment_proof_path TEXT,
    p_contact_name TEXT,
    p_contact_phone TEXT,
    p_contact_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event RECORD;
    v_current_count INT;
    v_next_num INT;
    v_reg_code TEXT;
    v_year TEXT;
    v_new_reg RECORD;
BEGIN
    -- 1. Lock the event row for update to prevent concurrent race condition on quota
    SELECT * INTO v_event
    FROM public.events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event tidak ditemukan';
    END IF;

    -- Check if event is open
    IF v_event.status <> 'open' THEN
        RAISE EXCEPTION 'Pendaftaran untuk event ini sedang ditutup';
    END IF;

    -- Check deadline
    IF v_event.registration_deadline IS NOT NULL AND v_event.registration_deadline < NOW() THEN
        RAISE EXCEPTION 'Batas waktu pendaftaran telah berakhir';
    END IF;

    -- Check quota
    SELECT COUNT(*) INTO v_current_count
    FROM public.registrations
    WHERE event_id = p_event_id AND status IN ('pending', 'verified');

    IF v_event.quota IS NOT NULL AND v_event.quota > 0 AND v_current_count >= v_event.quota THEN
        RAISE EXCEPTION 'Kuota pendaftaran telah penuh';
    END IF;

    -- 2. Generate unique registration code: PREFIX-YEAR-0001
    v_year := TO_CHAR(NOW(), 'YYYY');
    v_next_num := v_current_count + 1;
    v_reg_code := UPPER(COALESCE(v_event.prefix_code, 'EVT')) || '-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');

    -- Ensure code is unique in case of existing records
    WHILE EXISTS (SELECT 1 FROM public.registrations WHERE code = v_reg_code) LOOP
        v_next_num := v_next_num + 1;
        v_reg_code := UPPER(COALESCE(v_event.prefix_code, 'EVT')) || '-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');
    END LOOP;

    -- 3. Insert registration record
    INSERT INTO public.registrations (
        event_id,
        code,
        answers,
        schema_snapshot,
        total_amount,
        payment_proof_path,
        status,
        contact_name,
        contact_phone,
        contact_email
    )
    VALUES (
        p_event_id,
        v_reg_code,
        p_answers,
        p_schema_snapshot,
        p_total_amount,
        p_payment_proof_path,
        'pending',
        p_contact_name,
        p_contact_phone,
        p_contact_email
    )
    RETURNING * INTO v_new_reg;

    RETURN to_jsonb(v_new_reg);
END;
$$;

-- 6. Row Level Security (RLS)
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Admins helper function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admins
        WHERE user_id = auth.uid()
    );
$$;

-- Admins table policies
CREATE POLICY "Admins can view admins" ON public.admins
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- Organizations table policies
CREATE POLICY "Public can view organization settings" ON public.organizations
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "Admins can update organization settings" ON public.organizations
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Events table policies
CREATE POLICY "Public can view open events" ON public.events
    FOR SELECT TO anon, authenticated
    USING (status = 'open' OR public.is_admin());

CREATE POLICY "Admins have full access to events" ON public.events
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Registrations table policies
-- Public cannot view all registrations, only admins can view and mutate registrations
CREATE POLICY "Admins have full access to registrations" ON public.registrations
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Secure status check function (only returns specific registration if code + phone match)
CREATE OR REPLACE FUNCTION public.check_registration_status(
    p_code TEXT,
    p_phone TEXT
)
RETURNS TABLE (
    code TEXT,
    event_title TEXT,
    contact_name TEXT,
    status TEXT,
    admin_note TEXT,
    total_amount NUMERIC,
    created_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.code,
        e.title AS event_title,
        r.contact_name,
        r.status,
        r.admin_note,
        r.total_amount,
        r.created_at,
        r.verified_at
    FROM public.registrations r
    JOIN public.events e ON e.id = r.event_id
    WHERE UPPER(r.code) = UPPER(TRIM(p_code))
      AND (
          REGEXP_REPLACE(r.contact_phone, '[^0-9]', '', 'g') = REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g')
          OR r.contact_phone = TRIM(p_phone)
      );
END;
$$;

-- 7. Storage Bucket Setup (Payment proofs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies:
-- Only authenticated admins can read/download payment proofs
CREATE POLICY "Admin download payment proofs" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'payment-proofs' AND public.is_admin());

-- Server action / service role can insert, or allow authenticated admins to upload
CREATE POLICY "Admin upload payment proofs" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'payment-proofs');

-- ============================================================
-- Initial Seed Data
-- ============================================================

INSERT INTO public.organizations (name, logo_url, accent_color, wa_number, payment_info)
VALUES (
    'Arena Sport & Event Center',
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=160&auto=format&fit=crop&q=80',
    '#0f172a',
    '6281234567890',
    '{
        "bank_name": "BCA",
        "account_number": "8801239841",
        "account_holder": "PT Arena Nusantara Mandiri",
        "qris_url": "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=00020101021126580014ID.LINKAJA.WWW0118936009110022340000021520260421000000153033605802ID5914ARENA+NUSANTARA6007JAKARTA61051234062070703A0163041234",
        "instructions": "Transfer sesuai total biaya ke rekening di atas atau scan QRIS. Jangan lupa sertakan kode referensi jika diminta."
    }'::jsonb
)
ON CONFLICT DO NOTHING;
