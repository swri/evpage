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
