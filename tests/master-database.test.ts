import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
const owner='11111111-1111-4111-8111-111111111111',production='22222222-2222-4222-8222-222222222222',field='33333333-3333-4333-8333-333333333333',pending='44444444-4444-4444-8444-444444444444';
const ip='a'.repeat(64);let db:PGlite;
async function call(action:string,kind:string,payload:Record<string,unknown>={},actor=owner){
 const r=await db.query<{result:Record<string,any>}>('select public.enzy_master_action($1::uuid,$2,$3,$4,$5::jsonb) result',[actor,action,kind,ip,JSON.stringify(payload)]);return r.rows[0].result;
}
async function save(kind:string,record:Record<string,unknown>,request_id=crypto.randomUUID()){
 return call('save',kind,{record,request_id});
}
async function create(kind:string,extra:Record<string,unknown>={}){
 const r=await save(kind,{name:'TEST '+kind,...(kind==='products'?{sku_code:'TEST-20',weight_g:20,pcs_per_pack:25}:{}),...extra});expect(r.ok).toBe(true);return r.record;
}
async function priceSetup(){
 const product=await create('products'),store=await create('stores'),agent=await create('agents');
 return {product_id:product.id,store_id:store.id,agent_id:null,channel:'direct',store_price_rp:1500,enzy_share_rp:null,valid_from:new Date(Date.now()-86400000).toISOString(),change_reason:'TEST initial terms',agentFixture:agent};
}
async function price(record:Record<string,unknown>,request_id=crypto.randomUUID()){
 const {agentFixture,...clean}=record;return call('price','prices',{record:clean,request_id});
}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
 create schema auth;create table auth.users(id uuid primary key,is_anonymous boolean default true);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public to anon,authenticated,service_role;
 insert into auth.users(id) values('${owner}'),('${production}'),('${field}'),('${pending}');`);
 for(const name of readdirSync(new URL('../supabase/migrations',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.exec(`insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at) values
 ('${owner}','TEST owner','owner','active',now()),('${production}','TEST production','production','active',now()),('${field}','TEST field','field','active',now());`);
},30000);
afterAll(async()=>db?.close());
beforeEach(async()=>{await db.exec('begin')});afterEach(async()=>{await db.exec('rollback')});
it('migration preserves paired devices and seeds no business records',async()=>{
 expect((await db.query('select * from public.enzy_devices')).rows).toHaveLength(3);
 for(const kind of ['products','suppliers','stores','agents','prices'])expect((await call('list',kind)).count).toBe(0);
});
for(const actor of [pending,production,field])it(`denies master access to non-owner ${actor.slice(0,4)}`,async()=>{
 expect(await call('list','products',{},actor)).toEqual({error:'FORBIDDEN'});
 expect(await call('save','products',{request_id:crypto.randomUUID(),record:{name:'TEST',sku_code:'A',weight_g:20}},actor)).toEqual({error:'FORBIDDEN'});
});
it('revoked owner cannot read data or replay previous write',async()=>{
 const key=crypto.randomUUID();const body={name:'TEST supplier'};expect((await save('suppliers',body,key)).ok).toBe(true);
 await db.exec(`update public.enzy_devices set status='revoked',revoked_at=now() where auth_user_id='${owner}'`);
 expect(await call('list','suppliers')).toEqual({error:'FORBIDDEN'});expect(await save('suppliers',body,key)).toEqual({error:'FORBIDDEN'});
});
for(const kind of ['suppliers','products','stores','agents'])it(`creates, edits and archives ${kind} with version checks`,async()=>{
 const r=await create(kind);const updated=await save(kind,{id:r.id,version:r.version,name:'TEST revised'});expect(updated.record.version).toBe(2);
 expect(await save(kind,{id:r.id,version:r.version,name:'TEST stale'})).toEqual({error:'CONFLICT'});
 const archived=await call('archive',kind,{record:{id:r.id,version:2},request_id:crypto.randomUUID()});expect(archived.record.is_active).toBe(false);
 expect((await call('list',kind)).count).toBe(0);expect((await call('list',kind,{include_archived:true})).count).toBe(1);
 expect((await db.query('select * from public.enzy_master_audit where kind=$1',[kind])).rows).toHaveLength(3);
});
it('rejects duplicate SKU, fake business scope and invalid quantities',async()=>{
 await create('products');expect(await save('products',{name:'TEST dupe',sku_code:'test-20',weight_g:25})).toEqual({error:'CONFLICT'});
 expect(await save('suppliers',{name:'TEST',business_id:crypto.randomUUID()})).toEqual({error:'INVALID_REQUEST'});
 expect(await save('products',{name:'TEST',sku_code:'TEST-X',weight_g:-1})).toEqual({error:'INVALID_REQUEST'});
});
it('keeps retries idempotent and rejects changed payload for same key',async()=>{
 const key=crypto.randomUUID(),record={name:'TEST retry'};const a=await save('suppliers',record,key),b=await save('suppliers',record,key);
 expect(b.record.id).toBe(a.record.id);expect(b.replayed).toBe(true);
 expect(await save('suppliers',{name:'TEST changed'},key)).toEqual({error:'CONFLICT'});
 expect((await call('list','suppliers')).count).toBe(1);
 expect((await db.query('select * from public.enzy_master_audit')).rows).toHaveLength(1);
});
it('paginates and searches on the server',async()=>{
 for(let i=0;i<22;i++)await create('stores',{name:'TEST store '+i});
 expect((await call('list','stores')).records).toHaveLength(20);expect((await call('list','stores',{page:2})).records).toHaveLength(2);
 expect((await call('list','stores',{search:'store 21'})).count).toBe(1);
});
it('rejects overlapping periods and allows adjacent periods',async()=>{
 const r=await priceSetup();expect((await price({...r,valid_to:new Date(Date.now()+86400000).toISOString()})).ok).toBe(true);
 expect(await price(r)).toEqual({error:'CONFLICT'});
 expect((await price({...r,valid_from:new Date(Date.now()+86400000+1000).toISOString()})).ok).toBe(true);
});
it('records a replacement atomically without changing historical amount',async()=>{
 const r=await priceSetup();const first=await price(r);expect(first.ok).toBe(true);
 const revised=await price({...r,replaces_id:first.record.id,valid_from:null,store_price_rp:1600,change_reason:'TEST new agreement'});expect(revised.ok).toBe(true);
 const old=await db.query<{store_price_rp:number;valid_to:unknown}>('select store_price_rp,valid_to from public.enzy_price_agreements where id=$1',[first.record.id]);
 expect(Number(old.rows[0].store_price_rp)).toBe(1500);expect(old.rows[0].valid_to).not.toBeNull();
 expect((await call('list','prices')).records).toHaveLength(2);
 expect(await price({...r,replaces_id:first.record.id,valid_from:null,store_price_rp:1700})).toEqual({error:'CONFLICT'});
});
it('agent/store overrides have separate scopes and configurable shares',async()=>{
 const r=await priceSetup();const agentPrice={...r,agent_id:r.agentFixture.id,store_id:null,channel:'agent',enzy_share_rp:1300};
 expect((await price(agentPrice)).ok).toBe(true);
 expect((await price({...agentPrice,store_id:r.store_id,enzy_share_rp:1350})).ok).toBe(true);
 expect(await price({...agentPrice,enzy_share_rp:1600})).toEqual({error:'INVALID_REQUEST'});
 expect((await call('list','prices')).count).toBe(2);
});
it('rejects inactive references, missing direct store and zero/negative money',async()=>{
 const r=await priceSetup();expect(await price({...r,store_id:null})).toEqual({error:'INVALID_REQUEST'});
 expect(await price({...r,store_price_rp:0})).toEqual({error:'INVALID_REQUEST'});
 expect(await price({...r,store_price_rp:-1})).toEqual({error:'INVALID_REQUEST'});
 const product=(await call('list','products')).records[0];await call('archive','products',{record:{id:product.id,version:product.version},request_id:crypto.randomUUID()});
 expect(await price(r)).toEqual({error:'INVALID_REFERENCE'});
});
it('rolls back closing of previous price when replacement is invalid',async()=>{
 const r=await priceSetup(),first=await price(r);
 expect(await price({...r,replaces_id:first.record.id,valid_from:null,store_price_rp:0})).toEqual({error:'INVALID_REQUEST'});
 expect((await db.query<{valid_to:unknown}>('select valid_to from public.enzy_price_agreements where id=$1',[first.record.id])).rows[0].valid_to).toBeNull();
});
it('price history and audit reject direct rewriting',async()=>{
 const r=await priceSetup();await price(r);
 for(const sql of ["update public.enzy_price_agreements set store_price_rp=1","delete from public.enzy_price_agreements","delete from public.enzy_master_audit"]){
  await db.exec('savepoint guard');await expect(db.exec(sql)).rejects.toThrow();await db.exec('rollback to savepoint guard');
 }
});
it('browser roles cannot read tables or execute privileged RPC',async()=>{
 for(const role of ['anon','authenticated']){
  for(const table of ['enzy_suppliers','enzy_products','enzy_stores','enzy_agents','enzy_price_agreements','enzy_master_audit','enzy_master_requests']){
   await db.exec('savepoint access');await db.exec('set local role '+role);await expect(db.query('select * from public.'+table)).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint access');
  }
  await db.exec('savepoint rpc');await db.exec('set local role '+role);await expect(call('list','products')).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint rpc');
 }
});
it('service backend may execute after owner check',async()=>{
 await db.exec('set local role service_role');expect((await call('list','products')).count).toBe(0);expect(await call('list','products',{},field)).toEqual({error:'FORBIDDEN'});
});

it('rejects invalid and non-finite effective dates without creating price history',async()=>{
 const r=await priceSetup();
 for(const value of ['not-a-date','infinity','-infinity'])expect(await price({...r,valid_from:value})).toEqual({error:'INVALID_REQUEST'});
 expect((await call('list','prices')).count).toBe(0);
});
