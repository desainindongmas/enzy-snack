import {describe,it,expect,vi} from 'vitest';
import {handlePairing,digest,newPairingCode,type PairingEnv,type Backend} from '../server/pairing-api';
const env:PairingEnv={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-only-credential',APP_ORIGIN:'https://enzy-snack.pages.dev',PAIRING_ENABLED:'true',PAIRING_IP_HASH_SECRET:'test-only-ip-hmac-secret-at-least-32-characters'};
function request(path:string,body?:unknown,extra:Record<string,string>={}){
 const r=new Request(env.APP_ORIGIN+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer test-token-000000000000','cf-connecting-ip':'192.0.2.1',...(body===undefined?{}:{'content-type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 Object.defineProperty(r,'cf',{value:{colo:'TEST'}});return r;
}
function backend(result:Record<string,unknown>={ok:true}):Backend{return {verify:vi.fn().mockResolvedValue('verified-user'),action:vi.fn().mockResolvedValue(result)}}
describe('Pages pairing API boundary',()=>{
 it('fails closed until enabled and configured',async()=>{
  const b=backend();expect((await handlePairing(request('/api/device'),{...env,PAIRING_ENABLED:'false'},b)).status).toBe(503);expect(b.verify).not.toHaveBeenCalled();
 });
 it('requires Cloudflare ingress and ignores forwarded-for spoofing',async()=>{
  const b=backend();const r=new Request(env.APP_ORIGIN+'/api/device',{headers:{authorization:'Bearer test-token-000000000000','x-forwarded-for':'192.0.2.1','cf-connecting-ip':'192.0.2.1'}});
  expect((await handlePairing(r,env,b)).status).toBe(503);expect(b.verify).not.toHaveBeenCalled();
 });
 it('rejects foreign browser origin without calling auth',async()=>{
  const b=backend();expect((await handlePairing(request('/api/device',undefined,{origin:'https://untrusted.invalid'}),env,b)).status).toBe(403);expect(b.verify).not.toHaveBeenCalled();
 });
 it('never trusts claimed actor from request body',async()=>{
  const b=backend();const r=await handlePairing(request('/api/pairing/issue',{role:'field',device_label:'Test',actor:'forged-owner'}),env,b);
  expect(r.status).toBe(400);expect(b.action).not.toHaveBeenCalled();
 });
 it('verifies bearer identity through Auth server before RPC',async()=>{
  const b=backend();vi.mocked(b.verify).mockResolvedValue(null);
  expect((await handlePairing(request('/api/device'),env,b)).status).toBe(401);expect(b.action).not.toHaveBeenCalled();
 });
 it('issues 256-bit random code and sends only hash to database',async()=>{
  const b=backend({ok:true,expires_at:'2030-01-01T00:00:00Z'});const r=await handlePairing(request('/api/pairing/issue',{role:'field',device_label:'Test device'}),env,b);
  const data=await r.json() as {code:string};expect(data.code).toMatch(/^[0-9a-f]{64}$/);expect(r.headers.get('cache-control')).toBe('no-store');
  expect(b.action).toHaveBeenCalledWith('verified-user','issue',expect.stringMatching(/^[0-9a-f]{64}$/),{role:'field',device_label:'Test device',code_hash:await digest(data.code)});
  expect(JSON.stringify(vi.mocked(b.action).mock.calls)).not.toContain(data.code);
 });
 it('redemption uses verified UID and hashed code, not body UID',async()=>{
  const code=newPairingCode(),b=backend();await handlePairing(request('/api/pairing/redeem',{code}),env,b);
  expect(b.action).toHaveBeenCalledWith('verified-user','redeem',expect.any(String),{code_hash:await digest(code)});
 });
 it('malformed code still consumes database rate bucket',async()=>{
  const b=backend({error:'INVALID_CODE'});expect((await handlePairing(request('/api/pairing/redeem',{code:'123456'}),env,b)).status).toBe(400);
  expect(b.action).toHaveBeenCalledWith('verified-user','redeem',expect.any(String),{code_hash:''});
 });
 it('returns 429 for persisted throttle and 403 for revoked',async()=>{
  expect((await handlePairing(request('/api/pairing/redeem',{code:newPairingCode()}),env,backend({error:'RATE_LIMITED'}))).status).toBe(429);
  expect((await handlePairing(request('/api/pairing/redeem',{code:newPairingCode()}),env,backend({error:'DEVICE_REVOKED'}))).status).toBe(403);
 });
 it('never echoes backend errors or secrets',async()=>{
  const b=backend();vi.mocked(b.action).mockRejectedValue(new Error('private backend internals'));
  const r=await handlePairing(request('/api/device'),env,b);expect(r.status).toBe(503);expect(await r.text()).toBe('{"error":"BACKEND_UNAVAILABLE"}');
 });
 it('rejects oversized bodies before invoking backend',async()=>{
  const b=backend();expect((await handlePairing(request('/api/pairing/redeem',{code:'a'.repeat(3000)}),env,b)).status).toBe(400);expect(b.action).not.toHaveBeenCalled();
 });
});
it('backend accepts copied Data API base URL but rejects arbitrary paths',async()=>{
 const b=backend({device:{status:'pending'}});
 expect((await handlePairing(request('/api/device'),{...env,SUPABASE_URL:'https://fixture.supabase.co/rest/v1/'},b)).status).toBe(200);
 const rejected=backend();
 expect((await handlePairing(request('/api/device'),{...env,SUPABASE_URL:'https://fixture.supabase.co/rest/v1/stores'},rejected)).status).toBe(503);
 expect(rejected.verify).not.toHaveBeenCalled();
});
it('master endpoints use verified actor and bounded list query',async()=>{
 const b=backend({records:[],count:0,page:2});
 expect((await handlePairing(request('/api/master?kind=products&page=2&search=TEST'),env,b)).status).toBe(200);
 expect(b.action).toHaveBeenCalledWith('verified-user','master_list',expect.any(String),{kind:'products',page:'2',search:'TEST'});
});
it('master write cannot inject actor or business through envelope',async()=>{
 const b=backend();
 expect((await handlePairing(request('/api/master/save',{kind:'products',record:{name:'TEST'},request_id:'fixture',actor:'forged'}),env,b)).status).toBe(400);
 expect(b.action).not.toHaveBeenCalled();
});
it('master migration missing is reported without leaking database error',async()=>{
 const r=await handlePairing(request('/api/master?kind=products'),env,backend({error:'MIGRATION_REQUIRED'}));
 expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'MIGRATION_REQUIRED'});
});
it('master stale version returns 409 and requests cannot pick arbitrary kind',async()=>{
 expect((await handlePairing(request('/api/master/save',{kind:'products',record:{id:'fixture'},request_id:'fixture'}),env,backend({error:'CONFLICT'}))).status).toBe(409);
 const b=backend();expect((await handlePairing(request('/api/master?kind=auth.users'),env,b)).status).toBe(400);expect(b.action).not.toHaveBeenCalled();
});
it('inventory API dispatch binds verified identity and accepts only documented envelope',async()=>{
 const b=backend({records:[],count:0,page:1});
 expect((await handlePairing(request('/api/inventory?kind=balances'),env,b)).status).toBe(200);
 expect(b.action).toHaveBeenCalledWith('verified-user','inventory_list',expect.any(String),{kind:'balances'});
 const denied=backend();expect((await handlePairing(request('/api/inventory/purchase',{record:{},request_id:'fixture',actor:'forged'}),env,denied)).status).toBe(400);expect(denied.action).not.toHaveBeenCalled();
});
it('inventory migration missing has a distinct setup message; stock errors never report success',async()=>{
 const r=await handlePairing(request('/api/inventory?kind=balances'),env,backend({error:'INVENTORY_REQUIRED'}));expect(r.status).toBe(503);
 expect(await r.json()).toEqual({error:'INVENTORY_REQUIRED'});
 const stock=await handlePairing(request('/api/inventory/transfer',{record:{},request_id:'fixture'}),env,backend({error:'INSUFFICIENT_STOCK'}));expect(stock.status).toBe(400);expect(await stock.json()).toEqual({error:'INSUFFICIENT_STOCK'});
});
it('visit routes bind server-verified actor and restrict query/body envelope',async()=>{
 const b=backend({records:[],count:0,page:1});expect((await handlePairing(request('/api/visits?kind=stores'),env,b)).status).toBe(200);expect(b.action).toHaveBeenCalledWith('verified-user','visit_list',expect.any(String),{kind:'stores'});
 const preview=backend();expect((await handlePairing(request('/api/visits/preview',{record:{store_id:'TEST'}}),env,preview)).status).toBe(200);expect(preview.action).toHaveBeenCalledWith('verified-user','visit_preview',expect.any(String),{record:{store_id:'TEST'}});
 for(const path of ['/api/visits?kind=auth.users','/api/visits?kind=stores&actor=forged']){const bad=backend();expect((await handlePairing(request(path),env,bad)).status).toBe(400);expect(bad.action).not.toHaveBeenCalled()}
 const forged=backend();expect((await handlePairing(request('/api/visits/post',{record:{},request_id:'TEST',actor:'forged'}),env,forged)).status).toBe(400);expect(forged.action).not.toHaveBeenCalled();
});
it('visit setup and reconciliation errors fail closed and oversized body never reaches backend',async()=>{
 const setup=await handlePairing(request('/api/visits?kind=stores'),env,backend({error:'VISITS_REQUIRED'}));expect(setup.status).toBe(503);expect(await setup.json()).toEqual({error:'VISITS_REQUIRED'});
 const failed=await handlePairing(request('/api/visits/post',{record:{},request_id:'TEST'}),env,backend({error:'VISIT_RECONCILIATION'}));expect(failed.status).toBe(400);expect(await failed.json()).toEqual({error:'VISIT_RECONCILIATION'});
 const b=backend();expect((await handlePairing(request('/api/visits/post',{record:{reason:'x'.repeat(26000)},request_id:'TEST'}),env,b)).status).toBe(400);expect(b.action).not.toHaveBeenCalled();
});
it('finance binds verified identity and rejects arbitrary query/body and oversized writes',async()=>{
 const b=backend({records:[],count:0,page:1});expect((await handlePairing(request('/api/finance?kind=invoices'),env,b)).status).toBe(200);expect(b.action).toHaveBeenCalledWith('verified-user','finance_list',expect.any(String),{kind:'invoices'});
 for(const path of ['/api/finance?kind=auth.users','/api/finance?kind=accounts&actor=forged']){const bad=backend();expect((await handlePairing(request(path),env,bad)).status).toBe(400);expect(bad.action).not.toHaveBeenCalled()}
 const forged=backend();expect((await handlePairing(request('/api/finance/collect',{record:{},request_id:'TEST',actor:'forged'}),env,forged)).status).toBe(400);expect(forged.action).not.toHaveBeenCalled();
 const large=backend();expect((await handlePairing(request('/api/finance/collect',{record:{reason:'x'.repeat(9000)},request_id:'TEST'}),env,large)).status).toBe(400);expect(large.action).not.toHaveBeenCalled();
});
it('finance setup and dependency failures are distinct and never return optimistic success',async()=>{
 const r=await handlePairing(request('/api/finance?kind=accounts'),env,backend({error:'FINANCE_REQUIRED'}));expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'FINANCE_REQUIRED'});
 const failed=await handlePairing(request('/api/visits/reverse',{record:{},request_id:'TEST'}),env,backend({error:'FINANCE_DEPENDENCY'}));expect(failed.status).toBe(400);expect(await failed.json()).toEqual({error:'FINANCE_DEPENDENCY'});
});
