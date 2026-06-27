# H23 Update Notes — Daftar Hadir Layout Refactor

## Fokus revisi

H23 memperbaiki struktur layout Daftar Hadir karena pada versi sebelumnya beberapa menu sidebar tidak benar-benar memengaruhi live preview dan hasil export/print. Revisi ini tidak menambah tabel database dan tidak mengubah skema Supabase.

## Perubahan utama

1. Sidebar Daftar Hadir disederhanakan.
   - Menu yang tidak jelas efeknya dihapus.
   - Pengaturan yang tersisa dibuat langsung berpengaruh ke live preview dan hasil PDF/print.

2. Tinggi cell diperbaiki menjadi tinggi baris global.
   - Sebelumnya tinggi per kolom tidak terasa berfungsi karena tinggi baris HTML mengikuti cell tertinggi.
   - Sekarang hanya ada satu pengaturan: `Tinggi Baris Tabel (mm)`.
   - Jika diubah dari 5 ke 10, seluruh baris tabel berubah di preview dan hasil print.

3. Lebar kolom diperbaiki.
   - Jika kolom tengah diperbesar, kolom kanan yang menyesuaikan.
   - Kolom kiri tidak ikut bergeser kecuali kolom kiri yang memang diubah.

4. Kolom TTD diperbaiki.
   - Titik-titik tanda tangan tidak lagi selalu muncul di kolom ke-3.
   - Sekarang user memilih kolom mana yang menjadi kolom tanda tangan.
   - Jika tidak memilih kolom tanda tangan, titik-titik tidak ditampilkan.

5. Pagination diperbaiki.
   - Live preview dan print/export memakai struktur halaman yang sama.
   - Jumlah baris per halaman dihitung dari ukuran kertas, tinggi judul, tinggi header tabel, tinggi baris, dan ruang tanda tangan akhir.
   - Halaman dibuat lebih seimbang agar halaman terakhir tidak terlalu kosong.

6. Tanda tangan akhir diperbaiki.
   - Tanda tangan tetap hanya muncul setelah tabel terakhir.
   - Tanda tangan tidak muncul di setiap halaman.
   - Posisi tanda tangan lebih dekat ke akhir tabel, bukan dipaksa ke bawah kertas.

7. Export tetap hanya PDF/Print.
   - Word dan Excel tidak dikembalikan.
   - Database tetap hanya menerima counting penggunaan layanan gratis.

## File yang berubah

- `public/apps/daftar-hadir/index.html`
- `public/apps/daftar-hadir/script.js`
- `public/apps/daftar-hadir/style.css`
- `update-notes/H23_UPDATE_NOTES.md`

## Cara install ulang bersih

Jalankan dari root project:

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
```

Untuk CMD:

```cmd
npm config set registry https://registry.npmjs.org/
rmdir /s /q node_modules
del package-lock.json
npm install --registry=https://registry.npmjs.org/
```

## Cara cek local

```powershell
npm run dev
```

Buka:

```text
http://localhost:5173/daftar-hadir
```

Cek pengaturan berikut:

- ubah tinggi baris dari 5 ke 10,
- ubah lebar kolom tengah dan pastikan kolom kanan yang menyesuaikan,
- ganti kolom tanda tangan,
- ubah jumlah baris 10, 20, 30, 50,
- cek live preview dan print/save PDF.

## Cara build

```powershell
npm run build
```

## Cara push Git

```powershell
git status
git add .
git commit -m "H23 fix daftar hadir layout controls and print output"
git push
```

## Catatan print

Jika browser masih menambahkan margin sendiri, pada dialog print Chrome/Edge pilih:

- Paper size: sesuai setting di web, misalnya A4 atau F4/Folio
- Pages per sheet: 1
- Margins: None / Tidak ada
- Scale: Default atau 100%

