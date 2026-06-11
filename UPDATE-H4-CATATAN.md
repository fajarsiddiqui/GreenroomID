# GreenroomID H+4 Update

Update ini belum perlu dipush ke GitHub. Tes dulu di localhost sampai aman, terutama karena masih ada client dengan status waiting payment.

## Isi update utama

1. Routing seluruh page dibuat berbasis URL:
   - `/dashboard`
   - `/client/services`
   - `/request/new`
   - `/request/:requestId`
   - `/admin`
   - `/admin/requests`
   - `/admin/requests/:requestId`
   - `/admin/services`
   - `/admin/stats`
   - `/admin/audit-logs`
   - `/admin/archive`
   - `/admin/deleted-items`

2. Admin dashboard utama dibuat dalam bentuk kotak-kotak dengan header `Admin GreenroomID`.

3. Halaman admin internal memakai sidebar kiri. Dashboard utama admin tidak memakai sidebar dominan; sidebar muncul setelah masuk menu internal.

4. Landing page: angka layanan aktif tidak lagi hardcode 4. Angka layanan aktif mengambil jumlah `service_items` aktif dan kartu dibuat lebih berwarna/terlihat bisa diklik.

5. Client mengisi deadline saat membuat request dan bisa mengubah deadline dari halaman detail request client.

6. Admin tidak lagi mengubah deadline dari invoice. Admin hanya melihat deadline client.

7. Detail request admin dirapikan dengan laci/accordion:
   - Detail Request
   - Invoice & Pembayaran
   - File Client
   - File Preview & File Hasil
   - Upload File
   - Diskusi
   - Riwayat Aktivitas
   - Admin Note

8. Admin Request punya badge status konsisten, warning box request berisiko, quick action, label akses file, empty state, dan pagination 10/25/50.

9. Sidebar admin ditambah menu `Arsip` untuk melihat semua file aktif yang diupload client/admin.

10. Sidebar admin ditambah menu `Deleted Items` untuk request/file yang sudah dihapus sementara.

11. Delete request dan delete file memakai soft delete terlebih dahulu. Item yang dihapus masuk ke Deleted Items.

12. Di Deleted Items tersedia tombol `Restore` dan `Delete Permanen`.

13. Audit log ditambah untuk:
   - CLIENT_DEADLINE_UPDATED
   - REQUEST_SOFT_DELETED
   - REQUEST_RESTORED
   - REQUEST_PERMANENT_DELETED
   - FILE_SOFT_DELETED
   - FILE_RESTORED
   - FILE_PERMANENT_DELETED

14. File hasil tetap tidak ditampilkan ke client sebelum payment verified / invoice paid. Preview tetap boleh dilihat client.

## SQL wajib dijalankan sebelum tes lokal

Jalankan file ini di Supabase SQL Editor:

`supabase/h4-ui-routing-archive-deleted-items.sql`

## Urutan tes aman

1. Backup project dan database.
2. Jalankan SQL H+4 di Supabase.
3. Jalankan `npm install` jika perlu.
4. Jalankan `npm run dev`.
5. Tes route refresh:
   - `/admin`
   - `/admin/requests`
   - `/admin/requests/:id`
   - `/admin/archive`
   - `/admin/deleted-items`
   - `/dashboard`
   - `/request/:id`
6. Tes client waiting payment: pastikan file hasil final/revisi belum tampil sebelum payment verified.
7. Tes admin archive dan deleted items menggunakan request dummy/tester.
8. Jika semua aman, baru pertimbangkan `git push`.

## Catatan penting

Bucket storage masih public read untuk MVP. UI dan RLS metadata sudah menjaga file hasil tidak tampil ke client sebelum payment verified, tetapi keamanan paling kuat tetap private bucket + signed URL pada update berikutnya.
