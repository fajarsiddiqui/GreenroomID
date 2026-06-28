# H26 Update Notes - Midtrans Donation Gateway

## Ringkasan
H26 mengaktifkan fondasi Donate Us otomatis dengan Midtrans Snap Sandbox.

Fitur yang ditambahkan:
- Halaman public `/donate-us`.
- Halaman public `/top-donatur`.
- Menu admin `/admin/donations`.
- SQL `supabase/h26-midtrans-donation-gateway.sql`.
- Supabase Edge Function `create-donation` untuk membuat invoice Midtrans Snap.
- Supabase Edge Function `midtrans-webhook` untuk menerima notifikasi Midtrans dan mengubah donasi menjadi `paid`, `pending`, `expired`, `failed`, atau `cancelled`.
- Donasi login memakai profil client sebagai default nama donatur.
- Donasi non-login bisa isi nama manual.
- User bisa memilih nama tampil publik atau Anonim.
- Top Donatur hanya menampilkan donasi yang sudah `paid`.

## Prinsip keamanan
- Frontend tidak bisa mengubah status donasi menjadi `paid`.
- Status `paid` hanya diubah oleh Edge Function `midtrans-webhook` setelah signature Midtrans valid.
- `MIDTRANS_SERVER_KEY` hanya disimpan di Supabase Edge Function secrets, bukan di Vercel atau React frontend.

## Urutan SQL
Jalankan SQL berikut di Supabase SQL Editor:

```sql
-- Pastikan ini sudah pernah dijalankan
supabase/account-management-update.sql
supabase/h25-client-profile-lite.sql

-- Jalankan untuk H26
supabase/h26-midtrans-donation-gateway.sql
```

Setelah selesai, cek:

```sql
SELECT * FROM public.donation_settings;
SELECT * FROM public.donations ORDER BY created_at DESC;
```

## Deploy Edge Functions
Pastikan Supabase CLI sudah login dan project sudah linked.

```bash
supabase login
supabase link --project-ref PROJECT_REF_KAMU
```

Set secrets untuk Sandbox:

```bash
supabase secrets set MIDTRANS_SERVER_KEY="ISI_SERVER_KEY_SANDBOX"
supabase secrets set MIDTRANS_IS_PRODUCTION="false"
supabase secrets set SITE_URL="https://greenroomid.com"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="ISI_SERVICE_ROLE_KEY_SUPABASE"
supabase secrets set SUPABASE_ANON_KEY="ISI_ANON_KEY_SUPABASE"
```

Deploy functions:

```bash
supabase functions deploy create-donation --no-verify-jwt
supabase functions deploy midtrans-webhook --no-verify-jwt
```

Endpoint webhook Midtrans:

```text
https://PROJECT_REF_KAMU.functions.supabase.co/midtrans-webhook
```

Masukkan URL itu ke Midtrans Dashboard Sandbox pada bagian Payment Notification URL / HTTP Notification URL.

## Cara install local

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Cek halaman:

```text
http://localhost:5173/donate-us
http://localhost:5173/top-donatur
http://localhost:5173/admin/donations
```

Catatan: tombol donasi butuh Edge Function yang sudah deploy dan secrets yang lengkap.

## Build dan push Git

```bash
npm run build
git add .
git commit -m "H26 add Midtrans donation gateway"
git push
```

## Pindah ke Production Midtrans
Setelah Sandbox berhasil:
1. Ambil Production Server Key dari Midtrans.
2. Ubah secret:

```bash
supabase secrets set MIDTRANS_SERVER_KEY="ISI_SERVER_KEY_PRODUCTION"
supabase secrets set MIDTRANS_IS_PRODUCTION="true"
supabase functions deploy create-donation --no-verify-jwt
supabase functions deploy midtrans-webhook --no-verify-jwt
```

3. Pastikan Notification URL di dashboard Midtrans Production juga mengarah ke:

```text
https://PROJECT_REF_KAMU.functions.supabase.co/midtrans-webhook
```
