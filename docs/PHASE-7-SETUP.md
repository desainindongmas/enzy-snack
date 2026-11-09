# Phase 7 — pemeriksaan akhir dan persiapan operasional

Pemilik mengonfirmasi proyek yang sekarang berisi **seluruhnya data latihan/UJI**. Data itu tetap disimpan. Phase 7 tidak menghapus latihan, tidak mengubahnya menjadi saldo usaha, dan tidak otomatis mengaktifkan produksi.

Yang ditambahkan: menu pemilik **Kesiapan usaha**, pemeriksaan konsistensi stok/uang/akses, pembukaan saldo awal sekali pada database baru, catatan pemeriksaan pemilik, alat enkripsi backup lokal, dan uji pemulihan database terpisah. Logo asli tetap digunakan.

## 1. Pasang di proyek TEST dahulu

Prasyarat: SQL Phase 6 sudah berhasil dipasang. Jika menu Keuangan masih meminta SQL Phase 6, selesaikan pemasangannya dahulu mengikuti PHASE-6-SETUP.md; jangan mengulang SQL yang sudah sukses. UAT keuangan tetap perlu diselesaikan sebelum peralihan produksi.

1. Tunggu deployment Cloudflare terbaru **Success**.
2. Buka Supabase **Enzy Snack Test → SQL Editor → New query**.
3. Buka file `supabase/migrations/20261109182039_readiness_opening_balances.sql` pada GitHub branch `development`. Klik **Raw**, salin seluruh isi file ke query baru.
4. Klik **Run** sekali, tunggu sukses. Tidak perlu mengulang migration lama atau bootstrap owner.
5. Refresh aplikasi pemilik, lalu buka **Kesiapan usaha**. Tidak ada variabel Cloudflare baru.

Jika ingin memastikan pemasangan berhasil, jalankan pemeriksaan keberadaan berikut pada query terpisah:

```sql
select
  to_regclass('public.enzy_openings') is not null as tabel_pembukaan_ada,
  to_regclass('public.enzy_readiness_evidence') is not null as tabel_pemeriksaan_ada,
  to_regprocedure('public.enzy_readiness_action(uuid,text,text,jsonb)') is not null as fungsi_kesiapan_ada;
```

Semua harus `true`. Jangan menjalankan ulang migration yang sudah sukses. Simpan pesan error bila ada masalah.

## 2. Uji menu Kesiapan usaha pada data UJI sekarang

1. Tekan **Periksa ulang konsistensi**. Pemeriksaan yang lulus menampilkan **Lulus**. Jika ada temuan, jangan mengubah saldo untuk membuat indikator menjadi hijau; simpan hasil dan minta pemeriksaan penyebabnya.
2. Pada **Saldo awal**, proyek UJI yang sudah mempunyai transaksi harus menampilkan bahwa pembukaan **diblokir**. Tombol **Siapkan saldo awal** tidak tersedia. Ini hasil yang benar, bukan error pemasangan.
3. Pastikan data Produk, Harga & Riwayat, Stok, Kunjungan, Keuangan dan Perangkat tim tetap dapat dibuka. Hak produksi/lapangan tetap terbatas dan tidak mendapat menu Kesiapan usaha.
4. Catatan **lot biaya belum lengkap** atau **kunjungan lama menunggu tinjauan** bukan otomatis kerusakan ledger. Keduanya harus ditinjau sesuai proses bisnis; tidak otomatis dinilai nol/lunas.
5. Coba **Catat hasil pemeriksaan**, pilih jenis dan isi referensi/note latihan bertanda UJI. Lihat ringkasan lalu simpan. Statusnya **Dilaporkan pemilik**, bukan klaim backup/restore sudah dijalankan aplikasi.

Aplikasi memeriksa kecocokan saldo dengan ledger dari dua arah, stok negatif, jurnal uang tidak seimbang, arah saldo, dana setoran yang dicadangkan, pembayaran/komisi melebihi tagihan, titipan/siklus/penugasan, serta RLS/grants tabel/fungsi aplikasi. Pemeriksaan ini tidak membaca saldo bank atau stok fisik secara otomatis.

## 3. Pisahkan latihan dan usaha nyata

Jalur yang disarankan adalah **proyek Supabase produksi baru dan situs Cloudflare produksi terpisah**. Proyek TEST dan alamat aplikasi latihan tetap tersedia. Tidak ada tombol hapus/reset semua data pada Phase 7.

Urutan persiapan, dikerjakan satu per satu bersama pemilik:

1. Simpan cadangan TEST dan uji pemulihannya. Jangan menyamakan repo GitHub dengan backup database.
2. Buat proyek Supabase baru dengan nama yang jelas sebagai produksi. Pemilik menentukan paket/region dan menyimpan password di tempat privat. Jangan mengirim password/key/token ke chat.
3. Aktifkan anonymous sign-in di proyek baru. Terapkan seluruh migration berurutan **sekali** pada database baru: 001, 002, Phase 3, 4, 5, 6, 7. Pada proyek TEST yang sudah berjalan, tetap hanya menerapkan SQL Phase 7 baru.
4. Buat situs Cloudflare terpisah dari repo yang sama dengan konfigurasi build yang sudah dipakai. Isikan URL/key publik proyek baru serta secret runtime proyek baru pada dashboard. `APP_ORIGIN` harus sesuai alamat situs produksi yang benar-benar dibuat. Jangan menyalin service key TEST untuk produksi.
5. Buka situs baru dari perangkat pemilik. Identitas anonymous untuk proyek baru berbeda; verifikasi UID yang tampil, lalu lakukan bootstrap pemilik pertama mengikuti `docs/BOOTSTRAP-OWNER.md` dan script admin yang ada. Tidak membuat public owner claim atau mempromosikan perangkat pertama otomatis. Ini pemilik pertama pada proyek baru, bukan pemasangan admin kedua yang ditunda.
6. Isi hanya master usaha nyata: produk/SKU, supplier, warung, agen, lokasi, penugasan dan harga yang benar-benar berlaku. Jangan memindahkan transaksi UJI ke produksi.
7. Buat rekening kas/bank sebagai konfigurasi tanpa saldo melalui **Keuangan → Tambah kas / bank**. Jangan mencatat pembelian, kunjungan, modal atau pengeluaran latihan di database produksi sebelum pembukaan saldo awal.
8. Tentukan tanggal/jam cut-off, hitung stok, cocokkan kas/bank/uang petugas/agen, dan rekonsiliasi kewajiban/titipan lama. Baru gunakan pembukaan saldo awal pada bagian berikut.

Jika sudah ada transaksi nyata di proyek yang akan dipakai, hentikan rencana pembukaan baru dan buat rencana migrasi/cut-off khusus. Jangan mencoba mengosongkannya sendiri. Tool pengembang pada sesi ini tidak mempunyai koneksi berizin ke akun Supabase/Cloudflare untuk membuat proyek, mengubah secret atau melakukan peralihan live; bagian dashboard tetap dikerjakan pemilik secara manual.

## 4. Sebelum saldo awal: hitung dan rekonsiliasi

Pemilik menyiapkan catatan terpisah berisi:

| Yang dihitung | Informasi wajib |
|---|---|
| Bahan baku | Kode lot, lokasi, gram aktual, kedaluwarsa bila diketahui |
| Produk jadi | SKU/produk, lot, lokasi, pcs aktual, kedaluwarsa bila diketahui |
| Kas dan bank | Rekening dan nominal yang cocok dengan kas fisik/mutasi bank |
| Uang petugas | Perangkat penanggung jawab dan uang milik Enzy yang benar-benar dipegang |
| Uang agen | Agen dan uang milik Enzy setelah rekonsiliasi komisi aktual |
| Titipan/tagihan/kewajiban lama | Status penyelesaian atau rencana migrasi historis yang sudah diverifikasi |

**Titipan warung, piutang, utang, dan komisi periode lama tidak diimpor oleh formulir pembukaan fisik ini.** Jika masih ada saldo seperti itu yang harus dibawa ke aplikasi, diperlukan migrasi historis khusus sebelum operasional penuh. Jangan memasukkannya sebagai penjualan/komisi baru, menganggapnya nol, atau memakai checkbox sebagai pengganti rekonsiliasi.

Tanggal dan angka usaha nyata belum ditetapkan oleh pengembang. Jangan memakai contoh UAT berikut sebagai stok/saldo produksi.

## 5. Uji pembukaan pada database TEST baru yang kosong

Pengujian pembukaan membutuhkan database TEST lain yang baru, dengan master/perangkat/rekning disiapkan tetapi **belum mempunyai transaksi**. Jangan menguji dengan membuat data latihan baru pada proyek produksi.

1. Pemilik membuka **Kesiapan usaha → Siapkan saldo awal**.
2. Isi tanggal/jam hitung fisik dan dasar/catatan pembukaan.
3. Klik **Tambah stok awal** bila ada stok: pilih bahan/produk jadi, kode lot, lokasi, jumlah gram/pcs. Kedaluwarsa boleh kosong bila memang belum diketahui. Kode lot tidak boleh duplikat; maksimal 20 baris stok.
4. Klik **Tambah uang awal** bila ada uang: pilih kas/bank Enzy, petugas lapangan atau agen dan nominal aktual. Maksimal 20 baris uang; satu rekening/pemegang tidak diulang.
5. Bila satu bagian memang tidak mempunyai stok/uang sama sekali, centang konfirmasi **nol yang sudah diperiksa**. Membiarkan bagian kosong tidak dianggap nol secara otomatis.
6. Konfirmasikan hasil hitung fisik dan penyelesaian kewajiban lama. Jika masih belum jelas, jangan lanjutkan.
7. Klik **Periksa ringkasan saldo awal**. Pada tahap ini stok/uang belum diposting.
8. Periksa semua kode lot, lokasi, satuan, pemegang, angka dan waktu. Baru klik **Konfirmasi seluruh saldo awal**.
9. Tunggu konfirmasi server, refresh, lalu periksa stok dan rekening. Pemeriksaan konsistensi harus tetap lulus. Pembukaan kedua diblokir.

Contoh latihan pada database TEST kosong: bahan 1.000 gram, produk jadi 20 pcs, kas Rp10.000. Setelah pembukaan, stok/uang sesuai angka tersebut, **penjualan tetap Rp0**. Uang yang dibuka pada petugas/agen tetap pada penguasaan masing-masing sampai pemilik menerima setoran.

Opening tidak membuat pembelian, produksi, penjualan, earned commission atau modal baru. Jurnal uang diimbangi ke akun pembukaan, bukan revenue. Biaya stok awal belum dinilai dan tetap `COST_INCOMPLETE`/unit cost null; tidak mengarang HPP atau laba. Bahan awal dapat dipakai produksi dan produk jadi dapat ditransfer sesuai hak akses normal. Barang awal yang sudah kedaluwarsa hanya dapat dihitung pada lokasi karantina, bukan langsung menjadi stok siap edar. Biaya awal yang nantinya diketahui membutuhkan penyesuaian terpisah dengan audit; formulir ini tidak menyelesaikan laporan laba.

Pembukaan bukan fasilitas adjustment harian. Ia hanya dapat diposting sekali pada database baru tanpa header, lot, saldo, ledger, kunjungan atau usulan transaksi lama. Konfigurasi master/perangkat/rekening tanpa saldo boleh disiapkan sebelumnya. Jika ada transaksi baru setelah preview, server memeriksa ulang dan menolak pembukaan. Request identik dapat diulang dengan key yang sama tanpa menggandakan saldo.

Jika pembukaan salah, jangan membalikkan hanya uang atau hanya stok melalui menu lama. Pembalikan terpisah diblokir agar cut-off tidak rusak. Pemilik perlu meninjau backup, transaksi lanjutan dan rencana koreksi menyeluruh bersama admin; tidak ada reset/destructive correction otomatis.

## 6. Backup dan uji pemulihan

Panduan admin: **[BACKUP-RESTORE.md](BACKUP-RESTORE.md)**. Hal yang perlu dipahami pemilik:

- Backup database berbeda dari source GitHub dan berbeda dari cache HP. Tidak menghapus data browser saat menguji backup.
- Supabase menyatakan backup harian otomatis untuk paket Pro/Team/Enterprise. Jangan mengasumsikan paket Free sudah mempunyai backup harian yang bisa dipulihkan. Free memerlukan ekspor terpisah dan cadangan di luar proyek.
- Backup harus dienkripsi dan disimpan terpisah. Password disimpan di tempat berbeda. Jangan mengunggah backup, `.env`, token atau kredensial ke GitHub/chat.
- Pemulihan diuji pada target terpisah, bukan langsung ditimpakan ke proyek yang berjalan. Hasilnya harus cocok: stok per lot/lokasi, jurnal/saldo uang, piutang/komisi, setoran tertunda, histori/audit, hak akses dan perilaku retry.
- Backup database tidak mencakup isi objek Supabase Storage. Logo aplikasi ini termasuk source publik GitHub; bila nanti memakai Storage, file objek perlu dicadangkan tersendiri. Konfigurasi Auth/provider, secret Cloudflare dan sesi perangkat juga mempunyai prosedur pemulihan terpisah.
- Pemeriksaan lokal pengembang sudah membuktikan dump → enkripsi → dekripsi → restore database contoh dan rekonsiliasinya. **Backup/restore proyek Supabase milik pemilik belum dijalankan** dan harus dibuktikan sebelum go-live.

Sesudah pekerjaan nyata dilakukan, pemilik dapat mencatat nama file/nomor bukti dan hasilnya pada **Catat hasil pemeriksaan**. Catatan tersebut tetap ditandai **Dilaporkan pemilik**, bukan bukti otomatis dari aplikasi. Jangan memasukkan kata sandi atau isi backup.

## 7. Pemeriksaan terakhir sebelum mulai usaha nyata

- UAT Phase 6 pada TEST sudah selesai: pembayaran direct/field/agent, komisi, partial remittance, pembalikan dan pembatasan peran. Pertanyaan penggunaan saja belum merupakan konfirmasi seluruh UAT keuangan.
- Semua indikator konsistensi pada proyek tujuan lulus; temuan harus diperiksa penyebabnya, bukan dihapus dari laporan.
- Cadangan proyek tujuan sudah tersimpan dan pernah dipulihkan pada target terpisah; jadwal/penanggung jawab backup dan sasaran kehilangan data/durasi pulih disepakati pemilik. Tidak ada jadwal backup otomatis yang diklaim aktif oleh aplikasi.
- Master nyata, penugasan/harga dan tanggal mulai benar. Stok/uang awal sudah dihitung. Titipan/piutang/utang/komisi historis sudah diselesaikan atau dimigrasikan dengan bukti.
- Perangkat produksi/lapangan hanya mendapat sumber daya yang ditugaskan; perangkat dicabut langsung ditolak. Kepemilikan akses admin Supabase/Cloudflare dan pemulihan HP disimpan pemilik secara terpisah.
- URL proyek, publishable key, secret runtime, `APP_ORIGIN`, anonymous Auth dan aturan akses aktual diperiksa di dashboard. Tidak ada service key di VITE/browser/repo.
- Pemilik menyetujui peralihan nyata setelah meninjau hasil. **Lulus pemeriksaan otomatis atau menyimpan lima catatan tidak mengaktifkan produksi dan tidak menjamin kesiapan go-live.**

Admin kedua tetap ditunda sesuai permintaan. Phase 7 tidak memasangkan admin kedua, merotasi secret, memindahkan data nyata atau menerapkan SQL remote secara otomatis.
