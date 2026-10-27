# Phase 2 — implementasi dan batas verifikasi

Source pairing kini diimplementasikan melalui Cloudflare Pages Functions dan RPC service-only, bukan Supabase Edge Function stub lama. Endpoint Edge stub lama tetap menolak dan tidak digunakan/dideploy. Setup yang berlaku: [PHASE-2-SETUP](PHASE-2-SETUP.md).

## Sudah diimplementasikan dan diuji lokal
- JWT server verification boundary, exact origin, trusted Cloudflare ingress, body limit/no-store.
- Status perangkat sendiri, owner issue/list/revoke; pending/revoked default-deny.
- CSPRNG 256-bit code, SHA-256 hash-only storage, TTL 10 menit, bind verified auth UID.
- Persisted UID/IP/global throttling, single-use row lock + actor advisory lock, active owner authorization dan atomic audit.
- UI anonymous/pairing, owner management, production/field activation shell, online/status refresh. Tidak ada role switch atau public claim owner.
- Logo asset slot dan branding sesuai palet referensi. File asli belum tersedia; tidak diganti artwork generatif.

## Belum dapat dikerjakan tanpa konfigurasi eksternal
- Inventaris dan penerapan migration ke proyek Supabase TEST, bootstrap owner manual.
- Secret runtime Cloudflare dan anonymous Auth settings. Tidak ada secret/kredensial diberikan dalam sesi.
- E2E/JWT/REST/Pages live, true multi-connection concurrency/revoke race, browser 360px/install PWA dan backup restore.
- Pemasangan file logo asli setelah dilampirkan ulang.

SQL referensi asli dan SQL produksi tidak dijalankan. Business tables/posting masih fase lanjut. Jangan menyatakan operasional bisnis siap hanya karena halaman tampil atau perangkat berhasil pairing.
