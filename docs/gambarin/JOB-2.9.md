# Job 2.9 — hasil dan aktivasi

STATUS: **PARTIAL** — backend terpasang; autentikasi wake-up dan akses ulang REST belum terverifikasi penuh.

## State live yang diperiksa

Proyek `qhucajoygbexzpraxzlk`, 27 Oktober 2026. Sebelum dan sesudah deployment: dispatcher PAUSED/idle, tanpa job atau request aktif. Job kedua `c21e34f7-eb64-4d5b-a286-2feec31aafd2` tetap queued; dua job succeeded. Tidak ada request terbuka; recovered_unknown insiden lama sudah ditutup. Akun uji quota granted/used/reserved=8/2/1; akun lain 5/0/0. Kuota tidak diubah.

Worker sebelumnya v15, sekarang **v16** dengan platform JWT verification tetap true. Migration 007–008 diterapkan langsung lewat CLI SQL khusus Gambarin. Login v6, enqueue v6 dan customer asset v1 tidak diubah. Frontend produksi tidak dideploy.

## Worker

- Enqueue dan reservasi existing tetap atomik. Trigger AFTER INSERT memasang satu cron dan wake-up pg_net di transaksi yang sama. pg_net baru mengirim HTTP setelah commit; rollback tidak menyisakan wake-up.
- Cron `gambarin-activity-worker` melakukan tick database tiap 30 detik selama pending. Bila HTTP wake-up gagal atau worker crash, cron tetap ada; tick berikutnya mencoba lagi. Lease singleton existing membatasi satu worker/provider request aktif. Submit ambigu tidak diulang.
- Tick mengambil lock dispatcher yang sama dengan enqueue sehingga transisi idle tidak kehilangan job baru. Saat idle/PAUSED/recovery/submission_unknown, tick menghapus cron tanpa memanggil Edge Function. Job baru atau perubahan PAUSED→aktif membangunkan kembali scheduler bila konfigurasinya lengkap.
- Cron dibersihkan paling lambat tick berikutnya setelah terminal. Tidak ada HTTP worker rutin saat idle. Database cron sementara tetap memeriksa kondisi setiap 30 detik selama pending, termasuk backoff panjang.
- Crash dengan transport terbuka berhenti di recovery_required. Ini membutuhkan bukti operator bahwa transport lama sudah selesai; tidak ada timeout sweep yang mengirim ulang submit.
- `pg_cron` dan `pg_net` tersedia dan sudah terpasang. Dua trigger terpasang satu kali. Verifikasi akhir menunjukkan **nol cron**, karena dispatcher tetap PAUSED.

## Gallery dan rasio

Dokumentasi resmi: [image generation](https://jennabot.pro/docs/api-reference/generation), [media](https://jennabot.pro/docs/api-reference/media). Model capabilities Jennabot OAuth read-only membuktikan nano-banana-pro mendukung `1:1`. Payload backend sekarang mengirim `aspectRatio: '1:1'`, count=1 dan mode kredit; prompt tidak diubah. Harga aktual maksimal 2 kredit dan saldo tetap diperiksa sebelum submit. Tidak ada generate live untuk memeriksa dimensi baru.

Gallery OAuth memuat hasil uji dan resolve OAuth berhasil dengan handle yang sama. Item hasil uji mencatat expiresAt 27 Oktober 2027; ini metadata item tersebut, bukan janji retensi global. URL menurut docs berlaku sekitar enam jam. ID job, ID item Gallery dan mediaGenerationId adalah identitas berbeda.

Backend hanya menyimpan identitas media existing. Akses customer tetap memverifikasi autentikasi dan kepemilikan, tanpa daftar Gallery atau key di browser. Gate aset sekarang diizinkan ketika PAUSED, memakai lock/request index/cooldown global yang sama. Gate ini hanya menerima purpose=resolve dan job succeeded; tidak membuka generate.

REST assets/resolve sebelumnya memberi 403. **Belum ada bukti baru tentang scope key REST aktual**, sehingga penyebab pasti tidak diklaim; OAuth berhasil menunjukkan aset/handle masih tersedia tetapi bukan bukti permission key REST. Fallback existing GET job dibatasi ID job completed dan handle media yang sama. URL fallback masih sementara; akses setelah kedaluwarsa belum dijamin. Tidak ada storage binary/base64/signed URL permanen atau bypass OAuth ke customer.

## Tes

74/74 penghitung tes Node PASS: 53 PostgreSQL native (termasuk konkurensi, RLS dua identitas, FIFO, ledger, timeout, worker mock dan resolve PAUSED), 9 PostgreSQL WASM (8 skenario scheduler dengan cron/net/Vault mock), 12 provider/auth/customer endpoint. Lint terarah PASS. Vite build PASS; postbuild fetch/prerender tidak dijalankan. Native PostgreSQL pertama terhalang izin folder sementara dan berhasil setelah dijalankan pada folder sementara yang sesuai.

Tidak ada browser automation, generate berbayar, prompt baru, pemrosesan job queued, atau perubahan kuota live. HTTP wake-up melalui ekstensi asli dan REST resolve key backend belum diuji. Dependency runtime tes hanya dipasang sementara di luar proyek.

## Tindakan Owner sebelum aktivasi

1. Di Dashboard **proyek Gambarin**, buka Vault. Buat secret bernama `gambarin_worker_trigger_jwt` dengan **nilai yang persis sama** dengan backend `GAMBARIN_WORKER_TRIGGER_KEY` existing. Jangan gunakan publishable key, JWT pelanggan, key MAIN atau key Jennabot. Jangan mengirim nilainya ke chat. Secret tidak disalin ke repository. Jika belum memiliki nilainya, konfigurasi/rotasi backend harus diselesaikan dahulu; jangan mengisi tebakan.
2. Verifikasi key REST Jennabot memiliki izin aset yang sesuai, dan buktikan resolve melalui jalur backend. Scope `assets:read` tercantum dalam kontrak, tetapi penyebab 403 belum dipastikan. Jangan menganggap Gallery MCP yang berhasil otomatis memperbaiki REST.
3. Setelah kedua prasyarat selesai, berikan instruksi eksplisit untuk mengaktifkan dispatcher. Perubahan PAUSED→aktif akan memasang cron dan membangunkan **job queued yang sudah ada**. Tidak perlu mengirim prompt pengganti. Selama belum ada persetujuan, biarkan PAUSED.

Jika Vault belum terisi ketika unpause dicoba dengan outstanding job, transaksi unpause ditolak dengan `worker_wakeup_secret_missing` dan PAUSED dipertahankan. Jangan menjalankan aktivasi hanya untuk menguji HTTP karena itu dapat memproses job berbayar.

Setelah aktivasi disetujui, Owner menguji login/status/gambar/refresh pada website. Download existing tidak dihapus; tidak ditambahkan galeri pelanggan lengkap. Pekerjaan tetap pada prioritas MVP, tidak pindah ke Job berikutnya.

## Job 2.9B — pemeriksaan lanjutan (terbaru)

**PARTIAL untuk asset resolve jangka panjang; wake-up siap untuk keputusan aktivasi Owner.** Vault `gambarin_worker_trigger_jwt` sudah terisi. Hash nilainya cocok dengan hash Edge secret existing `GAMBARIN_WORKER_TRIGGER_KEY` tanpa membaca atau menampilkan JWT. Tidak ada nama Vault lain yang diperlukan migration 008. Probe pg_net ke `/gambarin-worker/resolve` dengan ID fiktif mendapat 409 `asset_not_ready` ketika memakai JWT Vault; probe tanpa Authorization mendapat 401. Probe pg_net pada rute wake-up sebenarnya `/gambarin-worker` mendapat HTTP 200 `paused`, tanpa claim job atau request provider. Scheduler aktif belum diuji karena dispatcher tetap PAUSED.

Diagnostik internal worker v17 menunjukkan REST resolve memakai `GET /api/assets/resolve?mediaGenerationId=...` dan key backend yang terpasang. Responsnya **403 `FORBIDDEN_ACTION`**; fallback GET job yang sama berhasil dan worker mengembalikan URL sementara (HTTP 200). Handle job cocok persis dengan `mediaGenerationId` item Gallery OAuth, dan key REST bisa membaca job. Penyebab izin 403 masih perlu klarifikasi: scope `assets:read` pada key atau kebijakan provider. Metadata diagnostik hanya tersedia pada respons worker yang memerlukan JWT backend dan tidak diteruskan ke customer. Hasil berhasil dibuka ulang ketika PAUSED, tetapi URL fallback dari job tidak dijamin bisa diperbarui setelah kedaluwarsa; Gallery menyimpan aset bukan janji signed URL dari GET job dapat diperbarui.

Tes terarah: 9/9 PostgreSQL WASM untuk scheduler/PAUSED, 11/11 auth/customer-asset/provider mock, 12/12 PostgreSQL native status/aset/recovery, lint terarah PASS. Worker v17 deployed; frontend tidak dideploy. Final live: dispatcher PAUSED/idle, 1 queued, 2 succeeded, 0 cron, 0 request provider terbuka; kuota akun uji 8/2/1 dan akun lain 5/0/0. Saldo Jennabot **2504**, sama dengan snapshot sebelum tugas; tidak ada generate baru.

Owner dapat memutuskan aktivasi **untuk pengujian terbatas** setelah menerima batasan fallback. Aktivasi akan mulai memproses job queued existing dan tidak dilakukan tanpa instruksi eksplisit. Untuk kesiapan refresh jangka panjang, minta Jennabot memeriksa izin `assets:read`/kebijakan REST atas 403 `FORBIDDEN_ACTION` atau siapkan key backend yang memang diizinkan melakukan resolve. Jangan kirim API key ke chat.
