# Enzy Snack — Phase 5: kunjungan warung, penjualan dan retur

Scaffold lokal React + TypeScript + Vite + Tailwind 4, komponen Button pola shadcn/ui (Radix/CVA), Supabase anonymous Auth dan PWA. Bahasa Indonesia, layout mobile dengan breakpoint 760px dan target 360px. Palet mengacu logo lampiran; gambar logo asli tidak tersedia sebagai file lokal sehingga ikon sementara dan ilustrasi kemasan CSS digunakan, bukan pengganti aset final.

## Jalankan

```sh
npm ci
cp .env.example .env
# isi URL proyek dan publishable key PUBLIK Supabase
npm run dev
npm test
npm run build
```

Anonymous sign-in harus diaktifkan pada proyek Supabase. Tidak perlu email/password. Jika env kosong, aplikasi menolak aktivasi dan menampilkan pesan penyiapan; tidak memakai backend/data contoh. Jangan pernah mengisi service-role/secret key ke variabel VITE_. Jangan menerapkan pada database existing sebelum audit RLS lengkap.

Phase 2 menambahkan API Cloudflare Pages Functions dan pairing RPC atomik, status perangkat serta owner issue/list/revoke. Seluruh API fail-closed sampai backend dikonfigurasi. Tidak ada public claim-owner atau data bisnis contoh. Posting stok ditambahkan pada Phase 4; posting finance belum tersedia. Bootstrap owner dan migration tetap manual, bukan bagian build/deploy. Lihat [Setup Phase 2](docs/PHASE-2-SETUP.md).

## Dokumen

- [Audit dan konflik](docs/CONFLICT-REPORT.md)
- [Urutan migration dan transisi legacy](docs/MIGRATION-PLAN.md)
- [Hasil verifikasi](docs/VERIFICATION.md)
- [Acceptance dan batas pengujian](docs/ACCEPTANCE.md)
- [Bootstrap dan rollback admin](docs/BOOTSTRAP-OWNER.md)
- [Checklist, risiko, handoff Phase 2](docs/PHASE-2-HANDOFF.md)

SQL versioned berada di supabase/migrations dan diterapkan manual oleh pengguna, bukan saat build/deploy. Script bootstrap di supabase/admin terpisah dari migration. API aktif memakai Pages Functions; folder Functions Deno lama tetap stub. Pengembang tidak menjalankan SQL ke proyek pengguna. Hasil test lokal jangan dianggap bukti RLS proyek live aman.

## Starter pack dan pengujian SQL lokal

Dokumen yang sebelumnya kurang sekarang lengkap, diaudit dan disimpan lokal tanpa perubahan di `references/starter-pack/`; checksum lokal di `references/SHA256.json`. Folder `references/` tidak dilacak Git untuk menghindari publikasi dokumen bisnis asli. `AGENTS.md` mengikuti paket. SQL referensi tidak dieksekusi. Draft versioned disiapkan untuk fresh schema dan menolak schema Enzy existing. Tidak ada database bisnis yang dibuat di Supabase.

`npm test` juga memuat migration baru ke PostgreSQL WASM disposable (PGlite) dengan fixture Auth/roles. Tidak perlu Docker, proyek cloud, kredensial atau API berbayar. Tes ini tidak menggantikan Supabase integration tests. Pairing expiry/reuse, audit, role dan idempotency diuji menggunakan fungsi SQL sebenarnya dengan fixture lokal.

## Git dan data privat

Branch pengembangan: `development`. Repo hanya berisi source, tes fixture sintetis, draft SQL dan dokumentasi teknis. Dokumen bisnis asli (`references/`), `.env`, credential, ekspor database, arsip, dependensi dan build tidak dilacak. `.env.example` hanya memiliki nama variabel publik dengan nilai kosong.

## Cloudflare Pages

Konfigurasi static Pages tersedia di `wrangler.toml`, Node 22 di `.node-version`, dan header hosting di `public/_headers`. Hubungkan repo ke akun Cloudflare dengan branch `development`, build `npm run build`, output `dist`. Langkah lengkap dan batas preview: [Cloudflare Pages](docs/CLOUDFLARE-PAGES.md). Konfigurasi siap tidak berarti situs sudah deployed.

## Logo dan deployment Phase 2

Artwork asli belum tersedia sebagai file lokal. Letakkan logo asli sebagai `src/assets/enzy-snack-logo.png` (jpg/jpeg/webp juga didukung), lalu build/push; komponen Brand akan memakainya di header dan panel. Sementara itu palet dan wordmark teks dipakai tanpa mengklaim sebagai logo asli.

Hosting kini memakai Pages Functions `/api/*` selain frontend statis. `SUPABASE_SERVICE_ROLE_KEY` dan `PAIRING_IP_HASH_SECRET` hanya secret runtime Cloudflare, tidak ada di VITE_* atau repo. Panduan Phase 2 menggantikan keterangan Phase 1 tentang stub lokal. Env kosong tetap menolak aktivasi.

## Verifikasi dan pengembangan backend

`npm test` menjalankan SQL disposable + tes API/Auth lokal. `npm run check:functions` memverifikasi bundling Pages Functions tanpa deploy atau login akun. `npm run build` membangun frontend serta memeriksa TypeScript backend. `npm run dev` (Vite) hanya melayani frontend; API membutuhkan runtime Cloudflare Pages. Untuk pengujian full-stack lokal admin dapat memakai Wrangler Pages dev setelah build dengan environment lokal yang diabaikan Git (`.dev.vars`), namun pemeriksaan trusted ingress harus tetap dipertahankan dan UAT live TEST tetap wajib. Jangan memasukkan secret ke konfigurasi Vite untuk membuat API lokal seolah aktif.

## Phase 3 — data usaha

Menu pemilik sekarang memisahkan Data usaha dan Perangkat tim. Supplier, SKU, warung, agen, dan harga per periode dikelola melalui backend owner-only dengan histori/audit, versi optimistic dan idempotency. Perangkat produksi/lapangan tetap dibatasi. Tidak membuat data bisnis contoh atau posting stok/uang.

Ikuti [panduan Phase 3](docs/PHASE-3-SETUP.md) untuk menjalankan **satu migration baru** secara manual di TEST. Jangan mengulang migration 001/002 atau bootstrap owner. Jika migration belum ada, menu Data usaha fail-closed dengan pesan yang jelas; menu pairing tetap tersedia.

`npm run test:browser` menjalankan Chromium dengan endpoint fixture, bukan Supabase live. Gunakan browser Playwright yang terpasang, `/usr/bin/chromium` pada managed Linux, atau `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` untuk memilih binary lokal. Screenshot/report lokal tidak dilacak Git.

## Phase 4 — produksi dan stok

Menu **Produksi & Stok** menambahkan penerimaan bahan per lot/harga, repacking multi-lot dengan rekonsiliasi gram, hasil produk jadi dalam pcs, transfer lokasi dan pembalikan append-only. Perangkat produksi dapat mencatat repacking; lapangan hanya melihat muatannya sendiri. Nominal biaya hanya dibaca pemilik. Biaya yang belum diketahui tetap NULL/COST_INCOMPLETE; tidak dihitung sebagai nol atau laba final.

Ikuti [panduan Phase 4](docs/PHASE-4-SETUP.md) dan jalankan **hanya migration baru** `20261109141211_inventory_lots_batches.sql` di proyek TEST. Env dan owner tidak perlu diubah. Tidak ada seed saldo atau stok awal, penjualan, kunjungan, retur, komisi maupun posting kas. Jika SQL belum dipasang, menu master/perangkat tetap tersedia.

Verifikasi tambahan: `python tests/postgres-concurrency.py` memakai Docker daemon lokal pada `/var/run/docker.sock` dan image PostgreSQL 17 resmi yang dipin digest. Container disposable tanpa jaringan/host port, tidak menerima URL database live; Docker harus tersedia dan image perlu diunduh bila belum ada. Tes ini membuktikan dua koneksi nyata bersaing atas stok/request/pembalikan. Lihat [hasil dan batas verifikasi](docs/VERIFICATION.md).

## Phase 5 — kunjungan dan retur

**Kunjungan & Retur** menambahkan penugasan historis warung, titipan per lot/harga snapshot, penutupan penuh siklus lama, penjualan terverifikasi, pemisahan retur layak/rusak/kedaluwarsa dan kehilangan, pemeriksaan tetap ditahan di karantina, serta pembalikan owner-only. Lapangan hanya memakai muatan sendiri pada warung yang ditugaskan; produksi tidak mendapat akses. Perubahan penugasan menunggu siklus ditutup.

Ikuti [panduan pemasangan dan UAT Phase 5](docs/PHASE-5-SETUP.md): terapkan **satu migration baru** `20261109161548_store_visits_returns.sql` di TEST. Tidak mengulang migration lama/owner atau mengubah env. Penitipan bukan penjualan; kehilangan bukan laku; komisi hanya earned atas laku terverifikasi, belum withheld/paid. Penerimaan uang, setoran dan finance menyusul Phase 6. Pelepasan retur untuk edar ulang/pemusnahan belum dibuka tanpa kebijakan pemilik.

Pengujian concurrency PostgreSQL kini mencakup kunjungan vs transfer, penutupan ganda dan retry kunjungan. Source dokumen bisnis asli tetap privat/tidak dilacak dan tidak tersedia di executor sesi ini; implementasi mengikuti keputusan pengguna dan audit aturan bisnis yang terdokumentasi, bukan mengklaim pembacaan ulang lampiran asli.
