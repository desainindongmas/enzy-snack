# Bootstrap owner manual — admin Supabase

1. Gunakan proyek TEST terpisah, verifikasi backup dan target project. Review migration terhadap schema yang sebenarnya sebelum penerapan manual. Migration ini fresh-install only dan akan menolak schema Enzy existing; ikuti MIGRATION-PLAN untuk legacy.
2. Aktifkan anonymous Auth; atur CAPTCHA/abuse controls yang didukung. Aplikasi tidak memuat paid API. Jika CAPTCHA diwajibkan, integrasinya harus diselesaikan sebelum pemakaian nyata.
3. Isi variabel publik frontend. Buka dari browser owner; verifikasi user anonymous di Dashboard Auth. ID singkat pada layar hanya pembantu pencocokan, bukan bukti identitas. Ambil UUID lengkap dari dashboard dan verifikasi terhadap perangkat owner melalui kanal admin yang dipercaya.
4. Admin mengedit placeholder di supabase/admin/bootstrap-owner.sql dan menjalankannya manual. Jangan masukkan ke migrations atau pipeline. Simpan identitas admin, waktu, target project, dan alasan dalam catatan operasional.
5. Verifikasi baris owner/active dan audit. Pada Phase 2, setelah backend dikonfigurasi, gunakan Periksa status perangkat agar panel owner muncul. Ikuti docs/PHASE-2-SETUP.md.
6. Simpan akses admin Supabase dan backup di luar perangkat owner. Storage browser hilang berarti sesi tidak bisa dipulihkan dari kode pendek.

Rollback: dalam transaksi admin, ubah owner yang salah menjadi revoked, isi revoked_at=now(), dan tambahkan enzy_device_audit action admin_bootstrap_revoked. Jangan menghapus audit. Tidak perlu menghapus auth.users secara tergesa. Recovery owner memerlukan verifikasi manusia oleh admin, pencabutan perangkat lama dan bootstrap UUID baru. Jangan otomatis mempromosikan pengguna pertama atau perangkat lain.
