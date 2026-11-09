# Backup dan pemulihan — panduan admin Enzy Snack

Panduan ini membedakan rehearsal lokal yang sudah diuji dari pemulihan Supabase sebenarnya. Pemilik nonteknis mengikuti PHASE-7-SETUP dahulu; bagian terminal dikerjakan admin yang memahami target database dan penyimpanan kredensial.

## Cakupan yang harus dicadangkan

| Komponen | Yang disimpan / diperiksa |
|---|---|
| Database bisnis | public.enzy_* dan schema privat, data, constraints, sequences, functions, grants/RLS, ledger/projection, audit, idempotency dan evidence/opening |
| Identitas | Hubungan auth.users ke perangkat; managed Auth/provider dan sesi dipulihkan menurut prosedur Supabase, bukan UUID acak baru |
| Infrastruktur | Versi source/migration dan konfigurasi proyek; secret disimpan terpisah di vault, bukan repo/file laporan |
| Storage | Database hanya menyimpan metadata; file objek perlu backup terpisah bila digunakan |
| Logo | PNG asli termasuk source publik; bukan rahasia atau pengganti backup database |

Dokumentasi resmi yang diperiksa: [Database Backups](https://supabase.com/docs/guides/platform/backups). Sumber resmi GitHub juga diperiksa karena akses sebagian halaman dokumentasi dibatasi pada executor. Pro/Team/Enterprise menyediakan backup harian sesuai retensi paket; Free dianjurkan mengekspor dan menyimpan off-site. Jangan menghapus proyek asal setelah punya satu file: backup yang disimpan provider dapat ikut hilang saat proyek dihapus. Password custom roles dan objek Storage tidak otomatis tercakup oleh backup database.

## Rehearsal yang dapat dijalankan dari repo

```sh
python tests/postgres-backup-restore.py
```

Memerlukan Node dan Docker lokal dengan image PostgreSQL 17 resmi sesuai digest di script. Script menerima **tidak ada URL/target remote**. Ia membuat container offline tanpa port host dan dua database kosong dengan fixture Auth/roles sintetis, menerapkan migration, mengisi data TEST, melakukan custom pg_dump, mengenkripsi dan mendekripsi, lalu pg_restore ke database lain dengan single transaction/exit-on-error. Script tidak memakai `--clean` untuk menimpa proyek berjalan.

Yang dibandingkan: fingerprint seluruh baris fixture Auth dan tabel Enzy, definisi fungsi, grants yang dinormalisasi (urutan ACL bisa berubah saat dump), RLS/FORCE, stok/uang/jurnal/siklus, ledger idempotency dan pembukaan saldo awal. Setelah restore, klien tanpa hak dan perangkat revoked tetap ditolak; retry pembayaran kembali sebagai replay; setoran tertunda dapat diselesaikan tanpa revenue kedua. Container dan file sementara dibuang setelah tes.

Ini **bukan** bukti managed Supabase Auth/JWT/Storage atau proyek cloud pengguna telah dipulihkan. Cluster roles fixture sudah dibuat di lingkungan test; ekspor database tunggal bukan backup semua role/credential cluster. Rehearsal data nyata membutuhkan target terpisah dan rencana admin sesuai schema/versi provider aktual.

## Enkripsi file backup secara lokal

Tool tidak mengambil database atau mengunggah data. Ia mengenkripsi file backup yang sudah diperoleh admin:

```sh
node scripts/backup-crypto.mjs encrypt private-backups/enzy.dump private-backups/enzy.enzybak
node scripts/backup-crypto.mjs decrypt private-backups/enzy.enzybak private-backups/enzy-restored.dump
```

Jalankan pada terminal interaktif. Password ditanyakan tanpa ditampilkan; enkripsi meminta dua kali. Gunakan password kuat minimal 12 karakter dan simpan di vault terpisah. Jangan menaruh password dalam argumen perintah, file source, chat, catatan Kesiapan usaha atau nama file. Tool memakai AES-256-GCM, salt/IV acak, PBKDF2-SHA256 600.000 iterasi, header terautentikasi dan file mode 0600; output dipublikasikan setelah berhasil dan tidak menimpa file yang sudah ada. File kosong ditolak. Password salah, ciphertext/header rusak atau backup terpotong harus gagal tanpa meninggalkan output plaintext yang dianggap selesai.

Input dapat berupa custom dump, file SQL, atau arsip berisi semua komponen backup yang sudah diinventarisasi. Ganti nama contoh dengan file yang benar-benar ada; bila ekspor menghasilkan beberapa file SQL, enkripsi setiap file atau paket lengkapnya, bukan hanya satu komponen.

Gunakan direktori privat dengan izin 0700. `private-backups/`, `*.dump`, `*.backup`, `*.enzybak` dan file partial diabaikan Git, tetapi tetap jangan menjalankan `git add -f` atas backup. Tool tidak otomatis menghapus sumber plaintext; admin menanganinya sesudah dekripsi/restore benar-benar diverifikasi. Enkripsi dan checksum saja tidak membuktikan backup memuat semua data yang diperlukan.

## Ekspor proyek Supabase sebenarnya

1. Tentukan target project ref dan cakupan schema/roles/Auth/Storage sebelum mengambil data. Pastikan target adalah proyek milik pemilik yang benar.
2. Periksa fitur Backup di dashboard dan paket yang dipakai. Bila provider backup tersedia, uji restore menggunakan prosedur resmi ke target yang terpisah dan jangan menimpa proyek aktif.
3. Untuk logical export, gunakan CLI resmi dan baca `supabase db dump --help` pada versi terpasang. CLI yang diperiksa pada sesi ini memakai `--remote=<ref>`, `--file`, `--role-only`, `--schema`, `--data-only`, `--use-copy`. Versi lain dapat berbeda. Autentikasi dilakukan lokal dengan kredensial di vault/fitur CLI yang aman; tidak diberikan lewat chat atau dimasukkan ke contoh command.
4. Contoh pembagian ekspor **business schemas**, bukan paket pemulihan Supabase lengkap:

```sh
umask 077
mkdir -p private-backups
supabase db dump --remote=PROJECT_REF_YANG_DIVERIFIKASI --role-only --file private-backups/roles.sql
supabase db dump --remote=PROJECT_REF_YANG_DIVERIFIKASI --schema public,enzy_private --file private-backups/schema.sql
supabase db dump --remote=PROJECT_REF_YANG_DIVERIFIKASI --schema public,enzy_private --data-only --use-copy --file private-backups/data.sql
```

Tiga file ini **belum** memulihkan managed Auth, sesi, objek Storage, secret Cloudflare atau seluruh konfigurasi provider. Device FKs memerlukan auth.users yang sesuai. Admin harus merancang bagian managed schemas/identitas memakai dokumentasi dan kemampuan proyek aktual; jangan mengganti UID historis, menonaktifkan semua kontrol secara sembarang atau menempel dump ke proyek aktif agar lolos FK.

5. Simpan semua komponen yang diperlukan dalam folder privat, inventaris cakupannya, enkripsi dan simpan off-site. Catat versi Postgres/migration, waktu, sumber, jumlah/fingerprint/checksum, cakupan dan hasil restore; jangan mencatat password/key. Jangan menggunakan opsi dry-run/debug untuk menghasilkan log kredensial.
6. Pulihkan ke target test terpisah menggunakan prosedur yang sesuai format (custom pg_dump berbeda dari file SQL CLI), versi provider, Auth dan hak admin. Uji foreign keys, trigger, role/grants dan idempotency; jangan hanya memeriksa bahwa restore tidak error.
7. Jalankan audit read-only aplikasi dan cocokkan dengan inventaris sebelum restore. Uji owner/production/field/pending/revoked, partial remittance, retry dan audit. Jangan memasangkan perangkat/owner baru untuk menutupi identitas yang salah tanpa mapping administratif yang disetujui.
8. Pemilik menyetujui target produksi setelah hasil diperiksa. Tetapkan penanggung jawab, frekuensi backup, retensi, lokasi cadangan kedua, sasaran kehilangan data dan waktu pulih. Tidak ada scheduler cloud yang diaktifkan oleh repo ini.

## Audit read-only setelah restore

SQL admin `supabase/admin/phase7-readonly-audit.sql` hanya menjalankan laporan dalam transaksi read-only. Menu Kesiapan usaha juga menyediakan pemeriksaan yang sama; endpoint app tetap mencatat rate attempts tetapi tidak memperbaiki atau mengubah saldo bisnis.

Setiap temuan harus ditinjau sebelum peralihan. Hasil hijau tidak membuktikan bank fisik cocok, backup lengkap, provider Auth bekerja atau kesiapan operasional; lampirkan bukti eksternal terpisah. Catatan yang disimpan pemilik adalah laporan pemilik, bukan sertifikasi otomatis oleh aplikasi.
