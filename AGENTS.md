# Petunjuk untuk Codex — Enzy Snack

Baca `README.md`, `docs/CONFLICT-REPORT.md`, `docs/MIGRATION-PLAN.md` dan `docs/PHASE-2-HANDOFF.md` sebelum mengubah kode. Dokumen bisnis asli dipertahankan secara lokal dan sengaja tidak dilacak Git; mintalah akses melalui pemilik bila diperlukan.

## Scope
- Mobile-first PWA Bahasa Indonesia untuk owner, produksi, dan petugas lapangan; satu Supabase PostgreSQL bersama.
- Tanpa layar login harian; gunakan anonymous Supabase Auth + persetujuan/pairing perangkat. Jangan membuat public owner-claim atau melewatkan autentikasi.
- Fase sekarang: audit + scaffold dasar UI Fase 0–1. Tidak deploy tanpa instruksi user, tidak sambungkan data bisnis nyata, tidak jalankan SQL draft ke produksi.

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
