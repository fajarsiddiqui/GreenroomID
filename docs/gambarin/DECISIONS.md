# Keputusan tetap — Gambarin AI MVP

Diperbarui: 27 Oktober 2026 (Job 2.2). Sumber: konfirmasi pemilik proyek di percakapan GreenroomID dan PRD MVP. Dokumen ini dibuat khusus Gambarin AI dan **tidak** menggantikan `docs/DECISIONS.md` milik Shop.

## Produk dan akses

1. Gambarin AI **fitur di aplikasi GreenroomID yang sama**, ditampilkan sebagai **card keempat pada landing page utama** berdampingan dengan Layanan, Shop, dan Authenticator; URL publik **`/GambarinAI`** (huruf besar mengikuti ketetapan pemilik produk). Jangan buat landing terpisah atau redirect ke dashboard umum.
2. **Login khusus username + password**. Hanya akun yang **dibuat admin Gambarin AI** dapat mengakses Studio. Google Auth GreenroomID utama **tidak** memberi akses Gambarin AI, walaupun email/Google account sama.
3. Google OAuth hanya untuk **izin Simpan ke Google Drive setelah diklik user**. Autentikasi/izin Drive terpisah dari sesi Gambarin AI dan juga tidak boleh mengubah sesi Google Auth GreenroomID utama. Login ke GreenroomID lainnya tetap menggunakan alur Google yang sudah ada.
4. Tidak ada registrasi sendiri dan tidak ada checkout Gambarin AI. Pembelian jatah, penambahan masa berlaku, reset akun dan reaktivasi ditangani **manual oleh admin**.

## Paket, kuota dan anggaran

5. Bonus paket 1 / 3 / 7 / 14 / 30 hari; waktu paket **dimulai saat admin mengaktifkan bonus**.
6. Usulan default foto per akun: 1 hari=4 (5 akun), 3 hari=8 (5), 7 hari=14 (5), 14 hari=20 (5), 30 hari=35 (20). Sasaran **40 akun** dan **930 gambar**. Worst case **1.860 dari 2.000 kredit**, sisa cadangan **140 kredit**.
7. Default paket **dapat diubah admin** (untuk aktivasi baru); admin dapat menambah/mengurangi jatah akun tertentu, menambah waktu, dan mengaktifkan kembali akun. Pengguna hanya melihat **sisa foto**, bukan kredit Jennabot.
8. Satu permintaan menghasilkan **satu gambar**. Reservasi 1 foto pada saat request diterima; pemakaian final hanya ketika berhasil, gagal final/queued cancellation melepas reservasi. Transaksi dan validasi atomik oleh backend.

## Generate dan penyimpanan

9. User **hanya memasukkan prompt** lalu Generate. Jangan menyediakan pemilihan model/tier, style atau kualitas berbayar. Sistem memilih model termurah yang memenuhi kebutuhan dan **terverifikasi maksimal 2 kredit per gambar**; alternatif juga wajib terverifikasi ≤2. Jika slot provider sibuk, tunggu tanpa mengganti model untuk melewati batas slot (Job 2.2). Jika tidak ada model eligible, tunggu. Kalau kemampuan API tidak mendukung, jangan mengarang model/endpoint.
10. Maksimum **20 job outstanding** di antrean global, urutan **FIFO berdasarkan penerimaan transaksi server/sequence**. **Maksimal satu job generate aktif secara global**, termasuk submit ambigu. Tidak ada antrean per pengguna atau peningkatan concurrency menjadi 2/3. Semua request Jennabot (submit, status, sync, resolve aset, metadata) wajib melalui satu gate database persisten, dengan jeda **minimal 5 detik setelah respons/kegagalan transport sebelumnya selesai ditangani**. Polling juga memakai backoff minimal 10 detik. Slot sibuk harus menunggu pada posisi FIFO yang sama; tidak mengganti model untuk melewati batas slot. Prioritas manual admin yang bertentangan dengan FIFO tidak dimasukkan pada MVP. Keputusan Job 2.2 ini menggantikan opsi peningkatan concurrency pada rencana implementasi/checklist lama.
11. Gambar **tidak disimpan di Supabase Storage/backend**. Gunakan IndexedDB di perangkat/browser user + Download + tombol Simpan ke Google Drive dengan consent sesuai permintaan. Backend hanya menyimpan metadata operasional penting. Browser berbeda tidak memiliki galeri lokal yang sama; pemulihan setelah browser ditutup tergantung retensi aset Jennabot.
12. Opsional popup kepuasan dan saran setelah generate berhasil; popup **boleh dilewati**.
13. Hanya **MVP**. Jangan tambahkan roadmap fitur di luar PRD, upsell otomatis, modul video/audio, galeri server permanen, atau pembelian mandiri.

## Keamanan dan ketidakpastian

14. Jangan bocorkan secret API/key/session. Endpoint submit, hasil, status, dan kuota divalidasi server sesuai identitas user Gambarin. Penerapan login khusus tidak boleh membahayakan Supabase Auth Google existing.
15. Dokumentasi provider: <https://jennabot.pro/docs> dan MCP untuk developer <https://fire.jennabot.pro/mcp>. **Developer API adalah jalur aplikasi**, bukan MCP OAuth sebagai login publik. Model/tarif, parallel, status/asset, saldo/top-up, retensi dan hak komersial penggunaan multi-pelanggan **belum diverifikasi** sampai Codex memperoleh bukti resmi/tes aktual.
16. Dashboard admin ada di area admin GreenroomID yang sudah ada, bukan aplikasi/admin auth yang dibangun ulang.
17. Job dan reservasi tetap persisten walau browser/worker berhenti. Timeout atau lease kedaluwarsa tidak membuktikan provider gagal. Submit ambigu menjadi `submission_unknown`, tetap menahan satu slot global serta reservasi; tidak boleh dikirim ulang otomatis. Pemulihan request yang terputus memerlukan bukti operator bahwa worker/transport lama sudah berhenti, kemudian cooldown dihitung ulang dari waktu pemulihan. Rekonsiliasi dengan referensi bukti dapat mengikat ID provider yang diterima atau memastikan tidak diterima dan melepas reservasi. Slot kosong saja bukan bukti kegagalan.
18. Enqueue, reservasi, job dan ledger harus atomik dengan idempotency key per akun. Sukses mengonsumsi satu reservasi tepat sekali; gagal final terkonfirmasi atau pembatalan queued oleh pemilik melepas tepat sekali. Ledger immutable untuk aplikasi; tidak ada hak TRUNCATE bagi anon/authenticated/service_role. Mutasi queue hanya melalui RPC backend tepercaya; identitas pemilik harus berasal dari JWT Gambarin terverifikasi. Fondasi Job 2.2 dipasang dalam keadaan dispatch **paused**, tanpa worker/provider request; gate harga aktual dan izin tertulis multi-pelanggan tetap berlaku sebelum integrasi diaktifkan.

## Prioritas ketika referensi bertentangan

**Keputusan ini > PRD MVP > 3 gambar UI terbaru > panduan visual Kilau Studio lama.** Semua keterangan API harus tunduk pada dokumentasi dan respons API resmi yang teruji. Gambar UI hanyalah inspirasi tampilan, bukan daftar fitur. Jangan mengambil dropdown Model/Style/Aspect Ratio dari gambar 1 sebagai kewajiban implementasi; ketetapan user adalah prompt-only untuk pemilihan model.
