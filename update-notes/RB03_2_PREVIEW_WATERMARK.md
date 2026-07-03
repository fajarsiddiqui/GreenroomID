# RB-03.2 — Watermark Otomatis File Preview PDF

Update ini menambahkan watermark otomatis untuk file preview PDF pada halaman Admin Requests.

## Perubahan utama

- Upload `preview_file` sekarang memproses PDF di browser admin sebelum file diupload.
- Watermark mengambil sumber logo dari `landing_content.content_key = site_logo_url`.
- Watermark ditempel pada halaman kelipatan 5: 5, 10, 15, 20, dan seterusnya.
- Posisi watermark di tengah halaman dengan opacity 50%.
- Ukuran watermark memakai area 10 x 10 cm dan rasio logo dipertahankan.
- Ditambahkan progress bar dan pesan status selama proses watermark dan upload.
- File preview asli tidak disimpan ke storage. Yang diupload hanya hasil preview ber-watermark.
- Upload file hasil final tidak diubah sama sekali.

## Dependency baru

- `pdf-lib`

## Validasi

- Lint tetap 0 error dan 7 warning lama.
- Build berhasil.
