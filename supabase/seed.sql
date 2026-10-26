-- ============================================================
-- Demo seed for LOCAL / DEVELOPMENT projects only.
-- Never run against production: it inserts a sample bank account that
-- would be shown to real participants.
-- Supabase CLI runs this automatically on 'supabase db reset'.
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
