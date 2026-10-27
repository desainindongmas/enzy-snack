# Cloudflare Pages — scaffold Phase 0–1

Konfigurasi frontend statis siap di branch `development`. Ini belum bukti proyek Cloudflare sudah dibuat atau deployed. Akun Cloudflare belum terhubung ke sesi pengembangan.

## Hubungkan GitHub dari dashboard Cloudflare

1. Buka Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git (label UI dapat berubah). Pilih Pages, bukan alur deploy Worker.
2. Otorisasi integrasi GitHub untuk repo `desainindongmas/enzy-snack`, lalu pilih repo itu.
3. Nama proyek yang diusulkan: `enzy-snack` (ubah jika tidak tersedia).
4. Production branch: `development` untuk scaffold saat ini. Jangan memilih main yang belum berisi source.
5. Framework preset: Vite; root directory: root repo (kosong atau `/` sesuai UI); build command: `npm run build`; build output directory: `dist`.
6. Build environment: `NODE_VERSION=22`; `.node-version` juga menetapkan Node 22. Dependensi dipasang dari package-lock.json oleh layanan build.
7. Untuk meninjau tampilan Phase 1, kedua variabel Supabase boleh kosong. Layar menampilkan aktivasi belum tersedia dan tidak memalsukan koneksi.
8. Jika proyek Supabase TEST sudah disiapkan, tambahkan hanya `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` publik. Aktifkan anonymous Auth pada Supabase. Jangan pakai service_role/secret key, isi database produksi, atau menjalankan migration dalam build.
9. Save and Deploy. Salin URL `*.pages.dev` yang benar-benar diberikan Cloudflare; nama proyek tidak menjamin URL sebelum penciptaan berhasil.

Git integration membuat deployment baru pada push berikutnya ke branch terpilih. Atur preview branch deployments secara sengaja; jangan tambahkan secrets ke preview publik. Bila variabel VITE berubah, rebuild karena nilainya dimasukkan ke bundle saat build. Tidak perlu domain kustom atau perubahan DNS untuk pages.dev.

## Cek setelah deployment

- Buka URL di HP 360px: judul dan input kode terbaca, tidak ada scroll horizontal.
- Tanpa env: tampil pesan aktivasi belum tersedia, tombol tidak memberi akses.
- Dengan Supabase test: sesi anonymous dibuat/dipakai ulang; tidak ada query data bisnis. Redeem tetap stub yang menolak aktivasi sampai Phase 2 selesai.
- DevTools Network: tidak ada error asset/manifest/SW, header sesuai `public/_headers`; periksa refresh dan offline app shell secara manual.
- Periksa instalasi PWA di browser/perangkat target. Build manifest/SW bukan bukti installability.

## Batas dan pemulihan

Hosting ini hanya preview scaffold; owner dashboard, pairing aman, RLS Supabase nyata dan sinkronisasi bisnis belum aktif. Tes lokal tidak menggantikan security/UAT go-live. Tidak ada SQL atau seed otomatis. Tidak ada paid API/binding D1/R2/Worker/scheduler. Pilih free plan yang tersedia dan pantau kuotanya.

Untuk rollback frontend gunakan deployment sebelumnya yang berhasil di Pages. Deployment pertama belum punya versi pemulihan; perbaiki source dan deploy ulang. Jangan mengubah Supabase untuk rollback UI. Cabut Git integration bila tidak ingin deployment otomatis dari push.

## CLI opsional bagi admin yang sudah terautentikasi

`wrangler.toml` menyatakan output statis `dist`. Setelah admin menyiapkan proyek Pages dan akses akun secara aman, deployment manual dapat memakai `wrangler pages deploy dist --project-name enzy-snack --branch development` setelah build. CLI bukan bagian dari dev/build dan tidak dijalankan otomatis. Token admin tidak boleh masuk repo atau frontend.
