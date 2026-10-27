import {createClient} from '@supabase/supabase-js';
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
 '/api/devices/revoke':{method:'POST',action:'revoke'},
};
async function boundedJson(request:Request):Promise<Record<string,unknown>>{
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('body');
 const reader=request.body?.getReader();if(!reader)throw new Error('body');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();throw new Error('body')}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 const body:unknown=JSON.parse(new TextDecoder().decode(bytes));
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('body');return body as Record<string,unknown>;
}
export async function handlePairing(request:Request,env:PairingEnv,backend?:Backend):Promise<Response>{
 try{
  const url=new URL(request.url);const route=routes[url.pathname];if(!route)return json({error:'NOT_FOUND'},404);
  if(request.method!==route.method)return json({error:'METHOD_NOT_ALLOWED'},405);
  if(env.PAIRING_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.APP_ORIGIN||env.PAIRING_IP_HASH_SECRET?.length<32||!env.PAIRING_IP_HASH_SECRET)return json({error:'SETUP_REQUIRED'},503);
  if(url.origin!==env.APP_ORIGIN||(request.headers.has('origin')&&request.headers.get('origin')!==env.APP_ORIGIN))return json({error:'FORBIDDEN'},403);
  // Only Cloudflare Pages runtime supplies request.cf and overwrites CF-Connecting-IP.
  // Do not accept X-Forwarded-For or any IP from the request JSON.
  const ip=request.headers.get('cf-connecting-ip');
  if(!(request as Request&{cf?:unknown}).cf||!ip||ip.length>45||!/^[0-9a-fA-F:.]+$/.test(ip))return json({error:'UNTRUSTED_INGRESS'},503);
  const auth=request.headers.get('authorization')??'';
  if(!/^Bearer [A-Za-z0-9._-]{16,4096}$/.test(auth))return json({error:'UNAUTHORIZED'},401);
  let payload:Record<string,unknown>={};
  if(request.method==='POST'){
   try{payload=await boundedJson(request)}catch{return json({error:'INVALID_REQUEST'},400)}
  }
  const client=backend?null:createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const service:Backend=backend??{
   async verify(token){const {data,error}=await client!.auth.getUser(token);return !error&&data.user?data.user.id:null},
   async action(actor,action,ipHash,body){const {data,error}=await client!.rpc('enzy_pairing_action',{p_actor:actor,p_action:action,p_ip_hash:ipHash,p_payload:body});return error?null:data},
  };
  const actor=await service.verify(auth.slice(7));if(!actor)return json({error:'UNAUTHORIZED'},401);
  let code:string|undefined;
  if(route.action==='issue'){
   if(Object.keys(payload).some(k=>!['role','device_label'].includes(k))||!['production','field'].includes(String(payload.role))||typeof payload.device_label!=='string'||!payload.device_label.trim()||payload.device_label.trim().length>100)return json({error:'INVALID_REQUEST'},400);
   code=newPairingCode();payload={role:payload.role,device_label:payload.device_label.trim(),code_hash:await digest(code)};
  }else if(route.action==='redeem'){
   // Even malformed code attempts go to RPC rate limits; never send/store plaintext there.
   const valid=Object.keys(payload).length===1&&typeof payload.code==='string'&&/^[0-9a-fA-F]{64}$/.test(payload.code);
   payload={code_hash:valid?await digest((payload.code as string).toLowerCase()):''};
  }else if(route.action==='revoke'){
   if(Object.keys(payload).length!==1||typeof payload.device_id!=='string')return json({error:'INVALID_REQUEST'},400);
   payload={device_id:payload.device_id};
  }
  const result=await service.action(actor,route.action,await hashIp(ip,env.PAIRING_IP_HASH_SECRET),payload);
  if(!result)return json({error:'BACKEND_UNAVAILABLE'},503);
  if(result.error){const status=result.error==='RATE_LIMITED'?429:['FORBIDDEN','DEVICE_REVOKED'].includes(String(result.error))?403:result.error==='UNAUTHORIZED'?401:400;return json({error:result.error},status)}
  return json(code?{...result,code}:result);
 }catch{return json({error:'BACKEND_UNAVAILABLE'},503)}
}
