# Audit kontrak API Jennabot — Gambarin AI MVP

Tanggal audit: **27 Oktober 2026 (Asia/Jakarta)**.
Status: **DONE untuk audit dokumentasi / PARTIALLY VERIFIED / integrasi provider BLOCKED**.

## 1. Lingkup, bukti, dan batas pemeriksaan

Dokumentasi resmi berhasil diambil dengan GET publik HTTP 200 melalui Node fetch. Alat web tidak dapat membuka halaman awal dan pencariannya tidak memberi hasil Jennabot yang relevan; kegagalan alat tersebut bukan bukti dokumentasi tidak tersedia. Halaman HTML dan OpenAPI yang diserialisasi pada halaman resmi menjadi bukti baru audit ini. OpenAPI menyatakan versi spesifikasi 3.2.0, versi API 1.0.0, dan server `https://fire.jennabot.pro`.

Label **DOC VERIFIED** berarti kontrak tercantum pada sumber resmi yang dibaca sekarang, **bukan** endpoint sudah dipanggil atau respons produksi sudah diuji. Tidak membaca/mengirim API key, login provider, menjalankan playground, memanggil endpoint API, membuat project/job, membeli kredit, atau melakukan generate. Harga contoh schema tidak dianggap harga aktif. Fakta audit lama tidak digunakan sebagai bukti kontrak sekarang.

| ID | Sumber resmi yang berhasil dibaca | Bagian yang dipakai |
| --- | --- | --- |
| S1 | [Dokumentasi utama](https://jennabot.pro/docs) dan [quick start](https://jennabot.pro/docs/quickstart) | Alur project → image job → sync → result.media |
| S2 | [Authentication](https://jennabot.pro/docs/authentication) | Header key, permission, pengelolaan rahasia |
| S3 | [Generation](https://jennabot.pro/docs/api-reference/generation) | Endpoint, GenerateImageDto, JobResponse, pricing, ErrorResponse; info OpenAPI tertanam berisi concurrency/errors |
| S4 | [API keys](https://jennabot.pro/docs/api-reference/api-keys) | Scope, rateLimit, expiresAt, revoke; catatan session-only |
| S5 | [Credits](https://jennabot.pro/docs/api-reference/credits) | Balance, costs, top-up dan status pembayaran |
| S6 | [Subscription](https://jennabot.pro/docs/api-reference/subscription) | Satu slot, status langganan dan waktu pembebasan slot |
| S7 | [Media](https://jennabot.pro/docs/api-reference/media) | Gallery, asset resolve, URL expiry, field expiresAt |
| S8 | [Syarat dan Ketentuan](https://jennabot.pro/terms) | Bagian 3, 7, 10–13; halaman bertanggal pembaruan 15 September 2026 |
| S9 | [Kebijakan Privasi](https://jennabot.pro/privacy) | Bagian 5/7: hasil privat secara default, retensi tanpa durasi tetap |
| S10 | [Situs publik](https://jennabot.pro/) dan [PixVerse reference](https://jennabot.pro/docs/api-reference/pixverse) | Klaim pemasaran bukan tarif API; katalog display berbeda dari harga tagihan |

Konteks lokal: `DECISIONS.md` butir 8–11/14–16, PRD bagian 9–12, `MVP-IMPLEMENTATION-PLAN.md` bagian 2/3/9/12, dan `JENNA-API-VERIFICATION.md` adalah persyaratan/checklist proyek. Konfirmasi publik baru pada dokumen ini menggantikan status belum dapat mengakses docs pada Job 0.3, tanpa mengubah dokumen historis tersebut.

Backend yang diperiksa: handler `gambarin-admin-read`, `gambarin-admin-create`, dan `gambarin-admin-manage` memakai Auth utama + `is_admin()` dan credential Gambarin server-side. Client frontend Gambarin terpisah ada di `src/features/gambarin/lib/supabaseClient.js`. Ketiganya bukan integrasi Jennabot, worker, atau login pelanggan; kontrak ini tidak mengubahnya. Migration 003 tetap NOT EXECUTED menurut konteks terakhir; tidak ada laporan penyelesaian Job 1.6D pada job ini.

## 2. Autentikasi dan batas key

**DOC VERIFIED, S2–S4:** integrasi server-to-server memakai header `x-api-key`; body JSON menggunakan `Content-Type: application/json`. API utama juga mendokumentasikan session JWT provider sebagai alternatif. JWT Supabase GreenroomID/Gambarin bukan JWT Jennabot dan tidak dipakai sebagai autentikasi provider.

- Semua endpoint privat pada matriks berikut membutuhkan autentikasi. Pengecualian publik yang didokumentasikan meliputi GET `/api/credits/packages` dan `/api/gallery/public`; public Gallery tidak diperlukan MVP.
- Scope terdokumentasi: `generation:write` untuk project/generate, `generation:read` untuk baca/sync job, `gallery:read` untuk Gallery. Enum key juga memuat `assets:read`/`assets:write` dan scope studio/workflows. Mapping permission tepat untuk resolve, pricing, balance, dan subscription perlu dikonfirmasi dengan uji baca resmi; jangan mengarang scope `credits:read`.
- Key dapat diberi `permissions`, `rateLimit` (default 100 request per rolling 60 detik), dan `expiresAt` bertipe date-time. Menghilangkan permissions memberi seluruh scope; array kosong ditolak. Rekomendasi: key khusus aplikasi dengan scope sesempit kebutuhan, disimpan hanya di secret backend, tanpa prefix VITE.
- Secret key ditampilkan sekali; provider menyimpan hash. Kehilangan key memerlukan revoke dan penerbitan baru. Endpoint revoke tercantum sebagai POST `/api/api-keys/{id}/revoke`. API untuk membuat/mengelola key membutuhkan sesi provider menurut narasi, bukan key yang dikelola itu sendiri.
- HTTP 401 pada kontrak mencakup credential hilang, tidak valid, kedaluwarsa atau dicabut. Jeda dispatch dan minta operator memeriksa/merotasi key; jangan retry cepat dengan credential yang sama.
- Pembatasan IP/origin dan plafon pengeluaran key tidak ditemukan dalam kontrak yang dibaca. Rate limit bukan batas biaya.

**Ketidakkonsistenan resmi:** OpenAPI memberi alternatif apiKey/bearer pada operasi key dan purchase, tetapi info OpenAPI serta deskripsi permissions menyatakan pengelolaan key/purchase/admin hanya memakai session token. Terapkan pembacaan konservatif session-only sampai provider mengonfirmasi; jangan memakai service key pelanggan atau sesi Supabase untuk operasi ini. [S3, S4, S5]

## 3. Matriks endpoint MVP — DOC VERIFIED, belum diuji live

Semua path berikut relatif terhadap `https://fire.jennabot.pro`.

| Method dan path | Request penting | Respons/arti yang dibuktikan | Sumber |
| --- | --- | --- | --- |
| POST `/api/projects` | `name` wajib string; `toolType` opsional, hanya label | 201: project dengan `id`; bukan pembatas mode image/video | S1/S3 |
| POST `/api/projects/{projectId}/images` | `prompt` wajib; `model`, `count`, `useUnlimited` dan pengaturan image opsional | 201 JobResponse; dapat masih processing | S1/S3 |
| GET `/api/generation/pricing` | Tidak ada body | `image[]`, `video[]`, `unpricedModels[]`; sumber harga tagihan dari credit_costs, tidak memotong kredit | S3 |
| GET `/api/credits/costs` | Tidak ada body | Daftar feature dengan `creditCost`, `chargeableCredits`, description | S5 |
| GET `/api/credits/balance` | Tidak ada body | `userId`, `balance` | S2/S5 |
| GET `/api/subscriptions/me` | Tidak ada body | `isActive`, plan/dates, `runningGeneration`, `slotFreesAt` | S6 |
| GET `/api/jobs/{id}` | ID job Jennabot | JobResponse; 410 jika job telah dihapus, bukan status masih menunggu | S3 |
| POST `/api/jobs/{id}/sync` | ID job; tanpa body terdokumentasi | Rekonsiliasi provider dan JobResponse; idempotent terhadap job terminal | S1/S3 |
| GET `/api/jobs` | `page`, `limit` maksimal 100, `projectId`, `status` opsional | Daftar job berhalaman; bukan bukti deduplikasi submit yang timeout | S3 |
| GET `/api/gallery` | `page`, `limit`, `type`, `visibility`, `includeExpired` (default false) | Item Gallery dengan `id`, `gcsUrl`, `mediaGenerationId`, `expiresAt` | S7 |
| GET `/api/gallery/{id}` | ID item Gallery, bukan otomatis ID job | Detail item milik akun provider | S7 |
| GET `/api/assets/resolve` | Query `mediaGenerationId` wajib | `{url, mediaGenerationId}`; URL baru | S7 |
| GET `/api/credits/packages` | Publik, tanpa body | Paket top-up dan harga; bukan eksekusi pembelian | S5 |
| POST `/api/credits/purchase` | `packageId` wajib; `paymentProvider` midtrans/paddle opsional | 201 transaksi/checkout: `orderId`, `status`, `checkoutToken`, `redirectUrl`, dll. Saldo belum otomatis lunas | S5 |
| GET `/api/credits/purchases/{orderId}` | ID transaksi | `settled` berarti kredit sudah masuk; autentikasi account-management perlu klarifikasi di atas | S5 |

Generic POST `/api/projects/{projectId}/jobs` juga tercantum, tetapi rekomendasi image MVP adalah endpoint `/images` yang benar-benar melakukan submit ke renderer. Tidak menjalankan semua operasi di atas, termasuk operasi purchase dan sync.

### Payload image dan job

Contoh struktur project yang sesuai schema:

```json
{"name":"Gambarin AI","toolType":"api"}
```

Contoh payload image yang memakai model enum dan mode subscription-only terdokumentasi:

```json
{
  "prompt":"Ilustrasi secangkir kopi di meja kayu",
  "model":"nano-banana-2-lite",
  "count":1,
  "useUnlimited":true
}
```

Contoh ini **tidak dikirim**, bukan persetujuan model termurah, dan bukan bukti akun Owner memiliki langganan aktif. Harga mode kredit model tersebut belum diverifikasi.

Parameter relevan schema S3:

| Field | Kontrak |
| --- | --- |
| `prompt` | String wajib |
| `type` | String opsional, default `image-generator`; jangan memberi feature lain untuk memanipulasi harga |
| `model` | Enum 13 model pada tabel berikut; pilih eksplisit setelah validasi harga |
| `count` | Default 1; deskripsi 1–4, model image PixVerse hanya menerima 1. MVP selalu 1 |
| `aspectRatio` | Opsional, dukungan berbeda per model; UI user tetap prompt-only |
| `quality`, `detailLevel` | Opsional pada schema umum; GPT Image membutuhkan detail untuk pricing deterministik. Pilihan harus divalidasi per model/varian |
| `seed` | Number opsional; tidak diperlukan MVP |
| `useUnlimited` | Boolean opsional, perilaku di bawah |
| field reference/character/account affinity | Terdokumentasi tetapi tidak diperlukan prompt-only MVP; jangan dikirim otomatis |

`useUnlimited: true` meminta langganan saja: tidak memotong kredit, dan 422 bila langganan tidak aktif/model tidak ditanggung. `false` selalu memotong kredit, sekalipun ada langganan. Jika field dihilangkan, provider memakai langganan bila ditanggung, atau beralih ke kredit. **Jangan menghilangkan field atau mengganti true menjadi false saat busy**, karena itu mengubah mekanisme pembayaran. [S3]

JobResponse memuat `id`, `projectId`, `type`, `prompt`, `model`, `status`, `serverJobId`, `result`, `error`, `creditsDeducted`, `createdAt`, `completedAt`; sejumlah field nullable. Status enum: `pending`, `processing`, `completed`, `failed`, `cancelled`. Gunakan `id` Jennabot sebagai identitas pemantauan; `serverJobId` adalah identitas upstream dan bisa null. Bentuk `result` pada OpenAPI masih object umum; quick start membuktikan akses `result.media[0].url`, bukan schema media lengkap. [S1/S3]

## 4. Model, harga, dan pemilihan otomatis

**Nama/ID DOC VERIFIED dari GenerateImageDto. Angka harga kredit aktif per model belum tersedia sebagai bukti audit.** Tidak ada request authenticated ke endpoint pricing pada job ini. Contoh angka 12/60/72 dan contoh video yang ikut muncul di array image pada renderer schema bukan tarif aktual untuk model gambar.

| Model ID terdokumentasi | Routing menurut docs | Harga kredit per gambar | Pemotongan saat subscription-only valid |
| --- | --- | --- | --- |
| `nano-banana-pro` | Google Flow | UNVERIFIED | 0, bersyarat |
| `nano-banana-2-lite` | PixVerse | UNVERIFIED | 0, bersyarat |
| `nano-banana-2` | PixVerse | UNVERIFIED | 0, bersyarat |
| `qwen-image` | PixVerse | UNVERIFIED | 0, bersyarat |
| `seedream-4.0` | PixVerse | UNVERIFIED | 0, bersyarat |
| `seedream-4.5` | PixVerse | UNVERIFIED | 0, bersyarat |
| `seedream-5.0-pro` | PixVerse | UNVERIFIED | 0, bersyarat |
| `seedream-5.0-lite` | PixVerse | UNVERIFIED | 0, bersyarat |
| `kling-3.0` | PixVerse | UNVERIFIED | 0, bersyarat |
| `kling-o3` | PixVerse | UNVERIFIED | 0, bersyarat |
| `gpt-image-2.0` | PixVerse | UNVERIFIED | 0, bersyarat |
| `gpt-image-2.5-flare` | PixVerse | UNVERIFIED | 0, bersyarat |
| `gpt-image-2.5-sunburst` | PixVerse | UNVERIFIED | 0, bersyarat |

0 di kolom terakhir adalah kontrak pemotongan dengan langganan aktif yang menanggung model dan `useUnlimited:true`, bukan harga katalog atau bukti tarif mode kredit <=2. Semua model image ditanggung menurut S3/S6 dan S8 bagian 6. Kondisi langganan akun Owner serta izin penggunaan pihak ketiga belum diperiksa. Kandidat minimum bersyarat pada jalur tersebut sama-sama 0; belum ada satu model termurah mode kredit yang dapat ditetapkan. Klaim situs pemasaran mulai 1 poin/Nano Banana tidak membuktikan ID/varian dengan harga itu. [S3, S6, S8, S10]

Kontrak rekomendasi pemilihan backend, belum diimplementasikan:

1. Dapatkan respons pricing resmi yang sudah disanitasi melalui pemeriksaan read-only Owner; validasi `image[]`, `priced`, `unit`, `creditsForOneOutput`/`creditsPerUnit`, `variants`, dan `unpricedModels`. Field harga pada schema memiliki beberapa tipe object/null meskipun contoh angka; parser produksi wajib memvalidasi bentuk nyata.
2. Untuk mode kredit, hanya aktifkan tuple model + quality/detail yang harga efektif untuk **count=1** terbukti <=2; biaya pecahan dibulatkan ke atas menurut info OpenAPI. Periksa varian dan biaya referensi, walau MVP tidak mengirim referensi. Harga null/unknown, unpriced, atau >2 tidak eligible. Allowlist mode kredit sekarang **kosong**.
3. Urutkan berdasarkan biaya efektif terendah. Harga sama memakai preferensi admin yang diuji. Tidak ada model/quality selector di UI pengguna.
4. Jalur subscription-only dapat mencegah debit kredit tak disengaja, tetapi baru dapat dipakai setelah izin penggunaan dan keadaan langganan diverifikasi. Tidak memberi izin otomatis untuk jalur kredit model yang harganya unknown. Jangan mengubah keputusan produk minimum 1–2 pada PRD hanya berdasarkan kolom conditional 0; aturan terbaru user adalah maksimum 2 dan keputusan pembayaran harus eksplisit.
5. Jika busy spesifik model terbukti dan submit sebelumnya jelas ditolak, alternatif harus lolos pemeriksaan biaya yang sama. `GENERATION_SLOT_BUSY` adalah slot akun, sehingga **tunggu**, bukan berpindah model. Bila tidak ada kandidat terverifikasi, job tetap menunggu dan tidak dikirim ke provider.
6. Tidak ditemukan `maxCredits`, price-lock/quote token, atau idempotency key pada schema submit image. Harga berlaku saat submit menurut terms; pengecekan harga sebelumnya tidak membuktikan plafon debit atomik. Minta kontrak pelindung perubahan harga kepada support sebelum menjanjikan batas debit mutlak.

Docs juga menyatakan quality PixVerse flat, tetapi schema pricing memuat varian quality/detail dan deskripsi detailLevel antar-GPT tidak sepenuhnya konsisten. Pakai respons pricing aktual untuk tuple yang dipilih; jangan menganggap semua kualitas model selalu sama harganya. [S3]

## 5. Concurrency, queue dan retry

| Jalur | Bukti dokumentasi | Implikasi |
| --- | --- | --- |
| Langganan covered | Satu job berjalan per akun; 409 `GENERATION_SLOT_BUSY`, `runningJobId`, `freesAt`; GET subscriptions/me menampilkan runningGeneration dan slotFreesAt | Slot dibagi antar model covered. Kredit tambahan tidak menambah slot; jangan bypass dengan pergantian model/pembayaran |
| Kredit/per-user | Info OpenAPI menyebut `GENERATION_MAX_CONCURRENT_PER_USER`, default **4**; kelebihan accepted+charged lalu pending hingga dijalankan otomatis | Paralel didokumentasikan, tetapi angka konfigurasi produksi akun Owner belum diuji. Pending bukan alasan submit ulang |
| Shared PixVerse | Default `PIXVERSE_MAX_CONCURRENT_GLOBAL` **8**, shared waiting line `PIXVERSE_MAX_QUEUED_GLOBAL` **100** | Batas global lintas pengguna, bukan kuota milik Gambarin; antrean penuh = 429 `GENERATION_QUEUE_FULL`, scope pixverse, tanpa charge |
| User waiting line | Bila waiting line user penuh: 429 `GENERATION_QUEUE_FULL`, scope user, tanpa charge | Ukuran user waiting line tidak dinyatakan pada bagian yang dibaca |
| API-key rate | rateLimit per rolling 60 detik; 429 `RATE_LIMIT_EXCEEDED` | Polling memakai budget request yang sama; bukan kapasitas generate |

Sumber: info OpenAPI pada S3 dan S6. Terms S8 bagian 7 menyatakan slot dapat bebas paling lambat 10 menit untuk proses yang tidak memberi kabar. Pakai `freesAt`/`slotFreesAt` aktual; bebas slot tidak membuktikan job lama gagal atau telah refund.

**Keputusan rekomendasi MVP: satu job aktif pada satu waktu**, antrian lokal FIFO maksimum 20 outstanding sesuai keputusan produk. Default paid 4 bukan izin menaikkan concurrency Gambarin menjadi 3 sekarang. Pengujian 2/3 dan konfigurasi akun nyata belum ada, serta subscription hanya satu slot. Jangan menyalin kapasitas antrian provider sebagai kapasitas lokal produk.

Docs tidak memberikan interval polling, jadwal exponential backoff, atau jaminan header Retry-After pada sumber yang dibaca. Rekomendasi aplikasi: backoff terbatas dengan jitter dan patuhi Retry-After jika benar-benar diterima; tetap di bawah rateLimit. Ini desain Gambarin, bukan janji Jennabot. Ulangi sync/read secara aman; jangan mengulang submit generate pada timeout/5xx yang hasil penerimaannya belum jelas.

## 6. Matriks HTTP dan strategi MVP

Kontrak error umum: `{statusCode, code, message}`; validation 400 dapat berbentuk `{statusCode, message: string[], error}` tanpa code. Prioritaskan code, bukan pencocokan kalimat. Field tambahan error pada info OpenAPI perlu divalidasi saat read/sandbox. [S3]

| HTTP / code | Arti terdokumentasi | Strategi aplikasi yang direkomendasikan |
| --- | --- | --- |
| 400 / validation | Body/query invalid atau field tidak dikenal | Permanen untuk request yang sama; perbaiki payload, jangan retry otomatis |
| 401 / UNAUTHENTICATED | Credential hilang/invalid/expired/revoked | Pause dispatch, periksa key backend; jangan bocorkan key ke respons/log |
| 402 / INSUFFICIENT_CREDITS | Balance kurang; `required`, `available` | Pause dan beri tahu admin; jangan pindah ke model lebih mahal atau membuat top-up otomatis |
| 403 / FORBIDDEN_ACTION | Resource bukan milik caller atau scope kurang | Perbaiki mapping/scope; jangan retry buta |
| 404 / ENTITY_NOT_FOUND | Resource tidak ditemukan | Verifikasi ID/ownership; tidak menganggap job belum pernah dibuat hanya karena transport gagal |
| 410 / ENTITY_GONE | Job dahulu ada dan sudah dihapus | Hentikan polling; tidak dapat dipulihkan melalui ID itu |
| 409 / GENERATION_SLOT_BUSY | Langganan covered sedang memakai slot akun | Sementara: baca subscription/sync job berjalan, tunggu freesAt; bukan model busy spesifik |
| 409 / CONFLICT | Nilai unik bentrok | Jangan diperlakukan sebagai slot busy; rekonsiliasi resource |
| 422 / BUSINESS_RULE_VIOLATION | Aturan bisnis/state invalid; endpoint image juga mencantumkan harga feature tidak aktif; useUnlimited true gagal bila subscription tidak berlaku | Jangan retry tanpa perubahan kondisi; periksa harga/state/subscription, tanpa fallback kredit implisit |
| 429 / RATE_LIMIT_EXCEEDED | Rate limit key per rolling 60 detik | Sementara: backoff; pakai Retry-After bila tersedia, interval resmi tidak dinyatakan |
| 429 / GENERATION_QUEUE_FULL | Waiting line user atau PixVerse penuh; submit tidak ditagih | Sementara: job tetap di FIFO lokal; tunda dan periksa scope |
| 502 | Renderer menolak/tidak dapat melayani; operasi generation mendokumentasikan refund biaya percobaan sebelum error | Bedakan penolakan jelas dari lost response; periksa job jika sudah ada ID. Tidak semua 502 berarti aman membuat generate baru |
| 500/503/5xx lain atau timeout | Kontrak rinci/code dan efek charge tidak ditemukan | Keadaan submit tidak pasti; rekonsiliasi sebelum retry/fallback, jangan menganggap refund otomatis |

Job final failed/cancelled mendokumentasikan refund dan creditsDeducted menjadi 0 dalam info OpenAPI; completed mempertahankan charge. Itu kontrak provider, bukan hasil tes saldo audit ini. Kuota foto Gambarin tetap reservasi lokal sampai sukses/final gagal yang benar-benar diketahui; tidak disamakan langsung dengan HTTP error atau berakhirnya slot. [S3]

## 7. Status, hasil, penyimpanan dan pemulihan

Alur yang direkomendasikan: simpan remote `job.id` pada metadata job milik pengguna Gambarin → baca/sync **ID yang sama** sampai terminal → validasi result/media → simpan Blob pada IndexedDB dan sediakan Download/Drive sesuai consent. POST sync terdokumentasi idempotent dan tidak membuat generasi baru. Menutup browser bukan alasan mengirim ulang generate. Backend/worker harus tetap memantau; implementasinya belum dibuat. [S1/S3; aturan lokal DECISIONS]

- Media otomatis masuk Gallery. Simpan ID job, ID item/handle remote bila terbukti, model, status, biaya dan URL sementara yang diperlukan. Jangan menyimpan bytes gambar di Supabase Storage atau tabel backend.
- `result.media[0].url` terverifikasi sebagai akses quick start. Schema `result` belum memerinci media item: nama field handle (`mediaId` vs `mediaGenerationId`) dan pemetaan job ke Gallery perlu respons yang disanitasi/support; jangan mengasumsikan ID job sama dengan ID Gallery/asset.
- GET resolve membutuhkan `mediaGenerationId` dan mengembalikan URL bertanda tangan baru, kira-kira **6 jam**, bukan TTL pasti/SLA. Docs menyebut handle tetap, tetapi terms tidak menjamin penyimpanan permanen. Resolve bukan jaminan menghidupkan aset yang sudah dihapus. [S7/S8]
- Gallery memiliki `expiresAt`; listing menyembunyikan expired secara default dan menyediakan `includeExpired`. Durasi retensi Gallery yang pasti serta apakah expired item masih dapat di-resolve belum terbukti. Jangan memakai masa berlaku kredit 3 bulan sebagai TTL gambar. [S5/S7/S8/S9]
- Satu akun Jennabot akan mengumpulkan hasil semua pelanggan. Endpoint Gambarin hanya boleh mengembalikan job/asset yang dipetakan server-side ke identitas Gambarin pemanggil; jangan meneruskan seluruh Gallery atau accountEmail upstream kepada pelanggan.
- CORS signed asset, kemampuan browser fetch menjadi Blob untuk IndexedDB/Drive, MIME/ukuran, dan perilaku URL expiry lintas provider belum diuji. Link yang bisa dibuka bukan bukti fetch lintas origin diizinkan. Tidak membuat proxy atau storage tambahan pada audit ini.

## 8. Top-up dan hak penggunaan

**Top-up resmi ada dalam dokumentasi:** POST credits/purchase → checkout → GET credits/purchases/{orderId} sampai settled; bukan endpoint gratis yang langsung menambah saldo. Midtrans/Paddle tercantum dalam API, tetapi mekanisme auth purchase memiliki konflik dokumentasi session-only vs apiKey. MVP tetap top-up manual oleh operator; tidak mengimplementasikan checkout pelanggan Gambarin atau pembelian otomatis. [S4/S5]

**Hak banyak pelanggan: BLOCKER.** Terms S8 bagian 3 membatasi satu pengguna per akun dan berbagi/pemindahtanganan tanpa izin tertulis. Bagian 10 mensyaratkan perjanjian tertulis untuk distribusi/penjualan kembali akses. Bagian 7 juga membatasi penyalahgunaan otomasi langganan; bagian 10 membedakan otomasi melalui API resmi. Hak komersial atas hasil pada bagian 11 tidak otomatis memberi izin menyediakan akses API satu akun untuk banyak pelanggan. Audit belum memperoleh persetujuan tertulis tersebut.

Pertanyaan yang harus dikonfirmasi tertulis oleh Owner ke support (tidak dikirim oleh Codex):

1. Apakah backend resmi GreenroomID boleh melayani pelanggan terpisah menggunakan satu akun/key Jennabot tanpa membagikan credential? Apakah ini memerlukan perjanjian/reseller plan?
2. Apakah izin itu mencakup subscription-only melalui REST Developer API, atau hanya kredit? Berlaku fair-use/volume/retensi apa?
3. Berikan contoh pricing image aktif untuk count=1 dan tuple quality/detail, serta kontrol plafon biaya/price-lock bila tarif berubah antara pengecekan dan submit.
4. Bagaimana menemukan job setelah submit timeout sebelum menerima ID; apakah ada idempotency key/client request ID resmi?
5. Konfirmasi mapping scope price/balance/subscription/resolve, auth top-up, schema result/handle Gallery, CORS, retensi dan kemampuan resolve setelah expiresAt.

## 9. Informasi belum terverifikasi dan gate implementasi

| Prioritas | Blocker/ketidakpastian | Bukti penutup yang diperlukan |
| --- | --- | --- |
| B1 — hard gate biaya | Tidak ada tarif aktif per model/varian, model termurah mode kredit atau fallback <=2 yang terbukti | Respons read-only pricing aktual yang disanitasi, timestamp, unit/varian dan validasi cap; tanpa key di percakapan/repo |
| B2 — hard gate penggunaan | Belum ada izin tertulis melayani banyak pelanggan; terms membatasi distribusi/berbagi akses | Persetujuan tertulis provider untuk skenario, akun, metode REST dan skema kredit/subscription Gambarin |
| B3 — recovery/hasil | Result/media handle belum typed lengkap; retensi pasti dan CORS fetch belum terbukti | Kontrak resmi/fixture disanitasi dan tes baca aset yang sah; jangan membuat generate berbayar untuk audit ini |
| B4 — submit ambigu | Tidak ada idempotency key/pencarian client-request-ID yang terdokumentasi | Konfirmasi provider atau kebijakan freeze+rekonsiliasi manual pada unknown submit; tanpa resend otomatis |
| B5 — dokumentasi/config | Auth purchase/key konflik; tipe harga object/null dan deskripsi quality/detail tidak konsisten; konfigurasi concurrency produksi tak diketahui | Klarifikasi resmi serta tes baca dengan permission terbatas; default config bukan hasil live |

Rekomendasi kontrak minimum: key hanya backend; dedicated image endpoint dengan count=1/model eksplisit; billing mode eksplisit; allowlist biaya kosong sampai terbukti; serial 1/FIFO lokal 20; job ID disimpan sebelum pemantauan; read/sync/resolve tanpa resubmit; final state menjadi dasar kuota; Blob hanya lokal/Drive; informasi provider/asset selalu dibatasi ownership. Implementasi provider dan launch masih diblokir B1/B2; B3/B4 harus ditutup atau ditangani eksplisit sebelum alur pemulihan dijanjikan kepada pelanggan.

Next Job sesuai rencana: **2.2 — Queue/ledger transaction**, menunggu instruksi PM dan penyelesaian gate provider yang diperlukan. Tidak mengerjakan job tersebut pada audit ini. Phase 1/Job 1.6D yang masih tertunda tidak ditandai selesai.
