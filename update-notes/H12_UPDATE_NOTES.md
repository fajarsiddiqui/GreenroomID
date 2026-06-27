# H12 Update Notes - Daftar Hadir Free Service

## Ringkasan
Versi H12 menambahkan aplikasi **Daftar Hadir** ke menu **Layanan Gratis** dengan pola integrasi yang sama seperti Image to Table.

## Perubahan utama

1. **Layanan Gratis baru: Daftar Hadir**
   - Route utama: `/daftar-hadir`
   - Alias: `/layanan-gratis/daftar-hadir`
   - Ditampilkan sebagai card baru di halaman `/layanan-gratis`.
   - Masuk ke statistik dan status di Admin > Layanan Gratis.

2. **Database hanya untuk counting**
   - Tidak menyimpan isi daftar hadir, dokumen, gambar, file Word, file Excel, atau file PDF client.
   - Event yang disimpan hanya: slug layanan, action, visitor_id, user_id, dan waktu.
   - Action yang didukung: `use`, `download_pdf`, `download_excel`, `download_word`, dan `print`.

3. **Tampilan aplikasi Daftar Hadir**
   - Sidebar dan preview memakai area scroll masing-masing.
   - Tampilan HP tetap mempertahankan sidebar + preview, bukan berubah menjadi satu kolom.
   - Semua menu pengaturan berupa laci/collapsible dan default tertutup.
   - Ukuran kertas dibatasi A4 dan F4/Folio.
   - CSS print dibuat mengikuti ukuran kertas yang dipilih.

4. **Logo transparan GreenroomID di output**
   - Image to Table sekarang menerima logo dari Admin > Branding & SEO dan menampilkannya sebagai watermark transparan pada preview, print, dan export PDF.
   - Daftar Hadir juga menerima logo dari Admin > Branding & SEO dan menampilkannya sebagai watermark transparan pada preview, print, export Word, dan export Excel.

5. **Reusable iframe wrapper**
   - Ditambahkan `FreeServiceFramePage.jsx` agar layanan gratis berbasis aplikasi statis bisa memakai pola yang sama: status maintenance, tracking event, dan pengiriman logo branding ke iframe.

## SQL yang perlu dijalankan
Jalankan setelah SQL H11 jika belum pernah:

```sql
supabase/h12-daftar-hadir-free-service-update.sql
```

## Cek build
- `npm run lint`: tidak ada error, hanya warning lama `useEffect` dari file existing.
- `npm run build`: berhasil.
- Warning Vite chunk > 500 kB masih muncul, bukan error deploy.
