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
