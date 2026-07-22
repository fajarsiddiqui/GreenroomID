PATCH H32 — GOOGLE FORM-LIKE UI UNTUK FORMULIR ONLINE
======================================================

Tujuan patch:
- Membuat tampilan Formulir Online lebih mirip pola Google Form.
- Client tetap masuk dari Request Saya > card Request Link Formulir.
- 1 request tetap hanya untuk 1 form.
- Tidak ada perubahan SQL/database pada patch ini.
- Patch ini hanya memperbarui UI/UX file yang sudah dibuat pada H31.

FILE YANG DIUBAH
----------------
1. src/pages/ClientFormWorkspacePage.jsx
   - Builder dibuat mirip Google Form: tab Pertanyaan | Jawaban | Setelan.
   - Pertanyaan dibuat dalam card putih dengan border kiri warna tema.
   - Ada panel toolbar kanan untuk tambah pertanyaan, tambah deskripsi, dan tambah bagian.
   - Tab Jawaban dibuat seperti Google Form: Ringkasan | Pertanyaan | Individual | Spreadsheet.
   - Ringkasan respons menampilkan card diagram sederhana.
   - Spreadsheet respons dibuat seperti tabel: baris = responden, kolom = pertanyaan.
   - Pemilik link tetap bisa edit/hapus respons secara soft delete.
   - Setelan dibuat mirip Google Form, termasuk link publik, status link, tema, dan zona hapus.

2. src/pages/PublicDynamicFormPage.jsx
   - Tampilan responden dibuat lebih mirip Google Form.
   - Background lavender, card putih, header warna, tanda wajib merah, dan tombol Kembali/Berikutnya/Kirim.
   - Form berjalan per bagian/section dengan progress.
   - Pertanyaan bersyarat tetap muncul/hilang berdasarkan logika yang dibuat.
   - Di bagian akhir ada review singkat sebelum kirim.

CARA PASANG PATCH
-----------------
1. Backup project kamu dulu.
2. Extract ZIP patch ini ke root project GreenroomID.
3. Saat Windows bertanya file dengan nama sama sudah ada, pilih Replace / Duplicate sesuai strategi kamu.
   - Kalau mau aman, extract ke folder sementara dulu.
   - Lalu copy dua file di atas secara manual ke project.

CATATAN DATABASE
----------------
Tidak perlu menjalankan SQL baru untuk patch H32.
Syaratnya: SQL H31 sudah dijalankan di Supabase.

CARA CEK DI LOCAL
-----------------
1. Buka terminal di root project:

   npm install
   npm run dev

2. Buka web local, biasanya:

   http://localhost:5173

3. Tes sebagai client:
   - Login akun client.
   - Buka Request Saya.
   - Buka card Request Link Formulir yang payment-nya sudah verified.
   - Masuk ke /request/:requestId/form.
   - Cek tab Pertanyaan, Jawaban, dan Setelan.

4. Tes sebagai responden:
   - Salin link publik dari tombol Publikasikan/Salin link.
   - Buka /f/:slug di browser.
   - Isi form dan submit.
   - Kembali ke dashboard client, cek tab Jawaban.
   - Buka tab Spreadsheet.

CARA CEK LINT DAN BUILD
-----------------------
Jalankan:

   npm run lint
   npm run build

Catatan:
Jika saat build muncul error native binding seperti:
"Cannot find native binding" atau "@rolldown/binding..."
jalankan ulang:

   npm install
   npm run build

Itu biasanya masalah optional dependency dari Vite/Rolldown di node_modules lokal, bukan dari kode patch.

PERINTAH GIT
------------
Setelah cek local aman:

   git status
   git add src/pages/ClientFormWorkspacePage.jsx src/pages/PublicDynamicFormPage.jsx README_PATCH_H32_GOOGLE_FORM_LIKE_UI.txt
   git commit -m "feat: improve online form google-like ui"
   git push

CATATAN BATASAN PATCH H32
-------------------------
- Panel tema saat ini fokus UI dulu; penyimpanan tema permanen ke database belum ditambahkan.
- Diagram ringkasan dibuat sederhana tanpa library chart tambahan agar tidak perlu install dependency baru.
- Spreadsheet respons adalah tabel internal web, bukan integrasi langsung ke Google Spreadsheet.
