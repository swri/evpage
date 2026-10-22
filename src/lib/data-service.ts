import { EventItem, OrganizationSettings, Registration, FormField } from '@/types';

// Default built-in Form Templates
export const BUILT_IN_TEMPLATES: { id: string; name: string; description: string; template: Partial<EventItem> }[] = [
  {
    id: 'mini-soccer',
    name: 'Turnamen Mini Soccer (Tim + Pemain)',
    description: 'Cocok untuk turnamen olahraga beregu dengan daftar pemain lengkap (nama, nomor punggung, posisi).',
    template: {
      title: 'Mandiri Mini Soccer Cup 2026',
      description: 'Turnamen sepak bola mini antar instansi & komunitas se-Jabodetabek. Total hadiah Rp 25.000.000 + Trophy bergengsi.',
      price_type: 'fixed',
      price_amount: 750000,
      quota: 32,
      prefix_code: 'MSC',
      location: 'Grand Futsal & Mini Soccer Arena, Jakarta Selatan',
      form_schema: [
        {
          id: 'team_name',
          type: 'text',
          label: 'Nama Tim / Klub',
          placeholder: 'Contoh: Garuda Muda FC',
          helperText: 'Nama tim yang akan dicantumkan di jadwal pertandingan',
          validation: { required: true, minLength: 3 }
        },
        {
          id: 'manager_name',
          type: 'text',
          label: 'Nama Official / Manajer Tim',
          placeholder: 'Nama lengkap manajer tim',
          validation: { required: true }
        },
        {
          id: 'manager_phone',
          type: 'phone',
          label: 'Nomor WhatsApp Manajer',
          placeholder: '081234567890',
          helperText: 'Untuk koordinasi teknis pertandingan (Technical Meeting)',
          validation: { required: true }
        },
        {
          id: 'jersey_color',
          type: 'text',
          label: 'Warna Jersey Utama & Cadangan',
          placeholder: 'Contoh: Biru Dongker (Utama) / Putih (Cadangan)',
          validation: { required: true }
        },
        {
          id: 'players',
          type: 'repeater',
          label: 'Daftar Pemain Tim',
          helperText: 'Minimal 7 pemain, maksimal 12 pemain per tim (termasuk kiper)',
          validation: { required: true, min: 7, max: 12 },
          subFields: [
            {
              id: 'player_name',
              type: 'text',
              label: 'Nama Pemain',
              placeholder: 'Nama sesuai KTP/ID',
              validation: { required: true }
            },
            {
              id: 'back_number',
              type: 'number',
              label: 'No. Punggung',
              placeholder: '1 - 99',
              validation: { required: true, min: 1, max: 99 }
            },
            {
              id: 'position',
              type: 'select',
              label: 'Posisi',
              placeholder: 'Pilih posisi',
              validation: { required: true },
              options: [
                { label: 'Kiper (GK)', value: 'GK' },
                { label: 'Bek (DF)', value: 'DF' },
                { label: 'Gelandang (MF)', value: 'MF' },
                { label: 'Penyerang (FW)', value: 'FW' }
              ]
            }
          ]
        },
        {
          id: 'agreement',
          type: 'checkbox',
          label: 'Pernyataan & Persetujuan',
          validation: { required: true },
          options: [
            { label: 'Tim kami bersedia mematuhi seluruh regulasi turnamen & menjunjung tinggi sportivitas', value: 'agree_rules' },
            { label: 'Seluruh pemain dalam kondisi sehat jasmani dan rohani', value: 'agree_health' }
          ]
        }
      ]
    }
  },
  {
    id: 'seminar-workshop',
    name: 'Seminar / Workshop / Webinar',
    description: 'Cocok untuk kegiatan edukasi, workshop, meetup, dan seminar dengan pengumpulan profil peserta.',
    template: {
      title: 'AI & Next-Gen Web Development Summit',
      description: 'Eksplorasi teknologi AI terapan, Next.js, dan modern stack bersama praktisi industri terkemuka.',
      price_type: 'fixed',
      price_amount: 150000,
      quota: 100,
      prefix_code: 'AIS',
      location: 'Auditorium Menara Digital & Hybrid Live Stream',
      form_schema: [
        {
          id: 'full_name',
          type: 'text',
          label: 'Nama Lengkap (untuk E-Sertifikat)',
          placeholder: 'Gelar jika diperlukan',
          validation: { required: true }
        },
        {
          id: 'email',
          type: 'email',
          label: 'Email Aktif',
          placeholder: 'nama@email.com',
          helperText: 'Tiket QR dan link zoom akan dikirimkan ke email ini',
          validation: { required: true }
        },
        {
          id: 'institution',
          type: 'text',
          label: 'Instansi / Perusahaan / Kampus',
          placeholder: 'PT Teknologi Hebat / Universitas...',
          validation: { required: true }
        },
        {
          id: 'job_role',
          type: 'select',
          label: 'Profesi / Peran Saat Ini',
          options: [
            { label: 'Software Engineer / Developer', value: 'developer' },
            { label: 'Product Manager / Designer', value: 'product' },
            { label: 'Mahasiswa / Akademisi', value: 'student' },
            { label: 'Founder / Executive', value: 'executive' },
            { label: 'Lainnya', value: 'other' }
          ],
          validation: { required: true }
        },
        {
          id: 'attendance_mode',
          type: 'radio',
          label: 'Mode Kehadiran',
          options: [
            { label: 'Offline di Lokasi (Termasuk Lunch & Goodie Bag)', value: 'offline' },
            { label: 'Online via Live Stream (Termasuk E-Certificate)', value: 'online' }
          ],
          validation: { required: true }
        },
        {
          id: 'dietary_notes',
          type: 'textarea',
          label: 'Alergi Makanan / Catatan Khusus (Opsional)',
          placeholder: 'Contoh: Vegetarian, tidak makan kacang, dll.'
        }
      ]
    }
  },
  {
    id: 'individual-competition',
    name: 'Lomba Individu / Kompetisi Kreatif',
    description: 'Cocok untuk kompetisi desain, fotografi, coding contest, atau perlombaan individual.',
    template: {
      title: 'Lomba Desain Poster Kreatif Nasional 2026',
      description: 'Tunjukkan kreativitas visualmu dengan tema "Inovasi Hijau untuk Masa Depan Bumi". Hadiah jutaan rupiah.',
      price_type: 'fixed',
      price_amount: 50000,
      quota: 75,
      prefix_code: 'LDP',
      location: 'Online Submission',
      form_schema: [
        {
          id: 'participant_name',
          type: 'text',
          label: 'Nama Peserta',
          placeholder: 'Nama lengkap peserta',
          validation: { required: true }
        },
        {
          id: 'birth_date',
          type: 'date',
          label: 'Tanggal Lahir',
          helperText: 'Peserta berusia antara 15 - 30 tahun',
          validation: { required: true }
        },
        {
          id: 'category',
          type: 'radio',
          label: 'Kategori Peserta',
          options: [
            { label: 'Pelajar SMA / SMK', value: 'sma' },
            { label: 'Mahasiswa', value: 'mahasiswa' },
            { label: 'Umum / Profesional', value: 'umum' }
          ],
          validation: { required: true }
        },
        {
          id: 'portfolio_link',
          type: 'text',
          label: 'Link Portofolio / Instagram',
          placeholder: 'https://behance.net/... atau @username',
          helperText: 'Opsional sebagai referensi karya'
        },
        {
          id: 'id_card_file',
          type: 'file',
          label: 'Upload Kartu Identitas (KTP / Kartu Pelajar)',
          helperText: 'Format JPG, PNG, atau PDF (maks. 5MB)',
          validation: { required: true }
        }
      ]
    }
  }
];

export const INITIAL_ORGANIZATION_SETTINGS: OrganizationSettings = {
  name: 'Arena Sport & Event Center',
  logo_url: '/icon.svg',
  accent_color: '#0f172a',
  wa_number: '6281234567890',
  payment_info: {
    bank_name: 'BCA',
    account_number: '8801239841',
    account_holder: 'PT Arena Nusantara Mandiri',
    qris_url: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=00020101021126580014ID.LINKAJA.WWW0118936009110022340000021520260421000000153033605802ID5914ARENA+NUSANTARA6007JAKARTA61051234062070703A0163041234',
    instructions: 'Transfer sesuai total nominal ke rekening di atas atau scan QRIS. Harap simpan dan upload struk transfer di bawah ini.'
  }
};

export const INITIAL_EVENTS: EventItem[] = [
  {
    id: 'evt-mini-soccer-2026',
    slug: 'mini-soccer-championship-2026',
    title: 'Mandiri Mini Soccer Cup 2026',
    description: `## Selamat Datang di Turnamen Mini Soccer Bergengsi 2026!
Turnamen terbuka untuk instansi swasta, BUMN, dan komunitas umum se-Jabodetabek.

### Ketentuan Umum:
- Sistem gugur (Knockout stage)
- Durasi pertandingan: 2 x 20 menit
- Wasit bersertifikasi PSSI
- Lapangan rumput sintetis standar internasional FIFA
- Total hadiah puluhan juta rupiah, medali, serta piala bergilir`,
    cover_url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&auto=format&fit=crop&q=80',
    location: 'Grand Futsal Arena, Cilandak, Jakarta Selatan',
    starts_at: '2026-11-15T08:00:00Z',
    registration_deadline: '2026-11-05T23:59:59Z',
    quota: 32,
    price_type: 'fixed',
    price_amount: 750000,
    prefix_code: 'MSC',
    form_schema: BUILT_IN_TEMPLATES[0].template.form_schema as FormField[],
    wa_template: 'Halo Panitia *{event}*, saya telah mendaftar.\n\nKode Pendaftaran: *{kode}*\nNama Tim: *{nama}*\nTotal Biaya: *Rp {total}*\nBukti Bayar: {bukti}\n\nMohon konfirmasi dan verifikasi pendaftaran kami. Terima kasih!',
    success_message: 'Pendaftaran tim Anda berhasil diterima sistem! Silakan lakukan konfirmasi WhatsApp dan persiapkan berkas tim sebelum Technical Meeting.',
    status: 'open',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z'
  },
  {
    id: 'evt-ai-summit-2026',
    slug: 'ai-next-gen-web-summit',
    title: 'AI & Next-Gen Web Development Summit',
    description: `## Belajar Langsung dari Para Pakar AI & Modern Frontend
Konferensi sehari penuh membahas integrasi LLM, WebAssembly, Server Components, dan arsitektur aplikasi masa depan.

### Fasilitas Peserta:
- Akses penuh semua sesi keynote & workshop hands-on
- Coffee break pagi & sore + lunch buffet
- Goodie bag eksklusif & stiker merchandise
- E-Certificate terverifikasi`,
    cover_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&auto=format&fit=crop&q=80',
    location: 'Auditorium Menara Multimedia & Virtual Stream',
    starts_at: '2026-11-20T09:00:00Z',
    registration_deadline: '2026-11-18T18:00:00Z',
    quota: 100,
    price_type: 'fixed',
    price_amount: 150000,
    prefix_code: 'AIS',
    form_schema: BUILT_IN_TEMPLATES[1].template.form_schema as FormField[],
    wa_template: 'Halo Admin *{event}*, saya telah melakukan pembayaran seminar.\n\nKode Pendaftaran: *{kode}*\nNama Peserta: *{nama}*\nTotal Bayar: *Rp {total}*\nBukti: {bukti}\n\nMohon verifikasi pendaftaran saya.',
    success_message: 'Pendaftaran berhasil! E-tiket dan barcode masuk akan dikirimkan setelah panitia memverifikasi pembayaran Anda.',
    status: 'open',
    created_at: '2026-10-05T12:00:00Z',
    updated_at: '2026-10-05T12:00:00Z'
  },
  {
    id: 'evt-poster-kreatif-2026',
    slug: 'lomba-poster-kreatif-2026',
    title: 'Lomba Desain Poster Kreatif Nasional 2026',
    description: `## Kompetisi Desain Visual Tingkat Nasional
Ajang unjuk kemampuan seni visual dan desain komunikasi grafis. Terbuka untuk pelajar, mahasiswa, dan desainer umum.`,
    cover_url: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=1200&auto=format&fit=crop&q=80',
    location: 'Online National Submission',
    starts_at: '2026-12-01T00:00:00Z',
    registration_deadline: '2026-11-28T23:59:59Z',
    quota: 50,
    price_type: 'fixed',
    price_amount: 50000,
    prefix_code: 'LDP',
    form_schema: BUILT_IN_TEMPLATES[2].template.form_schema as FormField[],
    wa_template: 'Halo Panitia *{event}*, ini konfirmasi pendaftaran lomba saya:\n\nKode: *{kode}*\nNama: *{nama}*\nNominal: *Rp {total}*\nBukti: {bukti}',
    success_message: 'Pendaftaran lomba berhasil dicatat! Simpan kode pendaftaran Anda untuk pengecekan status karya.',
    status: 'open',
    created_at: '2026-10-10T09:00:00Z',
    updated_at: '2026-10-10T09:00:00Z'
  }
];

export const INITIAL_REGISTRATIONS: Registration[] = [
  {
    id: 'reg-001',
    event_id: 'evt-mini-soccer-2026',
    code: 'MSC-2026-0001',
    contact_name: 'Budi Santoso',
    contact_phone: '081288991234',
    contact_email: 'budi.santoso@gmail.com',
    total_amount: 750000,
    status: 'verified',
    payment_proof_path: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
    admin_note: 'Pembayaran BCA valid masuk rekening pada 12 Okt 2026',
    created_at: '2026-10-12T14:32:00Z',
    verified_at: '2026-10-12T15:10:00Z',
    answers: {
      team_name: 'Garuda Muda FC',
      manager_name: 'Budi Santoso',
      manager_phone: '081288991234',
      jersey_color: 'Merah Putih (Home) / Hitam (Away)',
      players: [
        { player_name: 'Andi Wijaya', back_number: 1, position: 'GK' },
        { player_name: 'Rian Pratama', back_number: 4, position: 'DF' },
        { player_name: 'Bagus Kahfi', back_number: 7, position: 'FW' },
        { player_name: 'Fajar Alfian', back_number: 8, position: 'MF' },
        { player_name: 'Dimas Drajad', back_number: 9, position: 'FW' },
        { player_name: 'Irianto', back_number: 5, position: 'DF' },
        { player_name: 'Kurnia Meiga', back_number: 12, position: 'GK' }
      ],
      agreement: ['agree_rules', 'agree_health']
    },
    schema_snapshot: BUILT_IN_TEMPLATES[0].template.form_schema as FormField[]
  },
  {
    id: 'reg-002',
    event_id: 'evt-mini-soccer-2026',
    code: 'MSC-2026-0002',
    contact_name: 'Ahmad Fauzi',
    contact_phone: '085712348877',
    contact_email: 'fauzi.ahmad@bumn.co.id',
    total_amount: 750000,
    status: 'pending',
    payment_proof_path: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=600&auto=format&fit=crop&q=80',
    admin_note: '',
    created_at: '2026-10-15T09:12:00Z',
    answers: {
      team_name: 'Putra Mandiri FC',
      manager_name: 'Ahmad Fauzi',
      manager_phone: '085712348877',
      jersey_color: 'Biru Langit',
      players: [
        { player_name: 'Dedi Kusnandar', back_number: 1, position: 'GK' },
        { player_name: 'Henhen Herdiana', back_number: 3, position: 'DF' },
        { player_name: 'Beckham Putra', back_number: 10, position: 'MF' },
        { player_name: 'Ciro Alves', back_number: 77, position: 'FW' },
        { player_name: 'David Silva', back_number: 19, position: 'FW' },
        { player_name: 'Marc Klok', back_number: 23, position: 'MF' },
        { player_name: 'Nick Kuipers', back_number: 2, position: 'DF' }
      ],
      agreement: ['agree_rules', 'agree_health']
    },
    schema_snapshot: BUILT_IN_TEMPLATES[0].template.form_schema as FormField[]
  },
  {
    id: 'reg-003',
    event_id: 'evt-ai-summit-2026',
    code: 'AIS-2026-0001',
    contact_name: 'Jessica Tanuwijaya',
    contact_phone: '081987654321',
    contact_email: 'jessica.tan@techunicorn.id',
    total_amount: 150000,
    status: 'verified',
    payment_proof_path: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
    admin_note: 'QRIS verified',
    created_at: '2026-10-14T11:20:00Z',
    verified_at: '2026-10-14T11:45:00Z',
    answers: {
      full_name: 'Jessica Tanuwijaya, S.Kom',
      email: 'jessica.tan@techunicorn.id',
      institution: 'Tech Unicorn Indonesia',
      job_role: 'developer',
      attendance_mode: 'offline',
      dietary_notes: 'Vegetarian'
    },
    schema_snapshot: BUILT_IN_TEMPLATES[1].template.form_schema as FormField[]
  }
];

// Helper to format currency in Rupiah
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount);
}

// Helper to format Indonesian dates
export function formatIndoDate(dateString?: string, withTime = false): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' } : {})
    };
    return new Intl.DateTimeFormat('id-ID', options).format(d);
  } catch {
    return dateString;
  }
}
