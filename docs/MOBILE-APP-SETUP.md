# Tampilan aplikasi dan nama sapaan

Pembaruan ini melanjutkan Phase 7. Data dan pasangan perangkat lama tetap dipertahankan. Tidak perlu mengganti variabel Cloudflare atau melakukan pairing ulang.

## Aktifkan penyimpanan nama (satu kali)

1. Buka file `supabase/migrations/20261110043537_device_display_names.sql` di GitHub, branch **development**.
2. Klik **Raw**, lalu salin seluruh isinya.
3. Di Supabase proyek Enzy Snack yang digunakan aplikasi, buka **SQL Editor → New query**.
4. Tempel SQL, klik **Run**, tunggu sukses. SQL ini dijalankan setelah seluruh SQL Phase 7 berhasil; jangan menjalankan ulang SQL fase lama.
5. Setelah deployment Cloudflare selesai, buka aplikasi. Jika pembaruan aplikasi ditawarkan, terapkan pembaruannya. Jangan menghapus data browser karena identitas perangkat tersimpan di sana.

Sebelum SQL ini dijalankan, menu usaha yang lama tetap bisa dipakai. Pembuatan kode pairing dengan nama dan perubahan sapaan menampilkan petunjuk SQL, tanpa menyimpan nama secara diam-diam hanya di HP.

## Menu pada HP

- **Pemilik:** Beranda, Stok, Warung, Uang, Lainnya.
- **Produksi:** Beranda, Produksi, Stok, Lainnya.
- **Lapangan:** Beranda, Muatan, Warung, Uang, Lainnya.

Di layar komputer menu utama berada di sebelah kiri. Tab di dalam setiap menu disusun dalam beberapa baris saat ruang layar terbatas. Menu Lainnya milik pemilik berisi **Data usaha**, **Perangkat tim**, **Kesiapan usaha**, dan **Profil & sapaan**. Karyawan hanya mendapat profil dan menu sesuai perannya.

Ringkasan beranda pemilik adalah akumulasi transaksi yang tercatat, bukan transaksi hari ini atau laporan laba. Nilai yang gagal dimuat tidak ditampilkan sebagai nol. Pergerakan kas/bank bukan laba.

## Beri nama sapaan pemilik

1. Buka **Lainnya → Profil & sapaan**.
2. Pilih **Ubah nama sapaan**.
3. Ketik nama yang diinginkan, misalnya “Bu Nur”, lalu **Simpan nama sapaan**.
4. Buka Beranda: sapaan menjadi “Halo, Bu Nur.”

Pemilik dapat mengubah namanya sendiri. Perubahan nama tidak mengubah peran atau izin perangkat.

## Daftarkan HP karyawan

1. Pemilik membuka **Lainnya → Perangkat tim**.
2. Isi **Nama sapaan**, misalnya “Bu Ani”.
3. Isi **Nama perangkat**, misalnya “HP Produksi”.
4. Pilih akses **Produksi** atau **Lapangan**.
5. Pilih **Buat kode pairing**, lalu masukkan kode pada HP karyawan seperti biasa. Kode sekali pakai berlaku 10 menit dan disembunyikan saat berpindah halaman/tab.
6. Setelah terhubung, beranda karyawan menyapa nama yang diberikan.

Untuk HP yang sudah terdaftar, pilih **Ubah sapaan** pada daftar Perangkat tim. Tidak perlu mencabut akses. Karyawan meminta pemilik bila ingin mengganti nama.

## Pemeriksaan singkat

- Berpindahlah lewat menu bawah; hanya satu kelompok pekerjaan terbuka.
- Buka Data usaha lewat Lainnya, lalu Harga & Riwayat dari beberapa tab berbeda.
- Isi formulir, pindah menu, lalu pilih **Tetap mengisi**; isian masih ada. Pilih **Tinggalkan isian** hanya jika memang ingin membuang isian. Transaksi yang sudah terkirim harus diperiksa di riwayat sebelum diulang.
- Simpan sapaan dan muat ulang Beranda; namanya tetap sama.
- Perangkat produksi tidak mendapat menu uang, pengaturan perangkat, atau data usaha.
- Putuskan internet: akses tetap ditutup sampai status perangkat dapat diperiksa kembali.

Pembaruan tampilan ini tidak menyelesaikan backup proyek aktual. Lanjutkan pemasangan Docker dan panduan `BACKUP-RESTORE.md` setelahnya; seluruh data sekarang tetap UJI.
