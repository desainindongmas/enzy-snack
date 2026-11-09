# Phase 3 — data usaha dan riwayat harga

## Apa yang tersedia
Pemilik dapat menambah/mengubah/mengarsipkan supplier, produk/SKU, warung, dan agen. Harga langsung memerlukan warung+produk; harga agen memerlukan agen+produk dan boleh khusus warung. Semua uang berupa rupiah bulat. Harga beli supplier tetap per pembelian/lot di fase lanjut; tidak ditanam sebagai harga tetap supplier. Tidak ada data warung/agen/produk/harga fiktif yang dibuat oleh migration.

Satu baris konfigurasi bisnis Enzy Snack dibuat untuk scope database yang saat ini memang satu usaha. Belum mendukung multi-business melalui UI. Endpoint tidak menerima business_id dari browser; scope diambil dari singleton yang dikelola admin. Perangkat tidak diubah dan tidak ada owner/admin kedua dibuat.

## Langkah untuk pemilik — cukup satu SQL baru

1. Tunggu deployment Cloudflare terbaru dari branch development berhasil. Jangan mengubah variabel koneksi atau secret yang sudah bekerja.
2. Di HP pemilik, buka Enzy Snack dan tekan Perbarui aplikasi jika banner muncul. Menu baru **Data usaha** dan **Perangkat tim** tersedia. Sebelum SQL dipasang, Data usaha menampilkan pesan bahwa SQL Phase 3 diperlukan. Perangkat tim tetap tersedia.
3. Buka `supabase/migrations/20261109130426_master_data_pricing.sql` di GitHub; gunakan Copy raw file atau Raw lalu salin semua teks.
4. Di Supabase proyek **enzy-snack-test**, buka SQL Editor → New query, tempel seluruh SQL, lalu Run. Tidak perlu mengubah placeholder; SQL ini tidak meminta ID HP maupun secret.
5. Jika muncul Success, kembali ke Data usaha di HP dan tekan Coba muat ulang. Jika error, berhenti dan kirim teks error saja. Jangan menjalankan ulang SQL pertama/kedua, menghapus tabel, atau mereset browser untuk melewati error. Pastikan target proyek TEST, bukan database legacy.

File ini menambah tabel/RPC baru, tidak menghapus owner/device/invite. Ditulis sebagai satu transaksi. Jangan mengeksekusi ulang jika sudah berhasil: cek dengan query read-only di bawah. Deployment frontend tidak menjalankan SQL otomatis.

```sql
SELECT
  to_regclass('public.enzy_products') IS NOT NULL AS produk_ada,
  to_regclass('public.enzy_price_agreements') IS NOT NULL AS harga_ada,
  to_regprocedure('public.enzy_master_action(uuid,text,text,text,jsonb)') IS NOT NULL AS fungsi_data_ada;
```

## Cara mengisi dan mencoba

1. **Produk** → Tambah produk. Isi nama, kode SKU unik, berat nominal dalam gram, dan pcs per pack sesuai produk yang dipakai. Nilai awal 25 pcs adalah bantuan formulir yang bisa diubah, bukan stok aktual.
2. **Supplier**, **Warung**, **Agen** → tambahkan profil. Telepon/alamat/catatan boleh kosong. Interval kunjungan warung awal 14 hari bisa diubah; bukan jatuh tempo pembayaran.
3. **Harga & Riwayat** → Tambah harga. Pilih produk dan jalur Langsung/Agen. Cari warung/agen pada kolom pilihan jika tidak tampil pada halaman pertama. Isi harga ke warung dan hak Enzy bila jalur agen; komisi dihitung dari selisih dan hanya menjadi informasi per pcs laku, bukan transaksi atau laba final.
4. Pilihan **Harga khusus untuk warung tertentu** membuat scope produk+agen+warung yang terpisah dari harga umum agen. Dua periode dalam scope yang sama tidak boleh tumpang tindih. Tidak ada fallback harga otomatis jika belum dikonfigurasi. Pemilihan prioritas harga dan snapshot pada transaksi baru akan dipakai oleh engine fase lanjut.
5. Kosongkan Berlaku mulai untuk mulai saat disimpan. Jika mengisi tanggal/jam, input mengikuti zona waktu perangkat dan tampilan riwayat memakai WIB. Tanggal akhir bersifat eksklusif: satu periode boleh berakhir tepat saat periode berikutnya dimulai.
6. Untuk mengubah harga terbuka, gunakan **Ganti harga**, isi harga baru dan alasan. Sistem menutup periode lama dan membuat baris baru dalam satu transaksi; harga/nilai pada baris lama tidak ditimpa. Perubahan pengganti tidak boleh backdated sebelum saat request atau sebelum awal periode lama. Riwayat yang sudah ditutup tidak diedit/dihapus dari UI.
7. Untuk profil yang tidak digunakan, pilih **Arsipkan**. Riwayat tetap ada; centang Tampilkan arsip juga untuk melihatnya. Pengarsipan tidak memindahkan stok atau uang. Reaktivasi arsip belum disediakan di UI tahap ini.

Untuk latihan di proyek TEST, gunakan nama berawalan `UJI` agar tidak tertukar dengan data usaha nyata. Jangan menganggap pengisian harga sebagai posting penjualan. Setelah latihan, profil UJI dapat diarsipkan; harga UJI tetap berlabel riwayat test dalam database TEST. Jangan menyalin database latihan menjadi production tanpa proses cut-off/review.

## Pengujian manual sebelum lanjut

- Tambah produk, ubah nama, muat ulang: data tetap ada. Coba kode SKU sama: ditolak.
- Arsipkan profil: hilang dari daftar aktif tetapi tetap terlihat pada arsip. Data yang sudah diarsipkan tidak bisa dipakai untuk perjanjian harga baru.
- Tambah harga dengan rentang bertabrakan pada scope sama: ditolak. Rentang berdampingan boleh.
- Ganti harga: nilai lama tetap ada, periode lama ditutup, baris baru muncul. Harga tidak boleh negatif, dan hak Enzy tidak boleh melebihi harga warung.
- Dua browser owner mengubah profil yang sama: versi lama ditolak; muat ulang sebelum menyimpan ulang.
- Production/field tidak mempunyai menu Data usaha. Memanggil API master secara manual dari perangkat tersebut tetap 403; direct table/RPC dari anon/authenticated tetap ditolak.
- Ulangi permintaan dengan request_id+payload identik: hasil lama dikembalikan. Key sama dengan payload berbeda: conflict. Jika koneksi gagal, tombol Simpan menyimpan request key yang sama selama payload form tidak berubah. Refresh halaman membuang state form/key lokal; periksa daftar sebelum menambah ulang setelah kegagalan jaringan.
- Cabut perangkat: operasi berikutnya ditolak meski JWT belum habis. Offline tidak pernah dianggap berhasil menyimpan data.

## Desain keamanan dan batas fase

Semua tabel bisnis baru memakai RLS + FORCE RLS dan revoke client grants. RPC hanya EXECUTE service_role. Backend memakai JWT terverifikasi dan IP HMAC Cloudflare yang sama dengan Phase 2. SQL memeriksa device owner/active/revoked pada setiap panggilan. Lookup, pencarian dan pagination dilakukan server-side (20 baris/halaman); tidak mengirim seluruh katalog ke perangkat sekaligus.

Mutasi profil memakai row lock + expected version. Perjanjian harga memakai advisory lock per exact scope, pemeriksaan overlap, immutable guard, audit append-only, serta request hash SHA-256/idempotency. Semua FK lintas data menyertakan business_id. Retensi request/audit perlu dipantau; jangan hapus audit atau mengubah baris harga lama untuk mengatasi kesalahan. Tabel master diberi indeks scope/list/actor dan setiap hubungan harga mempunyai indeks sesuai FK.

Frontend membatasi body mutasi master 8 KB, pairing tetap 2 KB. RPC memakai persisted minute rate buckets global 1000, IP 150, UID 60 untuk endpoint master. Secret backend tidak dikirim ke browser.

Stock ledger, pembelian/produksi, penugasan lapangan historis, kunjungan, penjualan, setoran, costing dan snapshot transaksi berada di fase berikutnya. Data supplier/warung/agen sendiri belum memberikan akses kepada petugas. Pengelolaan produksi/field ditahan sampai aturan resource/assignment diterapkan dan diuji. Tidak ada angka HPP/laba, stok awal, saldo kas, atau transaksi yang dikarang.

## Verifikasi yang sudah dan belum dilakukan

Lokal: PostgreSQL WASM untuk migration/RPC/grants/role/revoke/version/idempotency/pricing; boundary HTTP dengan mock Auth; browser Chromium 360px dengan API/Auth fixture. Ini tidak menggantikan JWT/REST live, multi-connection concurrency PostgreSQL, UAT Supabase/Cloudflare, backup restore, atau review akses production. Akses connector ke proyek live ditolak sehingga SQL belum diterapkan dari sesi pengembangan.

Jika ada error migration, jangan mengubah data lama. Kirim pesan error untuk diagnosis transition. Untuk masalah frontend, menu Perangkat tim tetap bisa dipakai dan rollback Pages tidak memerlukan penghapusan tabel Phase 3. Tidak ada paid API atau scheduler keep-alive.
