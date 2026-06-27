# GreenroomID H9 - Simple Landing Header + Menu Cards

Perubahan utama:

1. Landing page dibuat lebih simpel.
   - Header menjadi card hitam berisi logo, nama GreenroomID, deskripsi singkat, dan tombol login.
   - Card header bisa diklik untuk kembali ke landing page. Saat sudah berada di landing page, klik card akan me-refresh halaman.

2. Hero besar lama dihapus dari tampilan utama.
   - Copy utama dipindahkan ke header card hitam.
   - Landing lebih pendek dan langsung menunjukkan menu utama.

3. Statistik landing diringkas.
   - Statistik kini tampil sebagai teks dan angka singkat.
   - Card layanan aktif dipindahkan menjadi menu “Daftar Layanan”.

4. Menu landing baru berbentuk card kecil.
   - Daftar Layanan: menuju /layanan.
   - Layanan Gratis: menuju /layanan-gratis.
   - Donate Us: menuju /donate-us.
   - Top Donatur: menuju /top-donatur.
   - Kritik dan Saran: menuju /kritik-saran.

5. Halaman Coming Soon ditambahkan.
   - Menu yang fiturnya belum tersedia diarahkan ke halaman Coming Soon.

6. Admin Landing Page disesuaikan.
   - Menu Admin > Landing Page kini mengatur Header Card, Ringkasan Statistik, Menu Landing, Kontak, dan CTA Bawah.

Catatan Supabase:

- Frontend sudah punya fallback default, jadi website tetap berjalan tanpa menjalankan SQL baru.
- Jika ingin label dan default field baru tersimpan di tabel landing_content, jalankan:
  supabase/h9-simple-landing-menu-update.sql

Validasi:

- npm run build: berhasil.
- npm run lint: tidak ada error baru. Masih ada warning useEffect dependency dari file lama.
