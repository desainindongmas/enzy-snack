# Verifikasi Phase 2 — hasil sesi pengembangan

## Berhasil
- `npm test`: 55/55 tes dalam 5 file. Pairing PostgreSQL 18, boundary Pages API 11, database foundation 12, mocked Auth 4, baseline fail-closed/struktur 10.
- TypeScript + Vite/PWA build PASS. Workbox mengecualikan `/api/*` dari navigation fallback, tidak ada runtime API caching. API no-store.
- Wrangler Pages Functions compile PASS, output lokal di work/pages-functions (tidak dilacak Git). Ini tes bundling, bukan deployment atau runtime Cloudflare live.
- SQL local PostgreSQL WASM: expiry/reuse, UID-bound activation, privileged grants, active production/field separation, owner-only issuance/revoke/list, persisted UID/IP/global limits, immediate revoked behavior, owner invitation invalidation, immutable audit dan rollback on audit failure.
- API boundary: token diverifikasi melalui backend Auth abstraction; forged actor/body ditolak; kode random dikembalikan sekali dan hanya hash masuk DB; trusted ingress/exact origin/body cap/error redaction/no-store/rate status diuji dengan mock.

## Batas penting
PGlite memakai satu koneksi dan fixture auth.users/auth.uid. Promise parallel di tes menjadi queued contenders, bukan pembuktian concurrency multi-koneksi PostgreSQL server. Supabase JWT/getUser nyata, PostgREST/RLS proyek sebenarnya, Cloudflare runtime/headers/secret, multi-connection race, backup restore serta browser 360px/PWA belum diuji. Tidak ada kredensial proyek atau akses akun diberikan.

Tidak ada migration/bootstrap/seed produksi, data bisnis asli, paid API, atau deployment langsung dari CLI. Push branch dapat memicu Git integration Cloudflare milik user; hasil deployment live perlu diperiksa di dashboard.

Logo asli tidak ditemukan sebagai file di workspace/ZIP. Warna dan wordmark sementara telah disesuaikan; slot asset `src/assets/enzy-snack-logo.png` (jpg/jpeg/webp juga didukung) siap. Tidak ada image generatif yang diklaim sebagai logo user.

Petunjuk aktivasi: PHASE-2-SETUP.md. Keberhasilan tes lokal tidak berarti bisnis siap operasional; master data, ledger stok/finance dan kunjungan masih fase lanjut.

## Perbaikan diagnosis startup

60/60 tes dalam 6 file lulus; build TypeScript/Vite lulus. Lima tes tambahan membuktikan klasifikasi kegagalan konfigurasi/Auth, redaksi pesan provider, retry setelah kegagalan dan import fail-closed saat konfigurasi client invalid. UI menampilkan kode SETUP-01..09 tanpa nilai key/token/error body. Polling tidak berjalan sebelum identitas sesi tersedia, agar pesan startup tidak tertimpa. Retry tidak menghapus storage atau mempromosikan perangkat. Penyebab konfigurasi live user belum terverifikasi; screenshot menunjukkan belum ada identitas HP, bukan bukti tunggal variabel salah.

## Perbaikan alamat proyek vs Data API URL

76/76 tes lokal dalam 7 file lulus; TypeScript/Vite build dan Wrangler Pages Functions compile lulus. Tes SDK sebenarnya dengan transport HTTP fixture membuktikan signup menuju `/auth/v1/signup` dan RPC menuju satu `/rest/v1/rpc/enzy_pairing_action`, tanpa suffix ganda. Tes config frontend dan boundary backend mencakup URL Data API; path/credentials/query/fragment yang tidak diharapkan ditolak. Tidak menggunakan jaringan Supabase atau membuat akun anonymous baru dalam tes tersebut.

Dokumentasi inisialisasi Supabase diperiksa; changelog Markdown tidak dapat dibaca oleh alat web (content-type), sehingga indeks HTML changelog diperiksa. Tidak ada perubahan SDK/CLI/schema pada perbaikan ini. Akses connector ke proyek Supabase user ditolak oleh kontrol akses; konfigurasi Auth, log live dan keberhasilan signup nyata belum dapat diperiksa. Tidak ada perubahan SQL atau kunci. Validasi live memerlukan deployment Cloudflare baru dan percobaan dari HP user.

## Phase 3 — data dasar dan harga

- `npm test`: 101/101 tes dalam 8 file lulus. Tambahan Phase 3: 21 tes SQL master/pricing dan 4 tes boundary HTTP di atas baseline 76.
- `npm run test:browser`: 4/4 tes Chromium lulus pada viewport 360×800 dengan Auth/API fixture. Mencakup tambah/ubah/arsip produk tanpa overflow horizontal, harga agen khusus warung dengan selector pencarian, pembatasan menu produksi/offline, serta akses menu perangkat saat migration master belum ada.
- TypeScript/Vite/PWA build lulus dan Wrangler Pages Functions compile lulus.
- Migration hasil CLI baru diuji di PostgreSQL WASM disposable, bukan database live. Mencakup RLS/grants, owner vs pending/production/field/revoked, optimistic version, retry hash, pagination, exact-scope overlap, perubahan harga atomik, histori immutable, invalid references/amounts/dates.
- Tidak ada contoh bisnis disisipkan oleh migration. Hanya konfigurasi singleton bisnis Enzy Snack dibuat; semua fixture `TEST` berada di pengujian.
- Percobaan browser awal sandbox gagal bind/connect localhost (EPERM). Pengujian kemudian berhasil pada executor dengan izin proses yang sesuai, tanpa mengubah pembatasan origin/Auth/data aplikasi.

Belum: pemeriksaan schema/grants/advisors proyek Supabase sebenarnya (connector menolak akses), penerapan SQL manual TEST oleh user, JWT/Pages/PostgREST end-to-end live, true multi-connection concurrency PostgreSQL, backup/restore dan stock/finance engine. Tidak menjalankan migration remote atau membuat admin kedua. Panduan aktivasi: PHASE-3-SETUP.md.

## Regresi layar putih saat membuka Harga & Riwayat

Masalah direproduksi di Chromium dengan daftar Produk terisi sebelum pindah ke Harga & Riwayat: regression test gagal pada baseline. Penyebab: kind tab berubah pada render sebelum useEffect menghapus rows tab lama; renderer harga menerima baris profil tanpa valid_from sehingga format tanggal melempar RangeError. Supplier kosong kebetulan tidak memicu pemformatan baris sehingga menjadi workaround.

Perbaikan mengikat hasil list (records/count/loading/error) pada key query lengkap: kind, pencarian, halaman, arsip dan reload. Render menampilkan loading sampai ada hasil yang sesuai; hasil tab lama tidak ditafsirkan sebagai schema tab baru. Active-request cleanup tetap menolak response terlambat. Error mutasi dipisahkan dari error list. Formatter tanggal juga memakai label eksplisit bila tanggal kosong/invalid, tanpa mengarang timestamp.

103/103 tes lokal dalam 9 file dan 7/7 tes browser Chromium 360px lulus. Tiga regression test baru mencakup daftar Produk/Warung/Agen yang sudah terisi, perpindahan bolak-balik, dan refresh sebelum membuka harga; tidak ada pageerror. Dua tes formatter memverifikasi WIB serta missing/invalid date. TypeScript/Vite build lulus. Tidak ada SQL, migration, env/secret, hak akses, atau data live yang diubah; tidak perlu mengulang SQL di Supabase. Pengujian browser memakai fixture API/Auth, bukan akses database user.

## Phase 4 — lot, produksi dan ledger stok

- `npm test`: **125/125** dalam 10 file. Tambahan: 20 tes SQL inventory dan 2 boundary API. Tes mencakup role/pending/revoked/field scope, read cost redaction, private helper/grants, snapshots harga, biaya belum lengkap, mass balance, multi-lot, expiry/FEFO, stok tidak cukup, retry/different payload, append-only, audit failure rollback, transfer dan reversal dependencies. Semua migration dimuat bersama pada database disposable.
- `npm run test:browser`: **11/11** Chromium. Empat tes inventory baru: penerimaan/repacking setelah review, transfer ditolak lalu dikoreksi, role produksi tanpa nominal/owner controls, serta migration stok belum ada tanpa memblokir menu master/perangkat. Tujuh tes Phase 3 termasuk regresi layar putih tetap lulus. Viewport 360×800; screenshot lokal tidak dilacak Git.
- TypeScript/Vite/PWA build dan Wrangler Pages Functions compile lulus. API tetap no-store, service worker tidak menyimpan respons bisnis.
- `python tests/postgres-concurrency.py`: lulus dengan **PostgreSQL 17 resmi, dua koneksi psql independen**, container lokal tanpa jaringan/port host, fixture TEST. Koneksi kedua terbukti menunggu lock sebelum koneksi pertama commit. Dua transfer 30 melawan stok 50 hanya meloloskan satu; request UUID sama hanya membuat satu operasi/dua ledger legs; transfer bersaing dengan reversal batch ditolak atomik bila barang sudah pindah. Seluruh bucket akhir sama dengan penjumlahan ledger dan tidak negatif. Container tes dibuang melalui finally.
- Ringkasan konfirmasi mempertahankan pilihan supplier/produk/lokasi/lot saat kembali mengubah isian, termasuk selama opsi dimuat ulang. Tidak ada optimistic stock save atau angka biaya palsu.

Migration dibuat sebagai file baru melalui Supabase CLI dan tidak diterapkan ke Supabase remote oleh pengembang. Tidak ada perubahan env, secret, owner atau data bisnis asli. Hanya tiga lokasi konfigurasi kosong disiapkan; tidak ada fixtures bisnis dalam migration.

Batas: tes PostgreSQL memakai auth/roles fixture dan belum membuktikan JWT/Cloudflare/PostgREST proyek live. Pengguna perlu menjalankan migration baru dan UAT TEST. Connector Supabase tidak memberi akses ke proyek sehingga audit schema/grants/advisors live belum dilakukan. Concurrency baru dibuktikan pada engine inventory, bukan seluruh alur pairing/master. Backup/restore, impor stok awal, kunjungan/retur dan finance masih fase berikutnya. Panduan: PHASE-4-SETUP.md.
