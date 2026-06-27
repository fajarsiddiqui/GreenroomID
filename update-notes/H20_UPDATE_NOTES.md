# H20 Update Notes — Export UI & Output Cleanup

## Ringkasan

- Memperbaiki dropdown Export pada Image to Table agar selalu tampil di atas live preview, bukan tertutup card preview.
- Merapikan output Image to Table pada halaman terakhir: slot kosong tidak lagi digambar sebagai kotak placeholder besar.
- Memperbaiki pembagian halaman Daftar Hadir agar halaman sebelum halaman tanda tangan tidak menjadi terlalu pendek secara tidak perlu.
- Tanda tangan Daftar Hadir tetap hanya muncul setelah akhir tabel pada halaman terakhir.
- Tidak ada SQL baru dan tidak ada penyimpanan file client ke database.

## Cara install bersih

Jalankan dari folder project:

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
```

Jika memakai CMD:

```cmd
npm config set registry https://registry.npmjs.org/
rmdir /s /q node_modules
del package-lock.json
npm install --registry=https://registry.npmjs.org/
```

## Cek local

```powershell
npm run dev
```

Buka halaman berikut:

```text
http://localhost:5173/layanan-gratis
http://localhost:5173/image-to-table
http://localhost:5173/daftar-hadir
```

## Cek build

```powershell
npm run build
```

## Push Git

```powershell
git status
git add .
git commit -m "H20 fix free service export dropdown and output layout"
git push
```
