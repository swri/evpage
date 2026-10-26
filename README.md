# EvPage — Platform Pendaftaran & Manajemen Event

Platform event untuk **peserta** (mendaftar, membayar manual, cek status, melihat pembagian tim) dan **penyelenggara** (organisasi berisi beberapa panitia yang membuat event, memverifikasi, mencatat kehadiran, dan membagi kelompok). Awalnya untuk olahraga (mini soccer); kini setiap hal spesifik olahraga ada di **modul jenis event**.

---

## Fitur

### Peserta (tanpa login)
- `/e/[slug]`: formulir dinamis (teks, angka, email, HP, tanggal, pilihan, file, **repeater** untuk anggota tim).
- Biaya gratis / tetap / per peserta, **dihitung di database**, bukan dari browser.
- Transfer manual / QRIS; bukti bayar ke bucket privat Supabase (mode demo: data URL).
- Kuota penuh + waitlist aktif → masuk **daftar tunggu** tanpa wajib bukti bayar.
- `/status`: cek tiket dengan **kode + nomor HP yang cocok**.
- `/e/[slug]/teams`: pembagian tim resmi (nama & posisi saja, tanpa nomor HP) + kode acak (seed).

### Penyelenggara (`/admin`)
- **Organisasi**: buat organisasi, undang panitia lewat email, atur peran:

  | Peran | Kelola organisasi | Kelola event | Edit data peserta | Verifikasi bayar | Check-in | Kelola undian |
  |---|:-:|:-:|:-:|:-:|:-:|:-:|
  | Pemilik / Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
  | Panitia | | ✓ | ✓ | ✓ | ✓ | ✓ |
  | Kasir | | | | ✓ | | |
  | Petugas Check-in | | | | | ✓ | |

- **Super admin platform** (pemilik aplikasi): melihat semua organisasi. Diberikan hanya lewat SQL (lihat Setup).
- **Event builder**: jenis event, form, kuota **per pendaftaran atau per peserta**, waitlist, harga, template pesan.
- **Pendaftar**: cari/filter, verifikasi/tolak (massal), daftar tunggu → promosi (kuota dicek ulang), **check-in**, ekspor XLSX/CSV, pesan WhatsApp sesuai status.
- **Pembagian kelompok** (bila diaktifkan di jenis event):
  - Strategi: *acak seimbang*, *acak murni*, *seeding level*, *manual*.
  - Batasan: pisahkan klub/tim asal yang sama, seimbangkan level, maksimal per kelompok.
  - **Seed** membuat hasil bisa diulang dan diaudit; hash daftar peserta ikut disimpan.
  - **Publikasi + persetujuan perubahan**: setelah dipublikasikan, memindah pemain atau mengacak ulang menjadi *usulan* yang perlu persetujuan panitia pengelola undian:

    | Panitia pengelola undian | Persetujuan dibutuhkan (termasuk pengaju) |
    |---|---|
    | 1 | 1 (langsung berlaku) |
    | 2–3 | 2 |
    | 4 atau lebih | 3 |

    Usulan otomatis ditolak bila sudah tidak mungkin mencapai jumlah itu, dan menjadi *kedaluwarsa* bila hasil sudah berubah duluan.

---

## Stack & mode data

| Bagian | Teknologi |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components, `src/proxy.ts`), React 19, TypeScript |
| Data | Supabase Postgres + RLS + RPC + Storage; mode demo di `localStorage` |
| Test | `node:test` + **PGlite** (Postgres WASM) untuk menguji migrasi, RLS, dan RPC tanpa server |
| Package manager | `pnpm` |

| | Mode demo | Mode Supabase |
| --- | --- | --- |
| Aktif bila | URL/anon key kosong atau placeholder | keduanya diisi |
| Data & akun | per browser | Postgres + Supabase Auth |
| Login demo | `admin@evpage.com` / `admin123` (berperan super admin) | tidak ada |
| Hak akses | dicek di UI | **ditegakkan RLS/trigger**; `/admin` dicek di server oleh proxy |

> Mode demo hanya untuk demo. Aturan peran (kasir/check-in) di mode demo hanya membatasi tombol di UI.

---

## Setup

```bash
pnpm install
cp .env.example .env.local   # biarkan placeholder untuk mode demo
pnpm dev
```

### Supabase (project development)
1. Terapkan migrasi: `supabase db push`, atau tempel `supabase/schema.sql` (gabungan semua migrasi) di SQL Editor.
2. Opsional, data contoh: `supabase/seed.sql` (**jangan** di production).
3. Isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` di `.env.local`.
4. Daftar lewat `/admin/register`. Organisasi pertama Anda dibuat otomatis.
5. Jadikan diri Anda super admin:
   ```sql
   INSERT INTO public.platform_admins (user_id)
   SELECT id FROM auth.users WHERE email = 'anda@example.com';
   ```

### Migrasi (`supabase/migrations/`)
| File | Isi |
|---|---|
| `…22000000_init_schema` | tabel awal |
| `…27000000_harden_public_rpc` | harga dihitung di DB, cek status butuh HP asli, `search_path`, statistik kuota publik |
| `…27010000_organizations_tenancy` | profiles, organisasi, anggota, undangan, super admin, RLS per organisasi |
| `…27020000_payment_proof_bucket_limits` | batas ukuran & tipe file bucket bukti bayar |
| `…27030000_quota_modes_waitlist_checkin` | mode kuota, daftar tunggu, check-in |
| `…27040000_group_draws_approvals` | publikasi undian + persetujuan perubahan |
| `…27050000_event_types` | `event_type`, `type_config` |
| `…27060000_notification_templates` | template pesan per event |
| `…27070000_role_permissions` | peran kasir/check-in + matriks izin |

`schema.sql` **dihasilkan** dari migrasi (`pnpm db:schema`), dan test akan gagal bila lupa diperbarui.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `pnpm dev` / `pnpm build` | development / build produksi |
| `pnpm test` | semua test: logika aplikasi, cabang Supabase (klien tiruan), dan **seluruh migrasi + RLS di PGlite** |
| `pnpm lint`, `npx tsc --noEmit` | lint & type check |
| `pnpm db:schema` | bangun ulang `supabase/schema.sql` |

CI (`.github/workflows/ci.yml`) menjalankan lint, type check, test, dan build.

---

## Struktur

```
src/
  proxy.ts                 cek sesi Supabase untuk /admin (mode Supabase)
  app/
    e/[slug]/              pendaftaran publik; teams/ = pembagian tim
    status/                cek tiket
    admin/                 dashboard, events, builder, pendaftar, organization, settings
  components/admin/        builder, modal acak tim, panel undian, org-context
  lib/
    store.ts               event & pendaftaran (demo/Supabase), harga, kuota
    orgs.ts                organisasi, anggota, undangan, peran & izin
    draws.ts               publikasi undian & persetujuan
    team-generator.ts      algoritma pembagian ber-seed + batasan
    event-types/           registry jenis event + strategi pengelompokan
    notifications.ts       template pesan
    payment-proof.ts       upload & tampilan aman bukti bayar
    auth.ts, admin-guard.ts, local-db.ts, export.ts
supabase/                  migrations/, schema.sql (generated), seed.sql
test/                      node:test; test/db/harness.ts = PGlite + stub Supabase
```

---

## Menambah jenis event baru

Tidak perlu mengubah inti aplikasi. Buat modul di `src/lib/event-types/index.ts`, atau panggil `registerEventType()`:

```ts
registerEventType({
  id: 'esports',
  label: 'Turnamen E-sports',
  description: 'Squad 5 orang, seeding berdasarkan rank.',
  templateId: 'esports',            // opsional: entri BUILT_IN_TEMPLATES (lib/data-service.ts)
  labels: { participant: 'Pemain', participants: 'Pemain', group: 'Squad', groups: 'Squad', groupingAction: 'Acak Squad' },
  defaults: { quota_mode: 'registration' },
  grouping: {
    enabled: true,
    strategies: ['seeded', 'balanced', 'manual'],   // id dari GROUPING_STRATEGIES
    defaultGroupCount: 8,
    spreadFirst: (p) => p.position === 'CAPTAIN',   // opsional: peran yang disebar dulu
    spreadFirstLabel: 'Kapten disebar rata',
    announcement: { heading: '🎮 *PEMBAGIAN SQUAD*', memberLabel: 'Pemain', closingNote: 'GLHF!' },
  },
});
```

- **Strategi baru**: `registerGroupingStrategy({ id, label, description, usesSeed, build })`. Fungsi `build` wajib deterministik untuk seed yang sama.
- **Override per event** (data saja, tersimpan di `events.type_config`): `labels`, `grouping.enabled`, `grouping.defaultGroupCount`, `grouping.strategies`, `announcement`.
- **Field peserta**: sub-field repeater dengan key di `PLAYER_NAME_KEYS`, `PLAYER_ROLE_KEYS`, `PLAYER_NUMBER_KEYS`, `PLAYER_LEVEL_KEYS`, `GROUP_ORIGIN_KEYS` (`lib/team-generator.ts`).
- **Pesan**: kosongkan template di builder untuk memakai bawaan (`lib/notifications.ts`).

---

## Batasan yang diketahui
- Pengiriman pesan memakai WhatsApp *click-to-chat* (panitia menekan kirim). Belum ada email atau WhatsApp API otomatis.
- Pembayaran tetap manual (tidak ada payment gateway).
- Bila pendaftaran gagal setelah upload, file bukti bayar bisa tertinggal di Storage (perlu pembersihan berkala).
- Istilah UI hanya Bahasa Indonesia (belum ada i18n).
- Semua halaman masih client component. Data di mode Supabase dilindungi RLS, bukan oleh server Next.

## Deploy
1. Buat project Supabase production, terapkan `supabase/migrations/` (bukan `seed.sql`).
2. Set `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` di hosting. `SUPABASE_SERVICE_ROLE_KEY` belum diperlukan.
3. Pastikan CI hijau, lalu deploy (mis. Vercel).
4. Tambahkan akun Anda ke `platform_admins` (lihat Setup).
