PATCH H37 — Lint Warning Cleanup

Tujuan:
- Menghilangkan 8 warning react-hooks/exhaustive-deps yang muncul saat npm run lint.
- Tidak mengubah alur runtime aplikasi.
- Tidak ada SQL baru.

File yang berubah:
- src/pages/AdminRequestsPage.jsx
- src/pages/AdminRevisionSettingsPage.jsx
- src/pages/ClientFormWorkspacePage.jsx
- src/pages/ClientProfilePage.jsx
- src/pages/Dashboard.jsx
- src/pages/DetailRequest.jsx
- src/pages/ServiceItemsPage.jsx
- src/pages/TopDonaturPage.jsx

Catatan teknis:
- Untuk beberapa useEffect yang memang sengaja hanya berjalan saat halaman dibuka atau saat id/slug berubah, ditambahkan anotasi eslint-disable-next-line react-hooks/exhaustive-deps secara lokal.
- Untuk TopDonaturPage.jsx, dependency leaderboardVisible ditambahkan ke dependency array karena aman dan sesuai dengan data yang dipakai effect.
- Anotasi lokal dipilih agar tidak mengubah behavior halaman request, detail request, dashboard client, profil, layanan, revisi, dan form workspace.

Cara pasang patch:
1. Extract ZIP ini ke root project GreenroomID.
2. Saat muncul pilihan file duplikat, pilih replace/overwrite untuk file yang ada.
3. Pastikan patch H31–H36 sudah terpasang sebelumnya.

Cara cek lokal:
1. Jalankan:
   npm run lint

   Hasil yang diharapkan:
   Tidak ada warning dan tidak ada error.

2. Jalankan:
   npm run build

   Jika muncul error native dependency Vite/Rolldown, jalankan:
   npm install
   npm run build

3. Jalankan local dev:
   npm run dev

4. Cek halaman penting:
   - /dashboard
   - /request/new
   - /request/:requestId
   - /request/:requestId/form
   - /admin/requests
   - /admin/forms
   - /profil
   - /top-donatur

Cara commit dan push Git:
1. Cek status:
   git status

2. Stage file:
   git add .

3. Commit:
   git commit -m "chore: clean lint hook warnings"

4. Push:
   git push origin main
