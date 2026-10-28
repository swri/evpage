-- ============================================================
-- Migration: 20261102000000_database_rate_limiting.sql
-- Database-level rate limiting for public RPC endpoints
-- (check_registration_status and create_registration_atomic)
-- ============================================================

-- 1. Rate limiting table (strictly internal, zero public permissions)
CREATE TABLE IF NOT EXISTS public.rpc_rate_limits (
    key_hash TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 1,
    first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blocked_until TIMESTAMPTZ
);

ALTER TABLE public.rpc_rate_limits ENABLE ROW LEVEL SECURITY;
-- No public policies! Denies all direct access to anon and authenticated users.

-- 2. Helper to extract client IP from PostgREST headers
CREATE OR REPLACE FUNCTION public.get_request_client_ip()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_headers JSONB;
    v_ip TEXT;
BEGIN
    BEGIN
        v_headers := NULLIF(current_setting('request.headers', true), '')::JSONB;
    EXCEPTION WHEN OTHERS THEN
        v_headers := NULL;
    END;

    IF v_headers IS NOT NULL THEN
        -- 1. Cloudflare connecting IP (trustworthy behind Cloudflare proxy)
        v_ip := TRIM(COALESCE(v_headers ->> 'cf-connecting-ip', ''));
        IF v_ip <> '' THEN
            RETURN v_ip;
        END IF;

        -- 2. X-Real-IP (reverse proxy)
        v_ip := TRIM(COALESCE(v_headers ->> 'x-real-ip', ''));
        IF v_ip <> '' THEN
            RETURN v_ip;
        END IF;

        -- 3. X-Forwarded-For (client, proxy1, proxy2)
        v_ip := TRIM(COALESCE(v_headers ->> 'x-forwarded-for', ''));
        IF v_ip <> '' THEN
            RETURN SPLIT_PART(v_ip, ',', 1);
        END IF;
    END IF;

    RETURN '127.0.0.1';
END;
$$;

-- 3. Sliding-window rate limit checker
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

-- 4. Check if currently blocked without recording an attempt
CREATE OR REPLACE FUNCTION public.is_rate_limited(
    p_action TEXT,
    p_identifier TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hash TEXT := md5(p_action || ':' || LOWER(TRIM(p_identifier)));
    v_blocked_until TIMESTAMPTZ;
BEGIN
    SELECT blocked_until INTO v_blocked_until
    FROM public.rpc_rate_limits
    WHERE key_hash = v_hash;

    IF FOUND AND v_blocked_until IS NOT NULL AND v_blocked_until > NOW() THEN
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$;

-- 5. Reset limit on success
CREATE OR REPLACE FUNCTION public.reset_rate_limit(
    p_action TEXT,
    p_identifier TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hash TEXT := md5(p_action || ':' || LOWER(TRIM(p_identifier)));
BEGIN
    DELETE FROM public.rpc_rate_limits WHERE key_hash = v_hash;
END;
$$;

-- 6. Purge old rate limit records (housekeeping)
CREATE OR REPLACE FUNCTION public.purge_expired_rate_limits()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM public.rpc_rate_limits
    WHERE (blocked_until IS NOT NULL AND blocked_until < NOW() - INTERVAL '1 day')
       OR (blocked_until IS NULL AND last_attempt_at < NOW() - INTERVAL '1 day');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- 7. Upgraded check_registration_status with strict brute-force & enumeration prevention
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
    v_clean_code TEXT := UPPER(TRIM(COALESCE(p_code, '')));
    v_phone TEXT := REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
    v_ip TEXT := public.get_request_client_ip();
    v_found BOOLEAN := FALSE;
BEGIN
    IF v_clean_code = '' THEN
        RETURN;
    END IF;

    -- A. Check if the ticket code or client IP is currently blocked
    IF public.is_rate_limited('check_status_code', v_clean_code) THEN
        RAISE EXCEPTION 'Terlalu banyak percobaan pada kode tiket ini. Silakan coba lagi dalam 15 menit.';
    END IF;

    IF public.is_rate_limited('check_status_ip', v_ip) THEN
        RAISE EXCEPTION 'Terlalu banyak percobaan pencarian tiket dari perangkat Anda. Silakan coba lagi dalam 15 menit.';
    END IF;

    -- B. Enforce real phone number (2nd factor, min 8 digits)
    IF LENGTH(v_phone) < 8 THEN
        -- Record failed attempt on code and IP
        IF NOT public.check_and_record_rate_limit('check_status_code', v_clean_code, 5, INTERVAL '15 minutes', INTERVAL '15 minutes') THEN
            RAISE EXCEPTION 'Terlalu banyak percobaan pada kode tiket ini. Silakan coba lagi dalam 15 menit.';
        END IF;
        IF NOT public.check_and_record_rate_limit('check_status_ip', v_ip, 30, INTERVAL '15 minutes', INTERVAL '15 minutes') THEN
            RAISE EXCEPTION 'Terlalu banyak percobaan pencarian tiket dari perangkat Anda. Silakan coba lagi dalam 15 menit.';
        END IF;
        RETURN;
    END IF;

    -- C. Query for matching registration
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
    WHERE UPPER(r.code) = v_clean_code
      AND REGEXP_REPLACE(r.contact_phone, '[^0-9]', '', 'g') = v_phone;

    GET DIAGNOSTICS v_found = ROW_COUNT;

    IF v_found THEN
        -- Successful verification: clear failed counter for this ticket code
        PERFORM public.reset_rate_limit('check_status_code', v_clean_code);
    ELSE
        -- Failed verification: increment attempts (max 5 per code, max 30 per IP per 15 min)
        IF NOT public.check_and_record_rate_limit('check_status_code', v_clean_code, 5, INTERVAL '15 minutes', INTERVAL '15 minutes') THEN
            RAISE EXCEPTION 'Terlalu banyak percobaan pada kode tiket ini. Silakan coba lagi dalam 15 menit.';
        END IF;
        IF NOT public.check_and_record_rate_limit('check_status_ip', v_ip, 30, INTERVAL '15 minutes', INTERVAL '15 minutes') THEN
            RAISE EXCEPTION 'Terlalu banyak percobaan pencarian tiket dari perangkat Anda. Silakan coba lagi dalam 15 menit.';
        END IF;
    END IF;
END;
$$;

-- 8. Upgraded create_registration_atomic with IP & target phone rate limits
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
    -- Rate limit check: max 30 registrations per hour per IP per event
    IF NOT public.check_and_record_rate_limit('reg_ip_' || p_event_id::TEXT, v_ip, 30, INTERVAL '1 hour', INTERVAL '1 hour') THEN
        RAISE EXCEPTION 'Terlalu banyak permintaan pendaftaran dari jaringan Anda. Silakan coba lagi dalam 1 jam.';
    END IF;

    -- Target rate limit check: max 5 registrations per hour per phone per event
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
