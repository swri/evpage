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
