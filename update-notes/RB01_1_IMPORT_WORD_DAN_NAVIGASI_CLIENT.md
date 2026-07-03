# RB-01.1 — Import Draft Word & Navigasi Client

RB-01.1 adalah penyempurnaan setelah RB-01 Ruang Belajar.
Tidak ada SQL Supabase baru.

## Import Draft Word

Admin dapat mengunduh template resmi dari:

```text
/templates/Template_Hasil_Pembelajaran_Artikel_GreenroomID_v1.docx
```

Di `/admin/ruang-belajar` tersedia tombol:

- `Template Word`
- `Import Draft Word`

File yang diterima hanya `.docx`, maksimal 5 MB. Import membaca `content controls`
bertag seperti `LEARNING_TITLE`, `SOURCE_URL`, `SUMMARY_OWN_WORDS`, dan tag metode/analisis.
Heading pada template tetap ada untuk manusia, tetapi sistem membaca field bertag agar urutan
atau gaya heading yang berubah tidak membuat data salah masuk.

Proses import sepenuhnya berjalan di browser:

```text
.docx dipilih
→ browser membaca XML dalam file
→ field dipetakan ke form draft
→ admin memeriksa isi
→ hanya teks yang disimpan saat tombol Simpan Draft / Publish digunakan
```

File Word asli tidak dikirim ke Supabase Storage dan tidak dicatat di database.

Status hasil import selalu menjadi `draft`. Import tidak dapat mempublikasikan konten otomatis.
Admin tetap harus memeriksa sumber, ringkasan dengan kata-kata sendiri, dan pernyataan keaslian.

## Tidak ada export GreenroomID ke Word

Fitur `GreenroomID → Word` sengaja tidak dibuat.
Hasil Pembelajaran Artikel yang sudah diterbitkan menggunakan **Cetak / Simpan sebagai PDF**.
Tujuannya menjaga agar publik tidak menerima file Word yang dapat diedit dan lalu dianggap sebagai
versi resmi GreenroomID.

## Navigasi Client

Komponen `ClientPortalHeader` dipakai pada:

- Dashboard client;
- Profil client;
- Layanan & Harga client;
- Request Baru;
- Detail Request;

Menu yang tersedia:

```text
Beranda | Layanan | Layanan Gratis | Ruang Belajar | Request Saya
```

Dashboard juga memiliki blok **Jelajahi GreenroomID** untuk mengarahkan client ke layanan,
tools gratis, Ruang Belajar, atau Beranda.

## Dependency baru

RB-01.1 menambahkan `jszip` untuk membaca struktur `.docx` di browser.
Tidak ada API AI, server PDF, Supabase Edge Function, atau Storage bucket baru.
