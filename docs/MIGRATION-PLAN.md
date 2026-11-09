# Rencana migration dan transisi legacy

## Urutan yang disiapkan
1. `202610260001_device_access.sql`: draft baru akses perangkat, helper admin-only, audit append-only; hanya fresh schema. Preflight menolak bila sudah ada tabel/view Enzy agar tidak menumpuk model profiles/device tanpa audit. Tidak otomatis dijalankan oleh dev/build/test cloud. Tes lokal memuatnya hanya di PostgreSQL WASM disposable.
2. Phase 2: setelah review, migration test untuk pairing atomik/rate limit dan resolver perangkat milik sendiri; function privileges dicabut dari PUBLIC secara eksplisit. Business tetap default-deny.
3. Phase 3: satu business identity, master dan assignment historis + harga versioned, business-scoped FK/constraints. Tidak membuat SaaS UI multi-tenant. Owner-only configuration; production/field scope belum terbuka sampai tests.
4. Phase 4–6: lot/batch/balance + inventory ledger; kunjungan/retur; cash custody/finance; RPC atomik idempotent sesuai spesifikasi. Migration per fitur dengan acceptance terpisah.
5. Phase 7: backup/restore, sensus stok/saldo awal, UAT, go-live berizin.

## Jika ternyata sudah ada schema legacy
Jangan menjalankan kedua SQL referensi secara berurutan atau memaksa migration fresh dengan IF NOT EXISTS. SQL baru sengaja berhenti sebelum membuat tabel.

- Admin mengambil backup terenkripsi dan membuktikan restore di test. Inventaris pg_tables, pg_policies, pg_proc/ACL, grants, extensions dan dependency, bukan hanya melihat file SQL.
- Audit `enzy_profiles`: user_id bukan device_id; anonymous UID baru tidak otomatis identik dengan akun lama. Tidak mempromosikan role lama atau perangkat pertama secara otomatis.
- Buat mapping admin terverifikasi old_user_id → approved device_id, dengan alasan, waktu, actor admin dan sumber bukti. Actor historis tidak ditimpa; bila tidak ada mapping, simpan legacy actor eksplisit/unresolved, bukan UUID palsu.
- `enzy_stores.assigned_field_user_id`: transisi ke assignment bertanggal dengan field_device_id/identity kerja yang disepakati, bukan rename FK langsung.
- `enzy_price_agreements.created_by`, `enzy_raw_purchase_lots.recorded_by`, `enzy_stock_movements.created_by`: kolom actor perangkat baru untuk aksi baru, pertahankan legacy reference untuk histori sampai mapping diaudit.
- Pisahkan display profile dari permission. Semua permission baru memakai auth.uid + active device + business/resource scope. Jangan fallback ke enzy_profiles jika perangkat tidak ditemukan.
- Tambahkan business scope dan composite FK/index; reconcile ledger terhadap projection sebelum memindah data. Tidak menambah omzet atau kas dari data pembukaan.
- Tulis transition migration khusus setelah schema aktual diketahui, jalankan di salinan nonproduksi, uji role/revoke/RPC, dan siapkan rollback. Baru terapkan produksi secara manual setelah otorisasi yang sesuai.

## Perbedaan sengaja dari SQL referensi device
Role NULL dibolehkan untuk pending; active tidak boleh NULL. FK auth tidak cascade agar audit/histori tidak hilang saat user dihapus. Owner invite belum dibuka; bootstrap/recovery admin. UUID untuk audit konsisten dengan scaffold; tidak ada data legacy yang diubah dari bigint. Hash code saja tidak membuktikan entropy/hash aman: issuance/redeem masih nonaktif.

## Implementasi Phase 3

Migration `20261109130426_master_data_pricing.sql` menambahkan konfigurasi satu bisnis, empat tabel master, price agreements periodik, audit dan request idempotency, serta RPC owner-only. Tidak mengubah devices/invites/owner yang sudah ada. Penugasan lapangan historis dan snapshot transaksi belum diimplementasikan karena memerlukan engine kunjungan/stock pada fase lanjut. Lihat PHASE-3-SETUP untuk langkah manual TEST dan batas UAT.

## Implementasi Phase 4

Migration `20261109141211_inventory_lots_batches.sql` setelah Phase 3 menambah lokasi, operasi immutable, pembelian, batch/input, lot, saldo projection, ledger, audit dan idempotency receipt. RPC service-only baru memakai helper di schema privat, active device/role check, persisted rate limits, business-wide transaction advisory lock dan bucket `FOR UPDATE`. Penggunaan raw gram dan finished pcs dipisahkan; biaya nullable tetap incomplete.

Hanya konfigurasi raw/finished/quarantine dibuat tanpa kuantitas. Tidak mengubah migration lama, owner, harga, atau data pengguna. Jalankan file baru secara manual di TEST sesuai PHASE-4-SETUP.md. Pengembang hanya menguji database disposable; tidak melakukan remote migration. Rollback bisnis memakai reversal beralasan, bukan menghapus ledger/tabel. Stok awal/legacy membutuhkan cut-off dan rencana rekonsiliasi tersendiri, bukan pembelian fiktif.

## Implementasi Phase 5

Migration `20261109161548_store_visits_returns.sql` memperluas lokasi dengan store_consignment dan operasi dengan visit; menambahkan assignment append-only, visit headers, cycle/lines, hasil per lot, inspections, store state/version dan request receipt. Public service-only visit RPC memakai helper privat dan lock inventory yang sama dengan Phase 4. Default created_at operasi baru memakai clock_timestamp untuk urutan posting sebenarnya, termasuk pada transaksi multi-aksi; waktu historis tidak ditimpa.

RPC inventory Phase 4 dipertahankan melalui wrapper kompatibel yang mendelegasikan ke implementasi privat; transfer ke/dari store_consignment dan pembalikan generik visit diblokir. SQL Phase 4 yang sudah diterapkan tidak diubah. Tidak ada seed/store assignment/stock/business fixture, remote migration atau perubahan owner. Return inspection hanya mengonfirmasi hold; edar ulang/pemusnahan menunggu keputusan. Panduan dan UAT: PHASE-5-SETUP.md.

## Implementasi Phase 6

Migration `20261109171410_finance_cash_custody.sql` menambahkan accounts, money operations/ledger/projection, remittance proposals/cancellations, request receipts, private invoice/remittance views, helpers serta service-only finance RPC. Seed hanya enam akun klasifikasi tanpa saldo/jurnal; kas/bank dibuat manual tanpa saldo awal. Financial balanced-journal constraint deferred menjaga setiap operation mempunyai minimal dua leg dan total nol.

Trigger visit sale dan inventory visit reversal mengikat posting finance ke transaksi stock/cycle yang sama. Public visit RPC Phase 5 dipertahankan sebagai wrapper atas implementasi privat untuk error dependensi. SQL Phase 1–5 tidak diubah. Semua penulisan memakai lock inventory per bisnis; financial allocation, reservations dan projection dicek atomik. Tidak menerapkan remote migration/backfill atau bootstrap. Panduan: PHASE-6-SETUP.md. Cut-off saldo awal dan backup/restore tetap Phase 7.
