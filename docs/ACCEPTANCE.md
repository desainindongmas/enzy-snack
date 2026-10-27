> **Pembaruan Phase 2:** matriks di bawah merekam baseline Phase 0–1. Pairing sekarang diimplementasikan dan diuji lokal (expiry/reuse/throttle/revoke/atomic rollback) melalui Pages Functions dan RPC. Hasil terbaru di [VERIFICATION](VERIFICATION.md); setup dan batas UAT live di [PHASE-2-SETUP](PHASE-2-SETUP.md). Baseline tidak menjadi klaim status terkini endpoint baru.

# Acceptance dan batas verifikasi

| Persyaratan | Verifikasi Phase 0–1 | Status yang tetap menunggu |
|---|---|---|
| Anonymous tidak membaca/menulis data | PostgreSQL WASM: anon dan authenticated pending pada synthetic business probe dengan RLS default-deny; read kosong/write 42501; direct device/invite/audit read ditolak | REST/RLS Supabase nyata dan semua tabel bisnis kelak |
| Revoked tertolak | PostgreSQL WASM: helper active → revoked memblokir next read pada policy fixture dengan UID sama | JWT nyata, subscription/cache dan operasi bisnis |
| Owner tidak dapat diklaim publik | SQL client insert role owner ditolak, fungsi claim tidak ada; bootstrap placeholder menolak; stub semua 503 | End-to-end Auth/Edge dan recovery admin |
| Kode expiry/reuse tertolak | Tes stub selalu 503 untuk expired/reused/wrong/forged | TTL boundary, single-use transaction race, persistent rate limit, hash/token binding belum diimplementasikan |
| Sesi anonim | Mocked Auth: reuse, startup concurrent sekali, error dan konfigurasi kosong | Auth provider/network/device nyata |
| Role separation/resource scope | Fase ini seluruh akses bisnis tertutup | production/field/owner pada setiap endpoint Phase 2–6 |
| Inventory/finance | Belum diimplementasikan | Seluruh acceptance Master §12/16.6/18.6/22/25.12: snapshot, retur, partial remittance, cash vs revenue, concurrency, retry, costing, opening balances, reconciliation |
| PWA/mobile | TypeScript + Vite menghasilkan app shell/manifest/service worker; CSS breakpoint mobile | Browser 360px, offline refresh, installability dan perangkat nyata |
| Backup | Tidak ada data nyata atau backup dijalankan | Restore database test dan rekonsiliasi ledger sebelum go-live |

PGlite menjalankan engine PostgreSQL WASM lokal dengan fixture auth.users/auth.uid dan database roles. Ini bukti perilaku SQL pada engine lokal, bukan verifikasi Supabase Auth/JWT, PostgREST, Edge runtime, schema produksi, deployment atau security review menyeluruh. Probe bisnis dan policy fixture hanya di tests/database.test.ts; tidak disertakan dalam migration aplikasi. Nilai fixture eksplisit TEST ONLY.

SQL referensi asli tidak dieksekusi. Migration hasil rekonsiliasi hanya dieksekusi secara disposable di test lokal. Tidak ada migration/seed/bootstrap otomatis ke Supabase.
