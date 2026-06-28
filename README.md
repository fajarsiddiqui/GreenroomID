# GreenroomID

GreenroomID adalah project Vite React untuk landing page, dashboard user, dashboard admin, layanan berbayar, dan layanan gratis seperti Image to Table serta Daftar Hadir.

## Menjalankan local

```bash
npm install
npm run dev
```

## Build production

```bash
npm run lint
npm run build
```

## Update notes

Catatan update disimpan di folder:

```text
update-notes/
```

Untuk update berikutnya, tambahkan file notes baru di folder tersebut agar root project tetap rapi.

## Vercel Speed Insights

Project ini sudah memakai `@vercel/speed-insights` melalui `src/main.jsx`.

Karena project ini berbasis Vite React, import yang digunakan adalah:

```jsx
import { SpeedInsights } from '@vercel/speed-insights/react'
```

Setelah deploy ke Vercel, buka website production dan navigasi antar halaman agar data Speed Insights mulai terkumpul.


## H16 Notes

Update terbaru ada di `update-notes/H16_UPDATE_NOTES.md`.

## H19 Ringkas

- Daftar Hadir dan Image to Table hanya memakai export PDF/Print.
- Export Word/Excel untuk layanan gratis tersebut dimatikan dari UI.
- Image to Table memakai dropdown export di header live preview.
- Penanda dokumen memakai teks `https://greenroomid.com` di kiri atas.
- Tanda tangan Daftar Hadir hanya muncul setelah akhir tabel pada halaman terakhir.
- Tidak ada SQL baru untuk H19.


## H21 Notes

Perubahan H21 merapikan sidebar Daftar Hadir, menghapus checklist menu yang tidak diperlukan, memperbaiki hubungan input data/jumlah baris, dan menjaga agar live preview serta export PDF/print memakai struktur halaman yang sama. Detail ada di `update-notes/H21_UPDATE_NOTES.md`.

## H23 Daftar Hadir Layout Refactor

Revisi H23 merapikan aplikasi Daftar Hadir agar live preview dan hasil PDF/print memakai struktur halaman yang sama. Sidebar juga disederhanakan: tinggi cell diganti menjadi tinggi baris global, lebar kolom memakai penyesuaian kolom tetangga, dan kolom tanda tangan dipilih secara eksplisit.

Catatan lengkap ada di `update-notes/H23_UPDATE_NOTES.md`.


## H25 Client Profile Lite

H25 menambahkan halaman `Profil Saya` untuk client di `/profile` dan `/client/profile`. Profil ini menyimpan nama tampilan, nomor WhatsApp opsional, preferensi tampil sebagai donatur, dan nama khusus donatur opsional.

SQL baru: `supabase/h25-client-profile-lite.sql`. Jalankan setelah `supabase/account-management-update.sql`.

Catatan lengkap ada di `update-notes/H25_UPDATE_NOTES.md`.

## H26 - Midtrans Donation Gateway

H26 menambahkan Donate Us otomatis dengan Midtrans Snap dan Supabase Edge Functions.

Halaman baru:
- `/donate-us`
- `/top-donatur`
- `/admin/donations`

File penting:
- `supabase/h26-midtrans-donation-gateway.sql`
- `supabase/functions/create-donation/index.ts`
- `supabase/functions/midtrans-webhook/index.ts`
- `update-notes/H26_UPDATE_NOTES.md`

Status pembayaran hanya diubah oleh webhook Midtrans, bukan oleh frontend.


## H27 - Donation Anonymous Identity

Patch H27 menambahkan redirect selesai bayar ke Top Donatur dan tracking alias anonim stabil untuk leaderboard donasi. Jalankan `supabase/h27-donation-anonymous-leaderboard.sql`, lalu deploy ulang Edge Functions `create-donation` dan `midtrans-webhook`.
