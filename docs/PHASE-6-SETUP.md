# Phase 6 — pembayaran, penguasaan uang, komisi dan setoran

Phase 5 telah diuji pemilik. Phase 6 menambahkan pencatatan uang yang benar-benar dibayar, uang yang dipegang petugas/agen, usulan setoran, penerimaan pemilik, komisi, modal/pengeluaran dan pembalikan. Aplikasi mencatat transaksi; tidak mengirim uang lewat bank.

## 1. Pasang SQL baru

1. Tunggu deployment Phase 6 di Cloudflare berstatus **Success**.
2. Di Supabase **Enzy Snack Test**, buka **SQL Editor → New query**.
3. Buka file `supabase/migrations/20261109171410_finance_cash_custody.sql` pada GitHub branch `development`. Klik **Raw**, salin seluruh isi, tempel ke query baru.
4. Klik **Run** sekali dan tunggu sukses. Tidak mengulang SQL Phase 1–5/bootstrap owner, tidak mengubah variabel Cloudflare.
5. Refresh aplikasi pemilik, perbarui versi bila diminta, lalu buka **Keuangan**. Jangan hapus data browser.

Pemeriksaan bila ragu SQL sudah selesai (hanya membaca keberadaan objek):

```sql
select
  to_regclass('public.enzy_money_operations') is not null as tabel_transaksi_ada,
  to_regclass('public.enzy_money_ledger') is not null as tabel_jurnal_ada,
  to_regclass('public.enzy_money_proposals') is not null as tabel_setoran_ada,
  to_regprocedure('public.enzy_finance_action(uuid,text,text,jsonb)') is not null as fungsi_keuangan_ada;
```

Empat hasil harus `true`. Jangan menjalankan ulang SQL yang sudah sukses. Simpan pesan error bila ada kendala.

## 2. Buat rekening pencatatan tanpa mengarang saldo awal

Gunakan nama **UJI** dan angka latihan berikut hanya di proyek TEST.

1. Pemilik membuka **Keuangan → Tambah kas / bank**.
2. Nama **UJI Kas Usaha**, jenis **Kas tunai**, alasan **UJI rekening kas**.
3. **Lihat ringkasan → Konfirmasi pencatatan**.
4. Periksa pada **Kas & penguasaan uang**. Rekening dibuat tanpa saldo awal.

Angka rekening adalah **mutasi bersih yang sudah dicatat**, bukan bukti jumlah uang fisik usaha. Saldo kas/bank lama belum diimpor; jangan mengarang penerimaan modal untuk menutup selisih. Sensus/cut-off saldo awal masih Phase 7. Tidak perlu menyimpan nomor rekening atau data perbankan sensitif di nama rekening.

## 3. Penjualan baru dan pembayaran langsung

Buat satu contoh **kunjungan baru setelah SQL Phase 6 dipasang**, menggunakan alur Phase 5:

- Warung/produk aktif dan harga langsung Rp1.500/pcs.
- Titipkan 20 pcs dari stok siap jual UJI. Penjualan saat titip tetap nol.
- Pada kunjungan berikutnya, verifikasi laku **12**, retur tampak layak **8**, rusak/kedaluwarsa/hilang **0**. Tutup seluruh titipan.

Sekarang **Keuangan → Tagihan warung** otomatis menampilkan penjualan **Rp18.000**, pembayaran **Rp0**, belum dibayar **Rp18.000**. Pencatatan penjualan dan stok dilakukan dalam transaksi yang sama; belum ada uang masuk otomatis.

1. Pilih **Catat pembayaran**, penerima **Langsung ke kas / bank Enzy**, pilih **UJI Kas Usaha**.
2. Jumlah **10000**, catatan **UJI pembayaran sebagian**.
3. Lihat ringkasan, lalu konfirmasi. Penjualan tetap **Rp18.000**, dibayar warung **Rp10.000**, belum dibayar **Rp8.000**. Mutasi kas bertambah Rp10.000.
4. Catat sisa pembayaran **8000** setelah benar-benar diterima dalam latihan. Tagihan menjadi lunas; penjualan transaksi ini tetap Rp18.000.
5. Refresh untuk memastikan data bertahan.

Mencatat uang melebihi sisa tagihan harus ditolak. Pembayaran dipecah per kunjungan/tagihan; satu penerimaan untuk beberapa tagihan dicatat sebagai alokasi terpisah dengan alasan/bukti yang sesuai. Tidak ada tenggat, denda atau diskon otomatis yang diasumsikan.

## 4. Uang lapangan dan setoran sebagian

Gunakan kunjungan/tagihan baru lainnya pada warung yang sudah ditugaskan ke perangkat lapangan aktif. Siapkan muatan/stok sesuai Phase 4–5.

1. Pada perangkat lapangan, buka **Uang & Setoran Saya → Tagihan warung**, catat pembayaran langsung yang benar-benar diterima, misalnya Rp18.000.
2. Uang masuk **penguasaan petugas**, bukan kas Enzy. Pada perangkat pemilik, mutasi kas Enzy belum bertambah dari pembayaran tersebut.
3. Petugas membuka **Rekening & uang saya**, pilih rekening penguasaannya, klik **Ajukan setoran**.
4. Pilih tujuan **UJI Kas Usaha**, jumlah **18000**, catatan **UJI usulan setoran**. Tinjau dan konfirmasi pencatatan.
5. Usulan masih **Menunggu penerimaan pemilik**. Kas Enzy tetap belum bertambah. Dana tersebut dicadangkan agar tidak diajukan dua kali.
6. Pada perangkat pemilik, buka **Keuangan → Setoran → Konfirmasi uang diterima**. Isi **10000** hanya jika jumlah itu sudah diterima, beri alasan, tinjau dan konfirmasi.
7. Kas Enzy bertambah Rp10.000; uang di petugas turun Rp10.000; sisa usulan Rp8.000. Penjualan tidak bertambah lagi.
8. Konfirmasi sisa Rp8.000 saat diterima. Status menjadi **Sudah diterima seluruhnya**.

Petugas tidak bisa mengonfirmasi penerimaan sendiri. Ia hanya mengajukan atau membatalkan sisa usulan uang perangkatnya. Pemilik dapat mencatat penerimaan warung yang dipegang petugas melalui pilihan **Dipegang petugas lapangan**, dengan memilih perangkat aktif yang benar.

## 5. Agen: bedakan komisi diperoleh, dipotong dan dibayar

Siapkan warung dengan penugasan **Melalui agen**, agen aktif, harga Rp1.500/pcs dan bagian Enzy Rp1.300/pcs. Buat kunjungan baru: titipan 20, laku 12, retur 8. Gunakan harga yang sudah berlaku dan stok UJI.

Hasil transaksi: penjualan Rp18.000, hak Enzy Rp15.600, **komisi diperoleh Rp2.400**. Belum ada uang diterima atau komisi dipotong otomatis.

1. Pemilik membuka tagihan itu → **Catat pembayaran**.
2. Isi **Jumlah uang Rp18.000** sebagai jumlah bruto yang dibayar warung, lalu **Komisi yang benar-benar dipotong agen Rp2.400**.
3. Tinjau dan konfirmasi. Tagihan warung lunas, komisi dipotong Rp2.400, uang milik Enzy yang dipegang agen Rp15.600. Kas Enzy belum bertambah.
4. Pada **Kas & penguasaan uang**, pilih uang agen → ajukan setoran Rp15.600 ke rekening Enzy.
5. Pemilik mengonfirmasi penerimaan ketika uang benar-benar diterima. Kas Enzy bertambah Rp15.600, uang agen berkurang; **setoran tidak menjadi omzet kedua**.

Masukkan potongan **0** bila agen tidak memotong komisi. Komisi tidak diisi otomatis. Komisi yang sudah diperoleh tetapi belum dipotong dapat dibayar terpisah melalui **Bayar komisi tersisa**, hanya dari kas/bank Enzy yang mempunyai dana tercatat. Total dipotong + dibayar terpisah tidak boleh melebihi komisi diperoleh dari barang laku.

Pembayaran sebagian didukung. Operator memasukkan potongan aktual, dibatasi jumlah pembayaran dan hak komisi tersisa. Sistem tidak mengarang pembagian komisi prorata. Agen bukan akun login baru; pemilik mencatat penerimaan/setoran agen. Field tidak mendapat nominal bagian Enzy/komisi dan tidak boleh mencatat pembayaran saluran agen.

## 6. Modal dan pengeluaran

- **Catat modal masuk** hanya untuk tambahan modal baru yang benar-benar masuk ke kas/bank terpilih. Bukan omzet dan bukan cara mengisi saldo lama yang belum diperiksa.
- **Catat pengeluaran** memilih kas/bank, jumlah dan kategori: pembayaran supplier, kemasan, upah, transportasi atau lainnya. Dana harus cukup; tidak boleh negatif.
- **Kembalikan modal** dibatasi kontribusi modal yang masih tercatat dan kas tersedia. Pembagian laba belum dibuka.
- Kas keluar ini belum otomatis merekonsiliasi utang supplier atau pembayaran per lot/pembelian; simpan keterangan/bukti yang jelas. Pembelian/biaya produksi tidak diposting ulang menjadi kas keluar tanpa penerimaan/pembayaran nyata yang dicatat terpisah.

Laporan ini adalah penjualan/piutang/penguasaan uang/arus kas. Pengeluaran kas untuk bahan tidak otomatis menjadi HPP barang laku. **Laba final tetap belum dihitung**, termasuk bila sebagian biaya diketahui; jangan menafsirkan mutasi kas sebagai laba.

## 7. Pembalikan dengan urutan benar

Pemilik membuka **Riwayat uang → Balikkan transaksi uang**, mengisi alasan, meninjau lalu mengonfirmasi. Catatan asli tetap tersimpan. Pembalikan tidak dapat dibalikkan lagi dan satu transaksi hanya boleh dibalikkan sekali.

Untuk mengoreksi pembayaran yang sudah disetor:

1. Jika uang kas tersebut sudah dipakai, koreksi/balikkan pengeluaran terkait dahulu bila memang pencatatannya salah.
2. Balikkan penerimaan setoran yang terkait; uang kembali tercatat pada penguasaan petugas/agen dan usulan dapat terbuka lagi.
3. Batalkan sisa usulan yang terbuka jika pembayaran asal akan dibalikkan; dana yang masih dicadangkan tidak boleh hilang dari penguasaan.
4. Balikkan pembayaran warung. Tagihan dibuka kembali; komisi potongan terkait ikut dikoreksi.
5. Setelah seluruh pembayaran/komisi terkait dikoreksi, kunjungan dapat dibalikkan melalui **Kunjungan & Retur** sesuai batas Phase 5 (kunjungan terakhir dan konteks penugasan sama).

Penjualan tidak boleh dibalikkan melalui menu uang biasa. Pembalikan kunjungan mengoreksi stok dan jurnal penjualan bersama-sama. Jika masih ada pembayaran atau komisi yang aktif, sistem menolak seluruh pembalikan kunjungan dengan pesan dependensi. Ini koreksi pencatatan, bukan pengembalian uang otomatis lewat bank.

## 8. Kunjungan sebelum Phase 6

Kunjungan lama tidak otomatis dianggap belum dibayar dan tidak diimpor sebagai uang masuk. Pemilik melihatnya pada **Keuangan → Kunjungan lama**.

**Tinjau tagihan lama** memerlukan konfirmasi bahwa seluruh nominal penjualan itu akan dicatat sebagai **tagihan penuh yang belum dibayar**. Gunakan hanya setelah bukti dan pembayaran historis diperiksa. Jika sebelumnya sudah ada pembayaran nyata, jangan mengonfirmasi penuh sebagai piutang baru tanpa rekonsiliasi/cut-off. Penerimaan lama/saldo awal tidak disimpulkan dari stok, data browser, nominal harga, atau status kunjungan.

Untuk UAT paling sederhana, buat kunjungan baru setelah SQL Phase 6 dipasang dan biarkan data UJI lama menunggu tinjauan.

## 9. Daftar uji penolakan dan hak akses

- Coba pembayaran melebihi sisa tagihan, negatif, pecahan rupiah, potongan melebihi komisi/uang dibayar: ditolak tanpa perubahan.
- Coba dua usulan memakai dana penguasaan yang sama: total cadangan tidak boleh melebihi dana tersedia.
- Coba konfirmasi melebihi sisa usulan atau usulan dibatalkan: ditolak. Konfirmasi sebagian dapat dilakukan beberapa kali sesuai penerimaan nyata.
- Field hanya dapat mencatat pembayaran langsung pada warung yang sedang ditugaskan dan hanya ke penguasaan perangkat sendiri. Tidak dapat memilih perangkat/rekening orang lain atau menerima pembayaran agen.
- Field hanya membaca rekening penguasaan sendiri; rekening kas/bank Enzy terlihat sebagai pilihan tujuan tanpa nominal saldo. Tidak ada ringkasan semua usaha, nominal komisi, menu modal/pengeluaran/komisi/konfirmasi penerimaan atau kunjungan lama.
- Produksi, pending, dan perangkat dicabut tidak dapat membaca/menulis keuangan. Reassignment menghapus akses tagihan/replay pembayaran petugas lama, tetapi ia masih dapat menyetorkan uang yang sudah dipegang perangkatnya sendiri selama perangkat masih aktif.
- Retry isian sama pada ringkasan yang masih terbuka memakai request ID sama. Jika koneksi terputus/reload, periksa riwayat sebelum membuat transaksi baru. Tidak ada posting offline otomatis.
- Pembalikan transaksi berdependensi ditolak; histori/jurnal/audit tidak dapat dihapus atau diedit.

## Logo

Gambar logo terlihat pada percakapan tetapi file biner belum tersedia di executor pengembangan. Logo belum diganti dengan gambar generatif atau gambar usaha lain. Pemilik diminta mengunggah file PNG/WebP asli; slot asset header/halaman sudah tersedia. Jangan mengklaim logo sudah dipasang sampai file asli disimpan, dibangun dan diuji tampil.

## Catatan teknis dan batas pengujian

Jurnal keuangan bertanda debit positif/kredit negatif harus berjumlah nol per operasi, dengan deferred constraint trigger. Saldo projection memakai numeric(30,0), nilai per operasi BIGINT, API nominal string integer dan UI BigInt. Uang fisik/penguasaan/piutang tidak boleh negatif; jenis kredit/liabilitas tidak boleh berbalik tanda. Posting mengunci per bisnis memakai advisory lock yang sama dengan inventory/visits dan bucket saldo FOR UPDATE. Usulan mencadangkan dana; konfirmasi hanya memindahkan penguasaan uang ke kas/bank, tanpa revenue baru.

Sale hook setelah insert visit mencatat piutang/revenue serta komisi expense/payable secara atomik dengan stok. Reversal hook membatalkan jurnal penjualan di transaksi pembalikan kunjungan. Wrapper service-only Phase 5 menjaga kompatibilitas dan mengembalikan error dependensi yang aman. Migration lama tidak diubah. Tidak ada backfill pembayaran/saldo historis atau akun kas berisi uang yang dibuat oleh migration.

Semua tabel default-deny RLS/FORCE, helper/view invoker di schema privat tanpa grant client/service, RPC hanya backend service_role. JWT diverifikasi API dan role/status/scope diperiksa database. API keuangan body maksimal 8 KB, no-store, pagination/search server dan rate UID/IP/global tersimpan. Audit/idempotency receipts ikut transaksi; receipt tidak berisi nominal sensitif.

Tes memakai database disposable/PGlite dan PostgreSQL 17 dua koneksi asli, serta browser fixture 360px. Ini tidak menggantikan UAT Auth/JWT/Pages/PostgREST dan pemeriksaan advisor/backup restore proyek live. Pengembang tidak menjalankan migration remote, mengubah secret/owner, membuat admin kedua atau memindahkan uang. Changelog Supabase sesi ini HTTP 403; tidak mengubah SDK/Auth. Phase 7 masih diperlukan untuk backup/restore, cut-off saldo awal, rekonsiliasi dan kesiapan operasional.
