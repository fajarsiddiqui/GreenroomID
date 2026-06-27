# Image Table Studio

Aplikasi web statis untuk menyusun banyak gambar ke dalam tabel dinamis, melihat live preview, lalu mengunduh hasil sebagai PDF.

## Cara membuka

1. Ekstrak ZIP.
2. Buka `index.html` memakai Chrome atau Microsoft Edge.
3. Upload banyak gambar sekaligus lewat area upload.
4. Atur ukuran kertas, orientasi, jumlah kolom, jumlah baris, margin, padding, border, dan caption.
5. Periksa hasil di Live Preview.
6. Klik `Download PDF`.

## Catatan PDF

Versi ini sudah menghapus fitur Download Word. Ekspor PDF diperbaiki dengan cara merender setiap halaman preview satu per satu menggunakan `html2canvas` dan `jsPDF`, sehingga file PDF tidak lagi kosong walaupun gambar tampil di preview.

Jika koneksi internet memblokir library CDN, gunakan tombol `Print / Save PDF` sebagai cadangan.

## Fitur utama

- Upload banyak gambar sekaligus.
- Drag and drop untuk mengubah urutan gambar.
- Sort nama file dan urutkan ulang caption.
- Tambah/kurangi kolom dan baris.
- Pilihan ukuran kertas: A4, F4/Folio, Letter, Legal, A3, dan Custom.
- Orientasi portrait atau landscape.
- Mode gambar: fit utuh, crop rapi, atau stretch penuh.
- Bentuk gambar: kotak, rounded, card shadow, atau lingkaran.
- Live preview sesuai ukuran kertas.
- Download PDF langsung.
- Simpan dan buka project JSON.

## Struktur file

- `index.html` — halaman utama aplikasi.
- `assets/styles.css` — desain tampilan dan layout dokumen.
- `assets/app.js` — logika upload, preview, layout, project, dan ekspor PDF.
- `CHANGELOG.txt` — catatan perubahan.
