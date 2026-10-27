import { FormField, FieldType } from '@/types';

export const FIELD_TYPE_OPTIONS: { label: string; value: FieldType; desc: string }[] = [
  { label: 'Teks Pendek', value: 'text', desc: 'Satu baris teks (nama, nama tim, instansi)' },
  { label: 'Teks Panjang', value: 'textarea', desc: 'Paragraf catatan, alamat, deskripsi' },
  { label: 'Angka (Number)', value: 'number', desc: 'Usia, nomor punggung, kuantitas' },
  { label: 'Email', value: 'email', desc: 'Email dengan validasi format' },
  { label: 'Nomor WhatsApp / HP', value: 'phone', desc: 'Nomor telepon format kontak' },
  { label: 'Tanggal', value: 'date', desc: 'Pemilih tanggal lahir / jadwal' },
  { label: 'Dropdown (Select)', value: 'select', desc: 'Pilihan menu dropdown tunggal' },
  { label: 'Pilihan Tunggal (Radio)', value: 'radio', desc: 'Opsi radio button berdampingan' },
  { label: 'Pilihan Ganda (Checkbox)', value: 'checkbox', desc: 'Persetujuan syarat & ketentuan / multi-pilih' },
  { label: 'Upload Berkas (File)', value: 'file', desc: 'Unggah KTP, kartu pelajar, atau karya' },
  { label: 'Repeater / Grup Berulang', value: 'repeater', desc: 'Daftar dinamis (pemain tim: nama, no punggung, posisi)' },
];

export const DEFAULT_INITIAL_FIELDS: FormField[] = [
  {
    id: 'full_name',
    type: 'text',
    label: 'Nama Lengkap',
    placeholder: 'Contoh: Budi Pratama',
    validation: { required: true },
  },
  {
    id: 'whatsapp',
    type: 'phone',
    label: 'Nomor WhatsApp',
    placeholder: '0812xxxxxxxx',
    helperText: 'Digunakan untuk konfirmasi pendaftaran & login cek status tiket',
    validation: { required: true },
  },
  {
    id: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'nama@email.com',
    validation: { required: false },
  },
  {
    id: 'team_name',
    type: 'text',
    label: 'Nama Tim / Klub',
    placeholder: 'Contoh: Garuda Muda FC',
    validation: { required: true },
  },
];
