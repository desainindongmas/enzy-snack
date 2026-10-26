# Hasil verifikasi — 26 Oktober 2026, Asia/Jakarta

## Berhasil
- `npm test`: 26/26 tes, 3 file. PostgreSQL integration 12, Auth mocked 4, stub/struktur 10.
- `npm run build`: TypeScript dan Vite PASS; manifest, service worker dan build statis di dist dihasilkan.
- PostgreSQL WASM disposable (PGlite): migration baru berhasil; pending tanpa role valid; anonymous default-deny read/write; akses client device/invite/audit ditolak; insert owner oleh client ditolak; active-only helper menolak next read setelah revoke; role/active constraint; audit update/delete ditolak; bootstrap placeholder gagal; public claim function tidak ada; fresh migration menolak schema legacy tanpa mengubahnya.
- File starter pack dipertahankan byte-for-byte, diverifikasi dengan SHA256 manifest. Audit file sumber dan rencana transisi selesai.

## Belum diverifikasi / belum diaktifkan
- Supabase Auth/JWT/PostgREST, rate limit, RLS pada proyek nyata dan Edge Functions belum diuji. Fixture auth.uid dan role lokal tidak memverifikasi token provider.
- Stub issue/redeem selalu 503. Tes expiry/reuse hanya membuktikan stub menolak; hashing, TTL, atomic consume, binding dan brute-force protection nyata belum dibangun.
- Probe bisnis/policy fixture hanya di test lokal. Tabel bisnis aplikasi dan operasi stok/uang belum dibuat; tidak mengklaim otorisasi seluruh engine sudah diuji.
- Browser 360px, PWA installability, offline dan perangkat nyata belum diuji karena fasilitas browser QA tidak tersedia.
- Backup/restore Supabase belum dijalankan. Tidak ada proyek Supabase/kredensial atau data nyata diberikan.

## Tidak dilakukan
Tidak menjalankan kedua SQL referensi asli, tidak migration/seed/bootstrap produksi, tidak push/deploy, tidak membuat repo remote, tidak memakai paid API atau transaksi bisnis fiktif. Migration hasil rekonsiliasi hanya dimuat ke PostgreSQL WASM disposable di test lokal.
