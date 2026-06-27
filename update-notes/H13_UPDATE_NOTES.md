# H13 Update Notes — Notes Folder & Vercel Speed Insights

Tanggal update: 27 Juni 2026

## Ringkasan
Update H13 berisi revisi ringan dari H12 untuk merapikan dokumentasi update dan menambahkan Vercel Speed Insights pada project Vite React GreenroomID.

## Perubahan

### 1. Folder update notes
- Semua file update notes lama dipindahkan dari root project ke folder `update-notes/`.
- Struktur baru:
  - `update-notes/H6_UPDATE_NOTES.md`
  - `update-notes/H7_UPDATE_NOTES.md`
  - `update-notes/H8_UPDATE_NOTES.md`
  - `update-notes/H9_UPDATE_NOTES.md`
  - `update-notes/H10_UPDATE_NOTES.md`
  - `update-notes/H11_UPDATE_NOTES.md`
  - `update-notes/H12_UPDATE_NOTES.md`
  - `update-notes/H13_UPDATE_NOTES.md`
- Untuk update berikutnya, catatan update cukup ditambahkan ke folder ini agar root project tetap rapi.

### 2. Vercel Speed Insights
- Menambahkan dependency `@vercel/speed-insights`.
- Menambahkan komponen `<SpeedInsights />` pada `src/main.jsx`.
- Karena project ini menggunakan Vite React, import yang digunakan adalah:
  ```jsx
  import { SpeedInsights } from '@vercel/speed-insights/react'
  ```
  bukan import khusus Next.js.

## File yang berubah
- `package.json`
- `package-lock.json`
- `src/main.jsx`
- `update-notes/`

## Catatan deploy
Setelah push ke GitHub dan deploy di Vercel, buka website production dan navigasi antar halaman agar Speed Insights mulai mengumpulkan data. Data tidak selalu muncul langsung; biasanya perlu beberapa kunjungan dan waktu singkat setelah deployment aktif.
