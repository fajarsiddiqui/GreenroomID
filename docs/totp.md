# Konfigurasi akses TOTP

Tambahkan variabel berikut pada environment Vercel:

```env
SESSION_SIGNING_KEY=nilai-acak-panjang-minimal-32-karakter
ENABLE_DEMO=false
```

Server memakai Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY`. `SESSION_SIGNING_KEY` minimal 32 karakter dan `TOTP_ENCRYPTION_KEY` tepat 64 karakter hex untuk AES-256-GCM. `ENABLE_DEMO=false` pada produksi.

Untuk database baru, gunakan `supabase/totp-accounts.sql`. Untuk database TOTP yang sudah ada, jalankan migration `supabase/totp-single-use.sql` melalui prosedur migration Supabase setelah direview. Migration produksi tidak dijalankan oleh agent.

Admin mengelola akun dan token melalui `/admin/totp`. Token asli hanya ditampilkan sekali, database menyimpan SHA-256, kedaluwarsa token boleh kosong, dan secret disimpan AES-256-GCM. Setiap token hanya dapat berhasil diverifikasi satu kali. RPC `consume_totp_access_token` mengisi `used_at` secara atomik; token yang sudah digunakan tetap terpakai setelah reset, refresh, atau restart server.

Endpoint memakai cookie HttpOnly selama lima menit. Secret, token, dan kode tidak dikirim lewat URL, browser storage, atau log.
