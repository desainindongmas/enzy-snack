import {createClient} from '@supabase/supabase-js';
import {SessionSetupError} from './session-errors';
const url=import.meta.env.VITE_SUPABASE_URL?.trim();
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
let configurationError:SessionSetupError|null=null;
function configuredClient(){
 if(!url||!key){configurationError=new SessionSetupError('CONFIG_MISSING');return null}
 try{return createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}})}
 catch{configurationError=new SessionSetupError('CONFIG_INVALID');return null}
}
export const supabase=configuredClient();
let initialization:Promise<string>|null=null;
export function initializeSession():Promise<string>{
 if(initialization)return initialization;
 initialization=(async()=>{
  if(!supabase)throw configurationError??new SessionSetupError('CONFIG_MISSING');
  const {data,error}=await supabase.auth.getSession();if(error)throw error;
  if(data.session)return data.session.user.id;
  const result=await supabase.auth.signInAnonymously();if(result.error)throw result.error;
  if(!result.data.user)throw new Error('Sesi belum terbentuk.');return result.data.user.id;
 })().catch(e=>{initialization=null;throw e});return initialization;
}
export type Role='owner'|'production'|'field';
export interface Device {id:string|null;device_label:string|null;status:'pending'|'active'|'revoked';role:Role|null}
export interface ManagedDevice extends Device {id:string;paired_at:string|null;revoked_at:string|null}
export interface Invitation {code:string;expires_at:string}
const messages:Record<string,string>={
 SETUP_REQUIRED:'Aktivasi belum siap. Pemilik perlu menyelesaikan penyiapan backend.',
 BACKEND_UNAVAILABLE:'Layanan belum dapat dihubungi. Coba lagi beberapa saat.',
 UNAUTHORIZED:'Sesi perangkat tidak valid. Muat ulang halaman untuk mencoba kembali.',
 FORBIDDEN:'Perangkat tidak memiliki izin untuk tindakan ini.',
 DEVICE_REVOKED:'Akses perangkat ini telah dicabut. Hubungi pemilik.',
 INVALID_CODE:'Kode tidak valid, sudah digunakan, atau kedaluwarsa. Minta kode baru kepada pemilik.',
 RATE_LIMITED:'Terlalu banyak percobaan. Tunggu satu menit sebelum mencoba kembali.',
 ALREADY_ACTIVE:'Perangkat sudah terhubung. Perbarui status perangkat.',
 INVALID_REQUEST:'Periksa kembali isian sebelum melanjutkan.',
};
export async function api<T>(path:string,body?:unknown):Promise<T>{
 if(!supabase)throw new Error(messages.SETUP_REQUIRED);
 const {data,error}=await supabase.auth.getSession();
 if(error||!data.session)throw new Error(messages.UNAUTHORIZED);
 const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',cache:'no-store',headers:{Authorization:'Bearer '+data.session.access_token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 let result;try{result=await response.json()}catch{throw new Error(messages.BACKEND_UNAVAILABLE)}
 if(!response.ok||result.error)throw new Error(messages[result.error]??messages.BACKEND_UNAVAILABLE);
 return result as T;
}
export async function getDevice():Promise<Device>{
 const {device}=await api<{device:Device}>('device');
 if(!device||!['pending','active','revoked'].includes(device.status)||
 (device.status==='active'&&(!device.id||!['owner','production','field'].includes(device.role??''))))throw new Error(messages.BACKEND_UNAVAILABLE);
 return device;
}
export const redeemPairing=(code:string)=>api<{ok:true}>('pairing/redeem',{code});
export const issuePairing=(role:'production'|'field',device_label:string)=>api<Invitation>('pairing/issue',{role,device_label});
export const listDevices=()=>api<{devices:ManagedDevice[]}>('devices');
export const revokeDevice=(device_id:string)=>api<{ok:true}>('devices/revoke',{device_id});
