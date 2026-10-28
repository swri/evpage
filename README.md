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
| Halaman publik (`/`, `/e/[slug]`, `/e/[slug]/teams`) | dimuat di browser | **dirender di server + cache** (lihat di bawah) |

### Rendering & cache halaman publik (mode Supabase)
- Halaman publik dibaca di server dengan klien Supabase anonim (tanpa cookie) di fungsi `'use cache'` (`src/lib/server/public-cache.ts`). Hasilnya sama untuk semua pengunjung: tampil cepat dan ramah SEO.
- **Pratinjau link**: `generateMetadata` mengisi judul, deskripsi, dan gambar cover per event. Saat link `/e/<slug>` dibagikan di WhatsApp/Facebook/X, pratinjau menampilkan event tersebut.
- **Kesegaran data**: cache diperbarui tiap ±1 menit. Setelah penyelenggara menyimpan event, mengubah status pendaftar, atau mempublikasikan undian, cache event itu langsung diperbarui lewat server action (`src/app/actions/public-cache.ts`, hanya untuk user yang login). Sisa kuota bisa tertinggal sampai ±1 menit setelah pendaftaran baru, tetapi kuota tetap dijaga RPC di database.
- **Tahan gangguan**: bila database tidak bisa dihubungi (termasuk saat build sebelum migrasi dijalankan), halaman otomatis memuat data di browser dan build tidak gagal.
- Halaman admin sengaja tetap dimuat di browser; keamanannya dijaga RLS dan `src/proxy.ts`.

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
  3. Pastikan hasilnya *Success*. Jalankan **sekali** saja pada project baru. Bila nanti memakai deploy otomatis, jalankan langkah *baseline* (lihat **Deploy otomatis**).

- **Cara 2 — Supabase CLI (disarankan untuk pembaruan berikutnya)**
  ```bash
  npx supabase login
  npx supabase init                      # hanya bila supabase/config.toml belum ada
  npx supabase link --project-ref <REF>  # REF = bagian ID di URL dashboard project
  npx supabase db push                   # menerapkan supabase/migrations/* yang belum diterapkan
  ```
  Pembaruan berikutnya bisa otomatis lewat GitHub Actions (lihat **Deploy otomatis**). Jangan mencampur dengan Cara 1 tanpa langkah *baseline*, karena CLI mencatat migrasi mana yang sudah diterapkan.

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
5. Cek pratinjau link: buka *View Page Source* di `https://<domain>/e/<slug>` dan pastikan ada `<meta property="og:title" ...>`. WhatsApp dan Facebook menyimpan pratinjau cukup lama; untuk memaksa refresh, pakai Facebook Sharing Debugger (<https://developers.facebook.com/tools/debug/>). Gambar cover sebaiknya URL publik `https://` berukuran sekitar 1200×630.

### Deploy otomatis (push ke `main` = kode + database ter-update)

| Bagian | Siapa yang men-deploy | Kapan |
|---|---|---|
| Kode | **Vercel Git integration** (otomatis setelah repo di-import) | setiap push ke `main` → production; setiap pull request → preview |
| Database | **GitHub Actions** `.github/workflows/supabase-migrate.yml` | setelah workflow **CI** lulus di `main`: menerapkan file baru di `supabase/migrations/` |

**Setup sekali saja**
1. Di Supabase klik **Connect** (atas dashboard), pilih **Session pooler**, lalu salin connection string. Bentuknya `postgresql://postgres.<ref>:<PASSWORD>@aws-…pooler.supabase.com:5432/postgres`.
   - Pakai *Session pooler*, bukan *Direct connection*: koneksi langsung hanya IPv6, sedangkan runner GitHub tidak mendukung IPv6.
   - Ganti `<PASSWORD>` dengan password database. Bila password mengandung karakter seperti `@ : / ? # %`, karakter itu harus di-*percent-encode* (contoh: `@` → `%40`).
2. Di GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**. Nama: `SUPABASE_DB_URL`, isi: string dari langkah 1.
3. **Hanya bila skema dulu dipasang lewat SQL Editor (Cara 1):** database belum punya catatan migrasi, sehingga CLI akan mencoba menjalankan ulang semuanya (dan gagal).
   1. Buka **Actions → Supabase migrations → Run workflow**, centang *baseline*, lalu jalankan.
   2. Langkah ini hanya menandai semua migrasi yang ada sebagai sudah diterapkan; tidak ada SQL yang dijalankan. Lakukan **sekali**.
   - Bila dulu memakai Cara 2 (CLI), lewati langkah ini.
4. (Opsional) **Settings → Environments → production → Required reviewers**: setiap migrasi menunggu persetujuan Anda sebelum dijalankan.

**Alur sehari-hari**
1. Buat migrasi baru `supabase/migrations/<YYYYMMDDHHMMSS>_<nama>.sql`, lalu jalankan `pnpm db:schema` dan `pnpm test`.
2. Commit & push ke `main` (lebih aman lewat pull request).
3. Vercel membangun kode. Bersamaan dengan itu CI berjalan, lalu migrasi diterapkan. Pantau di tab **Actions**: langkah *Preview pending migrations* menampilkan file yang akan dijalankan.
4. Tidak ada migrasi baru → workflow selesai tanpa perubahan.

**Soal urutan.** Vercel dan migrasi berjalan paralel, sehingga selama ±1–3 menit kode baru bisa aktif sebelum kolom/fungsi barunya ada. Ada dua pilihan:
- **Disarankan:** buat migrasi yang *kompatibel ke belakang* (tambah kolom/fungsi dulu, hapus yang lama di rilis berikutnya). Halaman publik sudah otomatis memuat di browser bila query server gagal.
- **Urutan ketat** (database dulu, baru kode):
  1. Di Vercel buat **Settings → Git → Deploy Hooks** untuk branch `main`, lalu simpan URL-nya sebagai secret `VERCEL_DEPLOY_HOOK_URL`.
  2. Matikan deploy otomatis `main` dengan menambahkan `vercel.json` berisi `{ "git": { "deploymentEnabled": { "main": false } } }`.
  3. Workflow migrasi akan memanggil hook itu setelah database siap. Pull request tetap mendapat preview.

> **Preview deploy memakai database yang sama** bila env Preview diisi kunci production. Agar uji coba di pull request tidak mengubah data asli, buat project Supabase kedua untuk Preview dan isi env *Preview* di Vercel dengan kuncinya.

> **Jangan menggabungkan** workflow ini dengan integrasi GitHub bawaan Supabase yang juga menerapkan migrasi ke production; pilih salah satu. Jangan pula menjalankan migrasi manual lewat SQL Editor setelah otomatisasi aktif, karena catatan migrasinya jadi tidak sinkron.

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
| `pnpm db:backup` | backup data database (JSON/CSV) & download file storage secara rekursif (`SUPABASE_SERVICE_ROLE_KEY` dibutuhkan) |
| `pnpm db:clean-orphans` | bersihkan file bukti bayar yatim (tidak terikat registrasi & >1 jam) |

### Environment Variables untuk Backup & Operasional

Untuk menjalankan `pnpm db:backup` atau `pnpm db:clean-orphans`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... (service_role secret dari Supabase Settings > API)
```
> [!IMPORTANT]
> `SUPABASE_SERVICE_ROLE_KEY` wajib digunakan untuk backup dan pembersihan file yatim agar operasi tidak dibatasi oleh Row-Level Security (RLS) Supabase yang dapat menyebabkan ekspor 0 baris atau kegagalan unduh bucket. Jangan pernah mengekspos kunci ini ke browser.

---

## Struktur

```
src/
  proxy.ts                 cek sesi Supabase untuk /admin (mode Supabase)
  app/actions/             server action (refresh cache halaman publik)
  lib/server/              pembaca data publik di server + cache
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
- Halaman admin dimuat di browser (data dilindungi RLS); hanya halaman publik yang dirender di server.

## Deploy
Lihat **Tutorial Deploy: Supabase + Vercel** di atas.
