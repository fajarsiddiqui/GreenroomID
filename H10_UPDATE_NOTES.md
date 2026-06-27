# GreenroomID H10 - SEO Logo + Free Image to Table

## Ringkasan perubahan

1. Landing header sekarang memakai logo dari menu Admin > Branding & SEO.
   - Prioritas logo: `site_logo_url`.
   - Jika `site_logo_url` kosong, landing otomatis memakai `site_favicon_url`.
   - Jika keduanya kosong, fallback tetap `/favicon.svg`.

2. Menu Admin > Branding & SEO ditambah upload baru:
   - Upload Logo Website, dipakai untuk card header landing.
   - Upload Favicon tetap dipakai untuk favicon/browser/Google icon.
   - Upload Gambar Share tetap dipakai untuk Open Graph preview.

3. Page Layanan Gratis sekarang aktif, bukan lagi Coming Soon.
   - Route: `/layanan-gratis`.
   - Ada card baru: `Image to Table`.

4. Aplikasi Image Table Studio sudah dimasukkan ke project.
   - File aplikasi ada di `public/apps/image-table-studio/`.
   - Route wrapper React: `/image-to-table`.
   - Alias route: `/layanan-gratis/image-to-table`.
   - Tersedia juga tombol `Buka Fullscreen` ke `/apps/image-table-studio/index.html`.

## File penting yang berubah

- `src/pages/LandingPage.jsx`
- `src/pages/AdminSiteBrandingPage.jsx`
- `src/utils/siteBranding.js`
- `src/App.jsx`
- `src/pages/FreeServicesPage.jsx`
- `src/pages/ImageToTablePage.jsx`
- `public/apps/image-table-studio/`
- `supabase/h10-free-image-table-and-seo-logo.sql`

## SQL tambahan

Jalankan di Supabase SQL Editor jika ingin field `site_logo_url` langsung muncul/rapi di database:

```sql
supabase/h10-free-image-table-and-seo-logo.sql
```

Catatan: tanpa SQL ini, frontend tetap bisa jalan. Tetapi untuk upload logo khusus dari Admin > Branding & SEO, sebaiknya SQL H10 dijalankan.

## Hasil pengecekan

- `npm run lint`: tidak ada error, hanya 5 warning lama terkait dependency `useEffect` di file existing.
- `npm run build`: berhasil. Ada warning ukuran chunk Vite karena bundle utama di atas 500 kB; bukan error build.
