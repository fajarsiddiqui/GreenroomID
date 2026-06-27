# H14 Update Notes — Request Back Navigation & Daftar Hadir Export Refinement

## Ringkasan Perubahan

### 1. Perbaikan tombol kembali pada request layanan
- Saat user belum login lalu memilih layanan dari halaman public, data layanan tetap disimpan di `localStorage`.
- Tombol `← Kembali` di halaman request sekarang kembali ke daftar layanan kategori asal, misalnya `/layanan/desain`, bukan ke dashboard.
- Setelah request berhasil dikirim, tombol `Kembali ke Dashboard` tetap diarahkan ke dashboard.

File yang diperbarui:
- `src/pages/ServiceItemsPage.jsx`
- `src/pages/RequestForm.jsx`

### 2. Revisi tampilan dan output Daftar Hadir
- Logo GreenroomID tidak lagi tampil sebagai watermark besar di tengah dokumen.
- Logo GreenroomID sekarang diposisikan kecil di pojok kanan bawah dokumen, seperti elemen nomor halaman, sehingga tidak mengganggu isi daftar hadir.
- Posisi logo berlaku pada live preview dan hasil export/print.
- Default checklist sidebar diperbarui: semua pengaturan aktif secara default, kecuali `Penandatanganan kiri bawah`.
- Storage lokal Daftar Hadir dinaikkan ke versi baru agar default baru langsung terbaca untuk user baru.
- Ukuran live preview dan output print/export diselaraskan memakai ukuran A4/F4 yang sama.

File yang diperbarui:
- `public/apps/daftar-hadir/index.html`
- `public/apps/daftar-hadir/script.js`
- `public/apps/daftar-hadir/style.css`

### 3. Menu ekspor dipindah ke header live preview
- Panel ekspor di sidebar kiri dihapus.
- Tombol export sekarang berada di header live preview.
- Tombol export berbentuk dropdown interaktif dengan pilihan:
  - PDF / Save as PDF
  - Print langsung
  - Excel (.xls)
  - Word (.doc)
- Tombol `Kosongkan Data Tabel` dan `Reset Semua` tetap tersedia di sidebar melalui panel `Aksi data`.

### 4. Data client tetap tidak disimpan di database
- Isi dokumen, data daftar hadir, file client, atau hasil export tidak disimpan di database GreenroomID.
- Database hanya menerima event statistik penggunaan layanan gratis melalui mekanisme counting yang sudah ada.

## Cara Install / Update Local

Jika memakai folder project yang sudah ada, gunakan install bersih agar dependency native Vite/Rolldown sesuai dengan laptop kamu:

```bash
npm config set registry https://registry.npmjs.org/
rm -rf node_modules
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Untuk Windows PowerShell:

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Cek halaman:

```text
http://localhost:5173/layanan-gratis
http://localhost:5173/daftar-hadir
http://localhost:5173/image-to-table
```

Cek build sebelum push:

```bash
npm run lint
npm run build
```

## Cara Push Git

```bash
git status
git add .
git commit -m "H14 fix request back navigation and daftar hadir export UI"
git push
```

## Catatan SQL

H14 tidak menambahkan SQL baru. Jika database sudah menjalankan SQL sampai H12, tidak perlu menjalankan SQL tambahan untuk update ini.

