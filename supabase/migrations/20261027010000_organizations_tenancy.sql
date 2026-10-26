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
