# Handoff Phase 2 dan checklist

- [x] Sumber starter pack lengkap dan diaudit; konflik profiles/device dan gaps SQL dicatat di CONFLICT-REPORT dan MIGRATION-PLAN.
- [ ] Inventaris schema/ACL/policies/fungsi proyek Supabase nyata; jika legacy ada, buat transition migration terpisah. Migration fresh sengaja menolak schema Enzy existing.
- [ ] Sediakan proyek Supabase TEST, aktifkan anonymous Auth dan abuse protection; jangan memakai data asli.
- [ ] Review dan terapkan migration secara manual di test; uji anon, authenticated anonymous, active role, revoked dan pemalsuan UUID.
- [ ] Tambahkan endpoint status-perangkat yang memvalidasi JWT server-side dan hanya mengembalikan perangkat sendiri. Tidak mempercayai role/localStorage; status fresh dan cache bisnis dibersihkan saat revoke.
- [ ] Issuance: JWT valid, owner active, nama/role tervalidasi, token minimal 128-bit dari CSPRNG, hash saja disimpan, TTL singkat terkonfigurasi, jangan log token.
- [ ] Redemption: rate limit persisten/atomik per IP terpercaya + auth UID, batas global, hash compare, validasi TTL dan unused, SELECT FOR UPDATE; bind UID dari JWT terverifikasi, bukan body.
- [ ] Konsumsi invite + aktivasi device + audit dalam satu transaksi. Race menghasilkan tepat satu sukses; retry tidak mengaktifkan perangkat berbeda.
- [ ] CORS allowlist frontend, body size limit, error generik, no-store, pembatasan fungsi privileged dan audit tanpa rahasia.
- [ ] Shell role hanya sesudah server menyatakan active. Tidak ada role switch. UI bisnis menunggu Phase 3+.
- [ ] Jalankan integration/adversarial tests, expiry/reuse/bruteforce/revoke, backup restore. Baru ganti stub; jangan membuka tabel invite ke client.

## Risiko tersisa
Migration baru diuji di PostgreSQL WASM lokal dengan fixture Auth; belum diuji di Supabase nyata. SQL referensi asli tidak dijalankan. Tidak ada data bisnis cloud atau sinkronisasi operasional yang diaktifkan. Frontend tanpa konfigurasi menampilkan status belum tersedia. Sesi hilang perlu pairing ulang. Cache service worker hanya app shell; jangan cache API/auth/data bisnis. PWA memerlukan HTTPS atau localhost dan pemeriksaan perangkat nyata. Kuota free tier bisa berubah; tanpa scheduler keep-alive. Kode bootstrap memerlukan review admin. CSP/header hosting dan observabilitas diatur sebelum deploy berizin.

Phase 3–7: master data dan snapshot harga; posting stok/finance atomik server dengan lock dan idempotency payload hash; kunjungan/retur; komisi dan setoran tanpa double count; COST_INCOMPLETE jika biaya belum diketahui; recovery/UAT/deploy hanya setelah acceptance lulus dan izin tersedia.
