# H27 Update Notes - Donation Redirect + Anonymous Leaderboard Identity

## Ringkasan
Patch H27 melanjutkan H26 Midtrans Donation Gateway.

Perubahan utama:
- Setelah pembayaran selesai, callback Midtrans `finish` diarahkan ke `/top-donatur?donation=success&order_id=...`.
- Callback `pending` diarahkan ke `/top-donatur?donation=pending&order_id=...`.
- Halaman Top Donatur menampilkan notice setelah user kembali dari Midtrans dan melakukan auto-refresh beberapa kali agar menunggu webhook masuk.
- Donatur yang menyembunyikan nama tetap tampil di leaderboard sebagai alias stabil: `Anonim 1`, `Anonim 2`, dan seterusnya.
- User login yang pertama kali donasi anonim akan dibuatkan anonymous identity yang terikat ke akun. Donasi anonim berikutnya dari akun yang sama tetap masuk ke alias anonim yang sama.
- User login bisa memiliki dua identitas leaderboard terpisah: nama publik dan alias anonim. Total donasi publik dan anonim tidak digabung.
- Guest yang belum login memakai `greenroomid_guest_donor_id` di localStorage, sehingga anonim guest stabil selama browser/cache tidak dihapus.
- Top Donatur tidak lagi mengabaikan donasi anonim. Donasi anonim ikut ranking dengan nama alias anonim.

## File penting yang berubah
- `src/pages/DonateUsPage.jsx`
- `src/pages/TopDonaturPage.jsx`
- `supabase/functions/create-donation/index.ts`
- `supabase/h26-midtrans-donation-gateway.sql`
- `supabase/h27-donation-anonymous-leaderboard.sql`

## SQL baru
Jalankan setelah SQL H26 sudah sukses:

```sql
supabase/h27-donation-anonymous-leaderboard.sql
```

SQL H27 membuat/menambah:
- `donor_anonymous_identities`
- `donor_anonymous_number_seq`
- kolom baru di `donations`: `guest_id`, `display_mode`, `donor_identity_key`, `anonymous_alias`, `leaderboard_key`, `leaderboard_name`
- RPC `ensure_donor_anonymous_identity(...)`
- update RPC Top Donatur agar public dan anonymous dipisah secara benar.

## Deploy Edge Functions
Setelah SQL H27 dijalankan, deploy ulang function:

```powershell
supabase functions deploy create-donation --no-verify-jwt
supabase functions deploy midtrans-webhook --no-verify-jwt
```

## Cek local
```powershell
npm config set registry https://registry.npmjs.org/
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Cek halaman:

```text
http://localhost:5173/donate-us
http://localhost:5173/top-donatur
http://localhost:5173/admin/donations
```

## Test skenario
1. Login sebagai user A.
2. Donasi dengan nama disembunyikan.
3. Bayar sandbox sampai status `paid`.
4. Top Donatur harus menampilkan `Anonim 1` atau alias anonim lain.
5. Donasi lagi sebagai user A dengan nama disembunyikan.
6. Total harus menambah ke alias anonim yang sama.
7. Donasi lagi sebagai user A dengan nama publik.
8. Top Donatur harus punya baris publik dan baris anonim yang berbeda.

## Push Git
```powershell
npm run build
git add .
git commit -m "H27 add anonymous donor identity and redirect to top donors"
git push
```
