# H24 Update Notes — Daftar Hadir Greedy Pagination dan Kolom TTD Dinamis

## Ringkasan Perubahan

Versi H24 memperbaiki logika pagination Daftar Hadir dan perilaku kolom tanda tangan.

### 1. Pagination tidak lagi diseimbangkan antar halaman
Pada versi sebelumnya, sistem mencoba membagi jumlah baris agar halaman pertama, halaman tengah, dan halaman terakhir terlihat relatif seimbang. Dampaknya, halaman yang tidak memiliki penandatanganan ikut menyisakan ruang kosong besar karena menyesuaikan halaman terakhir yang punya blok tanda tangan.

Pada H24, logika diganti menjadi greedy pagination:

- halaman non-final diisi sebanyak kapasitas maksimal kertas,
- jika sudah penuh, baris berikutnya lanjut ke halaman berikutnya,
- halaman terakhir baru menampung sisa baris dan blok penandatanganan,
- halaman sebelumnya tidak lagi dikurangi hanya demi menyeimbangkan halaman tanda tangan.

### 2. Kolom TTD tidak hardcode di kolom ke-3
Kolom tanda tangan sekarang benar-benar mengikuti pilihan user pada menu **Kolom Tanda Tangan**.

Jika user memilih kolom ke-2 sebagai kolom TTD, maka nomor dan titik tanda tangan akan muncul di kolom ke-2. Jika user memilih kolom lain, marker TTD berpindah ke kolom tersebut.

### 3. Isi data pada kolom TTD tidak lagi menghalangi marker tanda tangan
Pada versi sebelumnya, jika kolom yang dipilih sebagai TTD masih memiliki input data, marker tanda tangan bisa tidak muncul karena tertimpa isi data. Pada H24, kolom yang dipilih sebagai kolom TTD selalu menampilkan format tanda tangan:

```text
1 ...
2 ...
3 ...
```

### 4. Live preview dan export tetap memakai struktur halaman yang sama
Perubahan pagination diterapkan pada fungsi pembentuk halaman utama, sehingga live preview dan print/save PDF memakai struktur halaman yang sama.

## File yang Berubah

```text
public/apps/daftar-hadir/script.js
update-notes/H24_UPDATE_NOTES.md
```

## Cara Install / Update Local

Jalankan dari root project:

```powershell
npm config set registry https://registry.npmjs.org/
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Lalu cek halaman:

```text
http://localhost:5173/daftar-hadir
```

## Cara Cek Build

```powershell
npm run build
```

## Cara Push Git

```powershell
git status
git add .
git commit -m "H24 fix daftar hadir pagination and TTD column"
git push
```

## Catatan Print

Saat print/save PDF dari browser, gunakan ukuran kertas yang sama dengan pengaturan aplikasi. Jika browser masih memberi margin tambahan, pilih margin **None / Tidak ada** pada dialog print.
