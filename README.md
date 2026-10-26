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
- **Pendaftar**: cari/filter, verifikasi/tolak (massal), daftar tunggu → promosi (kuota dicek ulang), **check-in**, ekspor XLSX/CSV, pesan WhatsApp sesuai status, **bersihkan bukti bayar** setelah event selesai.
- **Pemeliharaan Platform** (super admin): pemakaian Storage, file yatim, hapus event/organisasi yang tidak terpakai beserta filenya.
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

## Menjalankan di komputer (mode demo)

Butuh Node.js ≥ 22.12 (disarankan 24) dan pnpm.

```bash
pnpm install
cp .env.example .env.local   # biarkan placeholder => mode demo
pnpm dev                      # http://localhost:3000, login demo admin@evpage.com / admin123
```

---

## Tutorial Deploy: Supabase + Vercel

Urutannya: **Supabase dulu** (database, auth, storage), lalu **Vercel** (aplikasi), lalu kembali ke Supabase untuk mendaftarkan domain Vercel.

### Bagian A — Supabase

**A1. Buat project**
1. Masuk ke <https://supabase.com/dashboard>, pilih **New project**.
2. Isi nama project, buat **Database Password** yang kuat (simpan di password manager), lalu pilih region terdekat dengan peserta (untuk Indonesia: *Southeast Asia (Singapore)*).
3. Tunggu sampai project selesai dibuat (± 1–2 menit).

**A2. Pasang skema database**

Pilih salah satu cara:

- **Cara 1 — SQL Editor (paling mudah)**
  1. Di repo ini buka `supabase/schema.sql` dan salin seluruh isinya. File ini gabungan semua migrasi dan selalu sinkron karena dijaga test.
  2. Di dashboard Supabase buka **SQL Editor → New query**, tempel, lalu klik **Run**. Bila muncul peringatan *destructive operation* (karena ada `DROP POLICY`/`DROP FUNCTION IF EXISTS`), pilih untuk tetap menjalankan.
  3. Pastikan hasilnya *Success*. Jalankan **sekali** saja pada project baru.

- **Cara 2 — Supabase CLI (disarankan untuk pembaruan berikutnya)**
  ```bash
  npx supabase login
  npx supabase init                      # hanya bila supabase/config.toml belum ada
  npx supabase link --project-ref <REF>  # REF = bagian ID di URL dashboard project
  npx supabase db push                   # menerapkan supabase/migrations/* yang belum diterapkan
  ```
  Untuk pembaruan berikutnya cukup `npx supabase db push`. Jangan mencampur dengan Cara 1 pada project yang sama, karena CLI mencatat migrasi mana yang sudah diterapkan.

> Jangan jalankan `supabase/seed.sql` di production; isinya data contoh, termasuk rekening contoh.

**A3. Periksa hasilnya**
- **Table Editor**: ada tabel `events`, `registrations`, `organizations`, `organization_members`, `group_draws`, dll.
- **Storage**: ada bucket **payment-proofs** dengan status *Private* (dibuat oleh migrasi).

**A4. Pengaturan Auth**
1. **Authentication → URL Configuration**
   - *Site URL*: sementara isi `http://localhost:3000`. Setelah Vercel jadi, ganti dengan domain Vercel (lihat B5).
   - *Redirect URLs*: tambahkan `http://localhost:3000/**` (dan nanti `https://<domain-vercel>/**`).
2. **Authentication → Sign In / Providers → Email**: provider Email aktif.
   - Bila *Confirm email* **aktif** (default): setelah daftar, penyelenggara harus mengklik email konfirmasi, lalu login di `/admin/login` dan membuat organisasi di menu **Organisasi & Tim**.
   - Bila *Confirm email* **dimatikan**: organisasi pertama langsung dibuat saat daftar.
3. Pengiriman email bawaan Supabase dibatasi dan ditujukan untuk uji coba. Untuk produksi, pasang SMTP sendiri di **Authentication → Emails → SMTP Settings**.

**A5. Ambil kunci API**

Buka **Project Settings → API / API Keys** dan catat:
- **Project URL**, misalnya `https://abcdefgh.supabase.co` → menjadi `NEXT_PUBLIC_SUPABASE_URL`.
- **anon / publishable key** (kunci publik) → menjadi `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Jangan** memakai `service_role` / *secret key* di variabel `NEXT_PUBLIC_*`. Aplikasi ini tidak membutuhkannya.

**A6. (Opsional) Uji dari komputer ke project ini**

Isi kedua nilai di atas ke `.env.local`, jalankan `pnpm dev`, lalu daftar di `http://localhost:3000/admin/register`.

### Bagian B — Vercel

**B1. Push kode ke GitHub/GitLab/Bitbucket**, misalnya `git push origin main`. Pastikan CI hijau.

**B2. Import project**
1. Buka <https://vercel.com/new>, pilih repository ini.
2. *Framework Preset*: **Next.js** (terdeteksi otomatis). *Root Directory*: root repo. Build/Install command dibiarkan default; Vercel memakai `pnpm` karena ada `pnpm-lock.yaml`.

**B3. Environment Variables** (di layar import, atau nanti di **Settings → Environment Variables**)

| Nama | Nilai | Environment |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL dari A5 | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key dari A5 | Production, Preview |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (opsional: memakai versi pnpm persis dari `packageManager`) | Production, Preview |

Variabel `NEXT_PUBLIC_*` dimasukkan ke bundle saat **build**. Setiap kali mengubahnya, lakukan **Redeploy**.

**B4. Deploy**

Klik **Deploy**. Node.js dipilih dari `engines` di `package.json` (≥ 22.12). Bila perlu, atur di **Settings → Build and Deployment → Node.js Version** ke 24.x.

**B5. Daftarkan domain ke Supabase**

Salin domain hasil deploy (misalnya `https://evpage.vercel.app` atau domain kustom), lalu di Supabase **Authentication → URL Configuration**:
- *Site URL* = domain tersebut.
- *Redirect URLs*: tambahkan `https://<domain>/**`. Untuk preview deploy Vercel, tambahkan juga `https://*-<akun>.vercel.app/**` bila dipakai.

### Bagian C — Setelah deploy

1. Daftar akun Anda di `https://<domain>/admin/register` (konfirmasi email bila diminta, lalu login).
2. Jadikan akun Anda **super admin**. Di Supabase **SQL Editor**:
   ```sql
   INSERT INTO public.platform_admins (user_id)
   SELECT id FROM auth.users WHERE email = 'anda@example.com';
   ```
   Lalu **logout dan login lagi**. Menu *Pemeliharaan Platform* akan muncul.
3. Uji alur lengkap:
   - Buat organisasi → buat event (status *Terbuka*).
   - Dari jendela incognito, daftar sebagai peserta dan unggah bukti bayar. File harus muncul di bucket `payment-proofs/<id-event>/`.
   - Verifikasi pendaftar → check-in → bagi tim → publikasikan.
   - Buka `/e/<slug>/teams` dan `/status`.
4. Undang panitia lain lewat **Organisasi & Tim**. Mereka mendaftar atau login dengan email yang diundang, lalu menerima undangan di halaman yang sama.

### Memperbarui aplikasi
- **Kode**: push ke `main` → Vercel deploy otomatis.
- **Skema**: tambahkan file baru di `supabase/migrations/`, jalankan `pnpm db:schema`, commit, lalu terapkan ke Supabase:
  - CLI: `npx supabase db push`.
  - SQL Editor: jalankan **hanya file migrasi baru**. Jangan jalankan ulang seluruh `schema.sql` di database yang sudah berisi.
- Selalu terapkan migrasi **sebelum** deploy kode yang membutuhkannya.

### Batas paket gratis & pemeliharaan
- Paket gratis Supabase membatasi ukuran database dan Storage, dan project dapat dijeda bila lama tidak dipakai. Cek angka terbaru di halaman *Usage* dan *Pricing* Supabase.
- Penyimpanan terbesar biasanya bukti bayar (maks. 5 MB per file). Gunakan:
  - **Bersihkan Penyimpanan** di halaman pendaftar: tersedia untuk pemilik/admin/panitia setelah event selesai (status *Ditutup* atau tanggal mulai lewat). Menghapus semua bukti bayar event itu, plus *file yatim* (upload yang pendaftarannya gagal, lebih dari 1 jam).
  - **Pemeliharaan Platform** (super admin): pemakaian Storage, hapus file yatim seluruh platform, bersihkan atau hapus event dan organisasi yang tidak terpakai, hapus undangan kedaluwarsa.
- Penghapusan bersifat permanen. Ekspor data pendaftar (XLSX/CSV) dulu bila masih diperlukan.

---

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
| `…28000000_storage_cleanup` | pembersihan bukti bayar & file yatim, ringkasan platform |

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
- Pesan sengaja manual: WhatsApp *click-to-chat*, panitia menekan kirim (tanpa email/WA API otomatis).
- Pembayaran tetap manual (tidak ada payment gateway).
- File yatim (upload yang pendaftarannya gagal) tidak dihapus otomatis; bersihkan lewat tombol pembersihan (lihat *Batas paket gratis & pemeliharaan*).
- Antarmuka sengaja hanya Bahasa Indonesia.
- Semua halaman masih client component. Data di mode Supabase dilindungi RLS, bukan oleh server Next.

## Deploy
Lihat **Tutorial Deploy: Supabase + Vercel** di atas.
