# H15 Update Notes — Daftar Hadir Print Scale & Corner Text Marker

## Ringkasan perubahan

1. Penanda logo pada layanan Daftar Hadir diganti dari gambar/logo menjadi teks kecil:
   - teks: `GreenroomID`,
   - posisi: pojok kiri atas dokumen,
   - gaya: miring, kecil, transparan,
   - tidak memakai watermark besar dan tidak mengganggu isi dokumen.

2. Output PDF/print Daftar Hadir diperbaiki agar tidak mengecil dari live preview:
   - proses PDF/print sekarang memakai dokumen print bersih di iframe terpisah,
   - hanya area kertas yang dicetak, bukan shell/sidebar aplikasi,
   - ukuran `@page` mengikuti pilihan A4 atau F4/Folio,
   - reset print CSS ditambahkan agar layout sidebar tidak ikut memengaruhi skala print.

3. Export Word/Excel ikut memakai penanda teks `GreenroomID`, bukan logo gambar.

4. Tidak ada perubahan database dan tidak ada SQL baru.

## File yang berubah

- `public/apps/daftar-hadir/index.html`
- `public/apps/daftar-hadir/style.css`
- `public/apps/daftar-hadir/script.js`
- `update-notes/H15_UPDATE_NOTES.md`

## Cara install ulang dependency

Jalankan dari root project:

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
```

Jika memakai CMD:

```cmd
npm config set registry https://registry.npmjs.org/
rmdir /s /q node_modules
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

Cek khusus:

- live preview tetap proporsional,
- teks `GreenroomID` kecil muncul di kiri atas kertas,
- export PDF/print tidak mengecil,
- ukuran kertas A4/F4 mengikuti pilihan di sidebar.

## Cara build

```powershell
npm run build
```

## Cara push Git

```powershell
git status
git add .
git commit -m "H15 fix daftar hadir print scale and corner marker"
git push
```
