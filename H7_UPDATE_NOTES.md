# GreenroomID H7 - Branding & SEO Update

Perubahan utama:

1. Menambahkan menu admin baru: `Branding & SEO`.
   - Route: `/admin/site-branding`
   - File: `src/pages/AdminSiteBrandingPage.jsx`

2. Admin dapat mengubah:
   - Nama situs
   - Judul browser / judul Google
   - Deskripsi Google
   - Canonical URL
   - Favicon / ikon pencarian Google
   - Gambar preview share / Open Graph image

3. Menambahkan upload gambar ke Supabase Storage bucket:
   - Bucket: `site-assets`
   - File SQL: `supabase/h7-site-branding-update.sql`

4. Menambahkan updater metadata di sisi aplikasi:
   - File: `src/utils/siteBranding.js`
   - Dipanggil di `src/App.jsx`

5. Memperbarui SEO default di:
   - `index.html`
   - `public/robots.txt`
   - `public/sitemap.xml`

6. Menambahkan redirect host lama Vercel ke domain baru di:
   - `vercel.json`
   - `greenroom-id.vercel.app` diarahkan ke `https://www.greenroomid.com`

Cara pakai setelah deploy:

1. Buka Supabase Dashboard.
2. Masuk ke SQL Editor.
3. Jalankan file `supabase/h7-site-branding-update.sql`.
4. Deploy project ke Vercel.
5. Login sebagai admin.
6. Buka `Admin > Branding & SEO`.
7. Upload favicon dan isi metadata.
8. Klik `Simpan Branding`.
9. Setelah live, buka Google Search Console lalu lakukan Request Indexing untuk `https://www.greenroomid.com`.

Catatan:
Google tidak langsung mengganti ikon dan nama di hasil pencarian. Setelah metadata, favicon, redirect, dan indexing benar, pembaruan biasanya perlu beberapa hari sampai beberapa minggu.
