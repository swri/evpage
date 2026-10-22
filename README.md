# EvPage — Form Pendaftaran Event yang Dapat Dikustomisasi (Multi-Event, White-Label)

Aplikasi web modern untuk manajemen dan formulir pendaftaran event dengan form builder dinamis (JSON schema), kalkulasi biaya otomatis, integrasi pembayaran transfer manual & QRIS, konfirmasi WhatsApp otomatis, serta portal admin lengkap dengan TanStack Table dan export XLSX/CSV.

---

## 🚀 Fitur Utama

### 1. Area Publik / Pendaftar (Tanpa Login)
- **URL Khusus per Event:** `/e/[slug]` (bisa langsung dibagikan ke media sosial / WhatsApp).
- **Desain Estetik Notion-like:** Tipografi bersih (Geist / Inter), border halus, kartu dengan bayangan lembut, dan dukungan dark mode.
- **Formulir Dinamis:** Dirender otomatis dari JSON Schema database:
  - Teks pendek, teks panjang, angka, email, nomor HP, tanggal, select dropdown, radio, checkbox, upload berkas, dan **repeater (grup pemain tim berulang: nama, no punggung, posisi)**.
- **Kalkulasi Biaya & Pembayaran:**
  - Tipe harga: Gratis, Tetap (Fixed), atau Per-Peserta (berdasarkan jumlah baris repeater).
  - Tampilan rekening bank transfer manual dan scan QRIS instan.
  - Upload bukti pembayaran (JPG/PNG/PDF, maks 5 MB) dengan pratinjau langsung.
- **Halaman Sukses & Konfirmasi WhatsApp:**
  - Kode pendaftaran unik yang digenerate aman dari race condition (contoh: `MSC-2026-0001`).
  - Efek selebrasi confetti animasi.
  - Tombol **"Konfirmasi via WhatsApp Panitia"** yang membuka `wa.me/<nomor_admin>?text=<pesan>` dengan format variabel otomatis `{nama}`, `{kode}`, `{event}`, `{total}`, `{bukti}`.
- **Halaman Cek Status Mandiri (`/status`):**
  - Pendaftar dapat memeriksa status tiket (Menunggu Verifikasi, Terverifikasi, Ditolak) menggunakan kombinasi Kode Pendaftaran + Nomor WhatsApp tanpa mengekspos data orang lain.

### 2. Area Admin (`/admin` — Wajib Login)
- **Otentikasi Aman:** Integrasi Supabase Auth dengan pengecekan whitelist tabel `admins`, serta tombol kredensial demo instan (`admin@evpage.com` / `admin123`) untuk pengujian lokal tanpa hambatan.
- **Dashboard Ringkasan KPI:**
  - Total Pendaftar, Jumlah Terverifikasi, Menunggu, Ditolak, dan Total Pemasukan Bersih Terverifikasi.
  - Progress bar keterisian kuota per event.
- **Event Builder Interaktif (`/admin/events/new` & `/admin/events/[id]/edit`):**
  - Tambah, hapus, dan urutkan susunan field formulir (drag & drop / tombol urut).
  - Konfigurasi repeater (min/maks baris, kolom sub-fields).
  - Preset template bawaan 1-klik:
    1. *Turnamen Mini Soccer (Tim + Pemain)*
    2. *Seminar / Workshop / Webinar*
    3. *Lomba Individu / Kompetisi Kreatif*
  - **Tab Pratinjau Live Form:** Coba isi formulir secara langsung sebelum disimpan.
  - Duplikasi event dengan 1 klik.
- **Tabel Pendaftar Lengkap (`/admin/events/[id]/registrations`):**
  - Pencarian instan (kode, nama, nomor WA, email, nama tim, dll.).
  - Filter status (Semua / Menunggu / Terverifikasi / Ditolak).
  - Aksi massal (Bulk Verify & Bulk Reject).
  - Side Drawer / Sheet untuk inspeksi detail pendaftar, pratinjau bukti bayar ukuran penuh, edit kontak, dan tombol hubungi WhatsApp langsung ke pendaftar.
  - **Export Data:** Unduh laporan pendaftar ke **XLSX (Excel)** dan **CSV**.
- **Pengaturan Organisasi (`/admin/settings`):**
  - White-label: nama organisasi, logo, warna aksen, nomor WA admin, info rekening bank & URL QRIS.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript + React 19
- **Styling:** Tailwind CSS v4, desain terinspirasi Notion
- **Komponen & Ikon:** shadcn/ui style components, Lucide React
- **Tabel Data:** TanStack Table
- **Spreadsheet Export:** `xlsx`
- **Database & Storage:** Supabase Postgres, RLS, Storage Bucket `payment-proofs`
- **Validasi:** Zod & React Hook Form
- **Package Manager:** `pnpm`

---

## 📦 Panduan Instalasi Lokal

### 1. Clone Repository & Install Dependensi
```bash
git clone <repo-url>
cd evpage
pnpm install
```

### 2. Setup Environment Variables
Salin file konfigurasi contoh:
```bash
cp .env.example .env.local
```

Isi variabel environment di `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_DEMO_MODE=true
```
> *Catatan:* Jika kredensial Supabase dikosongkan, aplikasi otomatis beralih ke **Demo Store & In-Memory Mode** dengan data bawaan siap pakai (Turnamen Mini Soccer, Seminar AI, dll.), sehingga Anda bisa langsung menguji seluruh fitur tanpa setup database eksternal terlebih dahulu!

### 3. Setup Database Supabase (Opsional jika menggunakan Supabase langsung)
Buka menu **SQL Editor** pada dashboard proyek Supabase Anda, lalu jalankan seluruh isi file:
```
supabase/schema.sql
```
atau via Supabase CLI:
```bash
supabase db push
```

File migrasi ini mencakup:
- Tabel `admins`, `organizations`, `events`, `registrations`.
- Fungsi atomik PostgreSQL `create_registration_atomic(...)` untuk mencegah *race condition / overselling* kuota dan membuat nomor tiket urut otomatis.
- Policy Row Level Security (RLS) lengkap.
- Konfigurasi bucket privat `payment-proofs`.

### 4. Jalankan Server Development
```bash
pnpm dev
```
Buka browser di [http://localhost:3000](http://localhost:3000).

---

## 🔐 Akun Login Admin Demo
- **URL Login:** [http://localhost:3000/admin/login](http://localhost:3000/admin/login)
- **Email:** `admin@evpage.com`
- **Password:** `admin123`
- *(Tersedia tombol satu-klik "Isi Kredensial Demo Instan" di form login)*

---

## 📂 Struktur Direktori Proyek

```
evpage/
├── public/                     # Aset statis & favicon
├── src/
│   ├── app/
│   │   ├── admin/              # Portal Manajemen Penyelenggara
│   │   │   ├── events/         # Daftar Event & Builder
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── edit/   # Edit Event & Form Schema
│   │   │   │   │   └── registrations/ # Tabel Pendaftar & Export
│   │   │   │   └── new/        # Buat Event Baru
│   │   │   ├── login/          # Halaman Login Admin
│   │   │   ├── settings/       # Pengaturan Organisasi & Rekening
│   │   │   ├── layout.tsx      # Sidebar & Admin Auth Guard
│   │   │   └── page.tsx        # Dashboard KPI & Ringkasan
│   │   ├── e/
│   │   │   └── [slug]/         # Halaman Publik Formulir Pendaftaran Event
│   │   ├── status/             # Halaman Cek Status Tiket Publik
│   │   ├── layout.tsx          # Root Layout & Toast Provider
│   │   ├── page.tsx            # Landing Page Publik (Daftar Event Buka)
│   │   └── globals.css         # Styling Notion & Desain Token
│   ├── components/
│   │   ├── admin/              # Komponen Builder & Event Editor
│   │   ├── form/               # Dynamic Form Field Renderer
│   │   └── ui/                 # Button, Input, Modal, Drawer, Badge, Toast, dll.
│   ├── lib/
│   │   ├── auth.ts             # Logika Otentikasi Admin
│   │   ├── data-service.ts     # Template Bawaan & Sample Seed
│   │   ├── store.ts            # State & Storage API Layer
│   │   ├── supabase/           # Client, Server, & Admin Supabase
│   │   └── utils.ts            # Helper Class Merge (cn)
│   └── types/
│       └── index.ts            # Definisi Tipe TypeScript Inti
├── supabase/
│   ├── migrations/             # SQL Migrations
│   └── schema.sql              # Skema Lengkap Supabase
├── .env.example                # Contoh Environment Variables
├── package.json
└── README.md
```

---

## 🚀 Panduan Deployment ke Vercel

1. Push repository Anda ke GitHub / GitLab.
2. Buka [Vercel Dashboard](https://vercel.com) dan impor repository ini.
3. Masukkan environment variable dari `.env.example` ke pengaturan Environment Variables di Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` (misal: `https://your-domain.vercel.app`)
4. Klik **Deploy**. Vercel akan otomatis membangun dan merilis aplikasi Anda.

---

## 📄 Lisensi
Hak Cipta &copy; 2026 EvPage. Dikembangkan dengan standar modern full-stack web engineering.
