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
