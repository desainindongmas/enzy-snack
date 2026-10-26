# Lanjutan setelah starter pack lengkap

- references/starter-pack + SHA256: seluruh sumber asli tersedia, tanpa perubahan; root AGENTS disesuaikan ke path dokumen yang benar.
- docs/CONFLICT-REPORT: audit aktual mengganti laporan sementara. SQL legacy sudah default-deny; masalah utama relasi profiles dan fondasi engine belum lengkap.
- docs/MIGRATION-PLAN: urutan fresh install dan transisi existing profiles/actors/assignment, tanpa menimpa histori atau eksekusi otomatis.
- supabase/migrations/202610260001_device_access.sql: fresh-schema preflight, role pending nullable, active wajib role/paired dan tidak revoked, indeks FK/audit. Ini penyempurnaan draft yang belum pernah diterapkan ke Supabase, bukan perubahan migration produksi.
- tests/database.test.ts + package.json/lockfile: PostgreSQL WASM lokal untuk tes SQL nyata dengan fixture Auth; tidak menggunakan cloud.
- README, ACCEPTANCE, BOOTSTRAP-OWNER, PHASE-2-HANDOFF, VERIFICATION: status sumber dan pengujian diperbarui, batas Phase 0–1 tetap.

TODO: review migration di Supabase test; implementasi secure pairing dan status resolver Phase 2; browser QA; acceptance role/resource; engine atomik fase lanjut; backup restore dan deploy berizin. Tidak ada keputusan bisnis baru diasumsikan.
