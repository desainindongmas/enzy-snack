import {createClient} from '@supabase/supabase-js';
import {normalizeSupabaseUrl} from '../src/lib/supabase-url';
export interface PairingEnv {
 SUPABASE_URL:string; SUPABASE_SERVICE_ROLE_KEY:string;
 APP_ORIGIN:string; PAIRING_IP_HASH_SECRET:string; PAIRING_ENABLED:string;
}
export interface Backend {
 verify(token:string):Promise<string|null>;
 action(actor:string,action:string,ipHash:string,payload:Record<string,unknown>):Promise<Record<string,unknown>|null>;
}
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export const newPairingCode=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))}
async function hashIp(ip:string,secret:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(ip))));
}
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'}})}
const routes:Record<string,{method:string;action:string}>={
 '/api/device':{method:'GET',action:'status'},'/api/devices':{method:'GET',action:'list'},
 '/api/pairing/issue':{method:'POST',action:'issue'},'/api/pairing/redeem':{method:'POST',action:'redeem'},
 '/api/devices/profile':{method:'POST',action:'profile'},
 '/api/devices/revoke':{method:'POST',action:'revoke'},
 '/api/master':{method:'GET',action:'master_list'},
 '/api/master/save':{method:'POST',action:'master_save'},
 '/api/master/archive':{method:'POST',action:'master_archive'},
 '/api/master/price':{method:'POST',action:'master_price'},
 '/api/readiness':{method:'GET',action:'readiness_report'},
 '/api/readiness/opening-preview':{method:'POST',action:'readiness_opening_preview'},
 '/api/readiness/opening-post':{method:'POST',action:'readiness_opening_post'},
 '/api/readiness/evidence':{method:'POST',action:'readiness_evidence'},
 '/api/finance':{method:'GET',action:'finance_list'},
 '/api/finance/account':{method:'POST',action:'finance_account'},
 '/api/finance/collect':{method:'POST',action:'finance_collect'},
 '/api/finance/propose':{method:'POST',action:'finance_propose'},
 '/api/finance/confirm':{method:'POST',action:'finance_confirm'},
 '/api/finance/cancel':{method:'POST',action:'finance_cancel'},
 '/api/finance/capital_in':{method:'POST',action:'finance_capital_in'},
 '/api/finance/capital_out':{method:'POST',action:'finance_capital_out'},
 '/api/finance/cash_out':{method:'POST',action:'finance_cash_out'},
 '/api/finance/commission_payment':{method:'POST',action:'finance_commission_payment'},
 '/api/finance/reverse':{method:'POST',action:'finance_reverse'},
 '/api/finance/recognize':{method:'POST',action:'finance_recognize'},
 '/api/visits':{method:'GET',action:'visit_list'},
 '/api/visits/preview':{method:'POST',action:'visit_preview'},
 '/api/visits/post':{method:'POST',action:'visit_post'},
 '/api/visits/assign':{method:'POST',action:'visit_assign'},
 '/api/visits/inspect':{method:'POST',action:'visit_inspect'},
 '/api/visits/reverse':{method:'POST',action:'visit_reverse'},
 '/api/inventory':{method:'GET',action:'inventory_list'},
 '/api/inventory/location':{method:'POST',action:'inventory_location'},
 '/api/inventory/purchase':{method:'POST',action:'inventory_purchase'},
 '/api/inventory/production':{method:'POST',action:'inventory_production'},
 '/api/inventory/transfer':{method:'POST',action:'inventory_transfer'},
 '/api/inventory/reverse':{method:'POST',action:'inventory_reverse'},
};
async function boundedJson(request:Request,maxBytes=2048):Promise<Record<string,unknown>>{
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('body');
 const reader=request.body?.getReader();if(!reader)throw new Error('body');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error('body')}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 const body:unknown=JSON.parse(new TextDecoder().decode(bytes));
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('body');return body as Record<string,unknown>;
}
export async function handlePairing(request:Request,env:PairingEnv,backend?:Backend):Promise<Response>{
 try{
  const url=new URL(request.url);const route=routes[url.pathname];if(!route)return json({error:'NOT_FOUND'},404);
  if(request.method!==route.method)return json({error:'METHOD_NOT_ALLOWED'},405);
  if(env.PAIRING_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.APP_ORIGIN||env.PAIRING_IP_HASH_SECRET?.length<32||!env.PAIRING_IP_HASH_SECRET)return json({error:'SETUP_REQUIRED'},503);
  let projectUrl:string;
  try{projectUrl=normalizeSupabaseUrl(env.SUPABASE_URL)}catch{return json({error:'SETUP_REQUIRED'},503)}
  if(url.origin!==env.APP_ORIGIN||(request.headers.has('origin')&&request.headers.get('origin')!==env.APP_ORIGIN))return json({error:'FORBIDDEN'},403);
  // Only Cloudflare Pages runtime supplies request.cf and overwrites CF-Connecting-IP.
  // Do not accept X-Forwarded-For or any IP from the request JSON.
  const ip=request.headers.get('cf-connecting-ip');
  if(!(request as Request&{cf?:unknown}).cf||!ip||ip.length>45||!/^[0-9a-fA-F:.]+$/.test(ip))return json({error:'UNTRUSTED_INGRESS'},503);
  const auth=request.headers.get('authorization')??'';
  if(!/^Bearer [A-Za-z0-9._-]{16,4096}$/.test(auth))return json({error:'UNAUTHORIZED'},401);
  let payload:Record<string,unknown>={};
  if(request.method==='POST'){
   try{payload=await boundedJson(request,route.action.startsWith('readiness_')?32768:route.action.startsWith('finance_')?8192:route.action.startsWith('visit_')?24576:route.action.startsWith('inventory_')?16384:route.action.startsWith('master_')?8192:2048)}catch{return json({error:'INVALID_REQUEST'},400)}
  }
  const client=backend?null:createClient(projectUrl,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const service:Backend=backend??{
   async verify(token){const {data,error}=await client!.auth.getUser(token);return !error&&data.user?data.user.id:null},
   async action(actor,action,ipHash,body){
    const profile=action==='profile'||(action==='issue'&&body.display_name!==undefined);
    const master=action.startsWith('master_'),inventory=action.startsWith('inventory_'),visit=action.startsWith('visit_'),finance=action.startsWith('finance_'),readiness=action.startsWith('readiness_');
    const {data,error}=await client!.rpc(profile?'enzy_profile_action':readiness?'enzy_readiness_action':finance?'enzy_finance_action':visit?'enzy_visit_action':inventory?'enzy_inventory_action':master?'enzy_master_action':'enzy_pairing_action',readiness?
     {p_actor:actor,p_action:action.slice(10),p_ip_hash:ipHash,p_payload:body}:finance?
     {p_actor:actor,p_action:action.slice(8),p_ip_hash:ipHash,p_payload:body}:visit?
     {p_actor:actor,p_action:action.slice(6),p_ip_hash:ipHash,p_payload:body}:inventory?
     {p_actor:actor,p_action:action.slice(10),p_ip_hash:ipHash,p_payload:body}:master?
     {p_actor:actor,p_action:action.slice(7),p_kind:body.kind,p_ip_hash:ipHash,p_payload:body}:
     {p_actor:actor,p_action:action,p_ip_hash:ipHash,p_payload:body});
    if((profile||master||inventory||visit||finance||readiness)&&error&&['42883','42P01','PGRST202'].includes(error.code))return {error:profile?'PROFILE_REQUIRED':readiness?'READINESS_REQUIRED':finance?'FINANCE_REQUIRED':visit?'VISITS_REQUIRED':inventory?'INVENTORY_REQUIRED':'MIGRATION_REQUIRED'};
    return error?null:data;
   },
  };
  const actor=await service.verify(auth.slice(7));if(!actor)return json({error:'UNAUTHORIZED'},401);
  let code:string|undefined;
  if(route.action.startsWith('readiness_')){
   if(route.action==='readiness_report'){
    if(url.searchParams.size)return json({error:'INVALID_REQUEST'},400);
   }else if(Object.keys(payload).some(k=>!['record','request_id'].includes(k))||!payload.record||typeof payload.record!=='object'||Array.isArray(payload.record)||(route.action!=='readiness_opening_preview'&&typeof payload.request_id!=='string'))return json({error:'INVALID_REQUEST'},400);
  }else if(route.action.startsWith('finance_')){
   if(route.action==='finance_list'){
    if(Array.from(url.searchParams.keys()).some(k=>!['kind','page','search'].includes(k)))return json({error:'INVALID_REQUEST'},400);
    payload=Object.fromEntries(url.searchParams);
    if(!['accounts','invoices','proposals','history','legacy','summary'].includes(String(payload.kind)))return json({error:'INVALID_REQUEST'},400);
   }else if(Object.keys(payload).some(k=>!['record','request_id'].includes(k))||!payload.record||typeof payload.record!=='object'||Array.isArray(payload.record)||typeof payload.request_id!=='string')return json({error:'INVALID_REQUEST'},400);
  }else if(route.action.startsWith('visit_')){
   if(route.action==='visit_list'){
    if(Array.from(url.searchParams.keys()).some(k=>!['kind','page','search','store_id'].includes(k)))return json({error:'INVALID_REQUEST'},400);
    payload=Object.fromEntries(url.searchParams);
    if(!['stores','visits','returns','detail'].includes(String(payload.kind)))return json({error:'INVALID_REQUEST'},400);
   }else if(Object.keys(payload).some(k=>!['record','request_id'].includes(k))||!payload.record||typeof payload.record!=='object'||Array.isArray(payload.record)||(route.action!=='visit_preview'&&typeof payload.request_id!=='string'))return json({error:'INVALID_REQUEST'},400);
  }else if(route.action.startsWith('inventory_')){
   if(route.action==='inventory_list'){
    if(Array.from(url.searchParams.keys()).some(k=>!['kind','page','search','lot_kind','location_id'].includes(k)))return json({error:'INVALID_REQUEST'},400);
    payload=Object.fromEntries(url.searchParams);
    if(!['locations','balances','lots','purchases','batches','movements','operations','catalog_products','catalog_suppliers','catalog_agents','catalog_devices'].includes(String(payload.kind)))return json({error:'INVALID_REQUEST'},400);
   }else if(Object.keys(payload).some(k=>!['record','request_id'].includes(k))||!payload.record||typeof payload.record!=='object'||Array.isArray(payload.record)||typeof payload.request_id!=='string')return json({error:'INVALID_REQUEST'},400);
  }else if(route.action.startsWith('master_')){
   if(route.action==='master_list'){
    if(Array.from(url.searchParams.keys()).some(k=>!['kind','search','page','include_archived'].includes(k)))return json({error:'INVALID_REQUEST'},400);
    payload=Object.fromEntries(url.searchParams);
   }
   if(!['suppliers','products','stores','agents','prices'].includes(String(payload.kind))||
    Object.keys(payload).some(k=>!(route.action==='master_list'?['kind','search','page','include_archived']:['kind','record','request_id']).includes(k)))return json({error:'INVALID_REQUEST'},400);
   if(route.action!=='master_list'&&(!payload.record||typeof payload.record!=='object'||Array.isArray(payload.record)||typeof payload.request_id!=='string'))return json({error:'INVALID_REQUEST'},400);
  }else if(route.action==='issue'){
   if(Object.keys(payload).some(k=>!['role','device_label','display_name'].includes(k))||!['production','field'].includes(String(payload.role))||typeof payload.device_label!=='string'||!payload.device_label.trim()||payload.device_label.trim().length>100)return json({error:'INVALID_REQUEST'},400);
   if(payload.display_name!==undefined&&(typeof payload.display_name!=='string'||!payload.display_name.trim()||payload.display_name.trim().length>80||/[\x00-\x1f\x7f]/.test(payload.display_name)))return json({error:'INVALID_REQUEST'},400);
   code=newPairingCode();payload={role:payload.role,device_label:payload.device_label.trim(),...(payload.display_name===undefined?{}:{display_name:(payload.display_name as string).trim()}),code_hash:await digest(code)};
  }else if(route.action==='redeem'){
   // Even malformed code attempts go to RPC rate limits; never send/store plaintext there.
   const valid=Object.keys(payload).length===1&&typeof payload.code==='string'&&/^[0-9a-fA-F]{64}$/.test(payload.code);
   payload={code_hash:valid?await digest((payload.code as string).toLowerCase()):''};
  }else if(route.action==='profile'){
   if(Object.keys(payload).length!==2||typeof payload.device_id!=='string'||typeof payload.display_name!=='string'||!payload.display_name.trim()||payload.display_name.trim().length>80||/[\x00-\x1f\x7f]/.test(payload.display_name))return json({error:'INVALID_REQUEST'},400);
   payload={device_id:payload.device_id,display_name:payload.display_name.trim()};
  }else if(route.action==='revoke'){
   if(Object.keys(payload).length!==1||typeof payload.device_id!=='string')return json({error:'INVALID_REQUEST'},400);
   payload={device_id:payload.device_id};
  }
  const result=await service.action(actor,route.action,await hashIp(ip,env.PAIRING_IP_HASH_SECRET),payload);
  if(!result)return json({error:'BACKEND_UNAVAILABLE'},503);
  if(result.error){const status=['PROFILE_REQUIRED','MIGRATION_REQUIRED','INVENTORY_REQUIRED','VISITS_REQUIRED','FINANCE_REQUIRED','READINESS_REQUIRED'].includes(String(result.error))?503:result.error==='CONFLICT'?409:result.error==='RATE_LIMITED'?429:['FORBIDDEN','DEVICE_REVOKED'].includes(String(result.error))?403:result.error==='UNAUTHORIZED'?401:400;return json({error:result.error},status)}
  return json(code?{...result,code}:result);
 }catch{return json({error:'BACKEND_UNAVAILABLE'},503)}
}
