# Phase 4 — pembelian, produksi, dan stok

Untuk pemilik aplikasi Enzy Snack. Phase 3 harus sudah berhasil. Tahap ini menambahkan pencatatan bahan per lot, repacking, stok per lokasi, transfer dan pembalikan. Kunjungan warung, retur, penjualan, komisi, kas dan setoran belum dibuka.

## 1. Pasang satu SQL baru

1. Buka Cloudflare → Workers & Pages → enzy-snack → Deployments. Tunggu deployment commit Phase 4 berstatus **Success**.
2. Buka Supabase proyek **Enzy Snack Test** yang sebelumnya digunakan.
3. Pilih **SQL Editor → New query**.
4. Buka file `supabase/migrations/20261109141211_inventory_lots_batches.sql` dari branch `development` GitHub, lalu klik **Raw** agar seluruh kode terlihat.
5. Salin seluruh isi file itu ke query baru di Supabase. Klik **Run** sekali. Tunggu hasil sukses.
6. Buka kembali `https://enzy-snack.pages.dev` di perangkat pemilik. Jika muncul pemberitahuan versi baru, perbarui aplikasi. Buka menu **Produksi & Stok**.

Tidak perlu mengulang SQL lama, bootstrap pemilik, memasangkan ulang perangkat, atau mengubah variabel Cloudflare. Jangan hapus data browser karena identitas perangkat tersimpan di sana. SQL tidak dijalankan otomatis saat deployment.

Jika ragu apakah SQL selesai, jalankan query pemeriksaan ini di tab baru. Query ini hanya membaca keberadaan tabel/fungsi:

```sql
select
  to_regclass('public.enzy_inventory_balances') is not null as tabel_stok_ada,
  to_regclass('public.enzy_production_batches') is not null as tabel_produksi_ada,
  to_regprocedure('public.enzy_inventory_action(uuid,text,text,jsonb)') is not null as fungsi_stok_ada;
```

Ketiganya harus `true`. Bila ada kesalahan, simpan pesan error dan periksa sebelum menjalankan ulang file. Jangan mengulang migration yang sudah sukses.

## 2. Uji penerimaan bahan

Gunakan data bertanda **UJI** di proyek TEST. Angka berikut hanya latihan, bukan transaksi usaha atau stok awal.

1. Pada **Data usaha → Supplier**, siapkan satu supplier aktif bernama **UJI Supplier Bahan**. Supplier yang telah diarsipkan tidak dapat dipilih.
2. Buka **Produksi & Stok → Terima bahan**.
3. Pilih supplier tadi. Isi berat **10000** gram dan harga total bahan **75000** rupiah.
4. Isi biaya perolehan tambahan **0** untuk contoh latihan tanpa ongkir. Untuk transaksi sebenarnya, biarkan kosong bila biayanya belum diketahui; isi 0 hanya bila memang tidak ada.
5. Kode lot: **UJI-BAHAN-01**. Kosongkan kedaluwarsa jika belum diketahui. Catatan: **UJI penerimaan bahan**.
6. Klik **Lihat ringkasan**, periksa, lalu **Posting sekarang**.
7. Tunggu tulisan **Posting dikonfirmasi server**. Pada **Stok per lokasi**, lot ini berada di Gudang bahan baku sebanyak **10.000 g**. Refresh dan pastikan tetap ada.

Satu pembelian menghasilkan satu lot dengan harga tersendiri. Perubahan nama supplier atau harga pembelian berikutnya tidak mengubah catatan lama. Tidak ada kas/utang yang otomatis dicatat pada tahap ini.

## 3. Uji repacking

Siapkan produk aktif yang sesuai. Untuk latihan ini dapat memakai **UJI Keripik 20g** dengan berat nominal 20 gram.

1. Klik **Repacking**, pilih produk dan lot **UJI-BAHAN-01**.
2. Isi **Gram dari lot 1: 1000**.
3. Isi jumlah bungkus baik **45 pcs**, berat isi produk baik total **900 gram**, berat cacat **0 gram**, susut/terbuang **100 gram**.
4. Biarkan tiga biaya produksi kosong untuk mencoba status **Biaya belum lengkap**. Jangan mengarang biaya kemasan/upah.
5. Kode lot produk jadi **UJI-JADI-01**. Catatan **UJI repacking**. Lihat ringkasan lalu posting.
6. Stok bahan menjadi **9.000 g**, produk jadi masuk **45 pcs** ke Gudang produk jadi. Catatan batch ada pada tab **Produksi** dan bertahan setelah refresh.

Berat harus seimbang: **bahan terpakai = berat isi produk baik + berat cacat + susut/terbuang**. Berat isi adalah hasil timbang, bukan otomatis jumlah bungkus dikali berat nominal. Bisa memakai sampai 20 lot bahan berbeda dalam satu batch. Pilihan lot mendahulukan tanggal kedaluwarsa yang paling dekat; tanggal kosong tidak dianggap aman atau diberi tanggal buatan. Pilihan akhir tetap diperiksa petugas. Lot kedaluwarsa ditolak untuk produksi dan transfer biasa.

Jika salah satu biaya belum diketahui, subtotal biaya yang sudah diketahui tetap terlihat oleh pemilik, tetapi biaya per unit final tetap kosong. Status lengkap hanya berarti komponen biaya yang disediakan sudah terisi; bukan laba final. Angka biaya internal memakai desimal delapan tempat, tampilan rupiah dibulatkan maksimal dua tempat. Penyesuaian biaya belakangan belum tersedia.

## 4. Uji transfer

1. Klik **Tambah lokasi**, pilih jenis **Gudang produk jadi**, beri nama **UJI Rak Distribusi**, tinjau lalu konfirmasi.
2. Klik **Transfer stok**. Asal **Gudang produk jadi**, lot **UJI-JADI-01**, tujuan **UJI Rak Distribusi**.
3. Jumlah **20 pcs**, catatan **UJI transfer**. Tinjau lalu posting.
4. Stok lot ini menjadi **25 pcs** di asal dan **20 pcs** di tujuan. Total tetap **45 pcs**. Lihat dua gerakan di **Riwayat gerak**.
5. Coba memindahkan **26 pcs** lagi dari asal. Server harus menolak karena stok hanya 25. Tidak boleh ada gerakan tambahan atau stok negatif.

Lokasi **Muatan lapangan** harus dikaitkan dengan perangkat lapangan aktif; lokasi **Dalam penguasaan agen** dengan agen aktif. Kepemilikan barang tetap Enzy. Transfer ke agen tidak mencatat penjualan, komisi atau setoran. Titip jual ke warung dan pemeriksaan retur menyusul Phase 5. Lokasi karantina belum menerima transfer biasa.

## 5. Uji koreksi tanpa menghapus riwayat

Pemilik membuka tab **Koreksi**, memilih transaksi dan menekan **Balikkan catatan**, mengisi alasan, lalu mengonfirmasi. Sistem menambah gerakan kebalikan; catatan asli tidak diedit atau dihapus. Satu transaksi hanya dapat dibalikkan sekali, dan pembalikan tidak dibalikkan lagi.

Untuk membatalkan seluruh latihan di atas, balikkan **transfer dahulu**, lalu **repacking**, lalu **pembelian**. Bila barang hasil produksi sudah dipindahkan/dipakai dan stok asal tidak cukup, pembalikan repacking ditolak seluruhnya. Riwayat dan biaya lama tetap tersimpan walaupun saldo fisik sudah dikembalikan.

## 6. Hak akses dan pemeriksaan lanjutan

- Pemilik: pembelian, produksi, lokasi, transfer, seluruh stok serta pembalikan.
- Produksi: stok gudang pusat, catatan produksi/gerakan yang terkait, dan posting repacking. Tidak menerima nominal harga beli, subtotal atau biaya per unit dari API daftar. Tidak bisa mencatat pembelian, transfer atau koreksi.
- Lapangan: hanya stok/gerakan lokasi yang dikaitkan dengan perangkatnya. Belum ada posting kunjungan pada fase ini.
- Perangkat pending atau dicabut: tidak dapat membaca atau menulis data stok. Mengirim ulang request lama tetap memeriksa status/hak akses terkini.

Gunakan perangkat uji yang sudah disetujui untuk memeriksa perbedaan peran dan pencabutan akses. Admin kedua tetap ditunda sesuai permintaan pemilik.

## Batas operasional dan teknis

Stok fisik lama **belum diimpor**. Migration hanya menyiapkan tiga lokasi kosong; tidak menambahkan pembelian, produk jadi, saldo atau transaksi contoh. Jangan membuat pembelian palsu untuk memasukkan barang lama. Gunakan penerimaan baru yang benar dan sepakati sensus/cut-off stok awal sebelum operasional penuh.

Posting harus online dan menunggu konfirmasi server. Isian melewati ringkasan sebelum dikirim. Retry isian yang sama mempertahankan request ID selama formulir masih terbuka; setelah reload/menutup formulir, periksa riwayat sebelum membuat posting baru jika hasil sebelumnya tidak jelas. Aplikasi tidak mempunyai antrean posting offline. Waktu kejadian disimpan untuk audit; saldo mengikuti urutan posting server, bukan rekonstruksi saldo harian historis dari tanggal isian.

RPC hanya bisa dipanggil backend `service_role`; tabel langsung tetap default-deny RLS/grants. JWT diverifikasi pada API dan status/role diperiksa lagi di database. Posting mengunci per bisnis menggunakan transaction advisory lock, lalu bucket saldo `FOR UPDATE`; pilihan ini membatasi throughput tetapi sesuai skala satu usaha dan mencegah stok minus. Ledger, projection, receipt idempotency dan audit diposting dalam satu transaksi. Pencarian/paginasi dijalankan server, body maksimal 16 KB, UID/IP/global rate limit tersimpan, respons API no-store.

Pengujian lokal mencakup PostgreSQL WASM serta PostgreSQL 17 sesungguhnya dengan dua koneksi bersamaan. Browser memakai fixture jaringan, bukan database pengguna. Akses connector Supabase ditolak sehingga schema/grants/Auth/Cloudflare live dan backup/restore proyek pengguna belum diverifikasi oleh pengembang. User menjalankan SQL dan UAT TEST secara manual; lolos tes lokal tidak menggantikan pemeriksaan live.
