# EvPage — Platform Pendaftaran & Manajemen Event

Platform event untuk dua jenis pengguna: **penyelenggara** (membuat event, memverifikasi pendaftar, membagi tim) dan **peserta** (mendaftar, membayar, cek status). Fokus awal: event olahraga seperti mini soccer. Arah ke depan: platform event umum.

---

## Fitur

### Peserta (tanpa login)
- Halaman pendaftaran per event: `/e/[slug]`.
- Formulir dinamis dari JSON schema: teks, angka, email, HP, tanggal, select, radio, checkbox, file, dan **repeater** (mis. daftar pemain).
- Tipe harga: gratis, tetap, atau per peserta (dihitung dari jumlah baris repeater pertama). Total selalu dihitung di sisi aplikasi/DB, bukan dari input browser.
- Instruksi transfer bank/QRIS dan unggah bukti bayar (maks. 5 MB).
- Kode pendaftaran `PREFIX-TAHUN-0001` dan tombol konfirmasi ke WhatsApp panitia (template `{nama}`, `{kode}`, `{event}`, `{total}`, `{bukti}`).
- Cek status di `/status`: **kode + nomor WhatsApp wajib cocok**.

### Penyelenggara (`/admin`)
- Dashboard KPI per penyelenggara; super admin (`admin@evpage.com`) dapat melihat semua event.
- Event builder: urutkan field, repeater, template bawaan (Mini Soccer, Seminar, Lomba Individu), pratinjau live, duplikasi event.
- Tabel pendaftar: cari, filter status, verifikasi/tolak massal, edit data, ekspor XLSX/CSV (CSV dinetralkan dari formula injection).
- **Tool acak tim** dan undian bagan turnamen:
  - Ukuran tim selisih maksimal 1; peserta "prioritas" (default: kiper) disebar lebih dulu.
  - Tanpa bias urutan tim; **seed** ditampilkan dan dicantumkan di pengumuman WA, sehingga hasil bisa diulang dan diaudit.
  - Pindah pemain manual (seed lalu ditandai "diubah manual").
- Pengaturan organisasi: nama, logo, warna, nomor WA, rekening, QRIS.

---

## Stack

| Bagian | Teknologi |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components), React 19, TypeScript |
| Styling | Tailwind CSS v4, komponen gaya shadcn, Lucide |
| Data | Supabase Postgres + RLS + RPC (opsional); mode demo di `localStorage` |
| Ekspor | `xlsx` (SheetJS) |
| Test | `node:test` bawaan Node (tanpa framework tambahan) |
| Package manager | `pnpm` |

> `@dnd-kit/*`, `@tanstack/react-table`, `react-hook-form`, `@hookform/resolvers`, dan `zod` terpasang tetapi **belum dipakai** oleh kode.

### Dua mode data

| | Mode demo | Mode Supabase |
| --- | --- | --- |
| Aktif bila | `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` kosong atau placeholder | keduanya diisi |
| Penyimpanan | `localStorage` per browser (data tidak dibagi antar perangkat) | Postgres |
| Login admin | akun lokal + demo `admin@evpage.com` / `admin123` | Supabase Auth + tabel `admins` saja |
| Pendaftaran | di browser peserta | RPC `create_registration_atomic` (kuota atomik) |
| Cek status | di browser | RPC `check_registration_status` |

Di mode Supabase, semua error DB diteruskan ke UI. Tidak ada lagi fallback diam-diam ke data demo.

---

## Setup lokal

Butuh Node 22+ (dikembangkan di Node 24) dan pnpm.

```bash
pnpm install
cp .env.example .env.local   # biarkan placeholder untuk mode demo
pnpm dev                      # http://localhost:3000
```

Mode Supabase (opsional): jalankan `supabase/schema.sql` di SQL Editor project **development**, lalu isi URL dan anon key di `.env.local`.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `pnpm dev` | server development |
| `pnpm test` | semua test di `test/*.test.ts` (termasuk test cabang Supabase dengan klien tiruan) |
| `pnpm lint` | ESLint |
| `npx tsc --noEmit` | type check |
| `pnpm build` | build produksi |

---

## Struktur

```
src/
  app/
    e/[slug]/           halaman pendaftaran publik
    status/             cek status tiket
    admin/              dashboard, events, builder, pendaftar, settings, login/register
  components/
    admin/              event-builder, random-team-modal
    form/               renderer field dinamis
    ui/                 komponen dasar
  lib/
    store.ts            API data (demo/localStorage atau Supabase), harga, validasi event
    auth.ts             login/registrasi admin, canManageEvent()
    team-generator.ts   pembagian tim ber-seed, undian, format pengumuman
    export.ts           sanitasi CSV
    data-service.ts     template bawaan + data demo
    supabase/           klien browser & server
  types/index.ts        tipe inti (EventItem, FormField, Registration)
supabase/schema.sql     skema, RLS, RPC, bucket (+ seed demo)
supabase/migrations/    migrasi yang sama tanpa seed
test/                   test node:test
```

---

## Menambah jenis event baru

Saat ini jenis event = **template form** + konfigurasi event. Tidak ada kolom `event_type`.

1. **Template form.** Tambahkan entri ke `BUILT_IN_TEMPLATES` di `src/lib/data-service.ts` (`id`, `name`, `description`, `template` berisi `form_schema`, `price_type`, `quota`, `prefix_code`, dst.). Template langsung muncul di event builder.
2. **Field peserta untuk pembagian kelompok.** `extractPlayersFromRegistrations` membaca baris repeater dengan key di `PLAYER_NAME_KEYS`, `PLAYER_ROLE_KEYS`, `PLAYER_NUMBER_KEYS`, dan `GROUP_ORIGIN_KEYS` (`src/lib/team-generator.ts`). Pakai salah satu key itu di sub-field repeater, atau tambahkan key baru ke daftar tersebut.
3. **Aturan pembagian.** `generateBalancedTeams(players, n, names, { seed, spreadFirst })`:
   - `spreadFirst` default `isSoccerGoalkeeper`; ganti dengan predikat lain (mis. `p => p.position === 'FASILITATOR'`) atau `() => false` untuk acak murni.
4. **Label pengumuman.** `formatTeamsForWhatsApp(title, teams, { labels })`, ganti `SOCCER_ANNOUNCEMENT_LABELS` dengan label versi event Anda.

Tahap 2 dan 3 belum bisa diatur per event dari UI (modal masih memakai default sepak bola). Lihat rekomendasi di laporan audit.

---

## Batasan yang diketahui

- **Mode demo bukan untuk produksi:** data dan akun hanya ada di browser masing-masing.
- Guard akses admin ada di UI. Di mode Supabase, RLS saat ini memberi **semua admin** akses ke semua event/pendaftar, dan tabel `events` belum punya kolom `created_by`.
- Bukti bayar disimpan sebagai data URL base64 di kolom `payment_proof_path`, belum di bucket `payment-proofs`.
- Kuota dihitung per pendaftaran, bukan per pemain.
- Belum ada waitlist, check-in/daftar hadir, notifikasi otomatis, atau payment gateway.

---

## Deploy

1. Siapkan project Supabase produksi; terapkan `supabase/migrations/` (bukan `schema.sql`, karena file itu berisi seed demo).
2. Set env di hosting (mis. Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` hanya bila nanti dipakai di server.
3. `pnpm build` harus lolos; jalankan `pnpm test` di CI.
4. Buat akun penyelenggara: daftar via `/admin/register`, lalu pastikan barisnya ada di tabel `admins` (lihat catatan RLS di laporan audit).
