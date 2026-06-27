# H11 Update Notes — Landing Logo, Image to Table Layout, dan Admin Layanan Gratis

## Perubahan Landing Page
- Logo pada card hitam landing diperbesar agar lebih seimbang dengan tinggi card.
- Logo tetap berbentuk kotak dan tetap memakai prioritas logo dari Admin > Branding & SEO:
  1. `site_logo_url`
  2. `site_favicon_url`
  3. `logo_url`
  4. `/favicon.svg`
- Statistik landing menambahkan angka total penggunaan layanan gratis.

## Perubahan Image to Table
- Tombol `Simpan Project` dan `Buka Project` dihapus.
- Header aplikasi menampilkan keterangan bahwa file tidak tersimpan di web GreenroomID.
- Sidebar dan preview sekarang punya area scroll terpisah.
- Sidebar tetap tampil berdampingan dengan preview, termasuk saat dibuka di HP. Layout tidak berubah menjadi satu kolom.
- Semua menu di sidebar dibuat seperti laci/collapsible dan default tertutup.
- Daftar file terunggah dipindahkan ke laci sendiri dengan scroll mandiri.
- Ukuran kertas dibatasi ke A4 dan F4/Folio.
- CSS print diperbaiki agar ukuran halaman mengikuti ukuran kertas yang dipilih melalui `@page` dan halaman preview dicetak tanpa scaling preview.
- Tracking penggunaan hanya mencatat event `download_pdf` dan `print`, tidak menyimpan file/gambar client.

## Perubahan Layanan Gratis
- Page `/layanan-gratis` membaca status layanan dari database melalui RPC `get_public_free_services`.
- Card layanan bisa berstatus:
  - `active`
  - `maintenance`
  - `inactive`
- Jika status bukan aktif, card tetap tampil tetapi tidak bisa dibuka dan menampilkan pesan dari admin.
- Route `/image-to-table` juga mengecek status layanan sebelum menampilkan iframe aplikasi.

## Perubahan Admin
- Sidebar admin ditambahkan menu baru: `Layanan Gratis`.
- Route admin baru: `/admin/free-services`.
- Halaman admin Layanan Gratis menampilkan:
  - total penggunaan semua layanan gratis,
  - total download PDF,
  - total print/save PDF,
  - jumlah layanan aktif,
  - jumlah layanan maintenance/nonaktif,
  - card statistik per layanan.
- Setiap card layanan gratis punya pengaturan status dan pesan status.

## Database
Jalankan SQL baru:

`supabase/h11-free-services-admin-update.sql`

SQL ini membuat:
- tabel `free_services`,
- tabel `free_service_usage_events`,
- RPC `get_public_free_services`,
- RPC `track_free_service_usage`,
- RPC `get_free_service_usage_total`,
- RPC `get_free_service_admin_stats`,
- RPC `update_free_service_status`.

Catatan: tabel usage hanya menyimpan slug layanan, action, visitor id, user id jika login, dan waktu. Tidak ada file client yang disimpan.

## Check
- `npm run lint`: tidak ada error. Masih ada warning lama dari beberapa `useEffect` existing.
- `npm run build`: berhasil. Masih ada warning ukuran chunk Vite di atas 500 kB, bukan error.
