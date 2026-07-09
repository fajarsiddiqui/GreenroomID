PATCH H33 - Perbaikan Pengalaman Client Formulir Online
=======================================================

Fokus patch:
1. Tema sekarang benar-benar berjalan dan tersimpan di forms.theme_json:
   - warna tema
   - warna latar
   - font header
   - font pertanyaan
   - font teks
   - ukuran font
   - gambar header form
   - gambar iklan sisi kiri dan kanan form

2. Pembungkus teks diperbaiki:
   - judul form panjang tidak lagi terpotong horizontal
   - judul pertanyaan panjang memakai textarea agar turun baris
   - tabel jawaban memakai break-words agar data panjang tetap terbaca

3. Toolbar kanan builder dibuat lebih dinamis:
   - toolbar mengikuti card yang sedang disentuh/di-fokuskan
   - perpindahan toolbar diberi transisi halus
   - toolbar tidak lagi terasa kaku di satu posisi saja

4. Deskripsi tidak memenuhi tampilan utama builder:
   - deskripsi form dibuka lewat tombol menu titik tiga pada card cover
   - deskripsi bagian dibuka lewat tombol titik tiga pada card section
   - deskripsi/placeholder/logika pertanyaan dibuka lewat tombol titik tiga pada card pertanyaan

5. Section/bagian memiliki aksi hapus yang lebih jelas:
   - tombol hapus bagian tersedia di kanan atas section
   - tambah section baru tetap tersedia di bawah builder

6. Tema produk tidak meniru Google Form 100%:
   - client dapat mengisi URL gambar atau upload gambar kecil untuk sisi kiri/kanan form
   - gambar sisi kiri/kanan tampil di halaman responden desktop dan tidak terlalu dekat dengan form
   - upload gambar disimpan sebagai data URL di theme_json, disarankan ukuran gambar < 700 KB agar database tetap ringan

File yang diubah:
- src/pages/ClientFormWorkspacePage.jsx
- src/pages/PublicDynamicFormPage.jsx

SQL:
- Tidak ada SQL baru.
- Patch ini memakai kolom theme_json yang sudah dibuat di SQL H31.

Cara pasang patch:
1. Extract ZIP ini ke root project GreenroomID.
2. Pilih replace/duplicate item untuk 2 file di atas.
3. Pastikan patch H31 dan H32 sudah terpasang sebelumnya.

Cara cek local:
1. Jalankan:
   npm install
   npm run dev

2. Buka halaman client form:
   http://localhost:5173/request/<REQUEST_ID>/form

3. Cek tab Pertanyaan:
   - ubah judul form panjang, pastikan teks turun baris
   - klik tombol titik tiga pada judul, section, dan pertanyaan
   - cek toolbar kanan bergerak saat hover/focus antar card

4. Cek panel tema:
   - klik ikon tema
   - ubah font header/pertanyaan/teks
   - ubah ukuran font
   - ubah warna tema dan latar
   - isi URL gambar header/kiri/kanan atau upload gambar kecil
   - klik Simpan tema
   - refresh halaman, pastikan tema tetap tersimpan

5. Cek link publik:
   http://localhost:5173/f/<SLUG_FORM>

   Pastikan:
   - tema ikut tampil di halaman responden
   - gambar sisi kiri/kanan muncul di layar desktop besar
   - pertanyaan panjang tidak terpotong
   - progress section tetap jalan

6. Cek respons:
   - submit satu respons dari link publik
   - kembali ke /request/<REQUEST_ID>/form
   - buka tab Jawaban > Spreadsheet
   - pastikan data tampil seperti tabel dan teks panjang tidak memotong tampilan

Cara cek build:
   npm run build

Catatan:
Jika build di environment zip/sandbox gagal karena optional native dependency Vite/Rolldown hilang, jalankan di lokal:
   npm install
   npm run build

Cara push git:
   git status
   git add src/pages/ClientFormWorkspacePage.jsx src/pages/PublicDynamicFormPage.jsx README_PATCH_H33_CLIENT_EXPERIENCE_UI.txt
   git commit -m "feat: improve form builder client experience and theme controls"
   git push

Rollback jika perlu:
   git restore src/pages/ClientFormWorkspacePage.jsx src/pages/PublicDynamicFormPage.jsx
