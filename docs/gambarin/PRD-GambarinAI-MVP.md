# PRD Gambarin AI — MVP

> **Sumber:** konversi teks dari `PRD-GambarinAI-MVP.docx` (26 Oktober 2026). Isi tabel dan ketentuan fungsional mengikuti naskah Word. Tiga gambar referensi ada pada `references/`.
> **Prioritas:** klarifikasi produk terbaru dalam `DECISIONS.md` mengatasi perbedaan pada bahan lama.

PRODUCT REQUIREMENTS DOCUMENT

Image Generator sebagai bonus produk digital GreenroomID

> LINGKUP: MVP SAJA • TARGET: greenroomid.com/GambarinAI • PEMILIK PRODUK: GreenroomID

Referensi tampilan Studio — tata letak, palet, dan proporsi komponen; bukan daftar fitur yang wajib diikuti.

| Identitas dokumen | Nilai |
| --- | --- |
| Versi | 1.0 — MVP |
| Tanggal | 26 Oktober 2026 |
| Status | Spesifikasi produk siap untuk estimasi dan implementasi; verifikasi API masih diperlukan |
| Sistem induk | GreenroomID (React + Vite + Supabase) |

## 1. Ringkasan produk

Gambarin AI adalah fasilitas pembuat gambar berbasis prompt teks yang diberikan sebagai bonus kepada pelanggan produk digital GreenroomID. Pengguna hanya boleh mengakses layanan dengan akun Gambarin AI yang dibuat admin; akun Google GreenroomID tidak memberikan akses otomatis. Pembelian paket, penambahan jatah, dan masa aktif dikelola manual oleh admin.

Produk berada langsung pada URL /GambarinAI di domain GreenroomID. Infrastruktur GreenroomID yang sudah ada dipakai ulang, tetapi sesi login Gambarin AI dipisahkan dari sesi akun Google pada layanan utama.

> Prinsip MVP: prompt → antrian → gambar → simpan lokal / unduh / simpan ke Google Drive. Pengguna tidak memilih model AI dan tidak melihat jumlah kredit Jennabot.

## 2. Tujuan dan batas lingkup

### 2.1 Tujuan produk

- Memberikan bonus image generation yang sederhana untuk pelanggan aktif, dengan jatah foto berbasis paket 1, 3, 7, 14, dan 30 hari.
- Mengendalikan biaya penyedia AI: model dipilih otomatis oleh server dan tidak boleh melebihi 2 kredit per output.
- Memungkinkan admin membuat akun, mengubah default jatah foto, menambah jatah individu, memperpanjang/reaktivasi, serta memantau antrian dan saldo penyedia.
- Menghindari penyimpanan berkas gambar pada server atau Supabase Storage; galeri lokal pengguna berada di browser.
### 2.2 Termasuk dalam MVP

- Halaman publik /GambarinAI, login khusus, Studio, hasil dan riwayat lokal, ringkasan akun.
- Dashboard admin Gambarin AI sebagai bagian dari dashboard admin GreenroomID.
- Satu integrasi Jennabot Developer API; pemilihan model termurah, antrean FIFO maksimum 20 job aktif, dan pelacakan status.
- Google Drive: simpan hasil hanya setelah pengguna memilihnya dan menyetujui izin Google.
- Popup kepuasan dan saran opsional setelah keberhasilan generate.
### 2.3 Tidak termasuk dalam MVP

- Checkout atau payment gateway untuk jatah foto; pembelian dan top-up dilakukan melalui admin.
- Pilihan model / tier, mode kualitas berbayar, image editing lanjutan, video, audio, dan chat.
- Penyimpanan permanen gambar, riwayat percakapan, atau sinkronisasi galeri antarperangkat di Supabase.
- Auto-save Google Drive, langganan mandiri, API multi-penyedia, serta ekspansi produk lain.
## 3. Pengguna dan wewenang

| Peran | Akses yang boleh dilakukan |
| --- | --- |
| Pengunjung | Buka /GambarinAI dan melihat halaman masuk; tidak dapat generate. |
| Pengguna Gambarin aktif | Masuk dengan username + password khusus; generate jika kuota dan masa berlaku mencukupi; unduh/simpan hasil. |
| Pengguna kedaluwarsa/nonaktif | Masuk untuk melihat status, bila kebijakan membolehkan, tetapi tombol Generate terkunci dan diarahkan untuk menghubungi admin. |
| Admin GreenroomID | Mengelola paket, akun, jatah, masa aktif, antrian, log, model eligible, dan konfigurasi Jennabot. |

## 4. Autentikasi dan kontrol akses

Gambarin AI menggunakan identitas username/password yang hanya diprovisikan admin. Tidak ada registrasi mandiri, login Google, atau fitur lupa password berbasis email pada halaman Gambarin AI; reset kredensial dilakukan admin. Google hanya digunakan untuk mendapatkan izin Google Drive ketika pengguna memilih menyimpan hasil.

- Sesi Gambarin AI harus terisolasi dari sesi Google Auth GreenroomID. Login ke satu layanan tidak boleh menimpa atau memvalidasi sesi layanan lain.
- Akses generation API, pembacaan job, dan pengecekan kuota harus divalidasi oleh server berdasarkan identitas Gambarin AI dan status entitlement, bukan berdasarkan tampilan browser.
- Kredensial disimpan melalui mekanisme autentikasi dengan hash password yang aman; jangan simpan password plaintext dalam tabel aplikasi atau log.
- Admin boleh membuat akun baru, reset password, menonaktifkan sementara, reaktivasi, dan memutus sesi akun bila diperlukan.
- Jika masa berlaku habis atau kuota nol, halaman tetap menampilkan status serta cara menghubungi admin, tetapi menolak job baru.
### 4.1 Pola implementasi pada codebase

Gunakan satu aplikasi React/Vite yang sama. Buat modul fitur tersendiri (disarankan src/features/gambarin/), route publik /GambarinAI, dan subbagian Gambarin AI di /admin. Supabase Auth dapat digunakan untuk identitas khusus berpassword dengan pemisahan sesi/client serta pemetaan username secara aman di backend; detail provisioning disahkan ketika desain autentikasi diuji. Jangan mengganti atau merusak Google OAuth yang sudah ada.

## 5. Paket bonus dan kuota foto

Anggaran awal menggunakan 2.000 kredit Jennabot untuk 40 pengguna sasaran. Usulan default di bawah menggunakan cadangan biaya maksimal 2 kredit per gambar, sehingga masih tersedia penyangga. Ini nilai awal yang dapat diubah admin kapan saja, bukan harga/tier yang dijual kepada pengguna.

| Durasi | Target akun | Foto / akun | Total foto | Estimasi kredit (maks. 2/foto) |
| --- | --- | --- | --- | --- |
| 1 hari | 5 | 4 | 20 | 40 |
| 3 hari | 5 | 8 | 40 | 80 |
| 7 hari | 5 | 14 | 70 | 140 |
| 14 hari | 5 | 20 | 100 | 200 |
| 30 hari | 20 | 35 | 700 | 1.400 |
| TOTAL | 40 | — | 930 | 1.860 |

> Anggaran awal 2.000 kredit − alokasi maksimal 1.860 kredit = cadangan 140 kredit (7%). Perhitungan ini adalah proyeksi, bukan jaminan saldo penyedia.

### 5.1 Aturan kuota

- Setiap user memiliki total alokasi gambar, jumlah gambar sukses terpakai, reservasi job yang belum terminal, dan sisa jatah. Rumus tampilan: sisa = total alokasi − sukses terpakai − reservasi aktif.
- Satu permintaan menghasilkan satu gambar dan mencadangkan satu jatah pada saat submit. Kuota final berkurang hanya ketika gambar berhasil.
- Jika job gagal final atau dibatalkan sebelum dikirim ke penyedia, reservasi dilepas. Kegagalan tidak mengurangi jatah foto.
- Admin dapat mengubah default jatah pada konfigurasi paket. Perubahan default hanya berlaku untuk aktivasi baru, kecuali admin secara eksplisit mengubah akun yang sudah ada.
- Admin dapat menambah/mengurangi jatah per akun; semua perubahan dicatat sebagai transaksi ledger dengan pelaku, waktu, dan alasan.
- Perhitungan estimasi penggunaan kredit harus diperbarui saat default atau jatah individual diubah. Jika estimasi melebihi saldo/anggaran, tampilkan peringatan dan minta konfirmasi admin.
### 5.2 Masa aktif

- Masa aktif dimulai tepat ketika admin mengaktifkan bonus; waktu sistem WIB/Asia/Jakarta untuk penampilan, database menyimpan timestamp UTC.
- Perpanjangan ketika aktif dihitung mulai expiry lama; akun kedaluwarsa dihitung dari waktu aktivasi ulang. Admin dapat mengubah expiry langsung jika diperlukan.
- Job yang sah dan sudah dicadangkan sebelum expiry boleh diselesaikan; expiry melarang submit job baru.
## 6. Alur pengguna

| Langkah | Interaksi dan respons sistem |
| --- | --- |
| 1. Akses | Klik card Gambarin AI dari landing → buka greenroomid.com/GambarinAI. |
| 2. Login | Masukkan username dan password khusus → server memvalidasi akun dan masa aktif. |
| 3. Tulis prompt | Pengguna mengetik instruksi gambar. Pengaturan model dan kredit tidak diperlihatkan. |
| 4. Submit | Backend cek jatah + status + kapasitas, reservasi 1 foto, buat job FIFO secara atomik. |
| 5. Pantau | Lihat status Menunggu / Diproses / Selesai / Gagal; posisi antrian dan hasil diperbarui. |
| 6. Hasil | Gambar ditampilkan lalu diunduh ke browser/IndexedDB; pop-up rating & saran bisa dilewati. |
| 7. Simpan | Pengguna bisa Download atau klik Simpan ke Google Drive dan menyetujui akses Drive. |
| 8. Kuota habis | Generate diblokir, muncul pemberitahuan “Hubungi admin untuk tambahan jatah atau perpanjangan”. |

### 6.1 Status yang harus ditampilkan

queued (menunggu, ada posisi), submitting (mengirim), running (sedang dibuat), succeeded (selesai), failed (gagal, jatah kembali), cancelled (dibatalkan sebelum provider menerima). Tampilan tidak boleh membuat persentase progres pasti jika API hanya menyediakan status tanpa persentase.

## 7. Spesifikasi UI pengguna

Gunakan gaya visual gambar referensi 1: latar putih/abu terang, kartu rounded besar, aksen navy/biru, ikon sederhana, tipografi ringkas, whitespace luas, dan fokus pada pratinjau hasil. Acuan merupakan inspirasi tata letak, bukan kewajiban menyalin semua pilihan pada gambar.

UI-01 — Referensi Studio pengguna (diberikan pemilik produk).

### 7.1 Struktur desktop

| Bagian | Isi MVP |
| --- | --- |
| Header ringan | Logo/nama Gambarin AI, status jatah foto, masa aktif, akses akun/logout. |
| Kiri: form generator | Textarea prompt (wajib), tombol Generate; prompt examples kecil boleh hanya placeholder bantuan. Tidak ada pemilih model, style, tier, dan biaya. |
| Tengah: workspace | Empty state bersih, preview gambar selesai, indikator status dan posisi antrian, aksi Unduh serta Simpan ke Google Drive. |
| Kanan: aktivitas | Daftar job saat ini dan thumbnail history lokal IndexedDB dari browser yang sama. |
| Bawah: hasil lokal | Grid hasil terakhir yang tersedia di browser, dengan akses buka/unduh/simpan Drive. |

### 7.2 Mobile dan kondisi khusus

- Mobile: satu kolom dengan urutan prompt → tombol Generate → preview/status → hasil lokal; panel riwayat dapat dilipat. Tidak boleh ada scroll horizontal halaman.
- Tampilkan keadaan loading, belum pernah generate, antrian penuh, offline, jatah nol, expired, provider sibuk, saldo habis, gagal, serta browser tanpa penyimpanan lokal.
- Tombol Generate dinonaktifkan ketika request sedang diajukan untuk mencegah double-submit, dan server tetap menggunakan idempotency key.
## 8. Spesifikasi UI admin

Admin Gambarin AI ditempatkan sebagai bagian dari navigasi admin GreenroomID. Gaya visual mengikuti referensi 2 untuk dashboard ringan dan referensi 3 untuk tabel manajemen; elemen finansial SaaS seperti MRR, churn, checkout, dan billing cycle tidak dipakai.

UI-02 — Referensi ringkasan admin.

UI-03 — Referensi tabel manajemen akun/paket.

### 8.1 Halaman Ringkasan

- Kartu KPI: akun aktif, akun akan habis, job sedang berjalan, job menunggu, gambar berhasil hari ini, saldo kredit Jennabot jika endpoint tersedia.
- Grafik ringkas: gambar sukses per hari dan status job; sertakan waktu terakhir sinkronisasi provider.
- Peringatan operasional: saldo rendah, langganan/akses provider bermasalah, antrian penuh, job macet, atau ada akun akan kedaluwarsa.
### 8.2 Halaman Akun & Paket

- Tabel yang dapat dicari/filter: username, durasi paket, tanggal aktivasi/berakhir, total kuota, terpakai, reservasi, sisa, status, dan aksi.
- Form admin: Buat Akun, Reset Password, Aktivasi, Nonaktifkan, Reaktivasi, Tambah/Kurangi Foto, Tambah Masa Aktif, serta Edit Default Kuota Paket.
- Kredensial awal hanya tampil sekali setelah dibuat, dapat disalin untuk dikirim manual ke pembeli; jangan ditampilkan ulang sebagai plaintext.
### 8.3 Halaman Antrian & API

- Tabel job global: nomor urut, username, waktu submit, status, model provider (admin saja), kredit aktual, attempt, error ringkas; filter dan jeda worker.
- FIFO ketat: tidak ada fitur “Dahulukan” yang mengubah urutan pengguna. Admin dapat membatalkan job yang masih queued atau melanjutkan worker yang dijeda.
- API: status koneksi, saldo tersinkronisasi jika tersedia, model eligible maksimum 2 kredit, batas concurrency hasil uji, tombol uji koneksi dan tautan top-up manual Jennabot.
## 9. Antrian, pemilihan model, dan job worker

### 9.1 Aturan pemilihan model

- Backend mengambil katalog harga model resmi dari Jennabot atau daftar harga yang sudah diverifikasi admin; jangan hardcode model tanpa pemeriksaan tarif.
- Hanya model image generation dengan harga terverifikasi 1–2 kredit per output yang boleh dipakai; biaya >2 atau harga tidak diketahui = tidak eligible.
- Urutkan model eligible berdasarkan harga terendah; untuk harga sama, gunakan urutan preferensi admin yang telah diuji kualitas/fungsinya.
- Jika model A mengalami busy yang spesifik model dan provider mengizinkan, coba model eligible berikutnya. Jika busy bersifat slot akun global, tunggu di antrian, jangan berulang kali mengganti model.
- Jika tidak ada model eligible, jangan kirim request dan jangan potong kuota; tampilkan layanan sementara tidak tersedia.
### 9.2 Aturan antrian

- Kapasitas maksimum 20 outstanding job global (queued + submitting + running), dengan antrean FIFO berdasarkan timestamp server dan nomor urut monotonik.
- Concurrency awal 1. Naikkan sampai maksimum 3 hanya setelah pengujian API menunjukkan paralel benar-benar didukung untuk akun dan metode pembayaran yang dipakai. Bila 409/slot busy, worker serial.
- Transaksi submit harus atomik: cek status akun, masa aktif, sisa kuota, kapasitas, buat reservasi, dan rekam job. Dua klik bersamaan tidak boleh mengurangi jatah dua kali tanpa job valid.
- Worker tidak bergantung pada browser yang tetap terbuka. Setelah job memperoleh ID Jennabot, pemantauan memakai ID tersebut dan tidak mengirim generate baru untuk pekerjaan yang sama.
- Batalkan hanya sebelum job dikirim ke provider. Job yang sudah berjalan tidak boleh dibatalkan secara lokal seolah biaya pasti dikembalikan.
### 9.3 Retry, error, dan pemulihan

| Kondisi | Perilaku minimum |
| --- | --- |
| 429 / rate limit | Tunda sesuai backoff/Retry-After bila tersedia. Pertahankan posisi FIFO yang belum dikirim. |
| 409 / slot busy | Jangan anggap gagal; tunggu slot. Kurangi concurrency ke 1 bila busy global. |
| Jaringan putus / timeout | Cek apakah remote job sudah dibuat sebelum submit ulang; idempotency wajib. |
| Gagal provider final | Coba ulang paling banyak 2 kali jika provider menjamin aman; jika gagal final, lepaskan reservasi. |
| Saldo tidak cukup / akses mati | Jeda dispatch, pertahankan antrian dan reservasi; tampilkan peringatan admin. |
| Browser ditutup | Worker tetap menyelesaikan job. Saat browser kembali, status dan aset yang masih tersedia di Jennabot diambil kembali. |

## 10. Data dan penyimpanan

Tidak ada gambar yang diunggah ke Supabase Storage. Database hanya menyimpan data yang diperlukan untuk akses, entitlement, antrian, keandalan, dan audit. Prompt boleh tersimpan sementara selama job perlu dikirim/di-retry lalu dihapus dari catatan operasional pada akhir siklus pekerjaan. Tidak ada penyimpanan riwayat chat.

| Entitas / tabel disarankan | Isi inti |
| --- | --- |
| gambarin_packages | duration_days, default_image_quota, active, updated_by. |
| gambarin_accounts | auth_user_id, username unik, status, activated_at, expires_at, package_id. |
| gambarin_quota_ledger | account_id, delta (alokasi/penyesuaian/pemakaian), alasan, actor, job_id, created_at. |
| gambarin_jobs | job_id, account_id, sequence, status, prompt sementara, remote_job_id, remote_asset_id, reserved, actual_cost, attempts, timestamps. |
| gambarin_config | queue_limit=20, concurrency=1..3, eligible model rules, pause switch, admin budget. |
| gambarin_feedback | job_id, rating opsional, saran opsional, created_at. |

### 10.1 Browser dan Google Drive

- Berkas hasil disimpan sebagai Blob pada IndexedDB milik origin greenroomid.com. Riwayat lokal hanya pada browser/perangkat tersebut dan dapat hilang jika data browser dibersihkan.
- Tombol Download harus tersedia meski IndexedDB penuh/tidak didukung; pengguna mendapat peringatan jika penyimpanan lokal gagal.
- Simpan ke Google Drive dilakukan hanya setelah user menekan tombol. Minta OAuth Google dengan scope minimal yang memadai (misalnya drive.file) untuk membuat file melalui aplikasi.
- Otorisasi Drive terpisah dari login Gambarin AI dan Google Auth utama; token Drive dipakai sementara di sisi klien untuk upload yang disetujui user, tidak disimpan sebagai refresh token di server.
- Jika sesi Google Drive belum terhubung/expired, tampilkan “Hubungkan Google Drive”, minta izin, lalu lanjutkan penyimpanan setelah user menyetujui.
- Jika browser ditutup sebelum hasil tersimpan, pemulihan hanya tersedia selama Jennabot masih menyediakan aset. Jangan menjanjikan galeri permanen.
### 10.2 Retensi metadata

Minimal metadata job dan transaksi kuota tetap ada untuk integritas kuota dan audit. Prompt teks dan URL sementara dihapus sesegera mungkin setelah tidak dibutuhkan; ID aset remote boleh dipertahankan sebatas jendela pemulihan yang diizinkan Jennabot. Jadwal cleanup harus otomatis, tanpa menyimpan bytes gambar di server.

## 11. Keamanan dan privasi

- Jennabot API key berada di Supabase Edge Function secrets saja; tidak masuk frontend, repository, log, atau respons publik. Akses admin pada endpoint server diverifikasi menggunakan identitas/role GreenroomID.
- Hak pengguna Gambarin dibatasi ke akun dan job sendiri. Terapkan RLS atau fungsi backend terkunci; tidak boleh melihat prompt, aset, saldo kredit atau metadata akun lain.
- Token/session admin GreenroomID dan sesi Gambarin terpisah; Google Drive meminta consent independen. Terapkan rate limit dan proteksi brute force pada endpoint login dan submit.
- Semua mutasi kuota dan masa aktif lewat backend atomik disertai audit log, bukan update langsung dari browser.
- Keluaran model harus melalui validasi respons serta pembatasan ukuran MIME unduhan/penyimpanan; output yang ditolak penyedia tidak mengurangi jatah gambar.
- Tampilkan informasi privasi: gambar di browser dan/atau Jennabot hingga masa retensinya, tidak di server GreenroomID; Google Drive menyimpan sesuai izin dan kebijakan akun Google user.
## 12. Kontrak integrasi Jennabot dan keputusan bersyarat

Penyedia tunggal MVP: Jennabot Developer API. Dokumentasi yang ditunjuk pemilik produk adalah https://jennabot.pro/docs. Situs pemasaran Jennabot menyebut image generation mulai 1 poin/gambar, tetapi itu tidak membuktikan harga per model maupun kapasitas paralel API. Detail berikut wajib dibuktikan dengan dokumentasi resmi atau uji sandbox sebelum production.

| Butir verifikasi | Kriteria implementasi |
| --- | --- |
| Autentikasi API | API key server-side, scope generation read/write dan balance jika disediakan. |
| Katalog model dan tarif | Respons tarif terverifikasi; hanya model biaya <=2 kredit per output yang diaktifkan. |
| Submit dan status job | Endpoint create, ID job, status terminal dan URL/asset ID dapat dipakai untuk retry-safe. |
| Batas paralel | Uji concurrency 1 → 2 → 3; gunakan angka terbukti, selain itu serial. |
| Saldo kredit | Dashboard admin sinkron jika API balance tersedia; jika tidak, status “Tidak tersedia”, bukan angka rekaan. |
| Top-up | Tombol membuka halaman Jennabot yang benar-benar mendukung isi ulang; proses tetap manual. |
| Retensi gambar | Pastikan apakah aset/URL dapat di-resolve ulang ketika browser ditutup. |
| Hak penggunaan | Pastikan persetujuan tertulis untuk melayani pelanggan GreenroomID memakai API/akun Jennabot. |

Tidak menggunakan MCP Remote OAuth sebagai autentikasi end-user Gambarin AI. MCP dapat digunakan developer untuk alat bantu pengujian, tetapi aplikasi web berkomunikasi melalui Developer API.

## 13. Kriteria penerimaan (Definition of Done MVP)

| ID | Pengujian wajib dan hasil yang diharapkan |
| --- | --- |
| AC-01 | Pengguna tanpa akun buatan admin, meski login Google GreenroomID, ditolak dari Gambarin AI. |
| AC-02 | Pengguna dengan username/password Gambarin aktif dapat membuka Studio tanpa mengubah sesi Google GreenroomID. |
| AC-03 | User expired, nonaktif, atau jatah nol tidak dapat submit job baru. |
| AC-04 | Admin membuat akun dan memberi paket 1/3/7/14/30 hari; aktivasi mulai saat admin menekan aktivasi. |
| AC-05 | Admin mengubah default paket dan top-up akun tertentu; ledger dan sisa jatah akurat setelah reload. |
| AC-06 | Serangan double-submit atau submit bersamaan tidak memunculkan overspend kuota maupun job ganda. |
| AC-07 | Global job outstanding tidak pernah lebih dari 20; job diproses sesuai urutan FIFO. |
| AC-08 | Tidak ada model >2 kredit atau tidak terverifikasi yang dipanggil melalui API. |
| AC-09 | Jika paralel tidak didukung, job tuntas satu per satu tanpa 409 berulang yang tidak terkendali. |
| AC-10 | Job sukses memakai 1 jatah foto; job gagal final/batal queued mengembalikan reservasi. |
| AC-11 | User melihat hasil, unduh, dan galeri IndexedDB; server tidak menyimpan gambar. |
| AC-12 | Simpan Google Drive meminta izin terpisah dan berhasil tanpa mengubah sesi Gambarin AI. |
| AC-13 | Browser ditutup saat queued/running tidak menghentikan worker; status kembali saat dibuka ulang. |
| AC-14 | Admin melihat saldo jika API mendukung, antrian, akun, log, dan tombol top-up manual. |
| AC-15 | Popup rating/saran boleh dilewati dan tidak menghalangi akses hasil gambar. |
| AC-16 | Pemeriksaan desktop/mobile, error provider, RLS, pemisahan sesi, dan build proyek GreenroomID lulus. |

## 14. Ketergantungan untuk mengaktifkan MVP

- Akun dan API key Jennabot yang aktif, saldo/limit yang cukup, serta daftar model eligible dan harga per output yang benar-benar terverifikasi.
- Hasil uji kontrak Jennabot untuk submit/status/asset, concurrency, saldo, dan retensi; bila kemampuan tidak tersedia, gunakan fallback yang ditetapkan di dokumen.
- Persetujuan penggunaan komersial layanan melalui website untuk banyak pelanggan (di luar hak komersial atas hasil gambar).
- Supabase Edge Functions dan mekanisme job scheduler yang mampu bekerja tanpa browser terbuka; konfigurasi RLS dan domain OAuth Google Drive.
- Admin menyediakan kanal kontak untuk pembelian/penambahan jatah secara manual dan pengelolaan saldo Jennabot.
## 15. Referensi dan aturan prioritas

Prioritas persyaratan: (1) klarifikasi terbaru pemilik produk dalam percakapan GreenroomID; (2) tiga gambar UI yang diunggah tanggal 26 Oktober 2026 sebagai referensi visual; (3) dokumen “Kilau Studio — Panduan Tampilan” sebagai inspirasi lama; (4) dokumentasi dan respons aktual Jennabot untuk kontrak teknis. Ketika dokumen UI lama memuat login Google sebagai akses utama Gambarin, pemilih model, kuota harian, dan antrian round-robin, hal tersebut tidak berlaku.

Sumber teknis dan referensi:

- GreenroomID GitHub: https://github.com/fajarsiddiqui/GreenroomID — struktur React/Vite, route publik/admin, dan Supabase.
- Jenna Bot developer documentation: https://jennabot.pro/docs — kontrak rinci perlu diperiksa oleh implementer.
- Jennabot public website: https://www.jennabot.pro/ — informasi pemasaran model kredit “mulai 1 poin/gambar”; bukan kontrak harga per model.
- Referensi UI pemilik produk: image(1).png, image(2).png, image(3).png; panduan lama Kilau-Studio-Panduan-Tampilan.pdf.
> Dokumen ini hanya mendefinisikan MVP Gambarin AI pada GreenroomID. Tidak mencakup roadmap, fase produk lanjutan, atau backlog enhancement.


## Lampiran visual utama

- [Studio pengguna](references/ui-studio.png) — acuan layout dan nuansa visual, **bukan** kewajiban menampilkan pilihan Style/Model.
- [Ringkasan admin](references/ui-admin-dashboard.png) — acuan grafik/kartu ringkas.
- [Manajemen akun admin](references/ui-admin-accounts.png) — acuan tabel akun/paket dan aksi admin.
