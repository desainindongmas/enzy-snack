export class SessionSetupError extends Error {
 constructor(public readonly setupCode:'CONFIG_MISSING'|'CONFIG_INVALID') {super(setupCode);this.name='SessionSetupError'}
}
// Only allowlisted guidance leaves this boundary. Never display raw provider errors,
// response bodies, URLs with query parameters, or supplied credential values.
export function sessionFailureMessage(error:unknown):string {
 if(error instanceof SessionSetupError)return error.setupCode==='CONFIG_MISSING'
  ? 'Pengaturan koneksi Supabase belum terbaca. Periksa VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY pada lingkungan deployment Cloudflare yang dipakai, lalu build ulang. [SETUP-01]'
  : 'Alamat atau pengaturan kunci publik Supabase tidak valid. Periksa kembali pengaturan Cloudflare lalu build ulang. [SETUP-02]';
 const e=error as {code?:unknown;status?:unknown;name?:unknown;message?:unknown}|null;
 const code=typeof e?.code==='string'?e.code:'';
 if(code==='anonymous_provider_disabled')return 'Anonymous sign-in belum diaktifkan pada proyek Supabase yang terhubung ke website ini. [SETUP-03]';
 if(code==='captcha_failed'||code==='captcha_required')return 'Supabase meminta pemeriksaan CAPTCHA. Penyiapan CAPTCHA aplikasi perlu dilengkapi. [SETUP-04]';
 if(e?.status===429||code==='over_request_rate_limit')return 'Terlalu banyak percobaan koneksi. Tunggu beberapa menit sebelum menekan Coba koneksi lagi. [SETUP-05]';
 if(e?.status===401||code==='invalid_api_key'||code==='bad_jwt')return 'Kunci publik atau sesi perangkat tidak diterima Supabase. Periksa kunci publik dan kecocokan proyek di Cloudflare. [SETUP-07]';
 if(e?.name==='SecurityError'||e?.name==='QuotaExceededError')return 'Browser belum dapat menyimpan identitas HP. Izinkan penyimpanan situs di pengaturan browser; jangan hapus identitas perangkat yang sudah aktif. [SETUP-09]';
 if(e?.name==='AuthRetryableFetchError'||(e?.name==='TypeError'&&typeof e.message==='string'&&/fetch|network/i.test(e.message)))return 'Koneksi ke Supabase gagal. Periksa koneksi internet dan pastikan proyek Supabase sedang aktif. [SETUP-06]';
 return 'Identitas HP belum berhasil dibuat di Supabase. Tekan Coba koneksi lagi; jika tetap gagal, sampaikan kode SETUP-08 kepada pengelola. [SETUP-08]';
}
