PATCH H35 — Perbaikan Layout Card Iklan, Header, dan Link Eksternal

Tujuan patch:
- Memperbaiki gambar header yang sebelumnya bisa terlihat terlalu besar di bagian atas dokumen builder.
- Mengubah iklan kiri/kanan dari gambar fixed kecil menjadi card iklan yang posisinya menyatu dengan layout form.
- Menambahkan 2 card iklan pada sisi kiri dan 2 card iklan pada sisi kanan.
- Memperbaiki link iklan agar input seperti greenroomid.com otomatis dibuka sebagai https://greenroomid.com, bukan menjadi /f/greenroomid.com.

File yang diubah:
1. src/pages/ClientFormWorkspacePage.jsx
2. src/pages/PublicDynamicFormPage.jsx

Tidak ada SQL baru.
Syarat: patch H31, H32, H33, dan H34 sudah terpasang.

Perubahan detail:
1. Header image
   - Header form sekarang memakai area card yang lebih pendek dan stabil.
   - Gambar memakai object-contain, sehingga tidak dipotong dan sisa area tetap putih jika rasio gambar berbeda.
   - Berlaku untuk builder client dan halaman responden.

2. Card iklan kiri/kanan
   - Panel Tema sekarang menyediakan 4 slot iklan:
     a. Iklan kiri 1
     b. Iklan kiri 2
     c. Iklan kanan 1
     d. Iklan kanan 2
   - Setiap slot bisa diklik untuk upload gambar.
   - Setiap slot memiliki input link sendiri.
   - Di halaman builder, slot kosong tetap tampil sebagai placeholder agar client paham posisi iklan.
   - Di halaman responden, hanya slot yang sudah berisi gambar yang tampil.

3. Link iklan
   - Input link seperti greenroomid.com otomatis dinormalisasi menjadi https://greenroomid.com saat dibuka responden.
   - Link mailto:, tel:, http://, dan https:// tetap dipakai apa adanya.

Cara pasang patch:
1. Extract ZIP patch ini ke root project GreenroomID.
2. Saat Windows menanyakan duplicate item, pilih replace untuk file yang sama.
3. Pastikan hanya dua file di atas yang tertimpa.

Cara cek lokal:
1. Buka terminal di folder project.
2. Jalankan:

npm install
npm run dev

3. Buka:

http://localhost:5173/request/38/form

atau request form aktif lain.

Checklist pengujian client:
1. Masuk ke tab Pertanyaan.
2. Klik Tema.
3. Upload gambar header.
4. Pastikan header tampil sebagai card pendek di dalam form, bukan melebar/menutup dokumen.
5. Upload gambar Iklan kiri 1, Iklan kiri 2, Iklan kanan 1, dan Iklan kanan 2.
6. Isi link, misalnya:
   greenroomid.com
7. Klik Simpan tema.
8. Buka preview/public form.
9. Pastikan card iklan tampil di sisi kiri dan kanan form pada layar desktop.
10. Klik gambar iklan.
11. Pastikan browser membuka https://greenroomid.com, bukan http://localhost:5173/f/greenroomid.com.

Cara cek build:

npm run build

Catatan sandbox:
Di lingkungan sandbox, build bisa gagal karena optional native dependency Vite/Rolldown tidak lengkap dari hasil zip node_modules. Di lokal, jika terjadi, jalankan:

npm install
npm run build

Cara push Git:

git status
git add src/pages/ClientFormWorkspacePage.jsx src/pages/PublicDynamicFormPage.jsx README_PATCH_H35_AD_CARD_LAYOUT_AND_LINK_FIX.txt
git commit -m "feat: refine form ad card layout and external links"
git push

Catatan:
- Tidak ada perubahan database.
- Tidak ada perubahan alur request/payment.
- Field theme_json lama tetap aman. Field baru akan ikut tersimpan saat client menyimpan tema.
