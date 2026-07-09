PATCH H31 - REQUEST LINK FORMULIR ONLINE
GreenroomID

ISI PATCH
Patch ini menambahkan fitur Request Link Formulir Online dengan konsep:
1. Responden membuka link publik /f/:slug tanpa login.
2. Pemilik link/client login Google dan mengelola form dari card Request Saya.
3. Admin utama mengelola semua form dari Admin > Formulir Online.
4. 1 request hanya berlaku untuk 1 form. Jika client ingin membuat form baru, wajib membuat request baru.
5. Payment memakai alur payment request yang sudah ada. Setelah admin memverifikasi pembayaran, form otomatis aktif.
6. Penghapusan oleh pemilik link bersifat soft delete. Admin tetap bisa melihat dan hanya admin yang bisa hapus permanen.

FILE YANG DITAMBAHKAN/DIUBAH
1. src/App.jsx
2. src/pages/AdminLayout.jsx
3. src/pages/Dashboard.jsx
4. src/pages/DetailRequest.jsx
5. src/pages/RequestForm.jsx
6. src/utils/dynamicForms.js
7. src/pages/PublicDynamicFormPage.jsx
8. src/pages/ClientFormWorkspacePage.jsx
9. src/pages/AdminFormsPage.jsx
10. supabase/h31-request-link-formulir-online.sql

CARA PASANG PATCH
1. Backup project sebelum patch.
2. Extract ZIP patch ini ke root project GreenroomID.
3. Saat muncul pilihan file sama, pilih Replace/Duplicate item sesuai kebiasaanmu. Patch ini hanya berisi file yang ditambah/diubah, bukan full project.
4. Buka Supabase SQL Editor.
5. Jalankan isi file:
   supabase/h31-request-link-formulir-online.sql
6. Setelah SQL sukses, cek lokal.

CARA CEK WEB LOCAL
Jalankan dari root project:

npm install
npm run lint
npm run build
npm run dev

Jika file executable node_modules bermasalah di Windows/hasil extract ZIP, jalankan ulang:

npm install

Cek manual di browser:
1. Login sebagai client.
2. Buka /request/new.
3. Pilih Request Link Formulir.
4. Isi judul, kategori otomatis Formulir Online, deskripsi, target link aktif, lalu kirim.
5. Buka Request Saya > detail request tersebut.
6. Upload bukti pembayaran seperti request biasa.
7. Login admin, buka Admin > Request, verifikasi payment menjadi VERIFIED/PAID.
8. Kembali sebagai client, buka detail request > Kelola Form.
9. Tambah bagian, tambah pertanyaan, tambah opsi, dan atur logika tampil jika diperlukan.
10. Salin link publik /f/:slug.
11. Buka link tersebut dari browser/incognito, isi form, submit.
12. Kembali ke dashboard form client, cek respons masuk.
13. Coba hapus respons dari client. Respons hilang dari client, tetapi masih terlihat admin di Admin > Formulir Online.
14. Admin bisa restore/hapus permanen respons atau form.

ROUTE BARU
Public responden:
/f/:slug

Client/pemilik link:
/request/:requestId/form

Admin:
/admin/forms

CATATAN DATABASE
- Kolom baru pada requests:
  request_type
  form_request_snapshot
- Tabel baru:
  forms
  form_sections
  form_questions
  form_options
  form_responses
  form_response_logs
  form_logic_rules
- forms.request_id dibuat UNIQUE agar 1 request hanya punya 1 form.

CATATAN BUILD YANG SUDAH SAYA CEK
Saya menjalankan:
node node_modules/eslint/bin/eslint.js .
Hasil: tidak ada error, tetapi masih ada warning useEffect lama dan warning baru non-blocking.

Saya menjalankan:
node node_modules/vite/bin/vite.js build
Hasil: build sukses.

Di environment extract ZIP, npm run lint/npm run build sempat gagal karena permission file node_modules/.bin hasil zip. Setelah npm install, perintah node langsung sukses. Di Windows kamu biasanya cukup pakai npm install lalu npm run lint dan npm run build.

CARA PUSH GIT
Setelah cek lokal aman:

git status
git add src/App.jsx src/pages/AdminLayout.jsx src/pages/Dashboard.jsx src/pages/DetailRequest.jsx src/pages/RequestForm.jsx src/utils/dynamicForms.js src/pages/PublicDynamicFormPage.jsx src/pages/ClientFormWorkspacePage.jsx src/pages/AdminFormsPage.jsx supabase/h31-request-link-formulir-online.sql README_PATCH_H31_FORMULIR_ONLINE.txt
git commit -m "feat: add request-based online form builder"
git push origin main

Jika branch kamu bukan main, ganti main sesuai nama branch aktif.
