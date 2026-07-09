PATCH H36 — Final Admin Cards + Cleanup Tampilan Iklan Builder

Tujuan patch:
1. Menghapus tampilan card iklan sisi kiri/kanan dari area builder client karena mengganggu proses membuat form.
2. Gambar iklan tetap diatur dari panel Tema, dan tetap tampil di halaman responden jika client sudah memasukkan gambar + link.
3. Menambahkan semua menu sidebar admin sebagai card di Dashboard Admin agar akses menu lebih sesuai dan informatif.

File yang diubah:
- src/pages/ClientFormWorkspacePage.jsx
- src/pages/AdminDashboard.jsx

Catatan perubahan:
- Tidak ada SQL baru.
- Tidak mengubah data lama.
- Tidak menghapus route lama.
- Tidak mengubah sistem request, payment, invoice, maupun verifikasi admin.
- Patch ini melanjutkan H31, H32, H33, H34, dan H35.

DETAIL PERUBAHAN

A. Builder Client
- Area builder tidak lagi menampilkan card iklan kiri/kanan.
- Pengaturan iklan tetap berada di panel Tema.
- Jika client mengisi gambar iklan di panel Tema, iklan akan muncul di halaman responden /f/:slug, bukan di area builder.
- Tujuannya agar builder lebih fokus dan tidak terganggu oleh area iklan.

B. Dashboard Admin
Semua menu utama yang ada di sidebar admin sekarang juga muncul sebagai card dashboard:
- Request
- Formulir Online
- Layanan & Harga
- Layanan Gratis
- Ruang Belajar
- Review Pembelajaran
- Kontribusi Publikasi
- Donasi
- Landing Page
- Branding & SEO
- Waktu Revisi
- Statistik
- Log Aktivitas
- Arsip
- Deleted Items
- Manajemen Akun
- Profile Payment

Card juga menampilkan angka/status seperti:
- request aktif
- form aktif
- pesan belum dibaca
- layanan aktif
- pemakaian layanan gratis
- konten ruang belajar
- antrean review
- pembayaran publikasi menunggu verifikasi
- transaksi donasi
- konten landing page
- field branding
- item terhapus
- jumlah akun
- status profile payment siap/belum siap

CARA PASANG PATCH

1. Backup project sebelum patch.
2. Extract ZIP patch ini ke root project GreenroomID.
3. Saat Windows menampilkan pilihan file sama, pilih Replace/Duplicate sesuai kebiasaan patch kamu. File yang berubah hanya file yang tercantum di atas.
4. Tidak perlu menjalankan SQL Supabase baru.

CARA CEK LOCAL

Jalankan:

npm install
npm run dev

Buka:

http://localhost:5173/admin

Cek:
- Dashboard admin sudah menampilkan card untuk semua menu sidebar.
- Card Formulir Online muncul.
- Card Manajemen Akun dan Profile Payment muncul.
- Angka/status pada card tampil.

Buka:

http://localhost:5173/request/38/form

Cek bagian builder:
- Iklan kiri/kanan tidak lagi tampil di area builder.
- Panel Tema masih bisa dibuka.
- Input gambar iklan kiri/kanan masih tersedia di panel Tema.

Buka link responden:

http://localhost:5173/f/<slug-form>

Cek:
- Jika gambar iklan sudah diisi lewat Tema, iklan tampil di halaman responden.
- Jika gambar iklan tidak diisi, tidak ada card iklan kosong.

CARA CEK BUILD

Jalankan:

npm run build

Jika muncul error optional dependency Vite/Rolldown, jalankan:

rd /s /q node_modules
npm install
npm run build

Atau di PowerShell:

Remove-Item -Recurse -Force node_modules
npm install
npm run build

CATATAN TEST DARI PATCH

Perintah lint spesifik file patch:

node node_modules/eslint/bin/eslint.js src/pages/ClientFormWorkspacePage.jsx src/pages/AdminDashboard.jsx

Hasil di sandbox:
- Tidak ada error.
- Masih ada 1 warning lama pada ClientFormWorkspacePage.jsx terkait dependency useEffect loadPage. Warning ini sudah ada dari patch sebelumnya dan tidak memblokir.

Build sandbox belum bisa diselesaikan karena node_modules dari ZIP kehilangan optional native dependency Vite/Rolldown. Ini sama seperti patch sebelumnya. Di lokal kamu biasanya selesai dengan npm install ulang.

CARA GIT PUSH

Setelah dicek local:

git status
git add src/pages/ClientFormWorkspacePage.jsx src/pages/AdminDashboard.jsx README_PATCH_H36_FINAL_ADMIN_CARDS_AND_AD_PREVIEW_CLEANUP.txt
git commit -m "feat: refine form builder ads preview and admin dashboard cards"
git push

