# RB-02 — Kirim Hasil Pembelajaran & Review Admin

## Tujuan
Membuka alur kontribusi user untuk **Hasil Pembelajaran Artikel**, tanpa mengubah GreenroomID menjadi jurnal ilmiah dan tanpa menyimpan file artikel sumber.

## Alur client

```text
Tulis manual / Import Draft Word
→ Simpan Draft
→ Kirim untuk Review
→ Menunggu Review
→ Sedang Direview
→ Perlu Revisi / Belum Diterima / Diterima Editorial
```

Client hanya dapat mengubah hasil pembelajaran saat statusnya:

- `draft`
- `revision_requested`

Client tidak dapat menerbitkan sendiri dan tidak dapat mengubah kiriman saat admin sedang melakukan review.

## Halaman baru

| URL | Fungsi |
|---|---|
| `/ruang-belajar/saya` | Daftar hasil pembelajaran milik client dan status review. |
| `/ruang-belajar/tulis` | Menulis hasil pembelajaran baru atau import template Word. |
| `/ruang-belajar/tulis?edit=<id>` | Memperbaiki draft atau kiriman yang diminta revisi. |
| `/admin/ruang-belajar/review` | Antrean review khusus admin. |

## Status RB-02

| Status | Makna |
|---|---|
| `draft` | Disimpan client, belum dikirim. |
| `submitted` | Menunggu admin mulai memeriksa. |
| `under_review` | Sedang diperiksa admin. |
| `revision_requested` | Client perlu memperbaiki dan mengirim ulang. |
| `rejected` | Belum dapat diterima secara editorial. |
| `accepted_pending_payment` | Diterima secara editorial; RB-03 akan menambahkan kontribusi publikasi manual. |
| `published` | Dipakai oleh alur admin/publik setelah seluruh tahap selesai. |

## Database dan RLS

SQL baru: `supabase/rb02-learning-submissions.sql`.

- `learning_entries` memperoleh kolom status/review: `submitted_at`, `reviewed_at`, `reviewed_by`, dan `review_note`.
- `learning_reviews` menyimpan riwayat keputusan admin.
- Publik tetap hanya membaca entry `published`.
- Client hanya membaca entry miliknya sendiri dan entry publik.
- Client hanya dapat membuat entry sebagai `draft` serta mengubah draft atau entry yang diminta revisi.
- Admin dapat melihat seluruh antrean dan memasukkan keputusan review.

## Batasan akademik dan hak cipta

- User wajib menulis ringkasan memakai kata-kata sendiri.
- User wajib menyertakan link sumber resmi atau DOI.
- User tidak boleh mengunggah PDF jurnal, screenshot, tabel, gambar, grafik, instrumen, atau data responden.
- Catatan review bersifat editorial dan hanya tampil kepada pemilik kiriman serta admin.
- Keputusan editorial dilakukan sebelum pembayaran. RB-02 belum memproses pembayaran apa pun.

## Tidak diubah

- Tidak ada Storage untuk file Word atau PDF.
- Tidak ada Midtrans.
- Tidak ada QRIS atau upload bukti bayar. Itu masuk RB-03.
- Tidak ada SEO/sitemap baru. Itu tetap ditunda pada RB-05.

## Validasi

- `npm run build` berhasil.
- `npm run lint` menghasilkan 7 warning React Hooks lama tanpa error baru.
