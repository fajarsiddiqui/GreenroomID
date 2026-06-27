# H17 Update Notes — Daftar Hadir Header Footer Per Halaman

## Ringkasan perubahan

- Live preview dan export/print Daftar Hadir sekarang memakai struktur halaman yang sama untuk setiap lembar.
- Halaman kedua, ketiga, dan seterusnya tidak lagi hanya berisi potongan tabel tanpa header/footer.
- Setiap kertas memiliki header judul, tabel, footer/tanda tangan sesuai pengaturan aktif, dan teks kecil `GreenroomID` di kiri atas.
- Perhitungan jumlah baris per halaman disesuaikan agar ruang header dan footer/tanda tangan dihitung sejak awal pada semua halaman.
- Ukuran kertas tetap dibatasi ke A4 dan F4/Folio.
- Tidak ada perubahan database. File/data client tetap tidak disimpan ke database.

## File utama yang berubah

```text
public/apps/daftar-hadir/script.js
update-notes/H17_UPDATE_NOTES.md
```

## Cara install lokal

Jalankan dari root project:

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Buka halaman:

```text
http://localhost:5173/daftar-hadir
```

atau:

```text
http://localhost:5173/layanan-gratis/daftar-hadir
```

## Cara cek export

1. Buka Daftar Hadir.
2. Isi jumlah baris sampai dokumen menjadi lebih dari satu halaman.
3. Cek live preview. Setiap kertas harus punya header dan footer/tanda tangan.
4. Klik tombol export di header preview.
5. Pilih PDF/Print dan cek hasilnya. Struktur halaman harus sama dengan live preview.

## Cara cek build

```powershell
npm run lint
npm run build
```

## Cara push Git

```powershell
git status
git add .
git commit -m "H17 fix daftar hadir header footer per page"
git push
```

## Catatan npm

Kalau `npm install` mencoba mengambil package dari registry internal, hapus `package-lock.json`, pastikan registry diarahkan ke `https://registry.npmjs.org/`, lalu jalankan `npm install` ulang.
