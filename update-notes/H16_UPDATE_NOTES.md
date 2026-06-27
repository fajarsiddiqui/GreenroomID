# H16 Update Notes — Daftar Hadir Preview Pagination

## Ringkasan perubahan

- Live preview Daftar Hadir sekarang memecah tampilan menjadi beberapa lembar kertas, mengikuti jumlah halaman yang akan keluar saat PDF/Print.
- Preview tidak lagi menumpuk semua baris dalam satu kertas ketika hasil export menjadi lebih dari satu halaman.
- Teks kecil `GreenroomID` di kiri atas dokumen dibuat lurus, tidak miring, pada preview dan output export/print.
- Export PDF/Print tetap memakai kertas A4 atau F4/Folio sesuai pilihan di sidebar.
- Tidak ada perubahan database dan tidak ada file client yang disimpan ke database.

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

## Cara cek build

```powershell
npm run lint
npm run build
```

## Cara push Git

```powershell
git status
git add .
git commit -m "H16 update daftar hadir preview pagination"
git push
```

## Catatan

Kalau `npm install` mencoba mengambil package dari registry internal, hapus `package-lock.json`, pastikan registry diarahkan ke `https://registry.npmjs.org/`, lalu jalankan `npm install` ulang.
