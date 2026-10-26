
# PRD GreenroomID Shop v2

·

## 1. Ringkasan, tujuan, dan keputusan produk

GreenroomID Shop adalah toko web penjual akun digital OpenAI yang dibeli resmi. Pembeli memilih jenis akun dan masa aktif, membayar manual, mengunggah bukti, lalu menerima akun setelah admin memverifikasi. Dokumen ini adalah acuan membangun MVP dengan React + Vite dan Supabase, dan menggantikan PRD versi pertama.

**Tujuan MVP**

- Pembeli bisa membeli dan menerima akun tanpa chat manual panjang.
- Admin hanya mencocokkan bukti dengan mutasi lalu menekan Verifikasi atau Tolak.
- Stok akun terbagi otomatis per varian sesuai stok tiap akun.
- Admin langsung dapat notifikasi WhatsApp Business saat bukti pembayaran masuk.

**Masuk MVP**

- Katalog dengan varian jenis akun × masa aktif, pendaftaran perangkat, pembayaran manual, upload bukti, halaman tunggu, halaman hasil, kode authenticator.
- Panel admin: verifikasi, produk, akun dan stok, metode pembayaran, log audit.
- Notifikasi WhatsApp Business ke satu nomor admin.

**Di luar MVP (fase 2)**

- Payment gateway otomatis, login dan riwayat pembeli, kupon, banyak admin dengan peran, notifikasi WhatsApp ke pembeli, keranjang, laporan lanjutan.

**Keputusan produk yang sudah final**

| Topik | Keputusan |
|---|---|
| Sumber akun | Dibeli resmi melalui OpenAI |
| Varian | Jenis akun (Sharing/Private) × masa aktif (1, 3, 7, 14 hari, 1 bulan) + harga |
| Alokasi | Hanya dari akun pada varian yang sama; akun habis → akun berikutnya pada varian itu |
| Awal masa aktif | Sejak pembeli pertama kali login / mengambil kode |
| Kode authenticator | Ditampilkan kode berikutnya agar pembeli punya sekitar 30 detik penuh; hanya sekali, tidak bisa diminta ulang |
| Akun lupa disimpan | Ditangani manual lewat admin, pembeli menunjukkan bukti belum pernah login |
| Draft pesanan | Menahan slot 30 menit |
| Admin | Satu nomor WhatsApp admin |
| Pesanan | Satu pesanan satu produk, tanpa keranjang |
| Refund | Bila akun bermasalah atau dinonaktifkan oleh pihak OpenAI |
| Bukti bayar | Wajib diunggah setelah "Saya sudah bayar" |

## 2. Peran, alur, dan status pesanan

| Peran | Akses | Tujuan utama |
|---|---|---|
| Pembeli | Halaman publik; pesanannya sendiri lewat kode order + token | Membeli dan menerima akun dengan cepat |
| Admin | Panel `/admin` dengan login Supabase Auth | Verifikasi pembayaran, kelola produk, akun, stok |

**Alur pembeli**

- Katalog: pilih jenis akun dan masa aktif, tekan Beli.
- Daftarkan perangkat: jenis perangkat, kota/kabupaten, nama panggilan, nomor WhatsApp. Pesanan `draft` dibuat dan slot akun dipesan.
- Pembayaran: pilih metode, transfer sesuai nominal.
- Tekan "Saya sudah bayar": masuk ke halaman Upload bukti pembayaran.
- Unggah bukti (wajib) lalu Kirim: status `waiting_verification`, notifikasi WhatsApp ke admin, hitung mundur 10 menit.
- Halaman tunggu dengan status realtime.
- Hasil: bila `verified`, tampil email, password, ketentuan produk, dan tombol Ambil Kode. Bila `rejected`, tampil alasan dan jalan keluar.

**Alur admin**

- Notifikasi WhatsApp masuk dengan kode order dan tautan panel.
- Buka pesanan Menunggu, lihat bukti, cocokkan nominal dan metode dengan mutasi.
- Verifikasi (akun terkunci ke pesanan) atau Tolak dengan alasan (slot dikembalikan).

**Status pesanan**

| Status | Arti | Transisi berikutnya |
|---|---|---|
| draft | Pesanan dibuat, belum ada bukti | waiting_verification, atau expired setelah 30 menit |
| waiting_verification | Bukti terkirim, menunggu admin | verified atau rejected; tidak pernah expired otomatis, ditandai Terlambat setelah 10 menit |
| verified | Admin menyetujui; kredensial siap dibuka | Selesai |
| rejected | Admin menolak dengan alasan | Pembeli bisa kembali ke pembayaran |
| expired | Draft melewati 30 menit, slot dilepas | Akhir |

## 3. Kebutuhan fungsional: pembeli

**Prioritas: P0 wajib MVP, P1 sebaiknya ada, P2 nanti.**

| ID | Kebutuhan | Aturan dan kriteria selesai | Prioritas |
|---|---|---|---|
| B-01 | Katalog | Produk aktif dengan gambar, nama, pilihan jenis akun dan masa aktif, harga mengikuti pilihan. Varian tanpa stok ditandai Habis dan tombol Beli nonaktif. | P0 |
| B-02 | Pilih varian | Pembeli memilih jenis akun (Sharing/Private) dan masa aktif (1, 3, 7, 14 hari, 1 bulan). | P0 |
| B-03 | Daftar perangkat | Wajib: jenis perangkat (Komputer/HP), kota/kabupaten, nama panggilan, nomor WhatsApp (9–13 digit, dinormalisasi ke 62xxx). | P0 |
| B-04 | Buat pesanan | Membuat order `draft` dengan kode order (contoh GR-7K2M9) dan token rahasia, lalu memesan slot akun. Bila stok habis saat itu, tampil pesan dan kembali ke katalog. | P0 |
| B-05 | Metode bayar | Hanya metode aktif dari pengaturan admin; nominal ditampilkan jelas. | P0 |
| B-06 | Detail pembayaran | Rekening/e-wallet: nomor, nama pemilik, tombol Salin. QRIS: gambar dan tombol Unduh. | P0 |
| B-07 | Upload bukti | "Saya sudah bayar" membuka halaman upload. File JPG, PNG, atau PDF maks. 5 MB, wajib; pratinjau, ganti file, pesan error format/ukuran. Disimpan di bucket privat. Tombol Kirim bukti mengubah status ke `waiting_verification` (idempoten) dan memicu notifikasi WhatsApp. | P0 |
| B-08 | Halaman tunggu | Hitung mundur 10 menit, status realtime, tombol Hubungi Admin (wa.me dengan kode order). Setelah 10 menit: pesan terlambat, pesanan tidak dibatalkan. | P0 |
| B-09 | Halaman hasil | Tampil bila `verified`: email, password, ketentuan produk, tombol Salin per field. | P0 |
| B-10 | Sekali tampil | Kredensial dibuka lewat "Tampilkan akun"; server menandai `credentials_viewed_at` dan menolak permintaan berikutnya. Pembeli wajib mencentang "sudah menyimpan" sebelum Selesai. | P0 |
| B-11 | Kode authenticator | Tombol Ambil Kode. Sistem tidak menampilkan kode yang sedang berjalan, tetapi kode berikutnya: pembeli melihat loading "Menunggu kode berikutnya aktif" dengan hitung mundur, lalu kode tampil dengan sekitar 30 detik penuh. Hanya sekali, tidak bisa diminta ulang; kode habis → pesan Hubungi Admin. Klik pertama menjadi awal masa aktif akun. | P0 |
| B-12 | Pesanan ditolak | Tampil alasan admin, tombol kembali ke pembayaran atau Hubungi Admin. | P0 |
| B-13 | Pulihkan pesanan | Kembali lewat `/order/<kode>?t=<token>` (localStorage; admin bisa mengirim ulang tautan lewat WhatsApp). | P1 |
| B-14 | Responsif | Nyaman di HP 360 px ke atas; target sentuh minimal 44 px. | P0 |

Cara kerja B-11 di server. Kode TOTP berganti tiap 30 detik. Saat pembeli menekan Ambil Kode pada detik ke-x dari jendela berjalan, server menunggu sampai awal jendela berikutnya (maksimal 30 detik, rata-rata 15), lalu mengirim kode jendela itu bersama waktu berakhirnya. Waktu hitung mundur diambil dari server, bukan dari jam browser. Agar pembeli sempat login, tombol baru boleh ditekan setelah ia mencentang bahwa halaman kode authenticator sudah terbuka.

## 4. Kebutuhan fungsional: admin

Panel di `/admin`, hanya untuk user Supabase Auth yang terdaftar di tabel `admins`.

| ID | Kebutuhan | Aturan dan kriteria selesai | Prioritas |
|---|---|---|---|
| A-01 | Login admin | Email + password (MFA disarankan); sesi berakhir otomatis; hanya yang ada di `admins`. | P0 |
| A-02 | Daftar verifikasi | Tab Menunggu / Terverifikasi / Ditolak dengan jumlah. Kolom: kode order, waktu, perangkat, kota, nama, WhatsApp (wa.me), produk + varian, harga, metode, bukti, status. Menunggu lebih dari 10 menit ditandai Terlambat. | P0 |
| A-03 | Lihat bukti | Tombol Lihat bukti membuka gambar/PDF lewat tautan bertanda waktu (berlaku beberapa menit) di samping data pesanan. | P0 |
| A-04 | Verifikasi | Konfirmasi dulu; status `verified`, akun terkunci ke pesanan, realtime ke pembeli. Dicatat siapa dan kapan. | P0 |
| A-05 | Tolak | Wajib alasan; slot dikembalikan; pembeli melihat alasan. | P0 |
| A-06 | Realtime dan bunyi | Pesanan baru muncul tanpa refresh dengan bunyi dan badge di judul tab. | P1 |
| A-07 | Kelola produk | Tambah/ubah/nonaktifkan produk: nama, gambar, ketentuan produk (termasuk kebijakan refund), urutan. | P0 |
| A-08 | Kelola varian | Atur jenis akun × masa aktif dan harga per varian. | P0 |
| A-09 | Kelola akun | Tambah akun: email, password, secret TOTP, pilih varian, atur stok (angka atau Tak terbatas). Tampilkan terpakai/stok dan riwayat pesanan tiap akun. | P0 |
| A-10 | Impor massal | Unggah CSV (email, password, secret, varian, stok) dengan pratinjau dan validasi. | P1 |
| A-11 | Metode bayar | Aktif/nonaktif, nama pemilik, nomor, gambar QRIS, urutan. | P0 |
| A-12 | Peringatan stok | Penanda merah bila sisa slot varian di bawah ambang (default 5). | P1 |
| A-13 | Ganti/nonaktifkan akun | Tandai akun bermasalah; pesanan yang belum dibuka dialihkan ke akun lain varian sama; yang sudah dibuka diproses refund. | P1 |
| A-14 | Penanganan akun lupa disimpan | Admin memeriksa bukti belum pernah login, lalu dapat mengirim ulang kredensial; aksi tercatat. | P1 |
| A-15 | Log audit | Setiap verifikasi, penolakan, perubahan akun, dan pembukaan password/secret tercatat. | P0 |
| A-16 | Ekspor | Ekspor pesanan ke CSV. | P2 |

Password dan secret tersamar di panel; tombol Lihat mencatat log audit.

## 5. Varian, stok, dan aturan alokasi akun

Pembeli memilih varian, bukan akun. Satu varian = jenis akun (Sharing atau Private) + masa aktif (1, 3, 7, 14 hari, atau 1 bulan) + harga. Pesanan hanya dilayani akun dari varian yang persis sama; akun varian lain tidak pernah dipakai walau stoknya masih ada.

**Aturan**

- Admin memasukkan akun (email, password, secret authenticator), memilih varian, dan mengatur stok (angka atau tak terbatas).
- Pembeli memilih jenis akun dan masa aktif; sistem mengambil akun pertama pada varian itu yang stoknya masih ada.
- Akun yang sama terus dipakai sampai stoknya habis, lalu otomatis pindah ke akun berikutnya pada varian dan harga yang sama (urut `priority`, lalu waktu dibuat).
- Pada satu varian, akun dengan stok terbatas didahulukan; akun tak terbatas menjadi cadangan terakhir di varian itu.
- Bila semua akun varian itu habis, varian ditandai Habis. Sistem tidak pernah beralih ke varian lain.
- Slot dipesan saat pesanan dibuat (bukan saat verifikasi) agar dua pembeli tidak mendapat slot yang sama.
- Slot dikembalikan bila pesanan `rejected` atau `expired`, atau bila akun dinonaktifkan dan pesanan dipindah.

**Contoh**

| Akun | Masa aktif | Stok | Perilaku |
|---|---|---|---|
| Akun A | 1 bulan | 20 | Dipakai pertama, sampai 20 pesanan |
| Akun C | 1 bulan | 20 | Dipakai setelah A habis (varian sama) |
| Akun B | 1 hari | Tak terbatas | Varian berbeda: tidak dipakai untuk pesanan 1 bulan |

Masa aktif. Dihitung sejak pembeli pertama kali login / mengambil kode (klik pertama Ambil Kode). Sistem mencatat `access_started_at` dan `access_expires_at` di pesanan; sebelum klik pertama, masa aktif belum berjalan.

Implementasi. Alokasi berjalan atomik di satu transaksi Postgres lewat RPC, bukan di React.

Fungsi `release_account` melakukan kebalikannya. Pesanan `draft` yang lewat 30 menit dilepas oleh pg_cron tiap menit.

## 6. Notifikasi WhatsApp Business

Saat pembeli menekan Kirim bukti, server mengirim pesan WhatsApp ke satu nomor admin berisi kode order, produk dan varian, nominal, metode, dan tautan panel. Cara resmi yang direkomendasikan: WhatsApp Business Platform (Cloud API) dari Meta, dipanggil dari Supabase Edge Function.

**Alur teknis**

- Frontend mengunggah bukti ke Storage (bucket privat), lalu memanggil RPC `submit_payment(order_id, token, file_path)`; status menjadi `waiting_verification`.
- Database webhook memicu Edge Function `notify-admin`.
- Edge Function memanggil Cloud API dengan template pesan; token disimpan sebagai secret Supabase, tidak pernah di frontend.
- Hasil kirim disimpan di tabel `notifications`; gagal dicoba ulang 3 kali.
- Bila tetap gagal, pesanan tetap muncul di panel dan ditandai "notifikasi gagal".

**Yang perlu disiapkan**

- Akun Meta Business dan nomor telepon khusus untuk WhatsApp Business API.
- Template pesan kategori utilitas yang disetujui Meta, misalnya: "Pesanan {{1}} menunggu verifikasi. Produk {{2}}, Rp {{3}}, metode {{4}}. Buka: {{5}}". Pengajuan memakan beberapa hari; mulai sejak Fase 0.
- Biaya dihitung per pesan template; tarif berubah, cek halaman harga resmi Meta sebelum menganggarkan.

Cadangan. Bot Telegram ke admin gratis dan cepat disiapkan bila template Meta tertunda. Gateway WhatsApp tidak resmi tidak disarankan karena risiko nomor diblokir.

Tombol Hubungi Admin di setiap halaman memakai tautan `wa.me/<nomor>?text=...` berisi kode order; tidak butuh API.

## 7. Arsitektur, rute, dan model data

Frontend React + Vite (TypeScript) berbicara ke Supabase. Logika sensitif (alokasi akun, pengambilan kredensial, TOTP, notifikasi) berjalan di server sebagai RPC dan Edge Function, bukan di browser.

| Lapisan | Pilihan | Fungsi |
|---|---|---|
| Frontend | React 18, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS | Halaman pembeli dan panel admin |
| Database | Supabase Postgres + RLS | Data, aturan akses, RPC atomik |
| Auth | Supabase Auth | Login admin saja |
| Realtime | Supabase Realtime | Status pesanan ke pembeli, pesanan baru ke admin |
| Storage | Supabase Storage | Gambar produk dan QRIS (publik); bukti pembayaran (privat, tautan bertanda waktu) |
| Edge Functions | Deno | Notifikasi WhatsApp, TOTP berikutnya, kredensial sekali tampil, tautan bukti |
| Terjadwal | pg_cron | Lepas draft kedaluwarsa, tandai terlambat |
| Hosting | Vercel atau Netlify | Deploy frontend statis |

**Rute**

- Pembeli: `/` katalog, `/beli/:varianId` daftar perangkat, `/order/:kode` (pembayaran, upload bukti, tunggu, hasil sesuai status).
- Admin: `/admin/login`, `/admin/verifikasi`, `/admin/produk`, `/admin/akun`, `/admin/pembayaran`, `/admin/log`.

**Tabel utama**

| Tabel | Kolom kunci | Catatan |
|---|---|---|
| products | id, name, image_url, terms, is_active, sort | Ketentuan produk, termasuk kebijakan refund |
| variants | id, product_id, account_type (sharing/private), duration_days (1/3/7/14/30), price, is_active, sort | Satu varian = jenis akun + masa aktif + harga; itu kategori stok |
| accounts | id, variant_id, email, password_enc, totp_secret_enc, max_uses (null = tak terbatas), used_count, priority, is_active | Password dan secret dienkripsi (Supabase Vault atau pgsodium) |
| orders | id, code, access_token_hash, variant_id, account_id, price, device_type, city, nickname, phone, method_id, status, proof_path, paid_at, verified_at, verified_by, reject_reason, credentials_viewed_at, totp_issued_at, access_started_at, access_expires_at | `code` unik; token hanya disimpan sebagai hash; `totp_issued_at` mencegah pengambilan kode kedua |
| payment_methods | id, name, kind (bank/ewallet/qris), account_number, account_name, qris_image_url, is_active, sort | Dikelola admin |
| admins | user_id, name | Daftar putih admin |
| notifications | id, order_id, channel, status, provider_message_id, attempts | Log kirim WhatsApp |
| audit_logs | id, actor, action, entity, entity_id, meta, created_at | Tidak bisa diubah |

**Akses data (RLS)**

- Pembeli tidak membaca tabel langsung. Semua lewat RPC dengan `order_id` + token: `create_order`, `get_order_status`, `submit_payment`, `reveal_credentials`, `issue_next_totp`.
- Katalog publik: anon hanya membaca `products`, `variants` (tanpa stok internal), dan `payment_methods` aktif lewat view.
- Bucket bukti pembayaran privat: pembeli hanya bisa mengunggah ke jalur pesanannya; hanya admin yang bisa membaca.
- Admin: akses penuh bila `auth.uid()` ada di `admins`.
- Tabel `accounts` tidak pernah bisa dibaca role `anon`.

## 8. Keamanan, kasus tepi, refund, dan non-fungsional

Produk ini menyimpan kredensial akun, jadi kebocoran data adalah risiko terbesar.

**Keamanan**

- Password dan secret TOTP dienkripsi; kunci tidak ada di frontend.
- Kredensial keluar hanya lewat `reveal_credentials` yang memeriksa token, status `verified`, dan `credentials_viewed_at` kosong, lalu menandainya dalam satu transaksi.
- `issue_next_totp` hanya berjalan sekali per pesanan (`totp_issued_at` kosong), memakai waktu server, dan mengisi `access_started_at`.
- Token pesanan acak 32 byte, hanya hash yang disimpan; kode order saja tidak membuka kredensial.
- Rate limit pada pembuatan pesanan, tebak token, dan unggah bukti; batas ukuran dan tipe file diperiksa di server, bukan hanya di browser.
- Admin: password kuat, sebaiknya MFA; semua aksi masuk log audit.
- Halaman hasil memakai `Cache-Control: no-store` dan tidak diindeks mesin pencari.
- Data pribadi pembeli dan bukti pembayaran dihapus atau dianonimkan setelah masa simpan (usulan 12 bulan); sesuaikan dengan UU Pelindungan Data Pribadi.

**Kebijakan refund**

Refund diberikan bila akun bermasalah atau dinonaktifkan oleh pihak OpenAI. Kebijakan ini tampil di Ketentuan Produk dan di halaman hasil. Bentuk refund dan batas waktu klaim belum ditentukan (lihat bagian 9).

**Kasus tepi**

| Situasi | Perilaku yang diharapkan |
|---|---|
| Dua pembeli membeli slot terakhir bersamaan | RPC mengunci baris akun; satu berhasil, yang lain dapat pesan Habis |
| Pembeli menutup halaman setelah bayar | Kembali lewat tautan pesanan; status dan bukti tetap |
| Kirim bukti dua kali | Idempoten: tidak ada notifikasi ganda |
| Unggah gagal di tengah jalan | Status tetap `draft`; pembeli bisa coba lagi |
| File bukan JPG/PNG/PDF atau lebih dari 5 MB | Ditolak di browser dan di server dengan pesan jelas |
| Admin lambat lebih dari 10 menit | Pesanan tetap menunggu, ditandai Terlambat, pembeli diberi tombol Hubungi Admin |
| Nominal kurang atau salah transfer | Admin menolak dengan alasan; pembeli diarahkan ke Hubungi Admin |
| Admin salah menekan Verifikasi | Konfirmasi dua langkah; setelah kredensial dibuka pembeli tidak bisa dibatalkan |
| Pembeli menekan Ambil Kode lalu menutup halaman | Kode tetap dianggap sudah diambil; ditangani manual lewat admin |
| Pembeli menyentuh Ambil Kode saat jendela kode hampir berganti | Server menunggu jendela berikutnya; pembeli tetap mendapat sekitar 30 detik penuh |
| Pembeli lupa menyimpan akun | Ditangani manual: bukti belum pernah login, admin memutuskan kirim ulang (tercatat) |
| Akun dinonaktifkan pihak OpenAI | Admin menonaktifkan akun; pesanan yang belum dibuka dialihkan, yang sudah dibuka mendapat refund |
| Notifikasi WhatsApp gagal | Pesanan tetap masuk panel dan ditandai gagal, dicoba ulang |

**Non-fungsional**

- Kinerja: katalog tampil di bawah 2,5 detik pada 4G; status pesanan berubah di layar pembeli maksimal 3 detik setelah verifikasi.
- Ketersediaan: target 99% per bulan.
- Aksesibilitas: kontras teks minimal 4,5:1, semua kontrol bisa dipakai dengan keyboard.
- Perangkat: Chrome, Safari, Firefox terbaru; HP 360 px ke atas.
- Pencadangan: backup harian database dan uji pemulihan sebelum rilis.
- Pemantauan: pelacak error (misalnya Sentry) di frontend dan Edge Function.

## 9. Metrik, roadmap, risiko, dan hal yang masih perlu ditentukan

Metrik keberhasilan (target awal, sesuaikan setelah ada data)

| Metrik | Target |
|---|---|
| Median waktu dari bukti terkirim sampai verifikasi | di bawah 10 menit |
| Pesanan selesai tanpa chat manual ke admin | di atas 80% |
| Selisih stok (akun terpakai vs tercatat) | 0 |
| Notifikasi WhatsApp terkirim | di atas 98% |
| Pembeli yang berhasil login dengan kode yang ditampilkan | dipantau, belum ada target |

**Roadmap (estimasi satu developer, kasar)**

| Fase | Isi | Estimasi |
|---|---|---|
| 0. Fondasi | Proyek Vite + Supabase, skema, RLS, auth admin, desain dari prototipe, ajukan template WhatsApp | 1 minggu |
| 1. Alur beli | Katalog varian, perangkat, buat pesanan, alokasi akun, pembayaran, upload bukti, halaman tunggu | 2–3 minggu |
| 2. Admin | Verifikasi dengan bukti, produk, varian, akun, metode bayar, realtime, audit | 2 minggu |
| 3. Hasil dan keamanan | Sekali tampil, TOTP berikutnya, enkripsi, rate limit, notifikasi WhatsApp | 1–2 minggu |
| 4. Uji dan rilis | Uji slot terakhir, uji waktu TOTP, uji keamanan, uji di HP asli, soft launch | 1 minggu |
| 5. Fase 2 | Gateway pembayaran, riwayat pesanan, peran admin, laporan | menyusul |

**Risiko**

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kredensial bocor | Sangat tinggi | Enkripsi, RLS ketat, RPC sekali tampil, audit |
| Akun dinonaktifkan pihak OpenAI | Komplain, refund | Ketentuan jelas, penggantian akun, stok per akun konservatif |
| Pembeli salah timing saat kode berikutnya | Kode terlewat, tidak bisa diminta ulang | Instruksi jelas: login dulu, baru Ambil Kode; hitung mundur dari server; Hubungi Admin |
| Admin lambat memverifikasi | Pembeli cemas | Notifikasi cepat, penanda Terlambat, bunyi di panel |
| Template WhatsApp ditolak atau lambat | Notifikasi tertunda | Cadangan Telegram, ajukan dini |
| Bukti pembayaran palsu | Rugi | Admin mencocokkan dengan mutasi, bukan hanya gambar |

**Masih perlu ditentukan**

- Bentuk refund (uang kembali atau akun pengganti) dan batas waktu klaim.
- Apakah harga per varian bisa berbeda antar produk, atau satu tabel harga umum?
- Apakah "Sharing" punya batas jumlah pengguna yang perlu ditampilkan ke pembeli?
- Masa simpan data pembeli dan bukti pembayaran (usulan 12 bulan).
- Pengaman agar pembeli tidak menekan Ambil Kode sebelum siap login (usulan: centang "halaman kode authenticator sudah terbuka").
