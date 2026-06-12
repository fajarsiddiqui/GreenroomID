# Update GreenroomID - H5 Payment, Notification, dan Request Safety

Update ini dibuat berdasarkan file `GreenroomID_H5_updated_account_management.zip` dan menjaga data request lama tetap aman. Tidak ada perubahan yang menghapus atau menimpa file client, bukti bayar lama, file hasil, maupun baris `request_files` lama.

## File update utama

- `supabase/h5-payment-notification-profile-update.sql`
- `src/pages/AdminProfilePage.jsx`
- `src/pages/DetailRequest.jsx`
- `src/pages/Dashboard.jsx`
- `src/pages/AdminDashboard.jsx`
- `src/pages/AdminRequestsPage.jsx`
- `src/pages/AdminServicesPage.jsx`
- `src/pages/AdminLayout.jsx`
- `src/App.jsx`
- `src/utils/status.js`
- `eslint.config.js`

## Perubahan fitur

1. **Instruksi pembayaran client di laci pembayaran**
   - Di halaman detail request client, laci pembayaran sekarang berisi dua blok: instruksi pembayaran dan QRIS admin.
   - Tombol upload bukti bayar tetap berada di dalam laci pembayaran.
   - Jika pembayaran ditolak, client melihat tombol **Upload Ulang Bukti Bayar**.

2. **Profile pembayaran admin**
   - Menu baru: **Admin > Profile Payment**.
   - Admin bisa mengisi nomor admin/WhatsApp, jenis rekening, bank/provider, nomor rekening/wallet, atas nama, instruksi pembayaran, dan upload foto QRIS.
   - Nomor admin tidak lagi hardcoded di dashboard client. Link WhatsApp mengambil nomor dari profile admin.

3. **Verifikasi pembayaran lebih aman**
   - Tombol **Verifikasi Pembayaran** di admin hanya aktif jika bukti bayar sudah ada.
   - Tombol **Tolak Pembayaran** juga dibuat tidak aktif jika belum ada bukti bayar.

4. **Deadline tidak bisa diubah lewat tombol**
   - Deadline hanya diisi client saat pertama membuat request.
   - Tombol ubah deadline di client/admin dihapus.
   - Perubahan deadline diarahkan lewat diskusi manual.

5. **Notifikasi pesan baru**
   - Dashboard admin menampilkan badge jumlah pesan baru.
   - Klik kartu pesan baru akan masuk ke menu request.
   - Daftar request admin menampilkan badge pesan baru per request.
   - Dashboard client menampilkan badge jika ada balasan admin yang belum dibaca.
   - Pesan lama dibackfill sebagai sudah terbaca agar badge hanya muncul untuk pesan baru setelah SQL update dijalankan.

6. **Status dibuat lebih ramah**
   - Value database tetap dipertahankan agar kompatibel.
   - Tampilan UI memakai label ramah seperti: `Request diterima`, `Sedang dikerjakan`, `Menunggu pembayaran`, `Bukti bayar terkirim`, `File hasil tersedia`, dan sejenisnya.

7. **Kategori dan layanan**
   - Tombol **Edit Kategori** ditambahkan berdampingan dengan **Tambah Kategori**.
   - Form kategori dan layanan ditambah field `sort_order` untuk mengatur urutan tampil.

8. **Audit log lebih bersih**
   - Log update request hanya dibuat jika field benar-benar berubah.
   - Jika admin klik simpan tanpa perubahan, sistem memberi notifikasi tidak ada perubahan.

9. **Dashboard admin**
   - Angka statistik dibatasi ke `99+` jika jumlah melebihi 99, sehingga tidak menyentuh angka 100 di UI.

10. **Optimasi request list**
    - Filter dan sort request list dipindah ke `useMemo` agar tidak dihitung ulang berlebihan.
    - Summary file request tetap mengambil data lama dengan aman dan hanya membaca file aktif (`deleted_at is null`).
    - SQL menambahkan index untuk list request aktif, status, deadline, dan unread message.

## SQL yang wajib dijalankan di Supabase

Buka **Supabase Dashboard > SQL Editor**, lalu jalankan:

```sql
supabase/h5-payment-notification-profile-update.sql
```

Catatan:

- SQL ini membuat tabel `admin_payment_settings`.
- SQL ini menambah kolom read receipt di `diskusi`: `read_by_admin_at` dan `read_by_client_at`.
- SQL ini tidak menghapus request, diskusi, file client, bukti bayar, atau file hasil.
- QRIS disimpan di Storage bucket `request-files`, folder `admin-qris/`.

## Validasi lokal

Sudah dijalankan:

```bash
npm ci
npm run lint
npm run build
```

Hasil:

- `npm run lint` berhasil tanpa error, masih ada warning `react-hooks/exhaustive-deps` dari pola lama beberapa halaman.
- `npm run build` berhasil.
- Build memberi warning ukuran chunk JS besar. Ini bukan error deploy, tetapi bisa ditingkatkan nanti dengan route-level lazy loading/code splitting.

## Tutorial push Git

Jalankan dari folder project:

```bash
git status
git add .
git commit -m "feat: add payment profile, qris, unread message badges, and request list optimization"
git push origin main
```

Jika branch kamu bukan `main`, cek dulu nama branch:

```bash
git branch
```

Lalu push sesuai branch aktif, contoh:

```bash
git push origin nama-branch-kamu
```

## Tutorial deploy setelah push

1. Push kode ke GitHub/Git provider.
2. Jalankan SQL `supabase/h5-payment-notification-profile-update.sql` di Supabase.
3. Deploy frontend seperti biasa, misalnya dari Vercel/Netlify/manual build.
4. Login admin.
5. Buka **Admin > Profile Payment**.
6. Isi rekening, nomor admin, instruksi pembayaran, dan upload QRIS.
7. Coba buka detail request dari akun client dan cek laci pembayaran.
8. Upload bukti bayar dari client.
9. Pastikan tombol verifikasi admin aktif setelah bukti bayar masuk.
