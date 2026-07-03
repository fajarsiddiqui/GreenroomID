# RB-01.2 — Rapikan Header Client & Dashboard

## Tujuan
Menghilangkan tombol dan card yang berulang di Dashboard client setelah navigasi umum sudah tersedia di header portal client.

## Perubahan

### Header client
- Menambahkan navigasi `+ Buat Request` menuju `/request/new`.
- Menambahkan tombol `Chat Admin` di kanan header, sebelum `Profil Saya`.
- Nomor WhatsApp admin dibaca dari `admin_payment_settings.admin_phone`.
- Jika nomor admin belum tersedia, tombol Chat Admin ditampilkan nonaktif.
- Header tetap digunakan pada Dashboard, Profil, Layanan & Harga, Request Baru, dan Detail Request.

### Dashboard client
- Menghapus card **Jelajahi GreenroomID**.
- Menghapus aksi ganda **Chat Admin**, **Profil Saya**, **Layanan & Harga**, dan **+ Buat Request Manual** dari isi dashboard.
- Dashboard sekarang fokus pada daftar request, status, invoice, diskusi, dan hasil.
- Empty state mengarahkan user memakai tombol `+ Buat Request` pada header.

## Tidak diubah
- Tidak ada SQL baru.
- Tidak ada perubahan pada database, RLS, Storage, atau payment.
- Tidak ada perubahan pada Ruang Belajar, template Word, dan ekspor PDF.

## Validasi
- `npm run build` berhasil.
- `npm run lint` menghasilkan warning React Hooks lama yang sudah ada sebelumnya, tanpa error baru.
