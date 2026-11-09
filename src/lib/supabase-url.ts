/** Supabase's SDK appends /auth/v1 and /rest/v1 itself.
 * Accept the copied Data API base URL too, but never keep its /rest/v1 suffix.
 * Reject arbitrary paths/credentials/query parameters rather than silently
 * redirecting credentials from a malformed configuration.
 */
export function normalizeSupabaseUrl(input:string):string {
 const url=new URL(input.trim());
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.search||url.hash)throw new Error('Invalid Supabase project URL');
 if(!['/','/rest/v1','/rest/v1/'].includes(url.pathname))throw new Error('Expected Supabase project URL or Data API base URL');
 return url.origin;
}
