# Checklist verifikasi Jennabot Developer API (MVP)

**Belum diuji terhadap API aktif.** Ini checklist agar Codex mencatat bukti, bukan mengarang endpoint, response, harga, atau kapasitas.

Dokumentasi yang diberikan: <https://jennabot.pro/docs>. Alternatif akses MCP untuk developer: <https://fire.jennabot.pro/mcp>. MCP bukan login end-user dan bukan pengganti Developer API untuk produk ini.

| Hal yang harus dibuktikan | Bukti yang diminta | Status |
| --- | --- | --- |
| Metode autentikasi, scopes, API key | Kutipan/link docs aktual | Unverified |
| Daftar model image & biaya **per 1 gambar** | Nama/ID model dan cost dari API/docs | Unverified |
| Model termurah <=2 kredit & fallback <=2 | Aturan pemilihan berdasar tarif nyata | Unverified |
| Submit prompt & respons job ID | HTTP method, path, schema, idempotency | Unverified |
| Query status + retrieve asset | Status, retries, error codes, URL expiry | Unverified |
| Cek saldo kredit admin | Endpoint dan respons atau dinyatakan unavailable | Unverified |
| Maximum concurrency | Uji serial, dua, tiga; kegagalan slot/rate | Unverified |
| Retensi aset di galeri Jenna | Periode dan cara resolve ulang | Unverified |
| Cross-origin client download (untuk IndexedDB/Drive) | Test aktual CORS/fetch atau fallback yang sah | Unverified |
| Top-up manual | URL halaman beli kredit valid (jangan reka endpoint) | Unverified |
| Hak API untuk pelanggan pihak ketiga | Persetujuan tertulis / ketentuan resmi | Unverified |

**Jangan sertakan API key, token OAuth, password atau data pelanggan di laporan verifikasi.** Jika bukti tidak tersedia, tandai Blocked dan jangan menganggapnya fakta.
