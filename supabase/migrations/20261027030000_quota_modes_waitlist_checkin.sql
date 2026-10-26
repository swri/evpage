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
