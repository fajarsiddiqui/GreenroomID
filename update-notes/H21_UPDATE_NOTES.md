# H21 Update Notes — Daftar Hadir Sidebar & Output Consistency

## Ringkasan Perubahan

Versi H21 merapikan ulang layanan gratis **Daftar Hadir** berdasarkan hasil pengecekan PDF export.

Perubahan utama:

1. Sidebar Daftar Hadir disederhanakan.
   - Checklist `Aktif` yang membingungkan pada menu judul, kolom, ukuran kolom, pola TTD, jumlah baris, dan data tabel dihapus.
   - Menu yang tersisa dibuat langsung berfungsi ke live preview dan hasil PDF/print.
   - Checklist hanya dipertahankan pada bagian penandatanganan kanan dan kiri karena memang berfungsi untuk menampilkan atau menyembunyikan tanda tangan.

2. Menu sidebar sekarang lebih ringkas:
   - Ukuran kertas
   - Judul dokumen
   - Kolom dan ukuran tabel
   - Isi tabel dan jumlah baris
   - Pola kolom TTD
   - Penandatanganan kanan
   - Penandatanganan kiri bawah
   - Aksi data

3. Jumlah baris dibuat lebih masuk akal.
   - `Minimal Jumlah Baris` tetap bisa dipakai.
   - Jika input data lebih banyak dari angka manual, jumlah baris otomatis mengikuti jumlah data.
   - Dengan begitu input data dan jumlah baris sama-sama memengaruhi preview dan export.

4. Pagination halaman akhir diperbaiki.
   - Jika halaman terakhir hanya berisi terlalu sedikit baris karena ada tanda tangan, sebagian baris dari halaman sebelumnya dipindahkan agar halaman akhir terlihat lebih seimbang.
   - Tanda tangan tetap hanya muncul setelah akhir tabel pada halaman terakhir.

5. Live preview dan PDF/print tetap memakai struktur halaman yang sama.
   - Export memakai clone dari live preview, sehingga tampilan preview dan output lebih konsisten.

6. Tidak ada perubahan SQL/database.
   - Data client tetap tidak disimpan.
   - Database tetap hanya untuk counting penggunaan layanan gratis.

## Cara Install / Update Local

Jalankan dari folder project utama:

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Buka halaman berikut untuk cek manual:

```text
http://localhost:5173/daftar-hadir
http://localhost:5173/layanan-gratis/daftar-hadir
```

## Cara Cek Build

```powershell
npm run build
```

Jika build berhasil, lanjut push ke Git.

## Cara Push Git

```powershell
git status
git add .
git commit -m "H21 clean daftar hadir sidebar and output consistency"
git push
```

## SQL

Tidak ada SQL baru untuk H21.
