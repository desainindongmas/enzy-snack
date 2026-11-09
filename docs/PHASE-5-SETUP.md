# Phase 5 — kunjungan warung, penjualan dan retur

Phase 4 sudah diuji oleh pemilik. Phase 5 menambahkan penugasan warung, titipan per lot, kunjungan yang menutup seluruh titipan lama, penjualan terverifikasi, karantina retur, pemeriksaan dan pembalikan. Penerimaan uang, piutang tertagih, kas petugas, potongan komisi dan setoran agen menyusul Phase 6.

## Pasang satu SQL baru

1. Di Cloudflare → Workers & Pages → enzy-snack → Deployments, tunggu deployment Phase 5 **Success**.
2. Buka Supabase proyek **Enzy Snack Test** → **SQL Editor → New query**.
3. Buka file `supabase/migrations/20261109161548_store_visits_returns.sql` pada branch `development` GitHub. Klik **Raw**, lalu salin **seluruh isi file** ke query baru.
4. Klik **Run** sekali dan tunggu sukses. Jangan mengulang SQL Phase 1–4 atau bootstrap pemilik. Tidak ada variabel/secret baru.
5. Refresh aplikasi pada perangkat pemilik. Jika ada pemberitahuan versi baru, perbarui. Jangan hapus data browser karena identitas perangkat tersimpan di sana.
6. Buka **Kunjungan & Retur**. Data usaha, Produksi & Stok dan Perangkat tim tetap tersedia.

Jika ragu SQL sudah terpasang, query ini hanya memeriksa keberadaan tabel/fungsi:

```sql
select
  to_regclass('public.enzy_visits') is not null as tabel_kunjungan_ada,
  to_regclass('public.enzy_consignment_lines') is not null as tabel_titipan_ada,
  to_regclass('public.enzy_return_inspections') is not null as tabel_pemeriksaan_ada,
  to_regprocedure('public.enzy_visit_action(uuid,text,text,jsonb)') is not null as fungsi_kunjungan_ada;
```

Empat hasil harus `true`. Jika Run gagal, simpan pesan error sebelum mencoba lagi; jangan menghapus tabel atau riwayat untuk mengatasi error.

## Uji 1 — siapkan warung dan penugasan

Gunakan data **UJI** di proyek TEST, bukan transaksi usaha sebenarnya. Migration tidak membuat transaksi contoh atau stok awal.

1. Pada **Data usaha**, siapkan warung aktif **UJI Warung Phase 5**, produk aktif, dan harga langsung **Rp1.500 per pcs** untuk kombinasi warung/produk tersebut. Pastikan harga sudah mulai berlaku.
2. Siapkan stok produk jadi sedikitnya **20 pcs** melalui pembelian/repacking latihan Phase 4 jika belum ada. Jika seluruh latihan sebelumnya sudah dibalikkan, buat penerimaan dan repacking UJI dengan kode lot baru. Jangan membuat penerimaan fiktif untuk stok usaha lama.
3. Buka **Kunjungan & Retur → Warung & penugasan**. Cari warung tadi, klik **Atur penugasan**.
4. Pilih saluran **Langsung**, penanggung jawab **Ditangani pemilik**, alasan **UJI penugasan awal**.
5. Klik **Lihat ringkasan → Konfirmasi**. Penugasan hanya mengatur akses; tidak menggerakkan stok atau mencatat penjualan.

Jika memakai petugas lapangan, pilih **Petugas lapangan** dan perangkat lapangan aktif yang sesuai. Perangkat lain tidak mendapat warung ini. Tutup semua titipan terbuka sebelum mengganti petugas/saluran/agen. Perubahan penugasan disimpan sebagai riwayat baru, tidak menimpa konteks kunjungan lama.

## Uji 2 — titipan pertama

1. Pada warung tadi, klik **Catat kunjungan**. Belum ada titipan lama yang harus diselesaikan.
2. Klik **Tambah titipan baru**.
3. Pilih asal **Gudang produk jadi**, pilih lot produk yang memiliki stok, isi jumlah **20 pcs**.
4. Waktu kunjungan boleh kosong; server memakai waktu sekarang. Catatan **UJI titipan pertama**.
5. Klik **Periksa harga & ringkasan**. Pastikan harga snapshot **Rp1.500/pcs** dan penjualan terverifikasi **Rp0**.
6. Klik **Posting kunjungan** dan tunggu konfirmasi server.
7. Pada **Produksi & Stok**, gudang asal berkurang 20 dan lokasi **Titipan · UJI Warung Phase 5** bertambah 20. Total barang milik Enzy tetap sama. Refresh dan periksa kembali.

Penitipan belum merupakan penjualan. Setiap lot menyimpan snapshot produk dan harga yang berlaku pada waktu titip. Perubahan harga master sesudahnya tidak menghitung ulang titipan lama. Titipan baru dibatasi 20 lot berbeda per kunjungan. Barang kedaluwarsa dan sumber karantina ditolak.

## Uji 3 — tarik seluruh sisa dan catat barang laku

Buka **Catat kunjungan** lagi pada warung yang sama. Pada lot titipan lama, isi:

| Kolom | Jumlah latihan |
|---|---:|
| Laku terverifikasi | 12 |
| Retur tampak layak | 4 |
| Retur rusak | 2 |
| Retur kedaluwarsa | 1 |
| Hilang / selisih | 1 |

Totalnya **20 pcs**, sama dengan seluruh titipan lama. Kolom tidak diisi otomatis: isi 0 hanya jika sudah diperiksa tidak ada. Untuk latihan pertama, tidak perlu menambah titipan baru.

1. Catatan **UJI penutupan titipan**. Periksa harga dan ringkasan.
2. Penjualan harus **12 × Rp1.500 = Rp18.000**. Satu barang hilang tidak dianggap laku.
3. Posting dan tunggu konfirmasi.
4. Warung tidak lagi memiliki titipan terbuka. Pada **Riwayat kunjungan** ada laku 12, retur 7, hilang 1.
5. Pada **Produksi & Stok**, stok titipan lama di warung habis dan karantina menerima **7 pcs**. Barang laku/hilang keluar dari stok, dengan kategori hasil tetap terpisah. Retur tidak menambah stok siap jual.
6. Refresh untuk memastikan catatan bertahan.

Opsional: pada kunjungan yang sama, tambahkan **15 pcs** dari stok siap jual yang masih tersedia. Siklus lama tetap harus selesai seluruhnya; sistem membuka siklus baru berisi 15 pcs. Retur kunjungan ini tidak boleh langsung dipakai sebagai sumber titipan baru.

## Uji 4 — penolakan yang benar

- Coba mengisi rincian yang jumlahnya hanya 19 atau menjadi 21 untuk titipan lama 20. Ringkasan/posting harus ditolak; sistem tidak mengisi selisih sebagai barang laku.
- Semua baris titipan lama wajib diselesaikan. Jangan mengosongkan satu lot atau mencatat baris yang sama dua kali.
- Coba menitipkan lebih banyak daripada stok asal; harus ditolak tanpa menutup siklus lama atau menyimpan sebagian gerakan.
- Dua tab/perangkat dengan versi warung lama tidak boleh menutup titipan yang sama dua kali. Salah satunya mendapat konflik dan harus memperbarui daftar sebelum membuat ringkasan baru.
- Jika harga berubah antara ringkasan dan posting sehingga quote tidak sesuai, buat ringkasan baru. Server tidak menerima harga atau total penjualan yang diketik sendiri lewat request.

Jika hasil posting tidak jelas karena koneksi putus, periksa riwayat. Retry pada ringkasan yang masih terbuka mempertahankan request ID. Setelah reload atau menutup formulir, jangan langsung membuat posting baru tanpa memastikan hasil sebelumnya.

## Uji 5 — pemeriksaan retur

1. Pemilik membuka **Kunjungan & Retur → Karantina retur**.
2. Pilih **Catat pemeriksaan**, isi hasil pemeriksaan di alasan/catatan.
3. Lihat ringkasan lalu **Konfirmasi**.
4. Status menjadi **Sudah diperiksa, tetap dikarantina**. Kuantitas stok tidak berubah dan pemeriksaan kedua atas baris yang sama ditolak.

Label **tampak layak** berasal dari laporan kunjungan, bukan persetujuan untuk dijual kembali. Pada tahap ini seluruh kategori retur ditahan. Pelepasan untuk edar ulang, reklasifikasi fisik dan pemusnahan belum dibuka karena kebijakan/otoritasnya belum diputuskan pemilik. Tidak ada kebijakan kelayakan atau biaya retur yang diasumsikan. Hilang/selisih dicatat terpisah tanpa otomatis menagih petugas/agen.

## Uji 6 — pembalikan kunjungan

1. Pemilik membuka **Riwayat kunjungan**, pilih transaksi **terakhir** warung tadi, klik **Balikkan kunjungan**.
2. Isi alasan **UJI koreksi kunjungan**, lihat ringkasan dan konfirmasi.
3. Semua gerakan transaksi dibalikkan bersama; titipan sebelumnya dipulihkan dan pengakuan penjualan transaksi itu menjadi batal. Riwayat asli tetap terlihat bertanda **Sudah dibalikkan**.
4. Jika kunjungan memuat titipan baru, titipan baru itu ikut dibatalkan. Jika sudah ada kunjungan berikutnya, balikkan dari yang paling akhir.
5. Bila pemeriksaan retur terkait sudah tercatat, bukti pemeriksaannya tetap ada tetapi ditandai tidak berlaku karena kunjungan dibalikkan.

Pembalikan harus dilakukan **sebelum mengganti penugasan**. Sistem menolak pembalikan yang konteks penugasannya sudah berubah, yang sudah dibalikkan, atau yang menyebabkan stok tidak cukup. Setelah pembalikan, kunjungan yang benar dapat dicatat lagi untuk siklus lama yang dipulihkan. Pembalikan tidak boleh dilakukan melalui menu Koreksi stok Phase 4; gunakan menu kunjungan agar stok dan hasil penjualan tetap konsisten. Transfer stok biasa ke/dari titipan warung diblokir.

## Uji 7 — peran lapangan dan produksi

1. Pemilik menugaskan satu warung ke perangkat lapangan aktif.
2. Pemilik menyiapkan **Muatan lapangan** untuk perangkat tersebut dan memindahkan produk jadi ke muatannya melalui Phase 4.
3. Perangkat lapangan hanya melihat warung yang ditugaskan kepadanya. Untuk titipan baru, ia hanya dapat memakai muatan perangkatnya sendiri, bukan gudang pusat atau muatan petugas lain.
4. Lapangan dapat melakukan kunjungan sesuai penugasan, tetapi tidak mengatur penugasan, memeriksa retur, membalikkan transaksi, atau membaca subtotal biaya/biaya per unit/bagian Enzy/komisi.
5. Produksi tidak mendapat akses kunjungan/warung, tetap bekerja di Produksi & Stok.
6. Perangkat dicabut tidak dapat membaca/posting/retry transaksi. Setelah penugasan dipindahkan, petugas lama kehilangan akses warung dan replay receipt terkait.

Admin kedua tetap ditunda. Tidak perlu memasangkan ulang pemilik untuk Phase 5.

## Uji 8 — alur agen dan harga historis (opsional)

Setelah seluruh titipan warung sudah ditutup, pemilik mengatur penugasan baru dengan saluran **Melalui agen** dan memilih agen aktif. Siapkan harga agen **Rp1.500**, bagian Enzy **Rp1.300** untuk produk yang diuji. Harga agen khusus warung mengalahkan harga umum agen bila keduanya berlaku.

Titipkan 20 pcs; penjualan dan komisi saat titip tetap nol. Pada kunjungan berikutnya, laku 12 dan sisa 8 dirinci sebagai retur/hilang sesuai pemeriksaan. Hasilnya penjualan **Rp18.000**, hak Enzy **Rp15.600**, komisi diperoleh **Rp2.400**. Angka ini hanya hasil penjualan terverifikasi: belum berarti agen telah menerima uang, memotong komisi atau menyetor. Tidak ada omzet kedua atau kas masuk otomatis. Untuk field yang mencatat saluran agen, sumber barang tetap muatan perangkatnya sendiri; pemilik dapat memakai lokasi agen yang sesuai penugasan.

Untuk uji harga historis, ubah harga master setelah titipan pertama lalu tutup titipan itu. Barang laku dari titipan lama harus tetap memakai harga snapshot awal; titipan baru memakai harga yang berlaku pada waktunya.

## Catatan pengembang dan batas verifikasi

- Tabel baru default-deny RLS/FORCE, browser tidak mendapat SELECT/write atau EXECUTE RPC. JWT diverifikasi backend; database memeriksa perangkat aktif, role dan resource scope. Helper tetap schema privat tanpa grant service/client.
- Posting memakai transaction advisory lock yang sama dengan Phase 4, bucket `FOR UPDATE`, expected version warung, idempotency hash/receipt, immutable snapshots dan audit. Kunjungan, ledger, projection, results, cycle pointer dan request disimpan atomik.
- Harga dipilih server sesuai timestamp/saluran/product/store/agent. Preview tidak menggerakkan stok. Posting memverifikasi price ID lagi. Nominal total dikirim sebagai string integer untuk menghindari hilangnya presisi JavaScript. Uang belum diterima, HPP dan laba tidak dibuat otomatis.
- API no-store, body kunjungan maksimal 24 KB (inventory tetap 16 KB, master 8 KB, pairing 2 KB), search/page server, rate UID/IP/global tersimpan. Tidak ada antrean posting offline.
- Saldo mengikuti urutan posting server. Waktu kejadian tidak boleh mendahului penugasan, produksi asal atau kunjungan sebelumnya; waktu kosong ditentukan server, dibekukan dalam ringkasan. Ini bukan sistem impor saldo/rekonstruksi stok lama.
- Satu siklus aktif per warung; penutupan seluruh sisa wajib. Top-up tanpa menutup siklus lama tidak dibuka. Laporan penjualan yang dibalikkan tetap tersimpan dan harus dikecualikan dari agregasi keuangan Phase 6.
- Tidak menjalankan SQL atau mengubah akun/proyek Supabase pengguna. Tes menggunakan database disposable dan browser fixture. UAT JWT/Cloudflare/PostgREST nyata dilakukan pemilik setelah memasang SQL. Advisor/backup restore proyek live belum dapat diperiksa; akses connector sebelumnya ditolak. Changelog Supabase saat sesi ini tidak dapat diakses (HTTP 403); tidak ada perubahan SDK/Auth.
