# H25 Update Notes - Client Profile Lite

## Ringkasan

Update H25 menambahkan menu profil ringan untuk user/client sebagai fondasi fitur Donate Us dan Top Donatur.

## Perubahan utama

1. Menambahkan halaman client:
   - `/profile`
   - `/client/profile`

2. Dashboard client sekarang memiliki tombol `Profil Saya`.

3. Profil client berisi:
   - email akun, read-only,
   - nama tampilan,
   - nomor WhatsApp opsional,
   - preferensi apakah nama ditampilkan saat menjadi donatur,
   - nama khusus donatur opsional.

4. Sinkronisasi profil login diperbaiki agar nama custom user tidak selalu ditimpa oleh nama dari Google OAuth.

5. Menambahkan SQL baru:
   - `supabase/h25-client-profile-lite.sql`

## SQL yang perlu dijalankan

Jalankan di Supabase SQL Editor:

```sql
supabase/h25-client-profile-lite.sql
```

Jalankan setelah SQL akun dasar:

```sql
supabase/account-management-update.sql
```

## Cara install di local

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Buka:

```text
http://localhost:5173/profile
```

## Cara cek build

```powershell
npm run build
```

## Cara push Git

```powershell
git status
git add .
git commit -m "H25 add client profile lite"
git push
```

## Catatan teknis

Belum ada fitur pembayaran donasi otomatis pada H25. Profil ini disiapkan agar nanti Donate Us bisa memakai nama user login secara default, dan user bisa memilih tampil publik atau anonim di Top Donatur.
