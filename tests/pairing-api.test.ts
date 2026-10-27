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
