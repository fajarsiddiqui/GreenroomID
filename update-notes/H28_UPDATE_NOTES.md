# H28 - Donation Public Visibility Toggle

## Ringkasan
- Menambahkan pengaturan admin untuk menyembunyikan halaman Donate Us.
- Menambahkan pengaturan admin untuk menyembunyikan halaman Top Donatur.
- Landing page tidak menampilkan card Donate Us dan Top Donatur jika statusnya dimatikan.
- Halaman /donate-us dan /top-donatur menampilkan pesan nonaktif saat disembunyikan.
- Edge Function create-donation menolak pembuatan invoice baru saat Donate Us dimatikan.

## Database
Jalankan SQL:
supabase/h28-donation-public-visibility.sql

## Edge Function
Deploy ulang:
supabase functions deploy create-donation --no-verify-jwt

## Catatan
Data donasi lama tidak dihapus. Toggle hanya mengatur tampilan publik dan pembuatan invoice baru.
