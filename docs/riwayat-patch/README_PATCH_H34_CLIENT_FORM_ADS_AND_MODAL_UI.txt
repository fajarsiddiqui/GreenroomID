PATCH H34 — Perbaikan Builder Client, Header, dan Iklan Sisi Form

Syarat sebelum pasang:
1. Patch H31 sudah terpasang dan SQL H31 sudah dijalankan di Supabase.
2. Patch H32 dan H33 sudah terpasang.
3. Patch ini tidak menambah SQL baru.

Isi file yang berubah:
- src/pages/ClientFormWorkspacePage.jsx
- src/pages/PublicDynamicFormPage.jsx

Perubahan utama:
1. Header image dibuat auto-fit dengan mode contain.
   - Gambar tidak dipotong.
   - Jika rasio gambar tidak sesuai area header, sisa area akan tetap putih.

2. Iklan sisi kiri dan kanan diperbesar dan dibuat sebagai card iklan.
   - Di panel Tema, client sekarang melihat dua card: Iklan kiri dan Iklan kanan.
   - Client cukup mengetuk card untuk upload gambar.
   - Di bawah masing-masing card tersedia input link.
   - Pada tampilan responden desktop, gambar tampil sebagai card iklan sisi kiri/kanan.
   - Jika responden mengetuk gambar iklan, responden diarahkan ke link yang diisi.

3. Tombol/toggle tambah gambar di toolbar kanan builder dihapus.

4. Tambah pertanyaan dan tambah bagian tidak lagi tampil sebagai card permanen di bawah form.
   - Toolbar kanan tombol (+) membuka popup tambah pertanyaan.
   - Toolbar kanan tombol tambah bagian membuka popup tambah bagian.
   - Ini menghindari double function dan membuat pengalaman client lebih mirip form builder.

5. Header pada tampilan responden dibuat lebih bersih.
   - Deskripsi header form hanya muncul pada bagian awal.
   - Setelah responden menuju bagian berikutnya, header hanya menampilkan judul form.

Cara pasang patch:
1. Extract file ZIP patch ini.
2. Copy folder `src` hasil extract ke root project GreenroomID.
3. Saat diminta replace/duplicate item, pilih replace untuk file yang sama.
4. Jangan hapus file lain.

Cara cek di local:
1. Buka terminal di root project.
2. Jalankan:

   npm install
   npm run dev

3. Buka browser:

   http://localhost:5173

4. Cek halaman client form builder:

   /request/:requestId/form

5. Cek poin berikut:
   - Toolbar kanan tidak lagi punya tombol tambah gambar.
   - Tombol + membuka popup tambah pertanyaan.
   - Tombol tambah bagian membuka popup tambah bagian.
   - Panel Tema punya card iklan kiri dan kanan.
   - Upload gambar iklan tampil di card.
   - Link iklan bisa diisi.
   - Header image tampil contain, tidak crop.

6. Cek halaman responden:

   /f/:slug

7. Pastikan:
   - Deskripsi form hanya tampil di bagian awal.
   - Bagian berikutnya hanya menampilkan judul form sebagai header.
   - Iklan kiri/kanan tampil lebih besar pada desktop.
   - Klik gambar iklan membuka link yang diisi.

Cek lint:

   node node_modules/eslint/bin/eslint.js src/pages/ClientFormWorkspacePage.jsx src/pages/PublicDynamicFormPage.jsx

Catatan hasil cek sandbox:
- Tidak ada error lint pada file patch.
- Masih ada warning lama di ClientFormWorkspacePage.jsx terkait useEffect dependency `loadPage`; warning ini sudah ada dan tidak memblokir fitur.

Cek build lokal:

   npm run build

Catatan:
- Di sandbox, build belum bisa dijalankan karena dependency native Vite/Rolldown dari node_modules hasil zip tidak lengkap.
- Di lokal Windows kamu, jalankan `npm install` dulu, lalu `npm run build`.

Perintah git setelah cek aman:

   git status
   git add src/pages/ClientFormWorkspacePage.jsx src/pages/PublicDynamicFormPage.jsx
   git commit -m "feat: refine form builder ads and modal creation UI"
   git push

Jika ingin rollback file patch:

   git restore src/pages/ClientFormWorkspacePage.jsx src/pages/PublicDynamicFormPage.jsx
