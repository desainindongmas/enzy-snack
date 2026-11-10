# Petunjuk untuk Codex — Enzy Snack

Baca `README.md`, `docs/CONFLICT-REPORT.md`, `docs/MIGRATION-PLAN.md` dan `docs/PHASE-2-HANDOFF.md` sebelum mengubah kode. Dokumen bisnis asli dipertahankan secara lokal dan sengaja tidak dilacak Git; mintalah akses melalui pemilik bila diperlukan.

## Scope
- Mobile-first PWA Bahasa Indonesia untuk owner, produksi, dan petugas lapangan; satu Supabase PostgreSQL bersama.
- Tanpa layar login harian; gunakan anonymous Supabase Auth + persetujuan/pairing perangkat. Jangan membuat public owner-claim atau melewatkan autentikasi.
- Fase sekarang: Phase 7 — pemeriksaan kesiapan, enkripsi backup/rehearsal restore dan pembukaan saldo awal atomik sekali pada database baru. Pemilik mengonfirmasi seluruh data saat ini UJI; jangan reset/hapus atau pindahkan transaksi UJI ke produksi. Go-live, backup proyek nyata, tanggal/angka cut-off dan proyek produksi baru tetap memerlukan pekerjaan manual terverifikasi. Pelepasan retur menunggu kebijakan pemilik. Logo asli tersedia di public/brand/enzy-snack-logo.png dari ZIP pemilik; pertahankan artwork tanpa menggambar ulang. Header, favicon dan manifest PWA memakai sumber yang sama. Admin kedua ditunda; instruksi hanya diberikan saat user mengetik "Pasangkan admin kedua". Tidak deploy tanpa instruksi user, tidak sambungkan data bisnis nyata, tidak jalankan SQL draft ke produksi.

## Data & engine
- Harga beli supplier per pembelian/lot; biaya kemasan & repacking belum diketahui; jangan mengarang HPP final.
- Harga jual langsung dapat berbeda per warung ; harga per agen/warung disimpan dengan histori dan snapshot transaksi.
- Agen hanyalah distributor; barang tetap milik Enzy. Agen menerima pembayaran warung, langsung menahan komisi yang disepakati, dan menyetorkan bagian Enzy. Komisi dari qty benar-benar terjual, bukan dititipkan.
- Semua sisa barang di warung ditarik saat kunjungan. Pisahkan retur layak, rusak, kedaluwarsa, hilang/selisih; jangan samakan kehilangan dengan barang laku.
- Setoran agen **tidak** menjadi omzet kedua. Kas Enzy bertambah hanya ketika setoran dikonfirmasi diterima.
- Inventory, finance, remittance, kunjungan dan reverse posting harus atomik + idempotent di server, dengan audit trail dan tanpa stok negatif.

## Security
- Semua akses business data default deny sampai device active/authorized. RLS dan RPC/Edge Function cek otoritas di server. Anon Supabase Auth JWT bukan hak akses bisnis.
- Jangan pernah expose service_role/secret keys dalam JS, browser, client bundle, atau repo.
- Bootstrap owner via prosedur admin manual yang aman. Undangan pairing one-time, high-entropy, hashed, TTL, rate-limited, audited, with server-only redemption.
- Tests wajib mencakup unauthorized reads, role separation, revoked devices, invite reuse, duplicate requests, concurrency, harga historis, retur, agen remittance, incomplete costing dan backup restore.

## Cara kerja
- Laporkan fase yang dikerjakan, tes dijalankan beserta hasil, file berubah, TODO/blockers.
- Jangan klaim selesai/aman sebelum implementasi + tes nyata. Jangan gunakan nominal ilustrasi sebagai transaksi produksi.
- Berhenti jika diperlukan keputusan bisnis yang masih terbuka; desain schema harus mendukung konfigurasi, bukan asumsi palsu.

## Pembaruan tampilan setelah Phase 7
- Shell mobile memakai bottom menu sesuai peran; desktop memakai sidebar. Data usaha/Perangkat tim/Kesiapan usaha ada di Lainnya. Jangan mengembalikan modul karyawan yang ditumpuk dalam satu halaman.
- Nama sapaan nullable terpisah dari device_label; migrasi `20261110043537_device_display_names.sql`, panduan `docs/MOBILE-APP-SETUP.md`. Nama diberikan saat undangan dan dapat diubah pemilik untuk diri sendiri/karyawan aktif; tidak mengubah peran dan tidak pairing ulang. Gunakan capability RPC baru untuk named issue, jangan diam-diam mengabaikan nama pada database lama.

## Otorisasi reset latihan — 10 November 2026
Instruksi terbaru pemilik secara eksplisit meminta pengosongan data latihan sekarang untuk latihan tim dari nol, setelah backup terenkripsi/pemulihan lokal terverifikasi. Ini menggantikan larangan reset terdahulu hanya untuk reset satu kali Enzy Snack Test yang tercatat pada device audit. Auth, perangkat/sapaan/peran/status revoked, audit perangkat dan pairing limits dipertahankan; undangan pending dibatalkan. Template admin `supabase/admin/reset-training-session.sql` bukan migration/API; parameter default NULL, inventaris tertutup, TRUNCATE RESTRICT atomik, verifikasi dan unique reset reference. Dokumentasi `docs/TRAINING-SESSION.md`. Otorisasi ini tidak menjadi izin permanen menghapus sesi berikutnya/produksi dan tidak mengizinkan go-live atau pemindahan data riil otomatis.
