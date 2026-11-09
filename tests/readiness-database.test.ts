import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
const owner='11111111-1111-4111-8111-111111111111',production='22222222-2222-4222-8222-222222222222',field='33333333-3333-4333-8333-333333333333',otherField='44444444-4444-4444-8444-444444444444',pending='55555555-5555-4555-8555-555555555555',ip='a'.repeat(64);
let db:PGlite;let supplier:string,product:string;let ownerDevice:string,fieldDevice:string;let raw:string,finished:string;
async function call(action:string,payload:Record<string,unknown>,actor=owner){
 const r=await db.query<{result:Record<string,any>}>('select public.enzy_inventory_action($1::uuid,$2,$3,$4::jsonb) result',[actor,action,ip,JSON.stringify(payload)]);return r.rows[0].result;
}
const post=(action:string,record:Record<string,unknown>,actor=owner,request_id=crypto.randomUUID())=>call(action,{record,request_id},actor);
const list=(kind:string,actor=owner,extra:Record<string,unknown>={})=>call('list',{kind,...extra},actor);
async function purchase(extra:Record<string,unknown>={}){const r=await post('purchase',{supplier_id:supplier,weight_g:10000,goods_cost_rp:75000,acquisition_extra_rp:0,reason:'TEST purchase',...extra});expect(r.ok).toBe(true);return r}
async function batch(lot:string,extra:Record<string,unknown>={},actor=owner){return post('production',{product_id:product,inputs:[{lot_id:lot,grams:1000}],good_pcs:45,good_output_weight_g:900,defect_weight_g:0,waste_g:100,packaging_cost_rp:null,labor_cost_rp:null,other_cost_rp:null,reason:'TEST batch',...extra},actor)}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
 create schema auth;create table auth.users(id uuid primary key,is_anonymous boolean default true);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public to anon,authenticated,service_role;
 insert into auth.users(id) values('${owner}'),('${production}'),('${field}'),('${otherField}'),('${pending}');`);
 for(const name of readdirSync(new URL('../supabase/migrations',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.exec(`insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at) values ('${owner}','TEST owner','owner','active',now()),('${production}','TEST production','production','active',now()),('${field}','TEST field','field','active',now()),('${otherField}','TEST other field','field','active',now());`);
 ownerDevice=(await db.query<{id:string}>('select id from public.enzy_devices where auth_user_id=$1',[owner])).rows[0].id;
 fieldDevice=(await db.query<{id:string}>('select id from public.enzy_devices where auth_user_id=$1',[field])).rows[0].id;
 supplier=(await db.query<{id:string}>("insert into public.enzy_suppliers(business_id,name,created_by_device_id) select id,'TEST supplier',$1::uuid from public.enzy_businesses returning id",[ownerDevice])).rows[0].id;
 product=(await db.query<{id:string}>("insert into public.enzy_products(business_id,name,sku_code,weight_g,pcs_per_pack,created_by_device_id) select id,'TEST product','TEST-20',20,25,$1::uuid from public.enzy_businesses returning id",[ownerDevice])).rows[0].id;
 raw=(await db.query<{id:string}>("select id from public.enzy_stock_locations where system_key='raw_primary'")).rows[0].id;finished=(await db.query<{id:string}>("select id from public.enzy_stock_locations where system_key='finished_primary'")).rows[0].id;
},30000);
afterAll(async()=>db?.close());beforeEach(async()=>{await db.exec('begin')});afterEach(async()=>{await db.exec('rollback')});
let cash:string,agent:string;
async function rc(action:string,payload:Record<string,unknown>={},actor=owner){return (await db.query<{r:Record<string,any>}>('select public.enzy_readiness_action($1::uuid,$2,$3,$4::jsonb) r',[actor,action,ip,JSON.stringify(payload)])).rows[0].r}
const rp=(action:string,record:Record<string,unknown>,actor=owner,key=crypto.randomUUID())=>rc(action,{record,request_id:key},actor);
const report=(actor=owner)=>rc('report',{},actor);
const fc=async(action:string,record:Record<string,unknown>)=>(await db.query<{r:any}>('select public.enzy_finance_action($1,$2,$3,$4::jsonb) r',[owner,action,ip,JSON.stringify({record,request_id:crypto.randomUUID()})])).rows[0].r;
function opening(extra:Record<string,unknown>={}){return {effective_at:new Date().toISOString(),reason:'TEST verified cut-off',physical_confirmed:true,legacy_resolved:true,zero_stock_confirmed:false,zero_money_confirmed:false,stock:[{kind:'raw',lot_code:'TEST-OPEN-RAW',location_id:raw,quantity:1000},{kind:'finished',lot_code:'TEST-OPEN-FIN',product_id:product,location_id:finished,quantity:20}],money:[{holder:'enzy',account_id:cash,amount_rp:'10000'}],...extra}}
beforeAll(async()=>{
 cash=(await fc('account',{name:'TEST opening cash',kind:'cash',reason:'TEST config'})).account_id;
 agent=(await db.query<{id:string}>("insert into public.enzy_agents(business_id,name,created_by_device_id) select id,'TEST opening agent',$1::uuid from public.enzy_businesses returning id",[ownerDevice])).rows[0].id;
},30000);
it('fresh database is eligible; report is consistent but never claims live approval',async()=>{
 const r=await report();expect(r.integrity_ok).toBe(true);expect(r.opening_eligible).toBe(true);expect(r.live_approved).toBe(false);expect(r.opening).toBeNull();expect(r.evidence).toEqual([]);expect(Object.values(r.checks).every(n=>n===0)).toBe(true);
});
it('readiness is owner-only including pending/revoked/production/field',async()=>{
 for(const actor of [field,otherField,production,pending])expect(await report(actor)).toEqual({error:'FORBIDDEN'});
 await db.query("update public.enzy_devices set status='revoked',revoked_at=now() where auth_user_id=$1",[owner]);expect(await report()).toEqual({error:'FORBIDDEN'});
});
it('opening preview writes no stock, cash, lot, header or audit business record',async()=>{
 const before=(await db.query('select count(*) n from public.enzy_inventory_audit')).rows[0];const p=await rp('opening_preview',opening());expect(p.money_total_rp).toBe('10000');expect(p.stock).toHaveLength(2);expect((await list('balances')).count).toBe(0);expect((await db.query('select * from public.enzy_openings')).rows).toHaveLength(0);expect((await db.query('select count(*) n from public.enzy_inventory_audit')).rows[0]).toEqual(before);
});
it('opening posts physical stock and cash without sale/capital/repacking or invented final costs',async()=>{
 const r=await rp('opening_post',opening());expect(r.ok).toBe(true);await db.exec('set constraints all immediate');const h=(await db.query('select * from public.enzy_openings')).rows[0];expect(h.inventory_operation_id).toBeTruthy();expect(h.money_operation_id).toBeTruthy();
 const lots=(await list('lots')).records;expect(lots.map((l:any)=>l.cost_status)).toEqual(['COST_INCOMPLETE','COST_INCOMPLETE']);expect(lots.every((l:any)=>l.unit_cost_rp===null)).toBe(true);expect((await report()).integrity_ok).toBe(true);expect((await report()).opening_eligible).toBe(false);
 const summary=(await db.query<{r:any}>('select public.enzy_finance_action($1,\'list\',$2,\'{"kind":"summary"}\') r',[owner,ip])).rows[0].r;expect(summary.sales_rp).toBe('0');expect(summary.enzy_cash_movement_rp).toBe('10000');expect(summary.profit_rp).toBeNull();
});
it('empty stock/money is unknown until zero is explicitly confirmed',async()=>{
 expect(await rp('opening_preview',opening({stock:[],money:[]}))).toEqual({error:'OPENING_REVIEW_REQUIRED'});
 const r=await rp('opening_post',opening({stock:[],money:[],zero_stock_confirmed:true,zero_money_confirmed:true}));expect(r.ok).toBe(true);expect((await report()).opening).not.toBeNull();expect((await db.query('select * from public.enzy_money_operations')).rows).toHaveLength(0);expect((await report()).integrity_ok).toBe(true);
});
it('requires physical count and legacy reconciliation; fake actor/price fields rejected',async()=>{
 for(const extra of [{physical_confirmed:false},{legacy_resolved:false},{business_id:crypto.randomUUID()},{physical_confirmed:'true'}])expect((await rp('opening_preview',opening(extra))).error).toBeTruthy();
 expect((await db.query('select * from public.enzy_openings')).rows).toHaveLength(0);
});
it('once-only plus idempotency: identical retry replays, changed body conflicts, new request cannot reopen',async()=>{
 const rec=opening(),key=crypto.randomUUID(),first=await rp('opening_post',rec,owner,key);expect(first.ok).toBe(true);expect(await rp('opening_post',rec,owner,key)).toMatchObject({opening_id:first.opening_id,replayed:true});expect(await rp('opening_post',{...rec,reason:'TEST changed'},owner,key)).toEqual({error:'CONFLICT'});expect(await rp('opening_post',rec)).toEqual({error:'OPENING_NOT_FRESH'});
});
it('existing UJI transactions stay untouched; reversing them does not make database fresh',async()=>{
 const p=await purchase();await post('reverse',{operation_id:p.operation_id,reason:'TEST reverse old purchase'});expect((await report()).opening_eligible).toBe(false);expect(await rp('opening_post',opening())).toEqual({error:'OPENING_NOT_FRESH'});expect((await db.query('select * from public.enzy_inventory_operations')).rows).toHaveLength(2);
});
it('post rechecks freshness after a preview, without resetting intervening data',async()=>{
 expect((await rp('opening_preview',opening())).error).toBeUndefined();await purchase();expect(await rp('opening_post',opening())).toEqual({error:'OPENING_NOT_FRESH'});expect((await list('balances')).records[0].quantity).toBe(10000);expect((await db.query('select * from public.enzy_openings')).rows).toHaveLength(0);
});
it('invalid stock, duplicate lot codes and impossible location cannot be posted partially',async()=>{
 const base=opening();for(const stock of [[{...base.stock[0],quantity:-1}],[base.stock[0],{...base.stock[0],lot_code:' test-open-raw '}],[{...base.stock[1],location_id:raw}],[{...base.stock[0],product_id:product}]])expect((await rp('opening_post',opening({stock}))).error).toBeTruthy();expect((await list('balances')).count).toBe(0);
});
it('negative/fractional money and duplicate holders fail without opening or cash',async()=>{
 const cashline=opening().money[0];for(const money of [[{...cashline,amount_rp:'-1'}],[{...cashline,amount_rp:'1.5'}],[cashline,cashline]])expect((await rp('opening_post',opening({money}))).error).toBeTruthy();expect((await db.query('select * from public.enzy_money_operations')).rows).toHaveLength(0);
});
it('expiry is not invented; expired physical stock can be counted only in quarantine',async()=>{
 const rec=opening();rec.stock[0].expiry_date='2001-01-01';expect(await rp('opening_preview',rec)).toEqual({error:'EXPIRED_LOT'});
 const quarantine=(await list('locations')).records.find((r:any)=>r.kind==='return_quarantine').id;rec.stock[0].location_id=quarantine;expect((await rp('opening_post',rec)).ok).toBe(true);expect((await report()).integrity_ok).toBe(true);
});
it('opening raw lots are consumable by production while costing remains incomplete',async()=>{
 await rp('opening_post',opening());const rawlot=(await list('lots',owner,{lot_kind:'raw'})).records[0];const batchResult=await batch(rawlot.id);expect(batchResult.ok).toBe(true);expect(batchResult.cost_status).toBe('COST_INCOMPLETE');expect((await report()).integrity_ok).toBe(true);
});
it('custody opening is separate from Enzy cash and can be remitted without revenue',async()=>{
 const result=await rp('opening_post',opening({money:[{holder:'field',device_id:fieldDevice,amount_rp:'2000'},{holder:'agent',agent_id:agent,amount_rp:'4500'}]}));expect(result.ok).toBe(true);
 const accounts=(await db.query<{r:any}>('select public.enzy_finance_action($1,\'list\',$2,\'{"kind":"accounts"}\') r',[owner,ip])).rows[0].r.records;const source=accounts.find((r:any)=>r.kind==='agent');expect(source.balance_rp).toBe('4500');
 const p=await fc('propose',{account_id:source.id,destination_account_id:cash,amount_rp:'4500',reason:'TEST opening custody remittance'});expect(p.ok).toBe(true);expect((await fc('confirm',{proposal_id:p.proposal_id,amount_rp:'4500',reason:'TEST received'})).ok).toBe(true);expect((await report()).integrity_ok).toBe(true);
});
it('generic inventory and finance reversal cannot reverse half an opening',async()=>{
 await rp('opening_post',opening());const h=(await db.query('select * from public.enzy_openings')).rows[0];expect(await post('reverse',{operation_id:h.inventory_operation_id,reason:'TEST half reverse'})).toEqual({error:'OPENING_CORRECTION_REQUIRED'});expect(await fc('reverse',{operation_id:h.money_operation_id,reason:'TEST half reverse'})).toEqual({error:'OPENING_CORRECTION_REQUIRED'});expect((await report()).integrity_ok).toBe(true);
});
it('report detects missing projection in both directions, never repairs or overwrites',async()=>{
 await rp('opening_post',opening());await db.exec('delete from public.enzy_inventory_balances;delete from public.enzy_money_balances');const r=await report();expect(r.integrity_ok).toBe(false);expect(r.checks.stock_projection).toBe(2);expect(r.checks.money_projection).toBe(2);expect((await db.query('select * from public.enzy_inventory_balances')).rows).toHaveLength(0);
});
it('report detects RLS/grant problems and mismatched journals',async()=>{
 await rp('opening_post',opening());await db.exec('alter table public.enzy_suppliers disable row level security;grant execute on function public.enzy_readiness_action(uuid,text,text,jsonb) to authenticated;alter table public.enzy_money_ledger disable trigger enzy_money_ledger_immutable;delete from public.enzy_money_ledger');const r=await report();expect(r.integrity_ok).toBe(false);expect(r.checks.table_access).toBeGreaterThan(0);expect(r.checks.function_access).toBeGreaterThan(0);expect(r.checks.journal_balance).toBeGreaterThan(0);
});
it('evidence is explicit owner-reported, append-only, and does not activate production',async()=>{
 expect((await rp('evidence',{kind:'backup',reference:'TEST-backup.enzybak',note:'TEST encrypted file verified'})).ok).toBe(true);const r=await report();expect(r.evidence[0]).toMatchObject({kind:'backup',verification:'owner_reported'});expect(r.live_approved).toBe(false);
 await db.exec('savepoint immutable');await expect(db.exec('delete from public.enzy_readiness_evidence')).rejects.toThrow('append-only');await db.exec('rollback to savepoint immutable');
});
it('audit failure rolls back opening header, lot, stock, cash, journal and receipt together',async()=>{
 await db.exec("create function public.test_opening_audit_fail() returns trigger language plpgsql as $$begin raise exception 'TEST opening audit unavailable';end$$;create trigger test_opening_audit before insert on public.enzy_inventory_audit for each row execute function public.test_opening_audit_fail();");await db.exec('savepoint fail');await expect(rp('opening_post',opening())).rejects.toThrow('TEST opening audit unavailable');await db.exec('rollback to savepoint fail');expect((await report()).opening_eligible).toBe(true);expect((await list('balances')).count).toBe(0);expect((await db.query('select * from public.enzy_money_ledger')).rows).toHaveLength(0);
});
it('browser roles cannot read readiness tables or execute RPC/private helpers; service RPC works',async()=>{
 for(const role of ['anon','authenticated'])for(const table of ['enzy_openings','enzy_readiness_evidence','enzy_readiness_requests']){await db.exec('savepoint deny');await db.exec('set local role '+role);await expect(db.query('select * from public.'+table)).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint deny');}
 await db.exec('savepoint rpc');await db.exec('set local role authenticated');await expect(report()).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint rpc');
 await db.exec('savepoint service');await db.exec('set local role service_role');expect((await report()).integrity_ok).toBe(true);await expect(db.query('select enzy_private.readiness_report(null)')).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint service');
});
it('report detects invoice-to-account mismatch even when journal and projection agree',async()=>{
 const op=(await db.query<{id:string}>("insert into public.enzy_money_operations(business_id,kind,actor_device_id,amount_rp,reason) select id,'capital_in',$1::uuid,1,'TEST malformed imported allocation' from public.enzy_businesses returning id",[ownerDevice])).rows[0].id;
 await db.query("select enzy_private.money_delta(id,$1::uuid,enzy_private.money_system(id,'receivable'),1),enzy_private.money_delta(id,$1::uuid,enzy_private.money_system(id,'capital'),-1) from public.enzy_businesses",[op]);await db.exec('set constraints all immediate');const r=await report();expect(r.checks.money_projection).toBe(0);expect(r.checks.journal_balance).toBe(0);expect(r.checks.receivable_total).toBe(1);expect(r.integrity_ok).toBe(false);
});
