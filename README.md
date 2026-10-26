# Enzy Snack — Phase 0 + 1

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

Phase 1 hanya layar perangkat belum terhubung, sesi anonim persisten dan kode pairing. Tidak ada query data bisnis, role switch, demo keuangan, claim-owner atau fallback akses. Redeem lokal dan kedua Edge Function stub menolak semua permintaan; aktivasi belum berfungsi sampai Phase 2. Perangkat active pun belum mendapat shell operasional pada fase ini. Tidak ada deploy atau migration otomatis. Push source hanya mengikuti instruksi eksplisit user.

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
