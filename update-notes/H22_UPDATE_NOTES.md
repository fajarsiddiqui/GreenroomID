# H22 Update Notes — Daftar Hadir Print Layout Cleanup

## Ringkasan

- Sidebar Daftar Hadir dirapikan lagi. Badge statis seperti `Aktif`, `Wajib`, dan `Opsional` yang tidak bisa diklik dihapus agar tidak terlihat seperti kontrol palsu.
- Semua menu yang tersisa tetap langsung memengaruhi live preview dan hasil PDF/print.
- Pagination Daftar Hadir diperbaiki agar halaman bawah tidak terlalu mepet dan halaman terakhir tidak terlalu kosong.
- Perhitungan baris per halaman menambahkan ruang aman bawah agar print preview tidak terasa kehilangan footer/margin bawah.
- Petunjuk ukuran kertas diperjelas: saat print/save PDF, pilih ukuran kertas yang sama dan gunakan margin `None/Tidak ada` jika browser masih memberi margin bawaan.

## Cara install lokal

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Buka halaman:

```text
http://localhost:5173/daftar-hadir
```

## Cara cek build

```powershell
npm run build
```

## Cara push Git

```powershell
git status
git add .
git commit -m "H22 clean daftar hadir print layout"
git push
```

## SQL

Tidak ada SQL baru.
