# AI-CONTEXT — Gambarin AI / GreenroomID

Diperbarui: 27 Oktober 2026. **Job 2.9 PARTIAL; status terbaru di bagian 14 dan JOB-2.9.md.** Bagian milestone sebelumnya adalah snapshot historis. Keputusan Owner terbaru di bagian 7 mengungguli usulan lama yang bertentangan. Baca docs/gambarin/DECISIONS.md dan docs/gambarin/JENNABOT-API-AUDIT.md untuk dasar historis; audit API Job 2.1 bukan status live terbaru.

## 1. PROJECT OVERVIEW

- Gambarin AI adalah fitur pada website GreenroomID, https://www.greenroomid.com, route publik /GambarinAI dan card keempat landing. Repository: https://github.com/fajarsiddiqui/GreenroomID.
- MVP: akun pelanggan dibuat admin; login username/password; prompt menghasilkan satu gambar; antrean global; status, sisa kuota, masa aktif dan hasil gambar tampil di Studio. Frontend memakai React/Vite.
- Provider produksi adalah Jennabot Developer REST API. Jennabot Remote MCP OAuth dipakai untuk pemeriksaan baca saja, bukan jalur generate produksi.
- Status saat handoff: satu gambar asli telah selesai dan tampil di Studio localhost, tetapi worker otomatis, akses ulang aset, dan default rasio 1:1 belum selesai. Frontend produksi belum dideploy menurut catatan terakhir.

## 2. ARCHITECTURE AND SUPABASE PROJECTS

| Batas sistem | Project / akses | Implementasi |
| --- | --- | --- |
| GreenroomID MAIN | Supabase otyugnwavbhkzbponbez; Google Auth admin utama | Edge Functions gambarin-admin-read, gambarin-admin-create, gambarin-admin-manage memverifikasi JWT MAIN melalui auth.getUser(), lalu memanggil is_admin() memakai sesi terverifikasi. Credential Gambarin hanya di backend MAIN. |
| Gambarin AI | Supabase qhucajoygbexzpraxzlk; Auth username/password pelanggan | Edge Functions login, enqueue, asset dan worker serta tabel/RPC Gambarin. JWT Gambarin tidak memberi hak admin MAIN. |
| Browser | src/features/gambarin/lib/supabaseClient.js | Client Gambarin terpisah memakai VITE_GAMBARIN_SUPABASE_URL dan VITE_GAMBARIN_SUPABASE_PUBLISHABLE_KEY, storage key greenroomid_gambarin_auth_v1, detectSessionInUrl=false. Tidak mengubah singleton src/supabase.js MAIN. |
| Jennabot | REST dari gambarin-worker dengan x-api-key backend | Model yang diuji nano-banana-pro, count=1, useUnlimited=false. Harga dicek sebelum submit; satu request provider pada satu waktu melalui gate database. |

Admin create membuat user Supabase Auth Gambarin melalui Admin API, lalu RPC gambarin_admin_create_account menulis akun dan audit secara atomik. Password awal hanya dikembalikan sekali ke admin. Login pelanggan memetakan username ke email Auth internal di backend, memverifikasi password dengan Supabase Auth Gambarin, memeriksa status/masa aktif, lalu frontend menyimpan sesi khusus Gambarin. Login publik memiliki rate limit migration 006; config Supabase menetapkan verify_jwt=false hanya untuk login. Enqueue dan endpoint aset memverifikasi JWT Gambarin; auth_user_id berasal dari getUser(), bukan payload. Endpoint aset memeriksa gambarin_my_job_status milik pemanggil sebelum meminta worker me-resolve aset. Worker hanya menerima JWT backend khusus dan menolak Origin browser.

## 3. FILES AND COMPONENT MAP

| Area | Path aktual dan fungsi |
| --- | --- |
| Route/card/UI | src/App.jsx (/GambarinAI), src/utils/landingContent.js (card dan ikon), public/landing/GambarinAI-icon.svg, src/features/gambarin/GambarinPage.jsx dan gambarin.css |
| Adapter browser | src/features/gambarin/lib/customerApi.js (login, enqueue, akun, status, aset) dan lib/supabaseClient.js (sesi terisolasi) |
| Admin MAIN | supabase/functions/gambarin-admin-read/ (GET packages/accounts/summary); gambarin-admin-create/ (POST create); gambarin-admin-manage/ (POST add-quota/extend/reactivate; route disable disiapkan lokal pada Job 2.11). UI admin di `/admin/gambarin`. |
| Pelanggan Gambarin | supabase/functions/gambarin-customer-login/; gambarin-customer-enqueue/; gambarin-customer-asset/; gambarin-customer-mock-asset/ |
| Worker/provider | supabase/functions/gambarin-worker/handler.js (satu tick, gate, recovery-safe); index.ts (mode provider); jennabot-provider.js (REST); provider.js (normalisasi media); mock-provider.js (tes) |
| SQL khusus proyek Gambarin | supabase/gambarin/migrations/001_accounts_packages.sql sampai 006_customer_login_rate_limit.sql; jangan jalankan pada MAIN |
| Konfigurasi | supabase/config.toml: login verify_jwt=false, enqueue/asset/mock-asset true; worker mempertahankan JWT platform menurut implementasi/deployment Job 2.8C. .env.example hanya placeholder publik. Secret backend tidak ada pada frontend. |
| Tes | supabase/gambarin/tests/generation-queue.test.js dan local-postgres.js; supabase/gambarin/verification/001_postdeploy_check.sql; handler.test.js pada fungsi admin/pelanggan; handler.test.js, status-asset.test.js, trigger-auth.test.js, jennabot-provider.test.js dan mock-provider.test.js pada worker. |

Migration 001 membuat gambarin_packages, gambarin_accounts, gambarin_account_events. Migration 002/003 menyediakan gambarin_admin_create_account dan gambarin_admin_manage_account beserta audit. Migration 004 membuat gambarin_jobs, gambarin_quota_ledger, gambarin_provider_requests, gambarin_dispatcher serta RPC gambarin_enqueue_job, gambarin_cancel_queued_job, gambarin_acquire_dispatcher, gambarin_release_dispatcher, gambarin_claim_next_job, gambarin_begin_provider_request, gambarin_finish_provider_request, gambarin_recover_provider_request, gambarin_reconcile_submission, gambarin_finalize_job. Migration 005 menambah gambarin_my_job_status dan gambarin_mark_asset_unresolved. Migration 006 membuat gambarin_login_rate_limits dan gambarin_login_rate_hit. RLS dan pembatasan EXECUTE/DML ada dalam migration masing-masing; jangan menganggap tes RLS dua identitas live sudah dilakukan bila belum ada buktinya.

## 4. COMPLETED MILESTONES

| Milestone | Status dan sumber bukti |
| --- | --- |
| Phase 0 | **DONE lokal:** dokumentasi, keputusan, arsitektur dua proyek dan rencana MVP. |
| Migration 001–003; Job 1.6D | **DONE, verified live menurut Owner:** fondasi akun/paket, create, add-quota, extend, reactivate dan audit. Endpoint admin read juga pernah diuji 401 anonim/200 admin. UI admin tetap PENDING. |
| Job 2.1 | **DONE audit lokal:** docs/gambarin/JENNABOT-API-AUDIT.md. Ketidakpastian pada tanggal audit tidak meniadakan bukti live sesudahnya. |
| Job 2.2 / 2.2B | **DONE lokal + deployed menurut Owner:** FIFO global dan quota ledger migration 004; verifikasi deployment 15/15 PASS. |
| Job 2.3 | **DONE lokal:** worker serial dan tes; provider awalnya nonaktif. |
| Job 2.4 / 2.4B | **DONE lokal + deployed menurut Owner:** status/aset/recovery migration 005; verifikasi 15/15 PASS. |
| Job 2.5 | **DONE lokal:** card, route, login page, Studio responsif. Frontend produksi PENDING. |
| Job 2.6 / 2.6B / 2.6C | **DONE lokal + deployed menurut Owner:** login, enqueue, worker; migration 006 diterapkan. Login dan enqueue melalui browser berhasil menurut Owner. |
| Job 2.7 | **DONE, verified live berdasarkan laporan Owner:** worker mock memproses job hingga gambar simulasi tampil dan kuota reserved berpindah ke used. |
| Job 2.8 | **DONE lokal:** adapter Jennabot REST; model/harga/saldo diperiksa read-only. |
| Job 2.8B | **PARTIAL / insiden sudah ditutup oleh 2.8C:** satu gambar asli dibuat di Jennabot, tetapi submit worker timeout dan local job sempat submitting/in_flight. |
| Job 2.8C | **DONE, verified live pada saat tes:** job direkonsiliasi tanpa generate kedua; succeeded, gambar asli 768×1376 termuat di Studio localhost; kuota dan dispatcher diperiksa. Perbaikan mapping mediaId/fallback REST dideploy ke worker. Batasan akses ulang aset tetap PENDING. |

## 5. LIVE TEST EVIDENCE

- Akun uji: gambarin_smoke_01. Alur mock menurut laporan Owner: login, enqueue, pemrosesan worker, gambar simulasi di Studio, reserved menjadi used.
- Gambar asli: local job 3176924a-412b-4f8c-b805-7fd87d8f5a66; Jennabot job 0f467f8d-c769-4612-91dc-4bcc3b7d0f02; project, prompt, model nano-banana-pro dan waktu cocok. Provider melaporkan completed dan creditsDeducted=2.
- Harga terverifikasi saat tes: 2 kredit/gambar, saldo sebelum 2506 dan sesudah 2504. Recovery tidak mengirim generate kedua atau memakai kredit tambahan. Nilai saldo **bukan saldo terkini**.
- Worker timeout setelah submit awal. Request migration 004 dipulihkan dengan referensi insiden setelah transport lama dinilai selesai; RPC reconcile_submission menerima provider job ID yang terverifikasi. Satu tick status REST memfinalisasi melalui RPC. Ledger job: satu reserve, satu consume, satu submit request. Hasil akhir saat tes: granted=8, used=2, reserved=0; dispatcher PAUSED, idle, active_job_id kosong.
- JobResponse memakai result.media[].mediaId; nilai tersebut sama dengan mediaGenerationId Gallery untuk gambar ini. REST assets/resolve dengan key yang ada memberi HTTP 403. Fallback GET job dengan kecocokan handle ketat menghasilkan URL sementara; endpoint owner-only mengembalikan HTTP 200 dan gambar termuat 768×1376.
- Log invocation Supabase tidak terbaca Codex karena dashboard meminta login. Bukti berhentinya worker lama berasal dari respons timeout dan waktu yang melampaui batas runtime Edge Function. Stabilitas submit otomatis untuk job berikutnya **belum terbukti**.

## 6. CURRENT DEPLOYMENT STATE

- Migration 001–006 diterapkan pada proyek Gambarin menurut Owner; 004 dan 005 masing-masing dilaporkan 15/15 PASS. Tidak ada migration sesudah 006 dalam repository saat handoff.
- Functions admin MAIN read/create/manage dilaporkan live pada milestone 1.x. Functions pelanggan login/enqueue/worker/mocks/aset di Gambarin telah dideploy menurut catatan Job 2.6B–2.8C; versi worker final Job 2.8C memakai Jennabot REST, bukan mock. Tidak ada scheduler otomatis yang telah dibuat dalam repository.
- Frontend /GambarinAI berfungsi pada localhost dan **belum dideploy produksi** menurut catatan terakhir. Nilai konfigurasi/secret runtime tidak dibaca pada handoff ini. Build terakhir: Vite compile lulus; postbuild prerender yang bergantung pada fetch layanan publik tertahan.
- **PENTING:** Owner melaporkan satu prompt pengujian **kedua** sudah dikirim dan berada dalam antrean. ID, jumlah outstanding, status dan kuota terkini **UNKNOWN**, belum diperiksa dalam handoff ini. Dispatcher terakhir diverifikasi PAUSED/idle/tanpa active job pada akhir Job 2.8C; state **sekarang UNKNOWN**. Saldo 2504 juga snapshot lama. Jangan memproses job kedua atau mengaktifkan dispatcher tanpa keputusan Owner.

## 7. LATEST OWNER DECISIONS

1. **Worker berbasis aktivitas untuk Job 2.9:** enqueue membangunkan worker; selama queued/processing ada, lanjutkan pemeriksaan sesuai backoff sekitar 30 detik; saat idle tidak ada panggilan berkala. Browser boleh ditutup tanpa menghentikan antrean. Perlu recovery crash/timeout, tanpa loop panjang Edge Function. Hindari cron permanen 30 detik dan scheduler ganda; rancang transisi idle tanpa kehilangan wake-up.
2. **Satu antrean global tetap:** FIFO seluruh pelanggan, maksimal satu generate aktif, 20 outstanding, cooldown semua request provider minimal 5 detik, reservasi/consume atomik dan idempotent. Submit ambigu tidak otomatis diulang. Keputusan ini mempertahankan docs/gambarin/DECISIONS.md butir 8–10 dan 17–18.
3. **Gallery Jennabot sebagai penyimpanan sementara:** simpan metadata dan handle provider; ambil hanya aset milik pelanggan terautentikasi. Tidak simpan binary di Supabase Storage; Google Drive tidak diperlukan untuk MVP. URL dapat kedaluwarsa dan Gallery bukan arsip permanen. Pilihan Owner terbaru ini menggantikan rencana IndexedDB/Drive sebagai prasyarat MVP pada DECISIONS.md butir 11; download pelanggan adalah pekerjaan mendatang.
4. **Default rasio 1:1:** verifikasi dukungan nano-banana-pro dan kirim parameter REST bila didukung, tetap count=1. Tidak ada selector rasio dan jangan mengubah prompt pengguna. Implementasi saat ini belum mengirim aspectRatio.
5. **Ketentuan provider:** Owner sudah berkomunikasi dengan admin Jennabot dan tidak meminta dokumen izin tertulis lagi untuk pengujian. Gunakan Developer REST API resmi, kontrol biaya dan batas pemakaian; jangan meminta ulang konfirmasi izin yang sama.
6. **Pengujian UI:** Owner sendiri yang menguji website. Codex mengerjakan tes unit/integrasi/database/API, lint, build, diagnosis. Browser automation hanya bila Owner meminta secara eksplisit.
7. **Perubahan live:** jangan deploy frontend, memproses prompt kedua, mengubah dispatcher atau melakukan generate baru tanpa instruksi Owner.

## 8. KNOWN BUGS AND BLOCKERS

| Temuan | Keadaan / dampak |
| --- | --- |
| Pemanggilan REST assets/resolve HTTP 403 | Izin/scope key atau penyebab provider yang tepat belum terverifikasi. Fallback GET job berhasil untuk URL gambar yang masih berlaku; pembukaan ulang setelah URL kedaluwarsa belum andal. |
| Dispatcher PAUSED menghalangi resolve melalui gate existing | Gambar sudah pernah tampil, tetapi refresh saat PAUSED tidak dijamin memperoleh URL baru. Jangan membuka Gallery seluruh provider ke browser sebagai jalan pintas. |
| Worker submit pernah timeout | Satu insiden sudah direkonsiliasi; kestabilan submit berikutnya, wake-up otomatis, retry/status recovery belum diuji live. |
| Prompt kedua menurut Owner | State sekarang UNKNOWN; cek database secara baca saja sebelum keputusan backend berikutnya. Jangan asumsikan queued/kuota/saldo tetap sama. |
| Default 1:1 | Belum dikirim adapter; dukungan dan nilai enum REST untuk nano-banana-pro perlu diverifikasi. |
| QA sisa MVP | Panel admin UI belum dibuat; download/galeri pelanggan lebih lengkap/Drive belum dimulai; RLS lintas dua identitas live dan frontend produksi belum dibuktikan pada catatan ini. |

## 9. ACTIVE/PENDING JOBS

- **Active handoff:** dokumen ini saja. Job 2.9 **PENDING**, tidak dikerjakan pada handoff.
- **Operasional:** prompt kedua dilaporkan Owner sudah masuk antrean, tetapi belum ada pembacaan state terkini. Tidak ada otorisasi untuk dispatch atau generate pada tugas handoff ini.
- **Next Job:** 2.9 — Event-Driven Worker + Gallery Jennabot + Default 1:1. Sebelum implementasi/deploy, baca keputusan terbaru di bagian 7 dan periksa state antrean/dispatcher secara read-only; pekerjaan live mengikuti instruksi Owner.

## 10. PRIORITY ROADMAP

| Prioritas | Status | Sasaran |
| --- | --- | --- |
| **TERPENTING — sedang berjalan** | IN PROGRESS | Login, enqueue, FIFO, worker otomatis hemat resource, Jennabot REST, gambar asli, ledger benar, panel admin minimum. Sebagian besar backend sudah ada; worker otomatis, reliabilitas hasil dan UI admin tersisa. |
| **SEDANG — belum dimulai** | PENDING | Penyempurnaan UX, galeri pelanggan, download/penyimpanan lokal, Drive bila diperlukan, pengaturan akun tambahan. |
| **RENDAH — belum dimulai** | PENDING | Statistik lanjutan, animasi, optimasi visual dan fitur opsional. |

Jangan pindah ke prioritas berikutnya sebelum inti MVP terbukti berjalan. Beri tahu Owner secara eksplisit ketika perpindahan prioritas terjadi.

## 11. TESTING RESPONSIBILITIES

- Owner menguji website/UI dan melaporkan hasil live. Jangan meminta pengulangan tes yang sudah PASS tanpa alasan nyata.
- Codex menjalankan tes kode dan API yang relevan, SQL/RPC lokal bila perlu, lint/build terarah, serta diagnosis error. Jangan otomatis memakai Chrome DevTools MCP atau Computer Use.
- Supabase CLI tersedia untuk backend; Jennabot MCP OAuth tersedia untuk baca saldo/project/model/pricing. REST backend adalah jalur generate produksi. Jangan generate melalui MCP.
- Untuk setiap pekerjaan, bedakan tes lokal, laporan Owner, dan bukti live Codex. Jangan mengklaim berhasil/deployed hanya karena source tersedia.

## 12. AGENT OPERATING RULES

- Prioritaskan alur utama dan perubahan minimum. Jangan audit ulang migration yang lulus, memecah pekerjaan menjadi banyak job kecil, refactor GreenroomID lain, atau membuat migration tanpa kebutuhan nyata.
- Pertahankan semua perubahan pengguna yang belum di-commit. Git status saat handoff menunjukkan banyak file Gambarin dan perubahan lain belum tracked/committed; jangan reset, clean, commit, atau push tanpa instruksi.
- Jangan baca/tampilkan secret, password, JWT atau key. Konfigurasi browser hanya publishable key; credential Jennabot dan service role hanya backend. Jangan mengirim kredensial ke chat.
- Jangan deploy produksi frontend, mengubah dispatcher, menjalankan migration live, atau mengirim generate baru tanpa instruksi Owner. Setiap pemulihan submit ambigu memerlukan bukti provider dan transport, bukan lease expired saja.
- Ikuti keputusan Owner terbaru di bagian 7 saat bertentangan dengan docs/gambarin/DECISIONS.md atau rencana lama. Root AGENTS.md berfokus Shop; jangan ubah untuk tugas Gambarin.

## 13. NEXT ACTION FOR NEW AGENT

1. Terima instruksi Job 2.9 dari Owner; jangan mulai otomatis dari handoff.
2. Periksa **secara baca saja** job kedua, kuota, dispatcher, request gate, deployment dan saldo yang relevan. Laporkan UNKNOWN bila tidak bisa diverifikasi.
3. Rancang dan implementasikan wake-up berbasis aktivitas dengan recovery aman; pertahankan gate FIFO/ledger. Perbaiki akses ulang aset Gallery/resolve dan default rasio 1:1 sesuai kontrak resmi. Lakukan tes kode terarah.
4. Deploy backend hanya bila instruksi Job 2.9 mengizinkan, tanpa mengirim job kedua atau membuka dispatcher sebelum keputusan Owner. Serahkan tes UI kepada Owner.

## 14. JOB 2.9 — CURRENT VERIFIED STATE

- **PARTIAL, deployed backend:** migration tambahan 007 (gate aset saat PAUSED) dan 008 (activity worker) diterapkan melalui CLI SQL ke qhucajoygbexzpraxzlk. Worker **v16**, verify_jwt=true. Frontend produksi tidak dideploy. Tidak ada generate/provider submit live, perubahan kuota, unpause, commit atau push.
- **Live sebelum/sesudah:** dispatcher PAUSED, idle, tanpa active job/request/lease; job c21e34f7-eb64-4d5b-a286-2feec31aafd2 tetap queued, dua job succeeded. Akun uji granted=8/used=2/reserved=1; akun lainnya 5/0/0. Insiden recovered_unknown lama sudah selesai, bukan request terbuka.
- **Worker:** trigger enqueue menyimpan wake-up pg_net dalam transaksi; HTTP dikirim sesudah commit. Satu cron bernama gambarin-activity-worker, interval 30 seconds, hanya selama pekerjaan nonterminal dan dispatch diizinkan; tick database menghapus cron tanpa HTTP saat idle/PAUSED/recovery/submission_unknown. Lock singleton dispatcher menyerialisasi enqueue/tick/stop; lease/index existing mencegah submit ganda. Cron bertahan bila HTTP/crash gagal; request transport ambigu tetap perlu recovery operator berbukti, tidak diulang otomatis. Poll backoff worker sekarang 30 detik; cooldown provider tetap minimal 5 detik.
- **Konfigurasi belum selesai:** pg_cron dan pg_net terpasang; dua trigger tunggal terverifikasi; **nol cron** karena PAUSED. Vault belum memiliki gambarin_worker_trigger_jwt. Isi lewat Dashboard dengan nilai JWT backend GAMBARIN_WORKER_TRIGGER_KEY yang sama, jangan kirim secret ke chat. Jika kosong, unpause/enqueue aktif gagal atomik, tidak diam-diam menerima pekerjaan tanpa watchdog. Aktivasi belum diotorisasi/dilakukan.
- **Gallery/aset:** REST adapter tetap resolve handle, dengan fallback GET job yang mencocokkan job ID/status/media ID secara ketat setelah 403. Endpoint owner-only memakai lease aset khusus pada singleton yang sama; resolve dapat berjalan saat PAUSED tanpa membuka gate generate dan tetap mencatat cooldown. Tidak menyimpan binary, base64, atau signed URL di database. UI existing width=100%/height=auto tidak melakukan crop.
- **Bukti provider baru:** dokumentasi REST image mendukung aspectRatio; model capabilities OAuth mencantumkan 1:1 untuk nano-banana-pro. Backend mengirim aspectRatio='1:1', count=1, useUnlimited=false, prompt asli; pemeriksaan harga <=2 dan saldo tetap berjalan sebelum submit. Gallery OAuth dan resolve OAuth read-only berhasil, handle hasil uji cocok; expiresAt item 2027-10-27T03:35:05.751Z, bukan jaminan retensi semua item. Docs menyebut URL kira-kira 6 jam. REST key aktual tidak diuji ulang; 403 historis belum terdiagnosis pasti. Keberhasilan OAuth tidak membuktikan scope REST. Fallback URL job tidak menjamin akses setelah kedaluwarsa.
- **Tes:** 53/53 PostgreSQL native (queue, konkurensi, ledger, worker mock, status/aset/recovery), 9/9 PostgreSQL WASM (scheduler/trigger dengan cron/net/Vault mock), 12/12 adapter/auth/customer endpoint: **74/74**, termasuk penghitung parent test Node. Lint file berubah PASS; Vite build PASS (tanpa postbuild fetch/prerender). Tidak ada browser automation. Ekstensi pg_cron/pg_net asli terpasang live tetapi dispatch/timing HTTP aktif tidak diuji. Runtime tes tambahan hanya di folder sementara, bukan dependency aplikasi.
- **Next:** isi Vault secara aman dan verifikasi izin/resolve REST backend, lalu minta keputusan Owner sebelum unpause atau memproses job queued. Instruksi dan keterbatasan ada di JOB-2.9.md. Belum siap mengklaim pengujian manual end-to-end berhasil.

## 15. JOB 2.9B — CURRENT STATE

- Owner mengisi Vault `gambarin_worker_trigger_jwt`. Hash SHA-256 nilai Vault cocok dengan hash `GAMBARIN_WORKER_TRIGGER_KEY` existing pada Edge Function; nilai asli tidak dibaca atau ditampilkan. Probe pg_net dari database ke worker `/resolve` dengan ID job fiktif: JWT Vault diterima dan menghasilkan 409 `asset_not_ready`; tanpa Authorization ditolak 401. Probe rute wake-up sebenarnya `/gambarin-worker` dengan JWT Vault menghasilkan HTTP 200 `paused`. Tidak ada claim job atau request provider baru.
- Worker **v17**, platform verify_jwt=true. Diagnosis internal hanya mengembalikan status/code/source provider yang disanitasi kepada pemegang JWT backend; endpoint customer tetap mengembalikan asset saja. Live read-only pada job succeeded: REST `GET /api/assets/resolve?mediaGenerationId=...` mengembalikan 403 `FORBIDDEN_ACTION`; fallback GET job dengan ID dan media handle yang cocok menghasilkan asset URL, worker merespons 200. Gallery OAuth juga cocok persis dengan handle job; penyebab izin 403 spesifik (scope `assets:read` vs kebijakan provider) belum dapat dibuktikan. Fallback tidak menjamin URL baru sesudah URL GET job kedaluwarsa, meskipun aset Gallery masih ada.
- Final live: dispatcher **PAUSED/idle**, active_job kosong, request provider terbuka 0, queued 1, succeeded 2, cron aktif 0. Kuota akun uji 8/2/1, akun lain 5/0/0; saldo Jennabot 2504, sama dengan snapshot sebelum Job 2.9B. Tidak ada generate, pengubahan ledger, atau deploy frontend. Tes terarah scheduler/PAUSED 9/9; auth/customer-asset/provider mock 11/11; PostgreSQL native status/aset/recovery 12/12; lint file berubah PASS.
- Wake-up dan keamanan siap untuk **keputusan Owner tentang aktivasi terbatas**, belum diaktifkan. Sebelum menjanjikan refresh jangka panjang, Owner perlu memastikan key REST diberi izin resolve atau memperoleh klarifikasi Jennabot untuk `FORBIDDEN_ACTION`; jangan menganggap OAuth memberi izin key REST. Aktivasi akan memproses job queued yang sudah ada dan memerlukan persetujuan eksplisit Owner.

## 16. JOB 2.9C — CONTROLLED ACTIVATION INCIDENT

- Owner mengizinkan maksimal satu job queued dan biaya maksimal 2 kredit. Sebelum aktivasi: dispatcher PAUSED/idle, tepat satu job queued `c21e34f7-eb64-4d5b-a286-2feec31aafd2`, tidak ada request aktif/ambigu, cron 0, belum ada submit job ini; `parameters.count=1`. Harga live `nano-banana-pro` 2 kredit/output, saldo 2504; adapter mengirim `count=1`, `aspectRatio='1:1'` dan menolak harga >2.
- Dispatcher dibuka melalui transaksi dengan guard state. Trigger pause→aktif memasang cron sementara `30 seconds` dan mengirim **satu kick awal** lewat pg_net. Tidak ada kick manual tambahan. Satu request submit tercatat; job masuk `submitting`. Respons submit tidak selesai sebelum lease 60 detik, lalu `recovery_required` dan job `submission_unknown`/`lease_expired`, tanpa provider job ID. Tidak ada submit kedua.
- Sesuai batas masalah, dispatcher dikembalikan ke **PAUSED**; cron 0. Request submit tetap terbuka untuk pemulihan berbukti, active_job masih menunjuk job tersebut, reserved kuota 1 dan used 2 (tidak berubah). Tidak ada rekonsiliasi/retry otomatis atau manual.
- Saldo provider sesudahnya **2502** (turun 2 dari snapshot awal). Gallery OAuth menampilkan satu gambar baru dengan prompt job yang cocok dan rasio persegi, tetapi metadata model tertulis `nano-banana-2`, sedangkan request worker dikonfigurasi `nano-banana-pro`; Gallery tidak memberikan provider job ID. Jangan menganggap item itu pasti terikat pada job lokal atau menyimpulkan siapa yang memakai kredit tanpa bukti provider tambahan. Harga katalog `nano-banana-2` saat diperiksa 288 kredit/output; perbedaan metadata ini perlu diagnosis.
- **STATUS: PARTIAL / kriteria PASS gagal.** Job lokal belum terminal, asset ID belum tersimpan, kuota belum dikonsumsi. Langkah berikutnya adalah diagnosis read-only provider job list/log/transport, lalu recovery hanya dengan bukti worker/transport lama berhenti dan referensi provider yang cocok. Jangan unpause atau submit ulang sebelum insiden terselesaikan; pertahankan ledger, request, dan dispatcher PAUSED. Tidak ada frontend/browser test.

## 17. JOB 2.9D — SUBMIT TIMEOUT DIAGNOSIS

- Percobaan tunggal `a948ce2a-4a56-40e6-9b11-f7f2f5996e4a` untuk job `c21e34f7-eb64-4d5b-a286-2feec31aafd2` dimulai 2026-10-27 05:54:56 UTC dan tetap tanpa provider job ID. Lease 60 detik kedaluwarsa, job `submission_unknown`, dispatcher PAUSED, cron 0, kuota used=2/reserved=1. Gallery item sekitar 05:55:46 UTC cocok prompt/waktu tetapi model tercatat `nano-banana-2` versus request `nano-banana-pro`; ID Gallery/media bukan ID job, sehingga hubungan belum terbukti. Saldo 2504→2502 adalah petunjuk saja. Jangan bind/recover/retry tanpa bukti ID provider yang cocok.
- Diagnosis kode: budget worker 45 detik mencakup pricing, balance, dua jeda 5 detik, dan POST; lebih pendek dari lease 60 detik. Dokumentasi REST menyatakan submit mengembalikan ID secara asynchronous, tetapi durasi POST aktual dan penyebab beda model belum terukur karena respons/ID tidak tersimpan. Tidak ada idempotency/client reference terdokumentasi. MCP baca-saja dapat menampilkan Gallery dan status ID yang diketahui, tetapi tidak dapat mencari daftar job berdasarkan waktu.
- Migration 009 **applied** ke proyek Gambarin; worker **v18 deployed**, verify_jwt=true. RPC baru memperpanjang lease percobaan submit aktif menjadi 120 detik; worker mengembalikan HTTP 202 lalu menunggu JobResponse dalam `EdgeRuntime.waitUntil` dengan batas 90 detik, menyimpan ID segera bila diterima. Saat timeout/parse/persist tidak pasti, gate tetap terbuka dan tidak ada submit ulang. Logging hanya tahapan, durasi, status/kode HTTP, model respons, dan ID job non-rahasia; tidak memuat prompt, key, token, atau URL. Tes terarah: PostgreSQL lokal 35/35, adapter/auth 11/11, lint PASS. Setelah deploy, live tetap PAUSED, cron 0, attempt lama tetap satu dan `recovery_required`, used=2/reserved=1, saldo provider 2502. Tidak ada generate pada Job 2.9D. Recovery belum dilakukan karena ID provider dan penjelasan mismatch model belum terbukti.

## 18. JOB 2.9D — OWNER-ATTESTED GALLERY RECOVERY

- Owner mengizinkan rekonsiliasi manual tanpa provider Job ID dan tanpa menghubungi support. Gallery item `caa1064a-3e63-4382-a2f5-55f2318ec370` milik akun REST Jennabot yang sama terbaca 200 via `GET /api/gallery/{id}`. Prompt lengkap cocok tepat dengan satu job lokal `c21e34f7-eb64-4d5b-a286-2feec31aafd2` milik `gambarin_smoke_01`; item dibuat 50 detik sesudah submit dan mempunyai mediaGenerationId. Gallery tidak menyediakan Job ID atau project ID pada metadata item. Hubungan job adalah **owner-attested manual reconciliation**, bukan verifikasi ID job provider. Debit 2 kredit hanya bukti pendukung.
- Migration 010 **applied**: RPC khusus service_role mensyaratkan dispatcher PAUSED, satu job unknown, satu request submit terbuka/kedaluwarsa, akun tepat, dan respons probe Gallery REST 200 yang cocok; transaksi menutup request ambigu, mencatat audit append-only, menghubungkan Gallery/media, dan memakai reservasi tepat satu kali. Pemanggilan ulang idempotent. Worker **v20 deployed** dengan Gallery probe/fallback dan verify_jwt=true. Tidak ada provider ID buatan. Tes PostgreSQL lokal 36/36, adapter/auth 14/14, endpoint pelanggan 2/2, lint PASS. Tidak ada generate tambahan.
- Live akhir: job `succeeded`, audit `owner_attested_gallery_match`, quota akun uji used=3/reserved=0, ledger consume tepat satu, submit tepat satu, saldo Jennabot tetap 2502, dispatcher PAUSED/idle, cron 0. RPC status sebagai pemilik mengembalikan `succeeded` dan asset `resolvable`. Worker `/resolve` saat PAUSED mengembalikan 200 dengan URL aset melalui **Gallery REST fallback**; REST `/api/assets/resolve` tetap 403 `FORBIDDEN_ACTION`. Signed URL tidak disimpan/ditampilkan. Gallery `expiresAt` 2027-10-27 adalah metadata item; masa hidup URL hasil GET Gallery tidak terbukti, sehingga refresh jangka panjang belum dijamin.
- Backend mengirim field resmi `aspectRatio:'1:1'`; metadata Gallery item `IMAGE_ASPECT_RATIO_SQUARE`. Prompt asli meminta komposisi vertikal 9:16, menjelaskan kesan visual vertikal meski metadata persegi. Model yang diminta `nano-banana-pro` tetapi Gallery menyebut `nano-banana-2`; dokumentasi membedakan keduanya dan tidak membuktikan pemetaan/alias. Catat mismatch untuk insiden mendatang, jangan menganggap setara.

## 19. JOB 2.10B — AUTOMATIC REST JOB IDENTIFICATION

- REST key backend berhasil `GET /api/jobs?projectId=...` (200, halaman 1/1). Untuk insiden apel, tepat satu job provider baru cocok project/prompt/waktu/model `nano-banana-pro`, debit 2 kredit, dan mediaGenerationId Gallery item `f99930b6-8910-4fd4-9eb4-c0f013bed122`; `GET /api/jobs/{id}` via OAuth juga mengonfirmasi status completed. Provider Job ID nyata `1d40d608-69c4-45d1-b6cf-6e571771591d` dipakai dalam transaksi RPC recovery existing untuk job lokal `02ed512d-c934-4c19-a5da-a8feb94b57e5`. Satu submit saja; job succeeded, kuota `gambarin_smoke_01` used=4/reserved=0, ledger consume satu, saldo Jennabot 2500. Dispatcher ditemukan sempat tidak PAUSED saat insiden terdeteksi; dikembalikan ke PAUSED sebelum diagnosis/recovery. Akhir PAUSED/idle, cron 0, outstanding 0.
- Worker **v22 deployed**, verify_jwt=true; tanpa migration baru. Sebelum POST berbayar adapter mengambil marker daftar job project. Jika respons POST ambigu, ia tidak mengirim POST kedua, menunggu cooldown lalu membandingkan daftar sesudahnya. Hanya **tepat satu job baru** dengan project, prompt lengkap, model, waktu, dan biaya cocok yang menghasilkan provider Job ID untuk RPC submit existing; baseline hilang, daftar tidak lengkap, dua job baru, atau metadata berbeda tetap unknown/manual. Ini menangani timeout normal ketika job segera tampak di REST, tetapi crash/hasil yang belum tampak sesudah pemeriksaan tetap memerlukan recovery manual. FIFO, batas outstanding, gate singleton, ledger, scheduler dan autentikasi pemilik tidak berubah.
- REST asset resolve tetap 403 `FORBIDDEN_ACTION`. Untuk job tanpa Gallery ID tersimpan, worker sekarang mencari mediaGenerationId yang persis sama melalui `GET /api/gallery` sebelum fallback URL GET job. Tes backend apel setelah deploy: HTTP 200, URL ada, sumber `gallery_fallback`; signed URL tidak ditampilkan atau disimpan. Refresh lama masih bergantung pada URL yang dikembalikan provider. Tes mock adapter/auth 21/21, PostgreSQL worker/status 35/35, scheduler WASM 9/9, lint PASS; tidak ada generate berbayar atau tes browser pada Job 2.10B.

## 20. JOB 2.11 — PANEL ADMIN MINIMUM (LOKAL)

- Route `/admin/gambarin` dan menu dashboard/admin memakai autentikasi MAIN. UI membaca paket/akun, membuat akun, menampilkan password awal sekali, menambah kuota, memperpanjang, dan mengaktifkan kembali melalui Edge Functions MAIN; credential proyek Gambarin tetap di backend. Kuota awal minimal nilai paket, dan kelebihannya memakai operasi `add-quota` terpisah. Jika langkah kedua gagal, admin perlu memeriksa daftar sebelum mengulang.
- Operasi nonaktif sebelumnya belum ada. Migration Gambarin `011_admin_disable_account.sql` dan route `gambarin-admin-manage/disable` disiapkan lokal, dengan izin service_role dan audit atomik. **Belum diterapkan/deploy**; tombol nonaktif baru berfungsi setelah migration 011 diterapkan pada proyek Gambarin dan Edge Function manage dideploy ke MAIN. Frontend tidak dideploy. Dispatcher tidak disentuh.

## 21. JOB 3.1 — REDESAIN UI GAMBARIN (LOKAL)

- Login pelanggan kini dua panel; Studio memakai ringkasan akun, prompt, antrean, dan grid hasil; tab Galeri menampilkan hingga 8 pekerjaan terbaru dari query milik akun yang sedang login. Kartu `succeeded` memakai endpoint aset existing dan memberi label jelas jika hasil simulasi. Bila aset tidak tersedia, tidak ditampilkan gambar contoh.
- Warna, radius, dan jarak khusus namespace Gambarin mengikuti referensi PDF Kilau Studio. Halaman admin Gambarin dirapikan secara lokal tanpa mengubah tema global `AdminLayout`. Tidak ada perubahan Edge Function, SQL, ledger, worker, dispatcher, atau deploy produksi.

## 22. JOB 3.4–3.5B — THUMBNAIL, GALERI, DAN RELEASE CANDIDATE

- Migration `012_thumbnails.sql` mendefinisikan bucket privat, status dan lease thumbnail, retry terbatas, cron sementara satu menit (`* * * * *`), serta backfill admin batch. Source jadwal disamakan dengan cron produksi yang Owner konfirmasi aktif; migration tidak dijalankan ulang pada Job 3.5B.
- Owner mengonfirmasi thumbnail otomatis dan backfill sudah berfungsi. Ada thumbnail gagal dengan `resolve_unavailable`, tetapi gambar asli tetap dapat dibuka. Perbaikan kode worker memakai `await` untuk RPC finalisasi dan menangani kegagalan resolver tanpa HTTP 500 tidak tertangani; status deployment versi perbaikan tidak dinyatakan tanpa bukti terpisah.
- Galeri memakai pagination 12 pekerjaan per halaman, cache memory/IndexedDB per akun, lazy loading, dan lightbox portal untuk gambar asli. Lightbox dan unduhan lulus uji manual; UI galeri Job 3.4F lulus 5/5 uji visual Owner. Kartu tanpa thumbnail tetap membuka gambar asli.
- Refresh Studio/Galeri distabilkan agar perubahan ID job atau jumlah item tidak memulai polling tambahan. Frontend terbaru masih lokal dan belum dirilis ke produksi. Jangan masukkan file di luar Gambarin atau arsip lokal ke Release Candidate.
