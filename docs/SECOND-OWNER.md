# Pasangkan admin / owner kedua

Owner kedua mempunyai akses pemilik penuh ke data usaha dan perangkat tim. Tidak perlu mengundang orang tersebut menjadi admin dashboard Supabase/Cloudflare. Perangkat owner pertama tetap aktif. Penambahan dilakukan sekali melalui admin Supabase; menu kode pairing biasa hanya untuk Produksi/Lapangan.

## 1. Buka dari HP atau browser owner kedua

Buka https://enzy-snack.pages.dev menggunakan browser biasa, bukan incognito/private. Gunakan perangkat/browser yang belum terhubung sebagai karyawan. Jangan menghapus data browser owner pertama.

## 2. Ambil identitas perangkat kedua

Pada halaman Aktivasi perangkat, tunggu koneksi siap, lalu buka **Identitas untuk admin**. Salin seluruh UUID yang tampil. ID ini bukan kode aktivasi 64 karakter; jangan mengisinya ke kotak kode aktivasi.

Jika browser tersebut sudah masuk sebagai Produksi/Lapangan, gunakan browser biasa lain yang belum dipasangkan. Template tidak mengubah perangkat karyawan atau mengaktifkan kembali perangkat revoked.

## 3. Cocokkan di Supabase

Pemilik/admin yang sekarang membuka proyek **Enzy Snack Test → Authentication → Users**. Cari UUID dari langkah 2 dan cocokkan tepat seluruh karakternya dengan yang masih terlihat pada HP kedua. Identitas harus anonymous. Jangan memilih UUID owner pertama atau user lain; bila tidak ditemukan, berhenti sebelum menjalankan SQL.

## 4. Tambahkan melalui SQL Editor

1. Buka `supabase/admin/add-second-owner.sql` pada GitHub branch development dan pilih **Raw**.
2. Salin seluruh SQL ke **Supabase → SQL Editor → New query** di proyek Enzy Snack Test.
3. Ganti **hanya** `00000000-0000-0000-0000-000000000000` pada baris `target uuid := ...` dengan UUID lengkap yang sudah dicocokkan. Pertahankan tanda petik tunggal di kedua sisinya.
4. Klik **Run**. Hasil akhirnya harus memperlihatkan dua baris dengan `role = owner` dan `status = active`.

Template membutuhkan tepat satu owner aktif sebelum menambahkan owner baru; tidak membuat owner pertama/ketiga, tidak mempromosikan karyawan/revoked, dan tidak mengubah owner pertama. Penambahan+audit satu transaksi. Menjalankan ulang untuk owner kedua yang sama tidak menambah perangkat/audit ganda. Jangan memakai template bootstrap-owner.sql karena memang menolak bila owner pertama sudah ada.

## 5. Buka akses owner kedua

Pada HP kedua, klik **Periksa status perangkat** atau refresh aplikasi. Beranda harus terbuka dengan peran **Pemilik**. Tidak perlu kode pairing tambahan.

## 6. Isi nama sapaannya

Owner kedua membuka **Lainnya → Profil & sapaan → Ubah nama sapaan**, lalu menyimpan namanya. Perubahan dilakukan pada profil perangkatnya sendiri.

Periksa singkat bahwa kedua perangkat dapat membuka Beranda sebagai Pemilik. Tidak perlu membuat transaksi latihan untuk pemeriksaan ini. Simpan akses dashboard/kredensial secara privat dan jangan kirim password/key ke chat. Jika data browser dihapus/perangkat diganti, akses perlu dipulihkan melalui admin; jangan menjalankan template ini untuk menambah owner ketiga.
