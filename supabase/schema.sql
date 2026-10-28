-- ============================================================
-- GENERATED FILE - do not edit. Source: supabase/migrations/*.sql
-- Regenerate with: pnpm db:schema
-- For a fresh project: paste into the Supabase SQL Editor, or use
-- `supabase db push`. Demo data lives separately in supabase/seed.sql.
-- ============================================================

-- Migration: 20261022000000_init_schema.sql
-- Form Pendaftaran Event yang Dapat Dikustomisasi (EvPage)
-- Run this migration in Supabase SQL Editor or via Supabase CLI

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Admins
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Organization / Settings
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

-- Events
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

-- Registrations
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_slug ON public.events(slug);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON public.registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_code ON public.registrations(code);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON public.registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_contact_phone ON public.registrations(contact_phone);

-- Atomic Registration Function
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
    SELECT * INTO v_event
    FROM public.events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event tidak ditemukan';
    END IF;

    IF v_event.status <> 'open' THEN
        RAISE EXCEPTION 'Pendaftaran untuk event ini sedang ditutup';
    END IF;

    IF v_event.registration_deadline IS NOT NULL AND v_event.registration_deadline < NOW() THEN
        RAISE EXCEPTION 'Batas waktu pendaftaran telah berakhir';
    END IF;

    SELECT COUNT(*) INTO v_current_count
    FROM public.registrations
    WHERE event_id = p_event_id AND status IN ('pending', 'verified');

    IF v_event.quota IS NOT NULL AND v_event.quota > 0 AND v_current_count >= v_event.quota THEN
        RAISE EXCEPTION 'Kuota pendaftaran telah penuh';
    END IF;

    v_year := TO_CHAR(NOW(), 'YYYY');
    v_next_num := v_current_count + 1;
    v_reg_code := UPPER(COALESCE(v_event.prefix_code, 'EVT')) || '-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');

    WHILE EXISTS (SELECT 1 FROM public.registrations WHERE code = v_reg_code) LOOP
        v_next_num := v_next_num + 1;
        v_reg_code := UPPER(COALESCE(v_event.prefix_code, 'EVT')) || '-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');
    END LOOP;

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

-- RLS
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Admins can view admins" ON public.admins
    FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY "Public can view organization settings" ON public.organizations
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "Admins can update organization settings" ON public.organizations
    FOR ALL TO authenticated
    USING (public.is_admin());

CREATE POLICY "Public can view open events" ON public.events
    FOR SELECT TO anon, authenticated
    USING (status = 'open' OR public.is_admin());

CREATE POLICY "Admins have full access to events" ON public.events
    FOR ALL TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins have full access to registrations" ON public.registrations
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Secure status check
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

-- Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin download payment proofs" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'payment-proofs' AND public.is_admin());

CREATE POLICY "Admin upload payment proofs" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'payment-proofs');

-- ============================================================
-- Migration: 20261027000000_harden_public_rpc.sql
-- Hardens the functions that anonymous visitors can call.
--  * create_registration_atomic: price and form snapshot are now taken from
--    the event row, never from the caller (anon could send total = 0)
--  * check_registration_status: requires a real phone number; '-' or an
--    empty value no longer matches registrations stored without a phone
--  * SECURITY DEFINER functions pin search_path
--  * get_event_public_stats: slot counts for public pages (anon cannot
--    SELECT registrations under RLS)
-- ============================================================

-- Price for one registration, mirrored in src/lib/store.ts
-- (calculateRegistrationAmount). per_participant counts the rows of the
-- first repeater field in the form schema (minimum 1).
CREATE OR REPLACE FUNCTION public.calculate_registration_amount(
    p_price_type TEXT,
    p_price_amount NUMERIC,
    p_form_schema JSONB,
    p_answers JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_price NUMERIC := GREATEST(COALESCE(p_price_amount, 0), 0);
    v_repeater_id TEXT;
    v_rows JSONB;
BEGIN
    IF p_price_type = 'free' THEN
        RETURN 0;
    END IF;

    IF p_price_type = 'per_participant' THEN
        SELECT f ->> 'id' INTO v_repeater_id
        FROM jsonb_array_elements(COALESCE(p_form_schema, '[]'::jsonb)) AS f
        WHERE f ->> 'type' = 'repeater'
        LIMIT 1;

        v_rows := p_answers -> v_repeater_id;
        IF v_rows IS NOT NULL AND jsonb_typeof(v_rows) = 'array' THEN
            RETURN v_price * GREATEST(1, jsonb_array_length(v_rows));
        END IF;
        RETURN v_price;
    END IF;

    RETURN v_price;
END;
$$;

-- Old signature accepted p_total_amount and p_schema_snapshot from the caller
DROP FUNCTION IF EXISTS public.create_registration_atomic(UUID, JSONB, JSONB, NUMERIC, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_registration_atomic(
    p_event_id UUID,
    p_answers JSONB,
    p_payment_proof_path TEXT,
    p_contact_name TEXT,
    p_contact_phone TEXT,
    p_contact_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event RECORD;
    v_current_count INT;
    v_next_num INT;
    v_reg_code TEXT;
    v_year TEXT;
    v_new_reg RECORD;
BEGIN
    -- Lock the event row so concurrent registrations cannot oversell
    SELECT * INTO v_event
    FROM public.events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event tidak ditemukan';
    END IF;

    IF v_event.status <> 'open' THEN
        RAISE EXCEPTION 'Pendaftaran untuk event ini sedang ditutup';
    END IF;

    IF v_event.registration_deadline IS NOT NULL AND v_event.registration_deadline < NOW() THEN
        RAISE EXCEPTION 'Batas waktu pendaftaran telah berakhir';
    END IF;

    SELECT COUNT(*) INTO v_current_count
    FROM public.registrations
    WHERE event_id = p_event_id AND status IN ('pending', 'verified');

    IF v_event.quota IS NOT NULL AND v_event.quota > 0 AND v_current_count >= v_event.quota THEN
        RAISE EXCEPTION 'Kuota pendaftaran telah penuh';
    END IF;

    v_year := TO_CHAR(NOW(), 'YYYY');
    v_next_num := v_current_count + 1;
    v_reg_code := UPPER(COALESCE(v_event.prefix_code, 'EVT')) || '-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');

    WHILE EXISTS (SELECT 1 FROM public.registrations WHERE code = v_reg_code) LOOP
        v_next_num := v_next_num + 1;
        v_reg_code := UPPER(COALESCE(v_event.prefix_code, 'EVT')) || '-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');
    END LOOP;

    INSERT INTO public.registrations (
        event_id, code, answers, schema_snapshot, total_amount,
        payment_proof_path, status, contact_name, contact_phone, contact_email
    )
    VALUES (
        p_event_id,
        v_reg_code,
        COALESCE(p_answers, '{}'::jsonb),
        v_event.form_schema,
        public.calculate_registration_amount(v_event.price_type, v_event.price_amount, v_event.form_schema, p_answers),
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

GRANT EXECUTE ON FUNCTION public.create_registration_atomic(UUID, JSONB, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

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
SET search_path = public
AS $$
DECLARE
    v_phone TEXT := REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
    -- A real phone number is the second factor; codes are sequential
    IF LENGTH(v_phone) < 8 THEN
        RETURN;
    END IF;

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
      AND REGEXP_REPLACE(r.contact_phone, '[^0-9]', '', 'g') = v_phone;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admins
        WHERE user_id = auth.uid()
    );
$$;

-- Slot usage for public pages. Only counts, never personal data.
CREATE OR REPLACE FUNCTION public.get_event_public_stats(p_event_ids UUID[])
RETURNS TABLE (event_id UUID, active_registrations INT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT e.id, COUNT(r.id)::INT
    FROM public.events e
    LEFT JOIN public.registrations r
        ON r.event_id = e.id AND r.status IN ('pending', 'verified')
    WHERE e.id = ANY(p_event_ids) AND e.status = 'open'
    GROUP BY e.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_public_stats(UUID[]) TO anon, authenticated;

-- ============================================================
-- Migration: 20261027010000_organizations_tenancy.sql
-- Multi-tenant model:
--   profiles            one row per auth user (created by trigger)
--   platform_admins     app owner(s); granted manually via SQL only
--   organizations       tenant (branding + payment info, public)
--   organization_members owner | admin | member
--   organization_invitations invite by email, accepted via RPC
-- Events belong to an organization; only its members (or a platform admin)
-- can see drafts, registrations and payment proofs.
-- The legacy `admins` table is no longer used by the app.
-- ============================================================

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    -- 'participant' accounts are reserved for future self-service participant logins
    account_type TEXT NOT NULL DEFAULT 'organizer' CHECK (account_type IN ('organizer', 'participant')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, COALESCE(NEW.email, ''), NEW.raw_user_meta_data ->> 'full_name')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Existing auth users (if any) get a profile too
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, COALESCE(u.email, ''), u.raw_user_meta_data ->> 'full_name'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ---------- platform admins ----------
CREATE TABLE IF NOT EXISTS public.platform_admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.platform_admins IS
    'App owners. Grant with: INSERT INTO public.platform_admins (user_id) SELECT id FROM auth.users WHERE email = ''you@example.com'';';

-- ---------- organizations (tenant) ----------
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.organization_members (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

CREATE TABLE IF NOT EXISTS public.organization_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
    accepted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON public.organization_invitations(LOWER(email));

-- ---------- events / registrations ownership ----------
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS organizer_name TEXT,
    ADD COLUMN IF NOT EXISTS contact_config JSONB;
CREATE INDEX IF NOT EXISTS idx_events_organization ON public.events(organization_id);

-- verified_by pointed at the legacy admins table
ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_verified_by_fkey;
ALTER TABLE public.registrations
    ADD CONSTRAINT registrations_verified_by_fkey
    FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------- helper functions (SECURITY DEFINER: no RLS recursion) ----------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.org_role(p_org UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT role FROM public.organization_members
    WHERE organization_id = p_org AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT public.org_role(p_org) IS NOT NULL OR public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org(p_org UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT public.org_role(p_org) IN ('owner', 'admin') OR public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.can_manage_event(p_event UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_event AND public.is_org_member(e.organization_id)
    ) OR public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT LOWER(email) FROM auth.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.shares_org_with(p_user UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members me
        JOIN public.organization_members other ON other.organization_id = me.organization_id
        WHERE me.user_id = auth.uid() AND other.user_id = p_user
    );
$$;

-- ---------- RPCs ----------
CREATE OR REPLACE FUNCTION public.create_organization(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org public.organizations;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Harus masuk untuk membuat organisasi';
    END IF;
    IF COALESCE(TRIM(p_name), '') = '' THEN
        RAISE EXCEPTION 'Nama organisasi wajib diisi';
    END IF;

    INSERT INTO public.organizations (name, created_by, wa_number, payment_info)
    VALUES (
        TRIM(p_name),
        auth.uid(),
        '',
        '{"bank_name": "", "account_number": "", "account_holder": ""}'::jsonb
    )
    RETURNING * INTO v_org;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org.id, auth.uid(), 'owner');

    RETURN to_jsonb(v_org);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inv public.organization_invitations;
BEGIN
    SELECT * INTO v_inv FROM public.organization_invitations WHERE id = p_invitation_id FOR UPDATE;

    IF NOT FOUND OR LOWER(v_inv.email) <> public.current_user_email() THEN
        RAISE EXCEPTION 'Undangan tidak ditemukan';
    END IF;
    IF v_inv.accepted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Undangan sudah digunakan';
    END IF;
    IF v_inv.expires_at < NOW() THEN
        RAISE EXCEPTION 'Undangan sudah kedaluwarsa';
    END IF;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_inv.organization_id, auth.uid(), v_inv.role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    UPDATE public.organization_invitations SET accepted_at = NOW() WHERE id = v_inv.id;

    RETURN jsonb_build_object('organization_id', v_inv.organization_id, 'role', v_inv.role);
END;
$$;

-- An organization must always keep at least one owner
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.role = 'owner'
       AND (TG_OP = 'DELETE' OR NEW.role <> 'owner')
       AND NOT EXISTS (
           SELECT 1 FROM public.organization_members
           WHERE organization_id = OLD.organization_id AND role = 'owner' AND user_id <> OLD.user_id
       )
       -- deleting the whole organization cascades here; allow that
       AND EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.organization_id)
    THEN
        RAISE EXCEPTION 'Organisasi harus memiliki minimal satu owner';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS organization_members_last_owner ON public.organization_members;
CREATE TRIGGER organization_members_last_owner
    BEFORE UPDATE OR DELETE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

-- ---------- RLS ----------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- Replace the "any admin sees everything" policies from the init migration
DROP POLICY IF EXISTS "Admins can view admins" ON public.admins;
DROP POLICY IF EXISTS "Public can view organization settings" ON public.organizations;
DROP POLICY IF EXISTS "Admins can update organization settings" ON public.organizations;
DROP POLICY IF EXISTS "Public can view open events" ON public.events;
DROP POLICY IF EXISTS "Admins have full access to events" ON public.events;
DROP POLICY IF EXISTS "Admins have full access to registrations" ON public.registrations;
DROP POLICY IF EXISTS "Admin download payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload payment proofs" ON storage.objects;

CREATE POLICY "Profiles visible to self, co-members, platform admins" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.shares_org_with(id) OR public.is_platform_admin());
CREATE POLICY "Users update own profile" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Users see own platform admin row" ON public.platform_admins
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_platform_admin());

-- Branding and payment instructions are shown on public event pages
CREATE POLICY "Organizations are public" ON public.organizations
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Org admins update organization" ON public.organizations
    FOR UPDATE TO authenticated
    USING (public.can_manage_org(id)) WITH CHECK (public.can_manage_org(id));
CREATE POLICY "Owners delete organization" ON public.organizations
    FOR DELETE TO authenticated
    USING (public.org_role(id) = 'owner' OR public.is_platform_admin());

CREATE POLICY "Members see their organization members" ON public.organization_members
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
-- Only an owner (or platform admin) may hand out the owner role
CREATE POLICY "Org admins change roles" ON public.organization_members
    FOR UPDATE TO authenticated
    USING (public.can_manage_org(organization_id))
    WITH CHECK (
        public.can_manage_org(organization_id)
        AND (role <> 'owner' OR public.org_role(organization_id) = 'owner' OR public.is_platform_admin())
    );
CREATE POLICY "Org admins remove members, members can leave" ON public.organization_members
    FOR DELETE TO authenticated
    USING (public.can_manage_org(organization_id) OR user_id = auth.uid());

CREATE POLICY "Org admins and invitees see invitations" ON public.organization_invitations
    FOR SELECT TO authenticated
    USING (public.can_manage_org(organization_id) OR LOWER(email) = public.current_user_email());
CREATE POLICY "Org admins invite" ON public.organization_invitations
    FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_org(organization_id) AND invited_by = auth.uid());
CREATE POLICY "Org admins revoke invitations" ON public.organization_invitations
    FOR DELETE TO authenticated USING (public.can_manage_org(organization_id));

CREATE POLICY "Open events are public, members see all of theirs" ON public.events
    FOR SELECT TO anon, authenticated
    USING (status = 'open' OR public.is_org_member(organization_id));
CREATE POLICY "Members create events in their organization" ON public.events
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "Members update their organization events" ON public.events
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "Members delete their organization events" ON public.events
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

-- Inserts only through create_registration_atomic
CREATE POLICY "Members read registrations of their events" ON public.registrations
    FOR SELECT TO authenticated USING (public.can_manage_event(event_id));
CREATE POLICY "Members update registrations of their events" ON public.registrations
    FOR UPDATE TO authenticated
    USING (public.can_manage_event(event_id)) WITH CHECK (public.can_manage_event(event_id));
CREATE POLICY "Members delete registrations of their events" ON public.registrations
    FOR DELETE TO authenticated USING (public.can_manage_event(event_id));

-- Payment proofs: path must be "<event_id>/<file>" of an open event
CREATE OR REPLACE FUNCTION public.proof_event_id(p_name TEXT)
RETURNS UUID LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT CASE
        WHEN split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN split_part(p_name, '/', 1)::uuid
    END;
$$;

CREATE OR REPLACE FUNCTION public.is_event_open(p_event UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.events WHERE id = p_event AND status = 'open');
$$;

CREATE POLICY "Participants upload proofs for open events" ON storage.objects
    FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id = 'payment-proofs' AND public.is_event_open(public.proof_event_id(name)));
CREATE POLICY "Event members read payment proofs" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'payment-proofs' AND public.can_manage_event(public.proof_event_id(name)));

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

-- ============================================================
-- Migration: 20261027030000_quota_modes_waitlist_checkin.sql
--  * events.quota_mode: 'registration' (1 slot per form, e.g. per team) or
--    'participant' (1 slot per person in the first repeater field)
--  * events.waitlist_enabled: full events accept registrations as 'waitlisted'
--  * registrations.participant_count, checked_in_at/by (attendance)
--  * promote_from_waitlist(): moves a waitlisted entry to pending if it fits
-- ============================================================

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS quota_mode TEXT NOT NULL DEFAULT 'registration'
        CHECK (quota_mode IN ('registration', 'participant')),
    ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.registrations
    ADD COLUMN IF NOT EXISTS participant_count INT NOT NULL DEFAULT 1 CHECK (participant_count >= 1),
    ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_status_check;
ALTER TABLE public.registrations
    ADD CONSTRAINT registrations_status_check
    CHECK (status IN ('pending', 'verified', 'rejected', 'waitlisted'));

-- People in a registration: rows of the first repeater field (minimum 1).
-- Mirrored by countParticipants() in src/lib/store.ts.
CREATE OR REPLACE FUNCTION public.count_participants(p_form_schema JSONB, p_answers JSONB)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_repeater_id TEXT;
    v_rows JSONB;
BEGIN
    SELECT f ->> 'id' INTO v_repeater_id
    FROM jsonb_array_elements(COALESCE(p_form_schema, '[]'::jsonb)) AS f
    WHERE f ->> 'type' = 'repeater'
    LIMIT 1;

    v_rows := p_answers -> v_repeater_id;
    IF v_rows IS NOT NULL AND jsonb_typeof(v_rows) = 'array' THEN
        RETURN GREATEST(1, jsonb_array_length(v_rows));
    END IF;
    RETURN 1;
END;
$$;

-- Slots used by active (pending + verified) registrations under the event's quota mode
CREATE OR REPLACE FUNCTION public.event_slots_used(p_event_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        CASE e.quota_mode
            WHEN 'participant' THEN (
                SELECT SUM(r.participant_count) FROM public.registrations r
                WHERE r.event_id = e.id AND r.status IN ('pending', 'verified'))
            ELSE (
                SELECT COUNT(*) FROM public.registrations r
                WHERE r.event_id = e.id AND r.status IN ('pending', 'verified'))
        END, 0)::INT
    FROM public.events e
    WHERE e.id = p_event_id;
$$;

CREATE OR REPLACE FUNCTION public.create_registration_atomic(
    p_event_id UUID,
    p_answers JSONB,
    p_payment_proof_path TEXT,
    p_contact_name TEXT,
    p_contact_phone TEXT,
    p_contact_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event RECORD;
    v_needed INT;
    v_used INT;
    v_status TEXT := 'pending';
    v_seq INT;
    v_next_num INT;
    v_reg_code TEXT;
    v_year TEXT;
    v_new_reg RECORD;
BEGIN
    -- Lock the event row so concurrent registrations cannot oversell
    SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event tidak ditemukan';
    END IF;
    IF v_event.status <> 'open' THEN
        RAISE EXCEPTION 'Pendaftaran untuk event ini sedang ditutup';
    END IF;
    IF v_event.registration_deadline IS NOT NULL AND v_event.registration_deadline < NOW() THEN
        RAISE EXCEPTION 'Batas waktu pendaftaran telah berakhir';
    END IF;

    v_needed := CASE WHEN v_event.quota_mode = 'participant'
        THEN public.count_participants(v_event.form_schema, p_answers) ELSE 1 END;
    v_used := public.event_slots_used(p_event_id);

    IF v_event.quota IS NOT NULL AND v_event.quota > 0 AND v_used + v_needed > v_event.quota THEN
        IF v_event.waitlist_enabled THEN
            v_status := 'waitlisted';
        ELSIF v_used < v_event.quota THEN
            RAISE EXCEPTION 'Sisa kuota % peserta, pendaftaran ini berisi % peserta', v_event.quota - v_used, v_needed;
        ELSE
            RAISE EXCEPTION 'Kuota pendaftaran telah penuh';
        END IF;
    END IF;

    -- Sequence continues across all statuses so codes never repeat
    SELECT COUNT(*) INTO v_seq FROM public.registrations WHERE event_id = p_event_id;
    v_year := TO_CHAR(NOW(), 'YYYY');
    v_next_num := v_seq + 1;
    v_reg_code := UPPER(COALESCE(v_event.prefix_code, 'EVT')) || '-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');
    WHILE EXISTS (SELECT 1 FROM public.registrations WHERE code = v_reg_code) LOOP
        v_next_num := v_next_num + 1;
        v_reg_code := UPPER(COALESCE(v_event.prefix_code, 'EVT')) || '-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');
    END LOOP;

    INSERT INTO public.registrations (
        event_id, code, answers, schema_snapshot, total_amount, payment_proof_path,
        status, participant_count, contact_name, contact_phone, contact_email
    )
    VALUES (
        p_event_id,
        v_reg_code,
        COALESCE(p_answers, '{}'::jsonb),
        v_event.form_schema,
        public.calculate_registration_amount(v_event.price_type, v_event.price_amount, v_event.form_schema, p_answers),
        p_payment_proof_path,
        v_status,
        public.count_participants(v_event.form_schema, p_answers),
        p_contact_name,
        p_contact_phone,
        p_contact_email
    )
    RETURNING * INTO v_new_reg;

    RETURN to_jsonb(v_new_reg);
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_registration_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reg RECORD;
    v_event RECORD;
    v_needed INT;
    v_used INT;
    v_updated RECORD;
BEGIN
    SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
    IF NOT FOUND OR NOT public.can_manage_event(v_reg.event_id) THEN
        RAISE EXCEPTION 'Pendaftaran tidak ditemukan';
    END IF;
    IF v_reg.status <> 'waitlisted' THEN
        RAISE EXCEPTION 'Pendaftaran ini tidak berada di daftar tunggu';
    END IF;

    SELECT * INTO v_event FROM public.events WHERE id = v_reg.event_id FOR UPDATE;
    v_needed := CASE WHEN v_event.quota_mode = 'participant' THEN v_reg.participant_count ELSE 1 END;
    v_used := public.event_slots_used(v_event.id);

    IF v_event.quota > 0 AND v_used + v_needed > v_event.quota THEN
        RAISE EXCEPTION 'Kuota belum tersedia (sisa %, dibutuhkan %)', GREATEST(v_event.quota - v_used, 0), v_needed;
    END IF;

    UPDATE public.registrations SET status = 'pending' WHERE id = v_reg.id RETURNING * INTO v_updated;
    RETURN to_jsonb(v_updated);
END;
$$;

-- Re-activating a waitlisted/rejected registration (by any path, including a
-- plain UPDATE from the admin table) must still fit in the quota.
CREATE OR REPLACE FUNCTION public.enforce_quota_on_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event RECORD;
    v_needed INT;
    v_used INT;
BEGIN
    IF OLD.status IN ('waitlisted', 'rejected') AND NEW.status IN ('pending', 'verified') THEN
        SELECT * INTO v_event FROM public.events WHERE id = NEW.event_id FOR UPDATE;
        v_needed := CASE WHEN v_event.quota_mode = 'participant' THEN NEW.participant_count ELSE 1 END;
        v_used := public.event_slots_used(NEW.event_id);
        IF v_event.quota > 0 AND v_used + v_needed > v_event.quota THEN
            RAISE EXCEPTION 'Kuota belum tersedia (sisa %, dibutuhkan %)', GREATEST(v_event.quota - v_used, 0), v_needed;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrations_quota_on_activation ON public.registrations;
CREATE TRIGGER registrations_quota_on_activation
    BEFORE UPDATE OF status ON public.registrations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_quota_on_activation();

DROP FUNCTION IF EXISTS public.get_event_public_stats(UUID[]);
CREATE FUNCTION public.get_event_public_stats(p_event_ids UUID[])
RETURNS TABLE (event_id UUID, slots_used INT, active_registrations INT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        e.id,
        public.event_slots_used(e.id),
        (SELECT COUNT(*)::INT FROM public.registrations r
         WHERE r.event_id = e.id AND r.status IN ('pending', 'verified'))
    FROM public.events e
    WHERE e.id = ANY(p_event_ids) AND e.status = 'open';
$$;

GRANT EXECUTE ON FUNCTION public.get_event_public_stats(UUID[]) TO anon, authenticated;

-- ============================================================
-- Migration: 20261027040000_group_draws_approvals.sql
-- Published team draws and the approval workflow for changing them.
--  * One published draw per event (group_draws). The first publish is
--    immediate; every later change (moving a player or re-shuffling) is a
--    draw_change_request that needs approvals from the organization:
--      1 organizer -> 1 (applied at once), 2-3 -> 2, 4+ -> 3
--    The requester's own approval counts. A request is rejected once it can
--    no longer reach the required number of approvals.
--  * Requests carry the draw version they were based on; if the draw changed
--    meanwhile they become 'stale' instead of overwriting newer results.
--  * Results store names/positions only (no phone numbers), so
--    get_public_draw() can show teams to participants.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.group_draws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    algorithm TEXT NOT NULL,
    seed TEXT,
    options JSONB NOT NULL DEFAULT '{}'::jsonb,
    participants_hash TEXT,
    result JSONB NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.draw_change_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    draw_id UUID NOT NULL REFERENCES public.group_draws(id) ON DELETE CASCADE,
    base_version INT NOT NULL,
    proposed_result JSONB NOT NULL,
    proposed_seed TEXT,
    proposed_options JSONB,
    reason TEXT,
    requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    required_approvals INT NOT NULL CHECK (required_approvals >= 1),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'stale')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_draw_requests_draw ON public.draw_change_requests(draw_id, status);

CREATE TABLE IF NOT EXISTS public.draw_change_votes (
    request_id UUID NOT NULL REFERENCES public.draw_change_requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    approve BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (request_id, user_id)
);

ALTER TABLE public.group_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_change_votes ENABLE ROW LEVEL SECURITY;

-- Read access for the organization; all writes go through the functions below
CREATE POLICY "Members read their draws" ON public.group_draws
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Members read change requests" ON public.draw_change_requests
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.group_draws d WHERE d.id = draw_id AND public.is_org_member(d.organization_id)));
CREATE POLICY "Members read votes" ON public.draw_change_votes
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.draw_change_requests r
        JOIN public.group_draws d ON d.id = r.draw_id
        WHERE r.id = request_id AND public.is_org_member(d.organization_id)
    ));

-- Mirrors requiredApprovals() in src/lib/orgs.ts
CREATE OR REPLACE FUNCTION public.required_approvals(p_member_count INT)
RETURNS INT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT CASE WHEN p_member_count <= 1 THEN 1 WHEN p_member_count <= 3 THEN 2 ELSE 3 END;
$$;

CREATE OR REPLACE FUNCTION public.org_member_count(p_org UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COUNT(*)::INT FROM public.organization_members WHERE organization_id = p_org;
$$;

CREATE OR REPLACE FUNCTION public.publish_group_draw(
    p_event_id UUID,
    p_algorithm TEXT,
    p_seed TEXT,
    p_options JSONB,
    p_participants_hash TEXT,
    p_result JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event RECORD;
    v_draw public.group_draws;
BEGIN
    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
    IF NOT FOUND OR v_event.organization_id IS NULL OR public.org_role(v_event.organization_id) IS NULL THEN
        RAISE EXCEPTION 'Event tidak ditemukan';
    END IF;
    IF EXISTS (SELECT 1 FROM public.group_draws WHERE event_id = p_event_id) THEN
        RAISE EXCEPTION 'Hasil undian sudah dipublikasikan; ajukan perubahan untuk mengubahnya';
    END IF;

    INSERT INTO public.group_draws (event_id, organization_id, algorithm, seed, options, participants_hash, result, created_by)
    VALUES (p_event_id, v_event.organization_id, p_algorithm, p_seed, COALESCE(p_options, '{}'::jsonb), p_participants_hash, p_result, auth.uid())
    RETURNING * INTO v_draw;
    RETURN to_jsonb(v_draw);
END;
$$;

-- Applies an approved request, or marks it stale if the draw moved on
CREATE OR REPLACE FUNCTION public.apply_draw_change(p_request_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req public.draw_change_requests;
    v_draw public.group_draws;
BEGIN
    SELECT * INTO v_req FROM public.draw_change_requests WHERE id = p_request_id FOR UPDATE;
    SELECT * INTO v_draw FROM public.group_draws WHERE id = v_req.draw_id FOR UPDATE;

    IF v_draw.version <> v_req.base_version THEN
        UPDATE public.draw_change_requests SET status = 'stale', resolved_at = NOW() WHERE id = v_req.id;
        RETURN 'stale';
    END IF;

    UPDATE public.group_draws
    SET result = v_req.proposed_result,
        seed = COALESCE(v_req.proposed_seed, seed),
        options = COALESCE(v_req.proposed_options, options),
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_draw.id;

    UPDATE public.draw_change_requests SET status = 'applied', resolved_at = NOW() WHERE id = v_req.id;
    -- Other open requests were based on the old version
    UPDATE public.draw_change_requests
    SET status = 'stale', resolved_at = NOW()
    WHERE draw_id = v_draw.id AND status = 'pending' AND id <> v_req.id;
    RETURN 'applied';
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_draw_change(p_request_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req public.draw_change_requests;
    v_org UUID;
    v_members INT;
    v_yes INT;
    v_no INT;
BEGIN
    SELECT * INTO v_req FROM public.draw_change_requests WHERE id = p_request_id;
    SELECT organization_id INTO v_org FROM public.group_draws WHERE id = v_req.draw_id;
    v_members := public.org_member_count(v_org);
    SELECT COUNT(*) FILTER (WHERE approve), COUNT(*) FILTER (WHERE NOT approve)
    INTO v_yes, v_no
    FROM public.draw_change_votes WHERE request_id = p_request_id;

    IF v_yes >= v_req.required_approvals THEN
        RETURN public.apply_draw_change(p_request_id);
    END IF;
    IF v_members - v_no < v_req.required_approvals THEN
        UPDATE public.draw_change_requests SET status = 'rejected', resolved_at = NOW() WHERE id = p_request_id;
        RETURN 'rejected';
    END IF;
    RETURN 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.request_draw_change(
    p_draw_id UUID,
    p_base_version INT,
    p_proposed_result JSONB,
    p_reason TEXT,
    p_proposed_seed TEXT,
    p_proposed_options JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_draw public.group_draws;
    v_req public.draw_change_requests;
    v_outcome TEXT;
BEGIN
    SELECT * INTO v_draw FROM public.group_draws WHERE id = p_draw_id;
    IF NOT FOUND OR public.org_role(v_draw.organization_id) IS NULL THEN
        RAISE EXCEPTION 'Hasil undian tidak ditemukan';
    END IF;
    IF p_base_version <> v_draw.version THEN
        RAISE EXCEPTION 'Hasil undian sudah berubah; muat ulang sebelum mengajukan perubahan';
    END IF;

    INSERT INTO public.draw_change_requests (
        draw_id, base_version, proposed_result, proposed_seed, proposed_options, reason, requested_by, required_approvals
    )
    VALUES (
        p_draw_id, p_base_version, p_proposed_result, p_proposed_seed, p_proposed_options, NULLIF(TRIM(p_reason), ''),
        auth.uid(), public.required_approvals(public.org_member_count(v_draw.organization_id))
    )
    RETURNING * INTO v_req;

    -- The requester approves their own change
    INSERT INTO public.draw_change_votes (request_id, user_id, approve) VALUES (v_req.id, auth.uid(), true);
    v_outcome := public.resolve_draw_change(v_req.id);

    SELECT * INTO v_req FROM public.draw_change_requests WHERE id = v_req.id;
    RETURN to_jsonb(v_req) || jsonb_build_object('outcome', v_outcome);
END;
$$;

CREATE OR REPLACE FUNCTION public.vote_draw_change(p_request_id UUID, p_approve BOOLEAN)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req public.draw_change_requests;
    v_org UUID;
BEGIN
    SELECT * INTO v_req FROM public.draw_change_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permintaan perubahan tidak ditemukan';
    END IF;
    SELECT organization_id INTO v_org FROM public.group_draws WHERE id = v_req.draw_id;
    IF public.org_role(v_org) IS NULL THEN
        RAISE EXCEPTION 'Permintaan perubahan tidak ditemukan';
    END IF;
    IF v_req.status <> 'pending' THEN
        RAISE EXCEPTION 'Permintaan ini sudah selesai (%)', v_req.status;
    END IF;
    IF EXISTS (SELECT 1 FROM public.draw_change_votes WHERE request_id = p_request_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Anda sudah memberikan suara untuk permintaan ini';
    END IF;

    INSERT INTO public.draw_change_votes (request_id, user_id, approve) VALUES (p_request_id, auth.uid(), p_approve);
    RETURN public.resolve_draw_change(p_request_id);
END;
$$;

-- Internal helpers must not be callable directly through the API
REVOKE EXECUTE ON FUNCTION public.apply_draw_change(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_draw_change(UUID) FROM PUBLIC, anon, authenticated;

-- Team list for participants of an open event: names and positions only
CREATE OR REPLACE FUNCTION public.get_public_draw(p_event_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'event_title', e.title,
        'seed', d.seed,
        'version', d.version,
        'updated_at', d.updated_at,
        'teams', d.result
    )
    FROM public.group_draws d
    JOIN public.events e ON e.id = d.event_id
    WHERE e.slug = LOWER(p_event_slug) AND e.status IN ('open', 'closed');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_draw(TEXT) TO anon, authenticated;

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

-- ============================================================
-- Migration: 20261027070000_role_permissions.sql
-- Configurable organizer roles with a permission matrix (mirrors
-- ROLE_PERMISSIONS in src/lib/orgs.ts):
--
--   permission            owner admin member cashier checkin
--   org.manage              x     x
--   events.manage           x     x     x
--   registrations.edit      x     x     x
--   registrations.verify    x     x     x      x
--   registrations.checkin   x     x     x               x
--   draws.manage            x     x     x
--
-- Every role can read its organization's events and registrations.
-- Registration UPDATEs are checked per changed column by a trigger, so a
-- check-in officer cannot verify payments and a cashier cannot edit answers.
-- Draw approvals count only members holding draws.manage.
-- ============================================================

ALTER TABLE public.organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE public.organization_members
    ADD CONSTRAINT organization_members_role_check
    CHECK (role IN ('owner', 'admin', 'member', 'cashier', 'checkin'));

ALTER TABLE public.organization_invitations DROP CONSTRAINT IF EXISTS organization_invitations_role_check;
ALTER TABLE public.organization_invitations
    ADD CONSTRAINT organization_invitations_role_check
    CHECK (role IN ('admin', 'member', 'cashier', 'checkin'));

CREATE OR REPLACE FUNCTION public.role_has_permission(p_role TEXT, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT CASE p_permission
        WHEN 'org.manage' THEN p_role IN ('owner', 'admin')
        WHEN 'events.manage' THEN p_role IN ('owner', 'admin', 'member')
        WHEN 'registrations.edit' THEN p_role IN ('owner', 'admin', 'member')
        WHEN 'registrations.verify' THEN p_role IN ('owner', 'admin', 'member', 'cashier')
        WHEN 'registrations.checkin' THEN p_role IN ('owner', 'admin', 'member', 'checkin')
        WHEN 'draws.manage' THEN p_role IN ('owner', 'admin', 'member')
        ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION public.org_can(p_org UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_platform_admin()
        OR COALESCE(public.role_has_permission(public.org_role(p_org), p_permission), false);
$$;

CREATE OR REPLACE FUNCTION public.event_can(p_event UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_platform_admin() OR EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_event AND public.org_can(e.organization_id, p_permission)
    );
$$;

-- Organization management now goes through the matrix
CREATE OR REPLACE FUNCTION public.can_manage_org(p_org UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT public.org_can(p_org, 'org.manage');
$$;

-- Events: everyone in the org reads; only events.manage writes
DROP POLICY IF EXISTS "Members create events in their organization" ON public.events;
DROP POLICY IF EXISTS "Members update their organization events" ON public.events;
DROP POLICY IF EXISTS "Members delete their organization events" ON public.events;

CREATE POLICY "Event managers create events" ON public.events
    FOR INSERT TO authenticated
    WITH CHECK (public.org_can(organization_id, 'events.manage') AND created_by = auth.uid());
CREATE POLICY "Event managers update events" ON public.events
    FOR UPDATE TO authenticated
    USING (public.org_can(organization_id, 'events.manage'))
    WITH CHECK (public.org_can(organization_id, 'events.manage'));
CREATE POLICY "Event managers delete events" ON public.events
    FOR DELETE TO authenticated USING (public.org_can(organization_id, 'events.manage'));

-- Registrations: read for every role, delete only with registrations.edit;
-- UPDATE is allowed for any role and narrowed per column by the trigger
DROP POLICY IF EXISTS "Members delete registrations of their events" ON public.registrations;
CREATE POLICY "Editors delete registrations" ON public.registrations
    FOR DELETE TO authenticated USING (public.event_can(event_id, 'registrations.edit'));

CREATE OR REPLACE FUNCTION public.enforce_registration_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- No user context = SQL run by the project owner (maintenance, migrations).
    -- RPCs keep the caller's auth.uid(), so they are checked like direct UPDATEs.
    IF auth.uid() IS NULL OR public.is_platform_admin() THEN
        RETURN NEW;
    END IF;

    IF (NEW.status, NEW.admin_note, NEW.verified_at, NEW.verified_by)
       IS DISTINCT FROM (OLD.status, OLD.admin_note, OLD.verified_at, OLD.verified_by)
       AND NOT public.event_can(NEW.event_id, 'registrations.verify') THEN
        RAISE EXCEPTION 'Peran Anda tidak boleh mengubah status pembayaran';
    END IF;

    IF (NEW.checked_in_at, NEW.checked_in_by) IS DISTINCT FROM (OLD.checked_in_at, OLD.checked_in_by)
       AND NOT public.event_can(NEW.event_id, 'registrations.checkin') THEN
        RAISE EXCEPTION 'Peran Anda tidak boleh mencatat kehadiran';
    END IF;

    IF (NEW.answers, NEW.contact_name, NEW.contact_phone, NEW.contact_email, NEW.payment_proof_path,
        NEW.total_amount, NEW.participant_count, NEW.event_id, NEW.code, NEW.schema_snapshot)
       IS DISTINCT FROM (OLD.answers, OLD.contact_name, OLD.contact_phone, OLD.contact_email, OLD.payment_proof_path,
        OLD.total_amount, OLD.participant_count, OLD.event_id, OLD.code, OLD.schema_snapshot)
       AND NOT public.event_can(NEW.event_id, 'registrations.edit') THEN
        RAISE EXCEPTION 'Peran Anda tidak boleh mengubah data pendaftar';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrations_enforce_permissions ON public.registrations;
CREATE TRIGGER registrations_enforce_permissions
    BEFORE UPDATE ON public.registrations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_registration_permissions();

-- Promotion is a status change: require registrations.verify
CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_registration_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reg RECORD;
    v_event RECORD;
    v_needed INT;
    v_used INT;
    v_updated RECORD;
BEGIN
    SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
    IF NOT FOUND OR NOT public.can_manage_event(v_reg.event_id) THEN
        RAISE EXCEPTION 'Pendaftaran tidak ditemukan';
    END IF;
    IF NOT public.event_can(v_reg.event_id, 'registrations.verify') THEN
        RAISE EXCEPTION 'Peran Anda tidak boleh mengubah status pembayaran';
    END IF;
    IF v_reg.status <> 'waitlisted' THEN
        RAISE EXCEPTION 'Pendaftaran ini tidak berada di daftar tunggu';
    END IF;

    SELECT * INTO v_event FROM public.events WHERE id = v_reg.event_id FOR UPDATE;
    v_needed := CASE WHEN v_event.quota_mode = 'participant' THEN v_reg.participant_count ELSE 1 END;
    v_used := public.event_slots_used(v_event.id);

    IF v_event.quota > 0 AND v_used + v_needed > v_event.quota THEN
        RAISE EXCEPTION 'Kuota belum tersedia (sisa %, dibutuhkan %)', GREATEST(v_event.quota - v_used, 0), v_needed;
    END IF;

    UPDATE public.registrations SET status = 'pending' WHERE id = v_reg.id RETURNING * INTO v_updated;
    RETURN to_jsonb(v_updated);
END;
$$;

-- Draws: only draws.manage may publish/request/vote, and only they count
CREATE OR REPLACE FUNCTION public.org_member_count(p_org UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COUNT(*)::INT FROM public.organization_members
    WHERE organization_id = p_org AND public.role_has_permission(role, 'draws.manage');
$$;

CREATE OR REPLACE FUNCTION public.assert_can_manage_draws(p_org UUID)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF public.org_role(p_org) IS NOT NULL AND NOT public.org_can(p_org, 'draws.manage') THEN
        RAISE EXCEPTION 'Peran Anda tidak boleh mengelola hasil undian';
    END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_can_manage_draws(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.draws_permission_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID;
BEGIN
    IF TG_TABLE_NAME = 'group_draws' THEN
        v_org := NEW.organization_id;
    ELSIF TG_TABLE_NAME = 'draw_change_requests' THEN
        SELECT organization_id INTO v_org FROM public.group_draws WHERE id = NEW.draw_id;
    ELSE
        SELECT d.organization_id INTO v_org
        FROM public.draw_change_requests r JOIN public.group_draws d ON d.id = r.draw_id
        WHERE r.id = NEW.request_id;
    END IF;
    IF auth.uid() IS NOT NULL THEN
        PERFORM public.assert_can_manage_draws(v_org);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_draws_permission ON public.group_draws;
CREATE TRIGGER group_draws_permission BEFORE INSERT ON public.group_draws
    FOR EACH ROW EXECUTE FUNCTION public.draws_permission_guard();
DROP TRIGGER IF EXISTS draw_requests_permission ON public.draw_change_requests;
CREATE TRIGGER draw_requests_permission BEFORE INSERT ON public.draw_change_requests
    FOR EACH ROW EXECUTE FUNCTION public.draws_permission_guard();
DROP TRIGGER IF EXISTS draw_votes_permission ON public.draw_change_votes;
CREATE TRIGGER draw_votes_permission BEFORE INSERT ON public.draw_change_votes
    FOR EACH ROW EXECUTE FUNCTION public.draws_permission_guard();

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
