# Lanjutan setelah starter pack lengkap

- references/starter-pack + SHA256: seluruh sumber asli tersedia, tanpa perubahan; root AGENTS disesuaikan ke path dokumen yang benar.
- docs/CONFLICT-REPORT: audit aktual mengganti laporan sementara. SQL legacy sudah default-deny; masalah utama relasi profiles dan fondasi engine belum lengkap.
- docs/MIGRATION-PLAN: urutan fresh install dan transisi existing profiles/actors/assignment, tanpa menimpa histori atau eksekusi otomatis.
- supabase/migrations/202610260001_device_access.sql: fresh-schema preflight, role pending nullable, active wajib role/paired dan tidak revoked, indeks FK/audit. Ini penyempurnaan draft yang belum pernah diterapkan ke Supabase, bukan perubahan migration produksi.
- tests/database.test.ts + package.json/lockfile: PostgreSQL WASM lokal untuk tes SQL nyata dengan fixture Auth; tidak menggunakan cloud.
- README, ACCEPTANCE, BOOTSTRAP-OWNER, PHASE-2-HANDOFF, VERIFICATION: status sumber dan pengujian diperbarui, batas Phase 0–1 tetap.

TODO: review migration di Supabase test; implementasi secure pairing dan status resolver Phase 2; browser QA; acceptance role/resource; engine atomik fase lanjut; backup restore dan deploy berizin. Tidak ada keputusan bisnis baru diasumsikan.

## Phase 2

- Migration 002: service-only pairing RPC, persisted rate buckets, transactional single-use consumption + device activation + audit, expiry/revoke/owner role checks.
- server/pairing-api.ts + functions/api: verified JWT boundary, CSPRNG/hash-only token handling, trusted Cloudflare IP HMAC, exact origin and body bounds. Secret backend tidak ada dalam VITE/bundle frontend.
- UI: status refresh/fail-closed, full UUID untuk verifikasi admin, owner issue/list/revoke dan employee activation shell. Business operations tetap belum dibuka.
- Branding: palette/reference typography, original asset slot, PWA update prompt. Logo asli menunggu lampiran file.
- Tests: 29 tes tambahan di atas baseline 26; PostgreSQL WASM dan mocked API boundary. Wrangler compile lokal ditambahkan.
- Dokumen setup Phase 2 menjelaskan konfigurasi TEST, admin bootstrap, runtime secret, UAT live, retention dan recovery. SQL asli maupun SQL produksi tidak dijalankan.

## Phase 3

- Data usaha owner-only: supplier, produk, warung, agen; tambah/ubah/arsip, server search/pagination dan optimistic version.
- Perjanjian harga exact scope direct/agent dan agent+store override; range tidak overlap, immutable amounts, closing+replacement atomic, audit dan idempotent requests.
- New service-only RPC di migration 20261109130426_master_data_pricing.sql. Existing owner/device/invite tidak disentuh; tidak ada seed bisnis atau public grants.
- Cloudflare boundary master API mewarisi verifikasi JWT, origin dan ingress; body cap 8 KB dan persisted throttle. Pesan khusus jika SQL belum dipasang.
- Menu Data usaha terpisah dari Perangkat tim; employee tetap tidak mendapat akses data master. Layout owner penuh dan mobile 360px diuji.
- 101 tes unit/integrasi lokal, 4 browser fixture tests, build dan Functions compile lulus. Source siap untuk review/manual migration TEST; bukan klaim engine bisnis lengkap atau live database telah diubah.

## Perbaikan navigasi Harga & Riwayat

Hasil list kini terikat pada query/tab yang memuatnya sehingga profil dari tab sebelumnya tidak pernah dirender sebagai harga pada frame transisi. Memperbaiki layar putih yang muncul dari tab Produk, Warung atau Agen terisi. Formatter tanggal menjaga data kosong/invalid tetap terlihat sebagai label. Regresi browser mencakup switching berulang dan refresh; tidak perlu migration atau perubahan data pengguna.

## Phase 4

- Pembelian bahan per lot dengan supplier/harga snapshot, gram, expiry opsional dan biaya perolehan nullable.
- Repacking hingga 20 lot bahan, rekonsiliasi berat terukur, batch produk baik pcs dan biaya belum lengkap tanpa HPP/laba palsu.
- Gudang/muatan lapangan/penguasaan agen, transfer produk jadi, saldo per lot/lokasi dan ledger immutable. Tidak ada penjualan/kas/komisi akibat transfer.
- Pembalikan owner-only dengan alasan, opposite ledger legs dan penolakan bila stok dependency tidak cukup; tidak menghapus histori.
- RPC atomik/idempotent service-only, schema helper privat, status/role check, scope lapangan dan cost redaction, persisted throttle, serialized posting + row locks.
- Menu produksi/stok mobile, selector pencarian/paginasi, ringkasan sebelum posting, receipt dari server dan query-key isolation. Data usaha/perangkat tetap tersedia bila migration baru belum diterapkan.
- 125 tes lokal, 11 tes browser dan pengujian concurrency dua koneksi PostgreSQL 17 lulus; build dan Functions compile lulus. Tidak mengubah database live, env/credential atau owner. Panduan manual/UAT TEST ditambahkan; admin kedua tetap ditunda.
