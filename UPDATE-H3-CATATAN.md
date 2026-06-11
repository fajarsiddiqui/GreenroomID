# GreenroomID H+3 Update

Perubahan utama:

1. Admin Request Filter
- Filter keyword, status request, kategori, payment status, invoice status, deadline, kondisi file, dan sorting.

2. Tabel baru request_files
- File awal client, file tambahan client, file preview, file hasil final, file revisi, dan file tambahan hasil disimpan lebih rapi.
- SQL ada di `supabase/request-files-update.sql`.
- Jalankan SQL ini di Supabase SQL Editor sebelum deploy kode terbaru.

3. Upload file tambahan client
- Client bisa upload file tambahan dari halaman detail request.
- Tidak mengubah invoice dan tidak mengubah data request utama.

4. File preview
- Admin bisa upload PDF preview.
- Watermark dan penutup halaman masih manual sesuai keputusan MVP.
- Client bisa melihat preview sebelum payment verified.

5. File hasil dipisah dari invoice
- Admin bisa upload file final, revisi, atau tambahan lewat satu tombol Upload File Hasil.
- Upload hasil tidak membuat invoice baru.
- File hasil penuh hanya terlihat ke client setelah payment_status VERIFIED atau invoice_status PAID melalui RLS request_files.

6. Audit log tambahan
- PREVIEW_FILE_UPLOADED
- RESULT_UPLOADED
- REVISION_RESULT_UPLOADED
- CLIENT_ADDITIONAL_FILE_UPLOADED
- STATUS_CHANGED
- PAYMENT_STATUS_CHANGED
- ADMIN_MESSAGE_SENT
- CLIENT_MESSAGE_SENT

Urutan penerapan:

1. Backup project dan database dulu.
2. Jalankan `supabase/request-files-update.sql` di Supabase SQL Editor.
3. Copy file project terbaru ke VS Code.
4. Jalankan `npm install` jika perlu.
5. Jalankan `npm run dev` untuk tes lokal.
6. Tes alur client dan admin.
7. Commit dan push ke GitHub.
8. Cek deploy Vercel.

Catatan keamanan:
- Storage bucket `request-files` masih public read sesuai kondisi MVP sebelumnya.
- RLS `request_files` sudah membatasi data metadata file hasil ke client sebelum payment verified, tetapi URL public yang sudah bocor tetap bisa diakses.
- Untuk versi lebih serius, lanjutkan private bucket + signed URL.
