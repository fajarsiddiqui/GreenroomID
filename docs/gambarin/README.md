# Paket referensi Gambarin AI — MVP

Siap dipakai oleh Codex pada proyek GreenroomID. **Semua path di bawah relatif terhadap `docs/gambarin/`**.

## Isi

| File | Kegunaan |
| --- | --- |
| `PRD-GambarinAI-MVP.md` | **Sumber utama yang dibaca Codex**: salinan Markdown isi PRD MVP lengkap; pertahankan isi fungsional yang sudah diputuskan. |
| `PRD-GambarinAI-MVP.docx` | Naskah PRD resmi asli (10 halaman), tidak diubah. |
| `DECISIONS.md` | Keputusan terkini yang mengikat, termasuk login khusus dan card publik. |
| `AI-CONTEXT.md` | Handoff progres; sudah diinisialisasi, **Codex Job 0.1 harus memverifikasi/melengkapi**, bukan membuat ulang. |
| `JENNA-API-VERIFICATION.md` | Checklist developer API Jennabot yang masih perlu pembuktian. |
| `references/ui-studio.png` | Referensi layar generator user. |
| `references/ui-admin-dashboard.png` | Referensi ringkasan admin. |
| `references/ui-admin-accounts.png` | Referensi manajemen akun/paket. |
| `references/icon-gambarin-white.svg` | Ikon putih transparan untuk kegunaan pada latar gelap; perlu adaptasi stroke/warna bila digunakan pada card putih. |

## Cara memasang

1. Ekstrak **isi ZIP langsung di folder `greenroomid/docs/gambarin/`** (buat folder jika belum ada). Jangan mengekstrak folder `docs/gambarin` bertingkat dua kali.
2. Codex diberi scope untuk membaca `AI-CONTEXT.md` dan file relevan, terutama `DECISIONS.md` dan `PRD-GambarinAI-MVP.md`.
3. Job pertama: validasi file dan peta integrasi dari **worktree aktual**, update AI-CONTEXT (tanpa coding).

## Penting

- Tiga gambar UI adalah **inspirasi visual**, bukan daftar opsi yang harus dibuat: tidak boleh muncul pilihan Model/Style/tier untuk user hanya karena ada di mockup.
- Panduan lama *Kilau Studio* tidak dimasukkan agar tidak menghidupkan kembali fitur lama yang dibatalkan (login berbeda, kuota harian, pemilihan kualitas, dan antrian round-robin).
- Jangan mengganti `docs/PRD.md`, `docs/DECISIONS.md`, atau `AGENTS.md` di root proyek: itu memuat aturan Shop existing.
- Tidak ada source code aplikasi, secrets, atau foto pengguna pada paket ini.
