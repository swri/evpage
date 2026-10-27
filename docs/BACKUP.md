# Panduan Backup & Pemulihan Data EvPage

Dokumen ini menjelaskan cara menjalankan backup otomatis dan terjadwal untuk database (`registrations`, `events`) serta berkas storage Supabase (`payment-proofs`, `form-attachments`).

---

## 1. Menjalankan Backup Manual

Jalankan perintah berikut di terminal:

```bash
pnpm db:backup
```
atau
```bash
node scripts/backup-data.mjs
```

### Output Backup
Setiap backup akan disimpan di folder berstempel waktu:
```
backups/
└── backup-YYYY-MM-DDTHH-mm-ss/
    ├── manifest.json            # Metadata waktu, jumlah record & berkas
    ├── registrations.json       # Dump JSON tabel registrations
    ├── registrations.csv        # Ekspor format CSV tabel registrations
    ├── events.json              # Dump JSON tabel events
    └── storage/                 # Berkas biner dari Supabase Storage
        ├── payment-proofs/      # Bukti transfer pembayaran
        └── form-attachments/   # Berkas lampiran kustom formulir
```

---

## 2. Variabel Lingkungan yang Dibutuhkan

Untuk backup live dari Supabase, pastikan variabel berikut disetel di file `.env.local` atau environment CI/CD:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# Direkomendasikan menggunakan Service Role Key agar dapat mengakses seluruh data & storage tanpa terhalang RLS:
SUPABASE_SERVICE_ROLE_KEY=eyJh...
```

> **Catatan:** Jika dijalankan tanpa variabel Supabase (misalnya pada mode demo), skrip akan otomatis menghasilkan snapshot demo untuk memastikan kontinuitas pipeline tanpa crash.

---

## 3. Menjadwalkan Backup Otomatis

### Opsi A: GitHub Actions (Direkomendasikan)
Buat file `.github/workflows/scheduled-backup.yml`:

```yaml
name: Scheduled Database & Storage Backup

on:
  schedule:
    # Berjalan setiap hari pada pukul 02:00 UTC (09:00 WIB)
    - cron: '0 2 * * *'
  workflow_dispatch: # Memungkinkan trigger manual dari UI GitHub

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Backup
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: pnpm db:backup

      - name: Upload Backup Artifact
        uses: actions/upload-artifact@v4
        with:
          name: evpage-backup-${{ github.run_id }}
          path: backups/
          retention-days: 30
```

### Opsi B: Linux / Cron Server
Tambahkan entri cron dengan perintah `crontab -e`:

```bash
# Backup setiap hari pukul 02:00 WIB
0 2 * * * cd /var/www/evpage && NEXT_PUBLIC_SUPABASE_URL="https://..." SUPABASE_SERVICE_ROLE_KEY="..." /usr/bin/node scripts/backup-data.mjs >> /var/log/evpage-backup.log 2>&1
```

### Opsi C: Windows Task Scheduler
1. Buka **Task Scheduler** di Windows.
2. Buat Basic Task dengan trigger Daily.
3. Action: Start a Program:
   - Program: `node.exe`
   - Arguments: `scripts/backup-data.mjs`
   - Start in: `d:\project-codex\evpage`

---

## 4. Panduan Pemulihan (Disaster Recovery)

1. **Data Pendaftaran & Event:**
   - Berkas `registrations.csv` dapat diimpor langsung melalui Supabase Dashboard > Table Editor > `registrations` > Insert > Import data from CSV.
   - Atau menggunakan query SQL `COPY registrations FROM ...` / skrip pemulihan JSON.
2. **Berkas Storage:**
   - Berkas di dalam folder `storage/payment-proofs/` dan `storage/form-attachments/` dapat diunggah kembali ke bucket Supabase Storage melalui Supabase Dashboard Storage Explorer atau Supabase CLI:
   ```bash
   supabase storage cp backups/backup-XYZ/storage/payment-proofs/* ss:///payment-proofs/
   ```
