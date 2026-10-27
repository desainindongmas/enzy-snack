# Enzy Snack — Phase 2: akses perangkat

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

Phase 2 menambahkan API Cloudflare Pages Functions dan pairing RPC atomik, status perangkat serta owner issue/list/revoke. Seluruh API fail-closed sampai backend dikonfigurasi. Tidak ada public claim-owner, data bisnis contoh, atau finance/inventory posting. Bootstrap owner dan migration tetap manual, bukan bagian build/deploy. Lihat [Setup Phase 2](docs/PHASE-2-SETUP.md).

## Dokumen

- [Audit dan konflik](docs/CONFLICT-REPORT.md)
- [Urutan migration dan transisi legacy](docs/MIGRATION-PLAN.md)
- [Hasil verifikasi](docs/VERIFICATION.md)
- [Acceptance dan batas pengujian](docs/ACCEPTANCE.md)
- [Bootstrap dan rollback admin](docs/BOOTSTRAP-OWNER.md)
- [Checklist, risiko, handoff Phase 2](docs/PHASE-2-HANDOFF.md)

Draft SQL versioned berada di supabase/migrations; hanya persiapan untuk review, TIDAK dijalankan. Script bootstrap di supabase/admin terpisah dari migration. Functions Deno adalah stub, tidak dideploy. Tidak ada koneksi ke Supabase produksi. Hasil test lokal jangan dianggap bukti RLS database aman.

## Starter pack dan pengujian SQL lokal

Dokumen yang sebelumnya kurang sekarang lengkap, diaudit dan disimpan lokal tanpa perubahan di `references/starter-pack/`; checksum lokal di `references/SHA256.json`. Folder `references/` tidak dilacak Git untuk menghindari publikasi dokumen bisnis asli. `AGENTS.md` mengikuti paket. SQL referensi tidak dieksekusi. Draft versioned disiapkan untuk fresh schema dan menolak schema Enzy existing. Tidak ada database bisnis yang dibuat di Supabase.

`npm test` juga memuat migration baru ke PostgreSQL WASM disposable (PGlite) dengan fixture Auth/roles. Tidak perlu Docker, proyek cloud, kredensial atau API berbayar. Tes ini tidak menggantikan Supabase integration tests. Pairing expiry/reuse masih diuji sebagai penolakan stub, bukan algoritma pairing nyata.

## Git dan data privat

Branch pengembangan: `development`. Repo hanya berisi source, tes fixture sintetis, draft SQL dan dokumentasi teknis. Dokumen bisnis asli (`references/`), `.env`, credential, ekspor database, arsip, dependensi dan build tidak dilacak. `.env.example` hanya memiliki nama variabel publik dengan nilai kosong.

## Cloudflare Pages

Konfigurasi static Pages tersedia di `wrangler.toml`, Node 22 di `.node-version`, dan header hosting di `public/_headers`. Hubungkan repo ke akun Cloudflare dengan branch `development`, build `npm run build`, output `dist`. Langkah lengkap dan batas preview: [Cloudflare Pages](docs/CLOUDFLARE-PAGES.md). Konfigurasi siap tidak berarti situs sudah deployed.

## Logo dan deployment Phase 2

Artwork asli belum tersedia sebagai file lokal. Letakkan logo asli sebagai `src/assets/enzy-snack-logo.png` (jpg/jpeg/webp juga didukung), lalu build/push; komponen Brand akan memakainya di header dan panel. Sementara itu palet dan wordmark teks dipakai tanpa mengklaim sebagai logo asli.

Hosting kini memakai Pages Functions `/api/*` selain frontend statis. `SUPABASE_SERVICE_ROLE_KEY` dan `PAIRING_IP_HASH_SECRET` hanya secret runtime Cloudflare, tidak ada di VITE_* atau repo. Panduan Phase 2 menggantikan keterangan Phase 1 tentang stub lokal. Env kosong tetap menolak aktivasi.

## Verifikasi dan pengembangan backend

`npm test` menjalankan SQL disposable + tes API/Auth lokal. `npm run check:functions` memverifikasi bundling Pages Functions tanpa deploy atau login akun. `npm run build` membangun frontend serta memeriksa TypeScript backend. `npm run dev` (Vite) hanya melayani frontend; API membutuhkan runtime Cloudflare Pages. Untuk pengujian full-stack lokal admin dapat memakai Wrangler Pages dev setelah build dengan environment lokal yang diabaikan Git (`.dev.vars`), namun pemeriksaan trusted ingress harus tetap dipertahankan dan UAT live TEST tetap wajib. Jangan memasukkan secret ke konfigurasi Vite untuk membuat API lokal seolah aktif.
