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

## RB-01 Ruang Belajar

RB-01 menambahkan katalog publik **Ruang Belajar GreenroomID** dan admin publishing untuk **Hasil Pembelajaran Artikel**. Jalankan `supabase/rb01-ruang-belajar.sql`, lalu buka `/admin/ruang-belajar` sebagai admin untuk membuat draft atau menerbitkan catatan.

Petunjuk lengkap: `RB01_PETUNJUK_PASANG.txt` dan `update-notes/RB01_RUANG_BELAJAR.md`.

## RB-01.1 — Import Draft Word & Navigasi Client

RB-01.1 menambahkan import `.docx` dari Template Hasil Pembelajaran Artikel GreenroomID pada `/admin/ruang-belajar`. File Word dibaca langsung di browser dan hanya mengisi draft form; file tidak disimpan ke Supabase. Update ini juga menambahkan header navigasi client menuju Beranda, Layanan, Layanan Gratis, Ruang Belajar, dan Request Saya.

Tidak ada SQL baru. Detail ada di `RB01_1_PETUNJUK_PASANG.txt` dan `update-notes/RB01_1_IMPORT_WORD_DAN_NAVIGASI_CLIENT.md`.

## RB-02 — Kirim Hasil Pembelajaran & Review Admin

RB-02 membuka kontribusi user untuk Ruang Belajar. Client dapat membuat draft, import template Word, mengirim hasil pembelajaran untuk review, menerima catatan revisi, lalu mengirim ulang. Admin melakukan review melalui `/admin/ruang-belajar/review`.

Jalankan `supabase/rb02-learning-submissions.sql` setelah `supabase/rb01-ruang-belajar.sql`.

RB-02 belum memproses pembayaran. Status `accepted_pending_payment` disiapkan untuk RB-03 agar keputusan editorial selalu terjadi sebelum kontribusi publikasi diminta.

Petunjuk lengkap: `RB02_PETUNJUK_PASANG.txt` dan `update-notes/RB02_SUBMISSION_DAN_REVIEW.md`.
