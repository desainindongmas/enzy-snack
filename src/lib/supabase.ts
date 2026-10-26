import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase=url&&key?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;
let initialization:Promise<string>|null=null;
export function initializeSession():Promise<string>{
 if(initialization)return initialization;
 initialization=(async()=>{
  if(!supabase)throw new Error('Konfigurasi belum tersedia.');
  const {data,error}=await supabase.auth.getSession();if(error)throw error;
  if(data.session)return data.session.user.id;
  const result=await supabase.auth.signInAnonymously();if(result.error)throw result.error;
  if(!result.data.user)throw new Error('Sesi belum terbentuk.');return result.data.user.id;
 })().catch(e=>{initialization=null;throw e});return initialization;
}
// Fail closed in Phase 1. Never set active status or role in browser storage.
export async function redeemPairing(_code:string):Promise<never>{throw new Error('Aktivasi perangkat belum dibuka. Hubungi pemilik untuk bantuan.');}
