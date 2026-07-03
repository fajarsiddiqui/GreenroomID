# RB-01 — Ruang Belajar GreenroomID

RB-01 menambahkan **Ruang Belajar GreenroomID** untuk menerbitkan **Hasil Pembelajaran Artikel**. Fitur tahap ini dibuat untuk admin terlebih dahulu.

## Yang ditambahkan

- Card **Ruang Belajar** di landing page, sejajar dengan Layanan Gratis.
- Halaman katalog publik: `/ruang-belajar`.
- Halaman detail otomatis setiap hasil pembelajaran:
  `/ruang-belajar/pendidikan/[slug]-[kodependek]`.
- Katalog 12 card per halaman, dengan pagination URL biasa.
- Filter kategori, metode, dan analisis tanpa membuat artikel duplikat.
- Halaman detail yang memisahkan:
  - sumber artikel;
  - ringkasan memakai kata-kata sendiri;
  - peta penelitian;
  - hasil menurut artikel;
  - hal yang dipelajari;
  - pertanyaan metodologis.
- Tombol **Cetak / Simpan sebagai PDF** melalui browser. Header PDF memakai logo GreenroomID; tidak ada watermark di tengah halaman.
- Menu admin: `/admin/ruang-belajar`.
- Form admin untuk membuat draft atau menerbitkan hasil pembelajaran.
- Artikel sumber dapat dipakai ulang oleh banyak hasil pembelajaran.
- RLS Supabase agar publik hanya membaca entry berstatus `published`; admin yang dapat menulis.

## Data yang disimpan

Hanya teks dan metadata ringan:

- judul hasil pembelajaran;
- ringkasan dan catatan pembelajaran;
- kategori ilmu;
- tag metode dan analisis;
- metadata artikel sumber;
- link sumber/DOI;
- nama pembelajar;
- tanggal dipelajari dan diterbitkan.

## Data yang tidak disimpan

- PDF jurnal;
- screenshot, tabel, gambar, instrumen, dan data responden;
- file Word, Excel, SPSS;
- PDF hasil download user;
- bukti atau riwayat download PDF.

## SQL baru

Jalankan:

```text
supabase/rb01-ruang-belajar.sql
```

Setelah SQL dijalankan, login sebagai admin lalu buka:

```text
/admin/ruang-belajar
```

## Batas RB-01

- Admin menerbitkan hasil pembelajaran sendiri.
- User submission, review admin untuk tulisan user, serta pembayaran publikasi belum diaktifkan. Itu masuk tahap RB-02/RB-03.
- Sitemap saat ini memasukkan halaman katalog `/ruang-belajar`. Sitemap artikel dinamis dibuat saat tahap SEO lanjutan.
