# GreenroomID H6 Update Notes

Update ini menambahkan:

1. Menu admin **Landing Page**
   - Admin bisa mengubah teks landing page dari dashboard.
   - Data tersimpan di tabel Supabase `landing_content`.

2. Perubahan UX halaman **Admin > Request**
   - Card/blok request bisa diklik langsung untuk membuka detail.
   - Tombol pintasan `Detail`, `Buat Invoice`, dan `Upload Preview` pada daftar request dihapus.
   - Aksi invoice/upload preview tetap tersedia di halaman detail request.

3. Menu admin **Waktu Revisi**
   - Default free revisi: 2 kali dalam 14 hari.
   - Admin bisa mengubah jumlah revisi dan durasi default.
   - Admin bisa override waktu revisi per request yang sudah menerima file hasil.

4. Menu client **Ajukan Revisi**
   - Muncul di detail request client setelah file hasil tersedia dan pembayaran sudah verified.
   - Tombol hanya muncul selama masa revisi aktif dan kuota revisi masih tersedia.
   - Setelah masa revisi lewat atau kuota habis, tombol tidak ditampilkan.

## Wajib dijalankan di Supabase

Sebelum deploy/build production, jalankan file berikut di Supabase SQL Editor:

`supabase/h6-admin-landing-revision-update.sql`

Jika SQL ini belum dijalankan, menu Landing Page dan Waktu Revisi akan menampilkan pesan error karena tabel/kolom baru belum tersedia.
