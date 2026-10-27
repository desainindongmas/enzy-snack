# Phase 2 — aktivasi perangkat dan konfigurasi backend

## Status
Implementasi source Phase 2 menggunakan Cloudflare Pages Functions `/api/*` dan RPC PostgreSQL atomik. Ini belum bukti konfigurasi Supabase/Cloudflare live sudah dilakukan. Data bisnis/ledger belum diimplementasikan. Logo asli belum tersedia sebagai file lokal; halaman memakai wordmark teks sementara dan warna krem/teal/kuning/oranye dari acuan. Tidak mengklaim artwork sementara sebagai logo asli.

## Mengaktifkan di lingkungan TEST dahulu

1. Buat proyek Supabase Free TEST; aktifkan anonymous sign-in. Jangan isi data bisnis asli. Jika mengaktifkan CAPTCHA untuk anonymous sign-in, integrasi token CAPTCHA frontend perlu diselesaikan dahulu; tidak ada bypass CAPTCHA dalam source ini.
2. Periksa schema aktual. Proyek fresh menggunakan migration `202610260001_device_access.sql` lalu `202610270002_secure_pairing.sql`, secara manual via admin/CLI migration setelah review. Jangan jalankan kedua SQL referensi asli. Jika schema legacy atau draft berbeda sudah diterapkan, berhenti dan tulis transition migration sesuai schema; jangan hapus tabel demi melewati preflight.
3. Pada Cloudflare Pages build env isi public `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`, rebuild. Key publik bukan service-role key. Jangan commit `.env`.
4. Pada Cloudflare Pages runtime Settings → Variables and Secrets (nama UI dapat berubah) tambahkan:
   - `SUPABASE_URL`: URL proyek TEST yang sama dengan build frontend.
   - `SUPABASE_SERVICE_ROLE_KEY`: **secret terenkripsi**, service-role key hanya backend. Jangan pakai prefix VITE.
   - `PAIRING_IP_HASH_SECRET`: **secret terenkripsi**, minimal 32 karakter acak kuat dari password manager/CSPRNG. Jangan salin ke chat atau repo.
   - `APP_ORIGIN`: `https://enzy-snack.pages.dev` persis, tanpa trailing slash. Domain custom/preview ditolak hingga dikonfigurasi sengaja.
   - `PAIRING_ENABLED`: `true` hanya setelah migration direview/diterapkan dan bootstrap/test siap. Jika kosong/false, semua API fail-closed 503.
5. Redeploy branch `development` agar Pages Functions menerima environment terbaru. Folder `functions/` berada di root repo, di luar dist; Git integration Pages membundelnya. `_routes.json` membatasi eksekusi Functions ke `/api/*`. Wrangler hanya digunakan untuk compile lokal, tidak melakukan deploy otomatis dari script build.
6. Buka halaman pada HP owner. UI membuat sesi anonymous. Buka **Identitas untuk admin**, cocokkan UUID lengkap dengan auth.users di Supabase Dashboard melalui verifikasi admin, bukan ID pendek saja.
7. Admin mengedit UUID di `supabase/admin/bootstrap-owner.sql` dan menjalankannya manual. Template placeholder sengaja gagal. Script tidak menjadi endpoint dan tidak berjalan di pipeline. Owner pertama tidak diberi kode universal/default.
8. Tekan **Periksa status perangkat** pada HP owner. Setelah server menyatakan active/owner, bagian Tambah perangkat tampil.
9. Pilih Produksi/Lapangan dan nama perangkat; buat kode. Tempel kode 64 karakter pada HP karyawan. Kode 256-bit, sekali pakai, TTL 10 menit; hanya hash SHA-256 disimpan. Kode asli ditampilkan sekali di state UI, tidak di localStorage/log/URL, dan disembunyikan saat pindah tab.
10. Owner dapat mencabut perangkat karyawan. Status/RPC berikutnya menolak revoked walau JWT masih valid. UI memeriksa status setiap 30 detik serta saat focus/online/tab kembali; UI/cache bukan batas otorisasi. Perangkat revoked tidak dapat re-pair dengan UID yang sama; pemulihan melalui admin dengan sesi/perangkat baru. App tidak mengizinkan revoke owner atau mengundang owner tambahan.

Perubahan env backend memerlukan redeploy. Jangan menaruh secret di wrangler.toml atau `.env.example`. Jangan memakai URL preview acak sebagai APP_ORIGIN produksi tanpa memahami audiensnya.

## Batas kepercayaan dan penyimpanan

- API memverifikasi bearer JWT via Supabase Auth `getUser(token)`; tidak mempercayai actor/role/UID dari body atau hasil decode JWT tanpa verifikasi.
- SQL `enzy_pairing_action` hanya EXECUTE untuk service_role. Browser anon/authenticated tidak mempunyai akses tabel device/invite/audit/rate limit maupun RPC ini.
- `CF-Connecting-IP` hanya dipercaya pada request yang memiliki `request.cf` dari runtime Pages. X-Forwarded-For dan IP di body tidak dipakai. IP disimpan sebagai HMAC dengan secret backend, bukan plaintext. Jangan menerbitkan handler ini sebagai HTTP server umum yang mempercayai header client.
- Code/hash tidak dimasukkan audit; audit hanya event, actor device, dan referensi internal. Auth UUID pada audit penolakan adalah metadata akses, bukan rahasia pairing. Batasi akses audit admin.
- Rate buckets persisten per UID + IP + global dalam fixed window 1 menit: redeem 5/15/100; issue/revoke 5/10/50; status/list 60/180/3000. Error dikembalikan dari fungsi agar hitungan kegagalan tidak rollback. Batas ini dapat menyebabkan penolakan layanan bila diserang; pantau kapasitas/kuota Auth dan gunakan abuse protection platform yang tersedia dalam anggaran. Body dibatasi 2 KB; origin exact; API response no-store, tidak ada cross-origin CORS.
- Race dilindungi advisory lock per auth UID, row lock invite dan share lock issuing owner. Aktivasi, consume invite dan audit satu transaksi. Semua penulisan bisnis tetap belum aktif.

## Maintenance dan pemulihan

Admin dapat menghapus **hanya rate buckets** yang lebih tua dari satu hari: `delete from public.enzy_pairing_limits where window_start < now() - interval '1 day';`. Jangan hapus audit. Atur retensi invites yang sesuai jejak audit dan kebutuhan operasi setelah review; tidak ada scheduler keep-alive.

Untuk insiden: set `PAIRING_ENABLED=false`, redeploy; revoke perangkat via admin dengan audit; bila perlu rotasi secret backend di dashboard dan redeploy. Rotasi HMAC IP mereset bucket IP efektif tetapi bucket UID/global tetap berlaku pada window berjalan. Bootstrap recovery owner tetap manual, simpan backup terpisah dan buktikan restore sebelum data nyata.

## Logo asli

Letakkan file logo yang dikirim pemilik sebagai `src/assets/enzy-snack-logo.png` (juga mendukung jpg/jpeg/webp dengan basename yang sama). Vite akan membundelnya dan komponen Brand menampilkan artwork di header serta panel desktop. Tidak ada request 404 untuk logo jika file belum diberikan. Jangan mengambil gambar lain dalam workspace sebagai logo. Untuk mengganti favicon/install icon dengan artwork asli, siapkan crop/icon yang disetujui pemilik setelah file tersedia.

## UAT live sebelum dinyatakan siap

- Anonymous/pending: tidak dapat mengakses device list, issuance, revoke, tabel/RPC secara langsung.
- Owner active: issue/list; production/field: issuance/revoke/list 403.
- Salah/expired/reused code ditolak; attempt ke-6 UID dalam window 429. Periksa IP/global secara terkontrol di TEST.
- Dua klien HTTP/JWT berbeda menukar kode serentak: tepat satu aktif; uji juga owner revoke vs redeem serentak. Tes PostgreSQL WASM memakai satu koneksi dan tidak membuktikan lock antar koneksi server.
- Putus jaringan, reload, sesi terhapus, revoke saat UI terbuka, tab tersembunyi, kode hilang; tidak ada klaim tersimpan sebelum server berhasil.
- Pastikan secret tidak ada di asset browser/devtools/source map. Jangan log Authorization/code/key.
- Test browser 360px, Pages Functions runtime, backup/restore Supabase. Kode yang diuji lokal bukan pengganti verifikasi ini.

Setelah pairing live lulus UAT, lanjutkan master data Phase 3. Pairing aktif tidak berarti finance/inventory/konsinyasi sudah bisa dipakai.

## Diagnosis halaman aktivasi

Pesan startup kini memuat kode yang aman dibagikan: SETUP-01 pengaturan VITE belum terbaca pada build/environment yang digunakan; SETUP-02 client config invalid; SETUP-03 anonymous provider nonaktif di proyek yang dihubungi; SETUP-04 CAPTCHA; SETUP-05 rate limit; SETUP-06 koneksi/provider tidak terjangkau; SETUP-07 kunci publik/sesi tidak diterima; SETUP-08 belum terklasifikasi; SETUP-09 storage browser tidak tersedia. Ini petunjuk diagnosis, bukan bukti root cause untuk semua kasus.

Tombol Coba koneksi lagi mengulangi penyiapan sesi tanpa menghapus identitas yang tersimpan. Jangan menghapus data situs/merotasi key/menjalankan ulang SQL hanya berdasarkan pesan generik. Jika build tidak membaca VITE, cocokkan Production vs Preview serta commit deployment terlebih dahulu. Jangan mengirim nilai secret saat meminta bantuan. Untuk memuat patch, gunakan banner Perbarui aplikasi setelah deployment sukses; jangan reset storage perangkat yang sudah dipasangkan.
