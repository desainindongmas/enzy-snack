# Audit dan rekonsiliasi Phase 0 — 26 Oktober 2026

## Sumber dan prioritas
Starter pack baru melengkapi Master Blueprint v1.0, Technical v1.0, Technical v1.1, dua SQL referensi, AGENTS.md, keputusan/open items, dan prompt Phase 0–1. Semua telah diperiksa. Salinan asli dipertahankan di references/starter-pack; SHA256 ada di references/SHA256.json. SQL asli tidak dijalankan dan tidak masuk migration runner.

Permintaan user: cek kelengkapan lalu lanjutkan proses. Scope yang sudah ditetapkan tetap audit + scaffold Phase 0–1; tidak berarti izin deploy, push, menjalankan SQL produksi, membuat repo GitHub, atau mengaktifkan Phase 2. Instruksi README starter tentang membuat repo adalah petunjuk penggunaan paket, bukan permintaan user untuk membuat repo sekarang.

Prioritas: keputusan terbaru user > AGENTS dan DECISIONS_AND_OPEN_ITEMS > technical v1.1 untuk teknologi/identity/security > Master untuk aturan bisnis > technical v1.0 dan SQL draft. Nomor fase bisnis di Master §13 tidak sama dengan nomor fase implementasi v1.1 §9.

## Temuan terverifikasi

| ID | Sumber | Temuan dan keputusan |
|---|---|---|
| C01 | Tech v1.0 D/F/G/I; Master §11, §24, §25.11; v1.1 §2–5 | Login email/password dan profiles sudah digantikan anonymous Auth persisten + persetujuan perangkat. Tidak ada login harian, role switch, first-user-owner, atau public owner claim. |
| C02 | Starter SQL: tabel profiles dan blok RLS terakhir | Koreksi audit awal: SQL legacy SUDAH enable RLS dan revoke anon/authenticated pada semua 10 tabel; tidak ditemukan policy authenticated luas. Kekurangannya bukan policy permisif yang terbukti, melainkan otorisasi perangkat belum ada, pencabutan dari PUBLIC tidak eksplisit, FORCE RLS tidak dipasang, dan legacy tidak menjadi schema final. |
| C03 | Starter SQL: stores, price_agreements, raw_purchase_lots, stock_movements | FK assigned_field_user_id, created_by, recorded_by masih menuju enzy_profiles(user_id). Jangan sekadar mengganti UUID user menjadi device ID. Mapping administratif, histori actor, dan penugasan perlu transisi eksplisit; lihat MIGRATION-PLAN. |
| C04 | Device SQL v1.1 | Sudah default-deny dan role pending boleh NULL. Draft baru mengikuti pending tanpa role; active wajib role + paired_at + revoked_at NULL. Auth FK tidak cascade delete agar histori audit tidak terhapus otomatis. |
| C05 | Device SQL v1.1 vs draft baru | Tambahkan validasi TTL positif, panjang label, indeks FK/audit, FORCE RLS, helper active-only dan audit update/delete guard. Semua fungsi helper tetap tidak bisa dieksekusi anon/authenticated pada Phase 1. |
| C06 | Device SQL v1.1: intended_role enum | Draft baru membatasi undangan karyawan ke production/field. Ini kebijakan scaffold konservatif, bukan klaim bisnis melarang tambahan owner. Perangkat owner/recovery tetap jalur admin; dukungan owner invite menunggu keputusan dan review Phase 2. |
| C07 | Tech v1.1 §9 vs prompt Phase 0–1 | Prompt meminta migration versioned disiapkan sekarang; penerapan, endpoint pairing aman, dan akses data berada di Phase 2+. Stub selalu 503. |
| C08 | Master §9/24 vs v1.1 §7 | Menu role mengikuti v1.1 saat diimplementasikan: owner Beranda/Warung/Transaksi/Stok/Keuangan; produksi dan lapangan sesuai §7. Pada fase ini unpaired tidak menampilkan modul bisnis. |
| C09 | Master §25.1/25.14 vs Tech v1.0 A/v1.1 §2 | Vendor/stack sudah terkunci React/Vite + Supabase + Cloudflare Pages. Tidak memakai IndexedDB sebagai sumber kebenaran; offline hanya draft bila kelak didukung. |
| C10 | Master §11 vs Tech v1.0 B | Kebutuhan backup tetap wajib, tetapi free tier tidak menjamin backup otomatis. Jadwal ekspor terpisah, enkripsi, uji restore; tidak membuat keep-alive palsu atau janji biaya selalu nol. |
| C11 | Master §25 vs Starter SQL | Starter belum punya business_id, assignment historis, raw consumption per lot, finished lots, balances, consignment, visit/sales/return, custody/settlement/jurnal, operation_requests. Bukan schema siap transaksi; tidak di-copy sebagai migration aktif. |
| C12 | Starter SQL: production_batches | cost_status='complete' belum menjamin seluruh komponen diketahui; ledger belum diproteksi trigger immutable; idempotency_key belum unique+payload hash. Harus diperbaiki pada fase engine, tidak membuka writes sekarang. |
| C13 | Master §25.1 vs Tech v1.0 B | Ada perbedaan presisi gram dan biaya. Usulan: penerimaan gram integer bila sesuai alat timbang; konsumsi NUMERIC bila perlu pecahan; uang pembayaran BIGINT IDR; costing NUMERIC eksak. Final precision/rounding dicatat sebagai decision gate sebelum schema produksi. Tidak perlu keputusan untuk layar pairing. |

## Aturan bisnis yang dipertahankan untuk fase lanjut
- Stok tetap milik Enzy di agen/warung; penitipan bukan penjualan. Setiap kunjungan menarik semua sisa dan membuka siklus baru untuk titipan baru.
- Hilang/selisih bukan otomatis laku. Retur masuk karantina; boleh edar kembali hanya setelah kebijakan dan inspeksi disahkan.
- Harga per lot/warung/agen/SKU/periode; snapshot saat titip atau topup, tidak dihitung ulang saat master berubah. Periode scope sama tidak boleh overlap.
- Agen potong komisi hanya atas penjualan terverifikasi; earned berbeda dari withheld; setoran bukan omzet kedua, kas Enzy hanya penerimaan terkonfirmasi. Kas petugas dan agen tetap terpisah.
- Biaya, stok, kas awal, yield, expiry dan cadangan yang tidak diketahui bukan nol. COST_INCOMPLETE menahan laba final.
- Posting stok/uang/kunjungan/koreksi atomik server, lock deterministik, idempotency key + payload hash, audit/reversal append-only.

## Gap audit yang terselesaikan dan batas tersisa
Kekurangan sumber dokumen sudah terselesaikan. Tidak ada keputusan bisnis terbuka yang menghalangi scaffold pairing. Sebelum fitur keuangan/retur/assignment aktif, perlu konfirmasi biaya, SKU, saldo awal/cut-off, tanggung jawab kehilangan, tenggat dan partial collection, kebijakan retur, cadangan modal serta kewenangan detail karyawan; tidak ada nilai palsu diisi.

Audit file tidak sama dengan audit proyek Supabase nyata: existing policies/grants/functions, Auth settings, JWT, REST/Edge dan backup live belum tersedia untuk inspeksi. Implementasi Phase 2 belum dilakukan.
