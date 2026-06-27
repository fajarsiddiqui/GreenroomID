# H8 Update Notes - Admin UI Refresh

## Ringkasan pembaruan

Patch ini memperbarui tampilan dan alur kerja dashboard admin GreenroomID dengan fokus pada ruang layar, urutan request, mode tampilan card, filter yang tidak memenuhi halaman, serta pengaturan revenue.

## Perubahan utama

1. Sidebar admin sekarang dibuka melalui tombol garis tiga kecil di kiri atas. Sidebar tidak lagi selalu mengambil ruang halaman, dan scroll sidebar dibuat terpisah dari scroll konten dashboard.
2. Semua halaman admin memakai layout full width ketika sidebar tertutup. Sidebar tampil sebagai panel kiri interaktif ketika tombol menu dibuka.
3. Header dashboard admin sekarang mengambil logo dari Branding & SEO, lalu menampilkan teks `Dashboard Admin, GreenroomID ...` di kanan logo pada card hitam.
4. Halaman Request Admin memakai urutan default berdasarkan prioritas status: Request diterima, Siap diproses, Perlu diskusi lanjut, Sedang dikerjakan, Sedang direview, Menunggu pembayaran, Bukti bayar terkirim, File hasil tersedia, dan Selesai. Di dalam status yang sama, request paling baru diedit tampil lebih dulu.
5. Halaman Request memiliki dua mode tampilan: grid kotak ringkas dan list detail. Default-nya adalah grid kotak supaya lebih banyak request terlihat dalam satu layar.
6. Grid request hanya menampilkan nama client dan email. Status ditandai lewat warna outline card. Jika request memiliki pesan diskusi, card menampilkan ikon pesan.
7. Filter pada halaman Request dipindah ke tombol popup agar tidak memenuhi halaman.
8. Popup/filter/menu interaktif diberi animasi fade dan slide halus.
9. Halaman Waktu Revisi memakai urutan default masa revisi aktif paling lama. Request yang masa revisinya berakhir disembunyikan otomatis, dengan tombol untuk menampilkan yang sudah berakhir.
10. Halaman Waktu Revisi juga memiliki dua mode tampilan: grid kotak dan list detail.
11. Perhitungan aktivasi masa revisi baru diperbaiki agar mengikuti angka dari menu Waktu Revisi, bukan nilai lama yang tersimpan pada request sebelumnya.
12. Header Statistik dibagi menjadi Total Revenue, Revenue Freelance 70%, Revenue Admin 10%, dan Revenue Owner 20%.
13. Halaman Statistik memiliki tombol pengaturan popup untuk mengubah persentase pembagian revenue. Nilai tersimpan di localStorage browser admin.
14. Halaman Log Aktivitas memiliki menu titik tiga untuk ekspor Excel dan hapus semua log.
15. Halaman Arsip tidak lagi memakai card filter besar; filter dibuka lewat tombol popup.
16. Halaman Deleted Items mengganti tombol Restore dan Delete Permanen menjadi ikon saja.

## Catatan database

Jalankan file SQL berikut di Supabase SQL Editor agar request memiliki kolom `updated_at` otomatis untuk urutan request paling baru diedit:

`supabase/h8-admin-ui-refresh.sql`

Tanpa SQL ini, aplikasi tetap fallback ke `created_at`, tetapi urutan "paling baru diedit" belum bisa akurat untuk perubahan lama.

## Build

Patch ini sudah dibuat untuk React + Vite. Jalankan:

```bash
npm install
npm run build
```
