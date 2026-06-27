# H18 Update Notes — Daftar Hadir Real Page Flow

## Ringkasan perubahan

1. Revisi ulang pendekatan pagination Daftar Hadir.
   - Tabel sekarang dipotong berdasarkan kapasitas kertas A4/F4.
   - Jika baris tabel melewati batas kertas, baris berikutnya lanjut ke halaman baru.
   - Nomor baris tetap berlanjut, tidak dimulai ulang.
   - Setiap halaman tetap membawa judul/header dan area tanda tangan/footer.

2. Live preview diselaraskan dengan export PDF/print.
   - Preview memakai model halaman yang sama dengan hasil print/PDF.
   - Setiap kertas preview memiliki tinggi fixed sesuai A4/F4.
   - Footer/tanda tangan ditempatkan di area bawah halaman, bukan menempel langsung setelah tabel.

3. Export PDF/print diperbaiki.
   - Export tetap memakai browser print engine, tetapi halaman sudah disiapkan per kertas.
   - Ukuran `@page` mengikuti pilihan A4 atau F4/Folio.
   - Tidak ada scaling otomatis yang membuat dokumen mengecil.

4. Export Word diperbaiki.
   - Judul dibuat heading tengah per halaman.
   - Tabel dilanjutkan ke halaman berikutnya saat melewati kapasitas halaman.
   - Nomor tabel tetap berlanjut.
   - Tanda tangan dibuat dengan struktur tabel agar lebih kompatibel dengan Microsoft Word.
   - Judul tidak dibuat sebagai blok tambahan di luar halaman dokumen.

5. Penanda GreenroomID tetap berupa teks kecil lurus di kiri atas.

## File yang berubah

- `public/apps/daftar-hadir/script.js`
- `public/apps/daftar-hadir/style.css`
- `update-notes/H18_UPDATE_NOTES.md`

## Catatan database

Tidak ada SQL baru. Update ini hanya mengubah tampilan dan export Daftar Hadir.

## Cara install ulang dependency

Jalankan dari root project:

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
```

Jika `package-lock.json` ingin dipertahankan, cukup jalankan:

```powershell
npm config set registry https://registry.npmjs.org/
npm install --registry=https://registry.npmjs.org/
```

## Cara cek local

```powershell
npm run dev
```

Buka halaman berikut:

```text
http://localhost:5173/daftar-hadir
http://localhost:5173/layanan-gratis/daftar-hadir
```

Cek skenario berikut:

1. Pilih A4, buat jumlah baris cukup banyak sampai lebih dari 1 halaman.
2. Pastikan live preview muncul halaman 1, halaman 2, dan seterusnya.
3. Pastikan setiap halaman punya judul/header dan tanda tangan/footer.
4. Export PDF/Print dan bandingkan dengan live preview.
5. Export Word dan cek judul, nomor tabel lanjutan, serta posisi tanda tangan.

## Cara build

```powershell
npm run build
```

## Cara push Git

```powershell
git status
git add .
git commit -m "H18 fix daftar hadir pagination and Word export"
git push
```
