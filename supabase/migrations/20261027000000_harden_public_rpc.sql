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
