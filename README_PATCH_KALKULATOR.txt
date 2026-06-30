PATCH: Kalkulator Aturan Angka ke Layanan Gratis

Perubahan utama:
1. Menambahkan aplikasi statis di public/apps/kalkulator-aturan-angka/index.html.
2. Menambahkan halaman React src/pages/KalkulatorAturanAngkaPage.jsx.
3. Menambahkan route:
   - /kalkulator-aturan-angka
   - /layanan-gratis/kalkulator-aturan-angka
4. Menambahkan card fallback di Layanan Gratis dan Admin Layanan Gratis.
5. Menambahkan onboarding tutorial awal berbasis localStorage:
   greenroomid_kalkulator_aturan_angka_tour_seen_v1
6. Print hanya memanggil dialog print browser melalui window.print(). Ukuran kertas dan margin utama diatur oleh Chrome/browser.
7. Aplikasi tidak menyimpan file hasil. Perhitungan hanya berjalan di browser. Database hanya menerima statistik event penggunaan jika SQL dijalankan.

Supabase:
Jalankan file supabase/h29-kalkulator-aturan-angka-free-service.sql di Supabase SQL Editor agar layanan masuk ke database free_services dan statistik usage tercatat.

Build:
Dist sudah dibuild di folder dist. Jika build ulang lokal, jalankan:
npm install
npm run build
