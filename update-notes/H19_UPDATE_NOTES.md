# H19 Update Notes — Export PDF/Print Only + Final Signature Placement

## Ringkasan perubahan

1. Daftar Hadir
   - Export Word dan Excel dimatikan dari UI.
   - Menu export hanya menampilkan PDF / Save as PDF dan Print / Save PDF.
   - Teks penanda dokumen diganti menjadi `https://greenroomid.com` di kiri atas halaman.
   - Tanda tangan tidak lagi muncul di semua halaman.
   - Tanda tangan hanya tampil setelah akhir tabel pada halaman terakhir.
   - Tanda tangan ditempatkan langsung di bawah tabel terakhir, bukan dipaksa ke bawah kertas.
   - Pagination tetap menjaga tabel lanjut ke halaman berikutnya saat melewati batas kertas A4/F4.

2. Image to Table
   - Export dipindahkan dari sidebar ke header live preview.
   - Sidebar tidak lagi memiliki panel export.
   - Tombol export dibuat dropdown seperti Daftar Hadir.
   - Export yang aktif hanya PDF / Download PDF dan Print / Save PDF.
   - Teks penanda dokumen memakai `https://greenroomid.com` di kiri atas halaman.
   - Data gambar tetap diproses lokal di browser dan tidak disimpan ke database.

3. Database
   - Tidak ada SQL baru.
   - Database tetap hanya menerima counting penggunaan layanan gratis.

## Cara install lokal

Jalankan dari root project:

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Buka halaman berikut untuk cek:

```text
http://localhost:5173/daftar-hadir
http://localhost:5173/image-to-table
http://localhost:5173/layanan-gratis
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
git commit -m "H19 simplify free service exports and final signature placement"
git push
```

## Catatan teknis

- Jangan commit `.env`.
- Jangan commit `node_modules`.
- Jika install dependency lambat atau error registry internal, hapus `package-lock.json`, lalu install ulang dari `https://registry.npmjs.org/`.
