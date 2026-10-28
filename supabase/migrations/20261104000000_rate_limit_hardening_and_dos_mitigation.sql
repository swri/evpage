-- Migration: 20261104000000_rate_limit_hardening_and_dos_mitigation.sql
-- Description:
-- 1. Mitigate Ticket Status Lookup DoS:
--    Key failed status check attempts to (client_ip || ':' || clean_code) instead of code globally.
--    This prevents malicious actors from locking legitimate participants out of checking their ticket.
-- 2. Revoke execute privileges on internal SECURITY DEFINER rate limiting helpers from PUBLIC/anon.
-- 3. Add opportunistic pruning to prevent unbounded growth of rpc_rate_limits.
-- 4. Increase IP registration rate limit from 30 to 100 per hour to accommodate shared campus/corporate NATs.

-- 1. Revoke execute privileges on internal rate limit helpers from public/anon/authenticated
REVOKE ALL ON FUNCTION public.check_and_record_rate_limit(TEXT, TEXT, INT, INTERVAL, INTERVAL) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_rate_limited(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_rate_limit(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_rate_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_request_client_ip() FROM PUBLIC, anon, authenticated;

-- 2. Upgrade check_and_record_rate_limit with automatic opportunistic housekeeping
CREATE OR REPLACE FUNCTION public.check_and_record_rate_limit(
    p_action TEXT,
    p_identifier TEXT,
    p_max_attempts INT,
    p_window_interval INTERVAL,
    p_block_interval INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hash TEXT := md5(p_action || ':' || LOWER(TRIM(p_identifier)));
    v_record RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- Opportunistic housekeeping (approx 1 in 100 requests) to prune expired rate limits
    IF random() < 0.01 THEN
        PERFORM public.purge_expired_rate_limits();
    END IF;

    SELECT * INTO v_record
    FROM public.rpc_rate_limits
    WHERE key_hash = v_hash;

    IF FOUND THEN
        -- If currently blocked, reject immediately
        IF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > v_now THEN
            RETURN FALSE;
        END IF;

        -- If window has expired, reset window
        IF v_record.first_attempt_at < v_now - p_window_interval THEN
            UPDATE public.rpc_rate_limits
            SET attempts = 1,
                first_attempt_at = v_now,
                last_attempt_at = v_now,
                blocked_until = NULL
            WHERE key_hash = v_hash;
            RETURN TRUE;
        END IF;

        -- Within window: check if exceeding threshold
        IF v_record.attempts + 1 >= p_max_attempts THEN
            UPDATE public.rpc_rate_limits
            SET attempts = v_record.attempts + 1,
                last_attempt_at = v_now,
                blocked_until = v_now + p_block_interval
            WHERE key_hash = v_hash;
            RETURN (v_record.attempts + 1 = p_max_attempts);
        ELSE
            UPDATE public.rpc_rate_limits
            SET attempts = v_record.attempts + 1,
                last_attempt_at = v_now
            WHERE key_hash = v_hash;
            RETURN TRUE;
        END IF;
    ELSE
        INSERT INTO public.rpc_rate_limits (key_hash, action, attempts, first_attempt_at, last_attempt_at, blocked_until)
        VALUES (v_hash, p_action, 1, v_now, v_now, NULL);
        RETURN TRUE;
    END IF;
END;
$$;

-- Keep execute restricted to internal
REVOKE ALL ON FUNCTION public.check_and_record_rate_limit(TEXT, TEXT, INT, INTERVAL, INTERVAL) FROM PUBLIC, anon, authenticated;

-- 3. Upgrade check_registration_status with DoS protection
DROP FUNCTION IF EXISTS public.check_registration_status(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.check_registration_status(
    p_code TEXT,
    p_phone TEXT
)
RETURNS TABLE (
    code TEXT,
    event_title TEXT,
    organizer_name TEXT,
    event_location TEXT,
    event_starts_at TIMESTAMPTZ,
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
    -- Strip any non-alphanumeric chars (hyphens, spaces) and uppercase for uniform comparison
    v_clean_code TEXT := UPPER(REGEXP_REPLACE(COALESCE(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
    v_phone TEXT := REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
    v_ip TEXT := public.get_request_client_ip();
    v_code_ip_key TEXT := v_ip || ':' || v_clean_code;
    v_found BOOLEAN := FALSE;
BEGIN
    IF v_clean_code = '' THEN
        RETURN;
    END IF;

    -- A. Check if the specific client IP has exceeded failed guesses on this code or overall
    IF public.is_rate_limited('check_status_code_ip', v_code_ip_key) THEN
        RAISE EXCEPTION 'Terlalu banyak percobaan pada kode tiket ini dari perangkat Anda. Silakan coba lagi dalam 15 menit.';
    END IF;

    IF public.is_rate_limited('check_status_ip', v_ip) THEN
        RAISE EXCEPTION 'Terlalu banyak percobaan pencarian tiket dari perangkat Anda. Silakan coba lagi dalam 15 menit.';
    END IF;

    -- B. Enforce real phone number (2nd factor, min 8 digits)
    IF LENGTH(v_phone) < 8 THEN
        -- Record failed attempt on this specific code from this IP and IP overall
        IF NOT public.check_and_record_rate_limit('check_status_code_ip', v_code_ip_key, 5, INTERVAL '15 minutes', INTERVAL '15 minutes') THEN
            RAISE EXCEPTION 'Terlalu banyak percobaan pada kode tiket ini dari perangkat Anda. Silakan coba lagi dalam 15 menit.';
        END IF;
        IF NOT public.check_and_record_rate_limit('check_status_ip', v_ip, 30, INTERVAL '15 minutes', INTERVAL '15 minutes') THEN
            RAISE EXCEPTION 'Terlalu banyak percobaan pencarian tiket dari perangkat Anda. Silakan coba lagi dalam 15 menit.';
        END IF;
        RETURN;
    END IF;

    -- C. Query for matching registration using normalized code lookup
    RETURN QUERY
    SELECT
        REPLACE(UPPER(r.code), '-', '') AS code,
        e.title AS event_title,
        e.organizer_name,
        e.location AS event_location,
        e.starts_at AS event_starts_at,
        r.contact_name,
        r.status,
        r.admin_note,
        r.total_amount,
        r.created_at,
        r.verified_at
    FROM public.registrations r
    JOIN public.events e ON e.id = r.event_id
    WHERE REPLACE(UPPER(r.code), '-', '') = v_clean_code
      AND REGEXP_REPLACE(r.contact_phone, '[^0-9]', '', 'g') = v_phone;

    GET DIAGNOSTICS v_found = ROW_COUNT;

    -- D. If no registration matched the code + phone combination, record failed attempt
    IF NOT v_found THEN
        IF NOT public.check_and_record_rate_limit('check_status_code_ip', v_code_ip_key, 5, INTERVAL '15 minutes', INTERVAL '15 minutes') THEN
            RAISE EXCEPTION 'Terlalu banyak percobaan pada kode tiket ini dari perangkat Anda. Silakan coba lagi dalam 15 menit.';
        END IF;
        IF NOT public.check_and_record_rate_limit('check_status_ip', v_ip, 30, INTERVAL '15 minutes', INTERVAL '15 minutes') THEN
            RAISE EXCEPTION 'Terlalu banyak percobaan pencarian tiket dari perangkat Anda. Silakan coba lagi dalam 15 menit.';
        END IF;
    ELSE
        -- Successful match: reset failure counter for this IP and code
        PERFORM public.reset_rate_limit('check_status_code_ip', v_code_ip_key);
    END IF;
END;
$$;

-- 4. Upgrade create_registration_atomic: increase IP threshold to 100/hr for shared corporate/campus networks
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
    v_ip TEXT := public.get_request_client_ip();
    v_clean_phone TEXT := REGEXP_REPLACE(COALESCE(p_contact_phone, ''), '[^0-9]', '', 'g');
BEGIN
    -- Rate limit check: max 100 registrations per hour per IP per event (safely accommodates campus/corporate NATs)
    IF NOT public.check_and_record_rate_limit('reg_ip_' || p_event_id::TEXT, v_ip, 100, INTERVAL '1 hour', INTERVAL '1 hour') THEN
        RAISE EXCEPTION 'Terlalu banyak permintaan pendaftaran dari jaringan Anda. Silakan coba lagi dalam 1 jam.';
    END IF;

    -- Target rate limit check: max 5 registrations per hour per phone per event (prevents individual hoarding)
    IF v_clean_phone <> '' AND v_clean_phone <> '-' THEN
        IF NOT public.check_and_record_rate_limit('reg_phone_' || p_event_id::TEXT, v_clean_phone, 5, INTERVAL '1 hour', INTERVAL '1 hour') THEN
            RAISE EXCEPTION 'Nomor telepon ini telah mencapai batas pendaftaran untuk event ini. Silakan coba lagi dalam 1 jam.';
        END IF;
    END IF;

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
    -- Clean format without hyphens: PREFIX + YEAR + 4-digit sequence (e.g. TIDDS20260005)
    v_reg_code := UPPER(COALESCE(v_event.prefix_code, 'EVT')) || v_year || LPAD(v_next_num::TEXT, 4, '0');
    WHILE EXISTS (SELECT 1 FROM public.registrations WHERE code = v_reg_code OR REPLACE(UPPER(code), '-', '') = v_reg_code) LOOP
        v_next_num := v_next_num + 1;
        v_reg_code := UPPER(COALESCE(v_event.prefix_code, 'EVT')) || v_year || LPAD(v_next_num::TEXT, 4, '0');
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

-- 5. Explicitly grant execute ONLY to intended public entrypoints
GRANT EXECUTE ON FUNCTION public.check_registration_status(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_registration_atomic(UUID, JSONB, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
