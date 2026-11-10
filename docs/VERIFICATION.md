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

## Phase 5 — kunjungan, siklus titipan dan retur

- `npm test`: **157/157** dalam 12 file. Tambahan Phase 5: 28 tes SQL visit, 2 boundary HTTP, 2 tes presisi nominal. Migration lama dan baru diuji bersama. Mencakup assignment/scope/role/revocation, RLS/ACL/service-role/private helper, immutable headers/lines/results/inspection, full reconciliation, snapshot harga direct/agent override, quote mismatch, biaya tersembunyi dari field, idempotency/version, server timestamp, expired/insufficient stock, audit failure rollback, reversal chain/corrected repost dan exact ledger/projection.
- `npm run test:browser`: **17/17** Chromium fixture. Enam tes Phase 5: assignment dengan review, titipan pertama dengan quote server tanpa posting sebelum konfirmasi, mass reconciliation dan retry setelah konflik tanpa mengarang sukses, pembatasan kontrol field, inspection hold/reversal, serta SQL belum terpasang tanpa memblokir menu lama. Regresi Harga & Riwayat dan Phase 4 tetap lulus. Viewport 360×800, screenshot internal lokal tidak dilacak.
- TypeScript/Vite/PWA build dan Wrangler Pages Functions compile lulus. Inventory cap tetap 16 KB, visit 24 KB. Respons bisnis tetap no-store dan tidak di-cache service worker.
- PostgreSQL 17 resmi dengan **dua koneksi independen**: tiga race Phase 4 tetap lulus, tiga race Phase 5 tambahan lulus. Visit vs ordinary transfer memperebutkan bucket yang sama tanpa overspending; dua penutupan siklus hanya membuat satu hasil/penjualan dan yang kedua CONFLICT; request visit identik menghasilkan satu visit/cycle dan replay receipt. Semua projection akhir sama dengan sum ledger, tidak ada stok negatif. Container disposable offline tanpa port host, selalu dihapus pada finally.

Pengujian browser memakai endpoint fixture, bukan Supabase live. Tes PostgreSQL memakai fixture auth/roles di database disposable dan membuktikan concurrency core, bukan JWT/Cloudflare/PostgREST proyek pengguna. Changelog Supabase sesi ini HTTP 403 dan tool dokumentasi membutuhkan link koneksi yang tidak tersedia; tidak mengubah SDK/Auth atau mengklaim advisor live sudah dijalankan. Lampiran bisnis asli tidak dapat dipulihkan di executor sesi ini; audit terdahulu dan keputusan pengguna menjadi sumber aturan.

Tidak ada remote migration, seed data bisnis, perubahan secrets/env, bootstrap owner atau admin kedua. User sebelumnya melaporkan seluruh UAT Phase 4 termasuk role berhasil; Phase 5 perlu dipasang dan diuji manual TEST sesuai PHASE-5-SETUP.md. Edar ulang/pemusnahan retur sengaja belum dibuka tanpa kebijakan pemilik; stock opening/cut-off, finance, cash custody/collection/remittance serta backup/restore masih fase lanjut. Ini bukan klaim bisnis sudah siap go-live.

## Phase 6 — keuangan, komisi dan penguasaan uang

- `npm test`: **186/186** dalam 13 file. Tambahan 27 tes SQL finance dan 2 boundary API di atas Phase 5. Mencakup balanced journals/projection, piutang/revenue tanpa cash saat sale, pembayaran langsung/field/agent, partial collection, potongan aktual vs earned/paid commission, zero-share/full-withheld, reservation/partial confirmation/cancel, modal/cash out tanpa saldo negatif, idempotency/conflict/revoke/reassignment, scope/role/RLS/grants/private helper, immutable evidence, legacy review, deferred constraint, audit failure rollback dan financial dependency pada visit reversal. Kegagalan dependensi tetap menyimpan rate attempts sambil membatalkan perubahan bisnis.
- `npm run test:browser`: **22/22** Chromium 360px. Lima tes baru finance: gross agent receipt→proposal→owner acceptance tanpa double revenue/cash awal, direct partial payment dengan review, rejected cash out/retry stable ID tanpa sukses palsu, field payment/proposal tanpa owner controls, legacy warning dan missing SQL yang tidak memblokir menu lama. Pemeriksaan tambahan setelah perapian ringkasan memastikan rekening tujuan penerimaan terlihat jelas; screenshot internal tidak dilacak Git.
- TypeScript/Vite/PWA build dan Pages Functions compile lulus. Nominal UI BigInt/string, finance body cap 8 KB, no-store, search/pagination server. Tidak ada SDK/dependency/key/Auth configuration diubah.
- Script PostgreSQL 17 dua koneksi nyata: seluruh race Phase 4–5 tetap lulus. **Lima skenario keuangan** lulus: simultaneous overcollection ditolak; UUID sama menghasilkan satu payment/journal; competing cash out tidak menghabiskan uang dua kali; pembayaran vs visit reversal terserialisasi dan menolak FINANCE_DEPENDENCY; dua konfirmasi setoran tidak melebihi sisa usulan. Revenue sebelum/sesudah remittance sama. Setiap financial operation seimbang dan projection setiap akun sama dengan ledger sum, di samping rekonsiliasi stok. Deferred journal constraint benar-benar dieksekusi saat commit PostgreSQL. Container offline tanpa host port selalu dibuang.

Migration baru saja dibuat/disimulasikan lokal; tidak dijalankan ke Supabase pengguna. Hanya akun klasifikasi tanpa saldo/jurnal dibuat. Kunjungan lama tidak dibackfill menjadi kas/piutang otomatis. Setup/UAT manual: PHASE-6-SETUP.md. Pemilik melaporkan semua UAT Phase 5 berhasil; ini laporan pengguna, bukan klaim pemeriksaan live dari pengembang.

Logo yang baru dikirim terlihat inline, tetapi tidak mempunyai path/file ID biner yang bisa diakses tool/workspace; pencarian attachment lokal tidak menemukan gambar itu. Pemilik diminta melampirkan PNG/WebP asli. Belum ada penggantian logo dan tidak memakai image generatif/usaha lain sebagai logo asli. Aset/favicons final menunggu file; status logo harus dilaporkan terpisah dari keberhasilan keuangan.

Batas: browser memakai fixture API/Auth dan database memakai auth/role fixture; tidak memverifikasi live JWT/Pages/PostgREST/advisors/backup restore atau melakukan transfer bank. Changelog Supabase HTTP 403, SDK/Auth tidak diubah. Saldo fisik awal/cut-off, penyelesaian biaya/HPP/laba, rekonsiliasi historis dan backup/restore masih diperlukan di Phase 7. Cash out belum auto-matching vendor payable/purchase lot. Tidak mengaktifkan edar ulang retur tanpa kebijakan atau admin kedua, tidak mengubah secrets/env/owner, dan tidak menyatakan siap go-live.

## Pemasangan logo asli setelah ZIP diterima

Status menunggu file pada catatan Phase 6 sebelumnya sudah terselesaikan. ZIP hanya memuat Enzy Snack Logo.png; PNG transparan asli 1254×1254 disalin ke public/brand/enzy-snack-logo.png tanpa penggambaran ulang atau perubahan byte. SHA-256 sumber dan aset yang disajikan build sama: `33676efaa52e2a1340a3ff3b229db3544a2cbfdce49c9ec05c5931f7b05ce900`.

TypeScript/Vite/PWA build lulus. Pemeriksaan Chromium pada preview build produksi lokal memverifikasi gambar berhasil decode dengan naturalWidth 1254, tidak ada wordmark fallback, tidak ada overflow di 360×800 dan 1280×900, hero desktop terlihat, favicon/Apple icon/manifest merujuk PNG yang benar dengan ukuran aktual, serta tidak ada pageerror. Setelah service worker aktif, PNG ada pada cache dan tetap tampil ketika offline/reload; cache tidak memuat /api/*. Screenshot/script pemeriksaan lokal berada di work/ dan tidak dilacak Git.

Tidak menambah tes unit yang meniru perubahan asset atau mengulang tes database karena SQL/Auth/finance tidak diubah. Instalasi ikon pada perangkat fisik dan status deployment Cloudflare tetap perlu dilihat pengguna; pembaruan ikon layar utama mengikuti browser/OS. Tidak perlu SQL, env baru, pairing ulang atau penghapusan data browser.

## Phase 7 — kesiapan, pembukaan fisik dan pemulihan

- `npm test`: **215/215** dalam 15 file lulus. Tes baseline Phase 6 tetap dipertahankan. Tambahan Phase 7: **21 tes SQL readiness/opening, 6 tes enkripsi backup, 2 boundary API**. Mencakup fresh-only/once-only/idempotency, explicit zero/physical/legacy confirmations, stock/money/custody opening tanpa revenue/modal baru/HPP palsu, expiry quarantine, konsumsi bahan opening, atomic audit failure rollback, larangan half reversal, client/service ACL, evidence owner_reported, full-outer projection drift, RLS/grant/journal drift dan tie-out piutang/revenue/komisi ke transaksi sumber walaupun ledger/projection saling cocok.
- `npm run test:browser`: **26/26** Chromium 360px. Empat tes readiness baru: UJI database tidak dapat dibuka ulang atau dihapus; evidence review sebelum simpan dan tetap owner_reported; nol harus eksplisit; nonzero stock/cash opening memakai preview sebelum final posting; migration belum ada tidak memblokir menu lama dan produksi tidak memperoleh kontrol readiness. Skenario nol/nonzero merupakan dua tes terpisah. Seluruh regresi master/harga/stok/kunjungan/keuangan tetap lulus. Screenshot lokal tidak dilacak Git.
- TypeScript/Vite/PWA build dan Wrangler Pages Functions compile lulus. Logo asli dipertahankan. API readiness owner-only, body 32 KB, verified JWT actor, persisted rate, no-store dan helper schema privat. Tidak mengubah secret, session atau konfigurasi live.
- **PostgreSQL 17 multi-koneksi**: seluruh race lama tetap lulus; dua request pembukaan identik bersamaan menghasilkan satu opening stock/cash dan replay receipt; owner lain tidak dapat membuka ulang. Reconciliation report lulus setelah seluruh race. Tidak ada stok/uang ganda atau saldo negatif.
- **Rehearsal backup/restore nyata pada PostgreSQL lokal**: dua database disposable dengan fixture Auth/roles, opening stock/cash, sale direct/agent, actual withheld commission, field custody, partial/pending remittance, audit dan requests. Custom pg_dump dienkripsi AES-256-GCM/PBKDF2-SHA256 600.000 iterasi, didekripsi dengan SHA256 archive identik, file mode 0600; restore single-transaction ke target kosong lulus. Seluruh row fingerprint Auth fixture/enzy tables dan definisi fungsi/grants/RLS cocok. ACL dinormalisasi karena pg_dump dapat mengubah urutan ACL tanpa mengubah hak. Report baru lulus, revoked/client tetap ditolak, replay setelah restore tetap idempotent, dan sisa setoran dapat diterima tanpa revenue kedua. File privat/container dibuang.
- Enkripsi lokal menolak password lemah, input kosong, password salah, header/ciphertext rusak, truncation dan overwrite. Output plaintext yang gagal diautentikasi tidak dipublikasikan; file partial dibersihkan. Tidak membaca kredensial provider atau mengunggah backup.

Pemilik menyatakan seluruh data proyek sekarang UJI. Tidak ada data itu dihapus/reset, tidak ada saldo nyata/cut-off diasumsikan, tidak membuat proyek produksi, tidak menjalankan remote migration/backup/restore dan tidak memasangkan admin kedua. Saldo awal hanya pada database benar-benar fresh; titipan/piutang/utang/komisi historis masih memerlukan penyelesaian/migrasi terverifikasi. Biaya opening selalu incomplete dan laporan laba belum dinyatakan final.

Dokumentasi backup resmi Supabase diperiksa melalui source GitHub. CLI db dump help terkini diperiksa (remote/schema/role-only/data-only/use-copy/file). Pro/Team/Enterprise menyediakan daily backup sesuai paket; Free tidak diasumsikan punya daily backup. Managed Auth/provider/sesi, roles/secret dan Storage objects tetap memerlukan rencana pemulihan aktual. Connector membutuhkan link koneksi yang tidak tersedia; proyek pengguna tidak dapat di-audit/dibackup dari executor ini.

**Batas kesiapan:** proof lokal bukan pemulihan managed Supabase, advisor live, bank/stocktake fisik atau persetujuan go-live. `live_approved` tetap false; indikator konsistensi lulus dan lima laporan pemilik tidak mengaktifkan produksi. UAT Phase 6, backup/restore proyek aktual, konfigurasi/akses live, cut-off dan persetujuan pemilik masih perlu bukti sebelum peralihan produksi. Panduan pengguna PHASE-7-SETUP.md, panduan admin BACKUP-RESTORE.md dan audit read-only terpisah sudah disediakan.

## Tampilan mobile dan nama sapaan — 10 November 2026

- `npm test`: **225/225** dalam 16 file. Tambahan: 7 tes database profil (nama ikut redeem, kompatibilitas undangan lama, owner-only/self rename, validasi, immutable audit rollback dan RPC ACL), 3 boundary API (verified actor, validasi nama/privilege injection, migration-required tanpa kode pairing palsu).
- `npm run test:browser`: **30/30**, termasuk seluruh regresi bisnis sebelumnya pada 360px; tambahan alur nama saat issue, profil persisten setelah reload, native dialog untuk isian belum disimpan, menu peran dan forbidden deep link, serta sidebar pada desktop 1440px. Screenshot mobile/desktop diperiksa lokal, tidak berisi transaksi usaha dan tidak dilacak Git.
- TypeScript/Vite/PWA build dan Pages Functions compile lulus. PostgreSQL 17 concurrency suite dan encrypted pg_dump/restore rehearsal tetap lulus dengan kolom/fungsi nama baru; reconciliation report tidak menemukan drift. Seluruh pengujian menggunakan data sintetis/offline.
- Tidak menjalankan migrasi pada Supabase pengguna; pemilik perlu menjalankan **hanya** `20261110043537_device_display_names.sql` sesuai `MOBILE-APP-SETUP.md`. Tidak mengganti secret, role pairing, identitas Auth, transaksi atau logo asli. Database lama tetap mendukung modul bisnis; nama membutuhkan migrasi tambahan dan gagal dengan pesan yang jelas bila belum tersedia.
- Bukti lokal bukan verifikasi deployment Cloudflare atau backup aktual proyek Supabase. Pemasangan Docker pada komputer pengguna dan backup/go-live tetap dilanjutkan terpisah.
