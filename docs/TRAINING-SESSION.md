# Sesi latihan tim dari kosong

Pada 10 November 2026 pemilik secara eksplisit meminta data lama dikosongkan sekarang agar tim memulai latihan bersama dari nol. Permintaan ini menggantikan penundaan reset sebelumnya, hanya untuk proyek **Enzy Snack Test**. Pemilik telah mengekspor aplikasi+Auth, mengenkripsi, memverifikasi hasil dekripsi, lalu berhasil memulihkan dan memeriksa konsistensinya di PostgreSQL lokal terpisah.

## Hasil yang diharapkan setelah reset

Produk, supplier, agen, warung, harga, penugasan, lot, stok, pembelian, produksi, kunjungan, retur, tagihan, komisi, usulan setoran, saldo, ledger, request idempotency, pembukaan dan evidence latihan lama kosong. Tiga lokasi bawaan dan tujuh akun sistem keuangan dibuat kembali **tanpa saldo**; ini konfigurasi mesin, bukan transaksi latihan baru.

Identitas bisnis, Supabase Auth, perangkat, nama sapaan, peran, status pencabutan, audit perangkat lama dan rate limits pairing tetap ada. Undangan yang belum dipakai dibatalkan agar kode dari sesi lama tidak mengaktifkan perangkat pada sesi baru. Reset dicatat pada audit perangkat yang tetap append-only. Tidak ada bootstrap ulang, pemulihan perangkat revoked, perubahan secret, schema atau hak klien.

## Mulai latihan

1. Tutup formulir lama pada seluruh HP, lalu refresh aplikasi. Jangan menghapus data/cache browser karena identitas perangkat tersimpan di sana.
2. Pemilik membuka **Lainnya → Data usaha** dan membuat produk, supplier, agen, warung serta harga latihan dari awal.
3. Siapkan kas/bank latihan, lokasi muatan dan penugasan sesuai skenario tim.
4. Latih pembelian, produksi, distribusi, kunjungan/retur, pembayaran, komisi dan setoran melalui menu sesuai peran. Semua nominal tetap data latihan; jangan menganggapnya saldo usaha nyata.
5. Perangkat yang sudah aktif tidak perlu pairing ulang. Perangkat baru memakai kode aktivasi baru; perangkat revoked tetap ditolak.

Data usaha nyata belum dimasukkan. Titipan/piutang/uang petugas-agen/komisi usaha sebenarnya masih perlu rekonsiliasi saat mulai pencatatan riil. Reset sesi latihan tidak menyelesaikan saldo historis tersebut.

## Prosedur admin yang dipertahankan

`supabase/admin/reset-training-session.sql` adalah template admin terpisah, **bukan migration atau endpoint aplikasi**. Template tidak bisa dijalankan sebelum admin mengisi UUID bisnis TEST yang diverifikasi dan referensi reset unik yang secara eksplisit diotorisasi pemilik. Jangan mengambil UUID dari data yang tidak dipercaya, menjalankannya otomatis saat deployment, atau memakainya pada produksi.

- Semua 40 tabel Enzy harus cocok dengan inventaris migration saat ini; perubahan schema/tabel privat/TRUNCATE trigger yang tidak dikenal menolak reset.
- Kunci tabel, snapshot perangkat dan konfigurasi bisnis, bounded TRUNCATE **RESTRICT** pada 35 tabel bisnis, seed konfigurasi nol, invalidasi undangan pending, verifikasi seluruh tabel, readiness/freshness dan audit dilakukan dalam satu transaksi.
- Tidak ada `CASCADE`, penonaktifan trigger, perubahan grant/RLS atau penghapusan Auth/perangkat.
- FK dari tabel di luar daftar menyebabkan pembatalan, bukan ikut terhapus. Kesalahan audit/verifikasi membatalkan seluruh perubahan termasuk TRUNCATE dan pembatalan undangan.
- Referensi reset yang sudah tercatat ditolak. Mengulang request yang sama setelah tim mulai mengisi data tidak menghapus sesi baru.
- Reset berikutnya memerlukan permintaan baru, backup yang sesuai dan referensi baru; template tidak memberi izin permanen menghapus latihan ataupun data riil.

Pengujian pengembang cukup ditargetkan pada reset; UAT fitur lama tidak perlu diulang oleh pemilik. Pemulihan managed Supabase Auth/provider/Storage berbeda dari latihan pemulihan PostgreSQL lokal.
