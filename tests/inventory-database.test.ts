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
it('migration creates only empty location configuration and preserves devices/master records',async()=>{
 expect((await list('locations')).count).toBe(3);expect((await list('balances')).count).toBe(0);expect((await list('purchases')).count).toBe(0);
 expect((await db.query('select * from public.enzy_devices')).rows).toHaveLength(4);
});
it('purchase posts raw grams only and keeps actual historical purchase costs',async()=>{
 const a=await purchase(),b=await purchase({goods_cost_rp:85000});expect(a.lot_id).not.toBe(b.lot_id);
 const rows=(await list('purchases')).records;expect(rows.map((r:any)=>Number(r.goods_cost_rp)).sort()).toEqual([75000,85000]);
 expect((await list('balances')).records.map((r:any)=>Number(r.quantity))).toEqual([10000,10000]);
 expect((await db.query('select * from public.enzy_stock_movements')).rows).toHaveLength(2);
});
it('missing acquisition cost remains incomplete, never fabricated zero final HPP',async()=>{
 const p=await purchase({acquisition_extra_rp:null});expect(p.cost_status).toBe('COST_INCOMPLETE');
 const lot=(await list('lots')).records[0];expect(lot.unit_cost_rp).toBeNull();expect(Number(lot.known_cost_rp)).toBe(75000);
 const r=await batch(p.lot_id,{packaging_cost_rp:0,labor_cost_rp:0,other_cost_rp:0});expect(r.cost_status).toBe('COST_INCOMPLETE');
 expect((await list('batches')).records[0].unit_cost_rp).toBeNull();
});
it('production consumes raw grams, records mass reconciliation and creates good pieces',async()=>{
 const p=await purchase();const r=await batch(p.lot_id);expect(r.ok).toBe(true);expect(r.quantity).toBe(45);expect(r.cost_status).toBe('COST_INCOMPLETE');
 const balances=(await list('balances')).records;expect(Number(balances.find((r:any)=>r.lot_kind==='raw').quantity)).toBe(9000);expect(Number(balances.find((r:any)=>r.lot_kind==='finished').quantity)).toBe(45);
 const row=(await list('batches')).records[0];expect(row.inputs).toMatchObject([{grams:1000}]);expect(row.unit_cost_rp).toBeNull();
});
it('complete costing uses source lots, not current supplier prices',async()=>{
 const a=await purchase(),b=await purchase({goods_cost_rp:85000});
 const r=await batch(a.lot_id,{inputs:[{lot_id:a.lot_id,grams:500},{lot_id:b.lot_id,grams:500}],packaging_cost_rp:1000,labor_cost_rp:1000,other_cost_rp:0});expect(r.cost_status).toBe('COST_COMPLETE');
 const row=(await list('batches')).records[0];expect(Number(row.known_cost_rp)).toBe(10000);expect(Number(row.unit_cost_rp)).toBeCloseTo(10000/45,7);
});
it('mass mismatch, zero output, duplicate inputs and negative quantities are rejected atomically',async()=>{
 const p=await purchase();
 expect(await batch(p.lot_id,{waste_g:0})).toEqual({error:'WEIGHT_MISMATCH'});
 expect(await batch(p.lot_id,{good_pcs:0})).toEqual({error:'INVALID_REQUEST'});
 expect(await batch(p.lot_id,{inputs:[{lot_id:p.lot_id,grams:500},{lot_id:p.lot_id,grams:500}]})).toEqual({error:'INVALID_REQUEST'});
 expect(await batch(p.lot_id,{inputs:[{lot_id:p.lot_id,grams:-1}]})).toEqual({error:'INVALID_REQUEST'});
 expect((await list('batches')).count).toBe(0);expect(Number((await list('balances')).records[0].quantity)).toBe(10000);
});
it('insufficient input rolls back every touched lot, batch, movements and audit',async()=>{
 const a=await purchase(),b=await purchase({weight_g:100});
 const result=await batch(a.lot_id,{inputs:[{lot_id:a.lot_id,grams:900},{lot_id:b.lot_id,grams:200}],good_output_weight_g:1000,waste_g:100});expect(result).toEqual({error:'INSUFFICIENT_STOCK'});
 expect((await list('batches')).count).toBe(0);expect((await db.query('select * from public.enzy_stock_movements')).rows).toHaveLength(2);
 expect((await list('balances')).records.map((r:any)=>Number(r.quantity)).sort((a:number,b:number)=>a-b)).toEqual([100,10000]);
});
it('transfers preserve total pieces and scope field access to own custody',async()=>{
 const p=await purchase(),r=await batch(p.lot_id);
 const loc=await post('location',{label:'TEST field custody',kind:'field_custody',device_id:fieldDevice});expect(loc.ok).toBe(true);
 expect((await post('transfer',{lot_id:r.lot_id,from_location_id:finished,to_location_id:loc.location_id,quantity:20,reason:'TEST transfer'})).ok).toBe(true);
 const rows=(await list('balances',owner,{lot_kind:'finished'})).records;expect(rows.reduce((s:number,r:any)=>s+Number(r.quantity),0)).toBe(45);
 const mine=(await list('balances',field)).records;expect(mine).toHaveLength(1);expect(Number(mine[0].quantity)).toBe(20);expect(mine[0].unit_cost_rp).toBeUndefined();
 expect((await list('balances',otherField)).count).toBe(0);expect((await list('lots',field,{lot_kind:'raw'})).count).toBe(0);
});
it('production can post batches but cannot see acquisition costs, HPP, or post purchases/transfers',async()=>{
 const p=await purchase();const result=await batch(p.lot_id,{},production);expect(result.ok).toBe(true);
 const rows=(await list('batches',production)).records;expect(rows).toHaveLength(1);for(const k of ['unit_cost_rp','known_cost_rp','labor_cost_rp','packaging_cost_rp'])expect(rows[0][k]).toBeUndefined();
 for(const r of (await list('lots',production)).records){expect(r.known_cost_rp).toBeUndefined();expect(r.unit_cost_rp).toBeUndefined()}
 expect(await list('purchases',production)).toEqual({error:'FORBIDDEN'});expect(await list('catalog_suppliers',production)).toEqual({error:'FORBIDDEN'});
 expect(await post('purchase',{},production)).toEqual({error:'FORBIDDEN'});expect(await post('transfer',{},production)).toEqual({error:'FORBIDDEN'});
});
it('retries return same receipt; changed payload with same key conflicts; revoked cannot replay',async()=>{
 const key=crypto.randomUUID(),record={supplier_id:supplier,weight_g:1000,goods_cost_rp:1000,acquisition_extra_rp:0,reason:'TEST retry'};
 const a=await post('purchase',record,owner,key),b=await post('purchase',record,owner,key);expect(b.operation_id).toBe(a.operation_id);expect(b.replayed).toBe(true);
 expect(await post('purchase',{...record,weight_g:2000},owner,key)).toEqual({error:'CONFLICT'});expect((await list('purchases')).count).toBe(1);
 await db.exec(`update public.enzy_devices set status='revoked',revoked_at=now() where id='${ownerDevice}'`);
 expect(await post('purchase',record,owner,key)).toEqual({error:'FORBIDDEN'});
});
it('owner reversals append opposite ledger without editing original rows',async()=>{
 const p=await purchase(),r=await batch(p.lot_id);
 const reversed=await post('reverse',{operation_id:r.operation_id,reason:'TEST correction'});expect(reversed.ok).toBe(true);
 expect((await list('batches')).records[0].reversed).toBe(true);expect(Number((await list('balances')).records[0].quantity)).toBe(10000);
 expect(await post('reverse',{operation_id:r.operation_id,reason:'TEST repeated'})).toEqual({error:'CONFLICT'});
 expect(await post('reverse',{operation_id:reversed.operation_id,reason:'TEST reverse reversal'})).toEqual({error:'CONFLICT'});
 expect((await post('reverse',{operation_id:p.operation_id,reason:'TEST cancel purchase'})).ok).toBe(true);expect((await list('balances')).count).toBe(0);
});
it('reverse purchase cannot remove consumed material; failed reversal leaves no partial changes',async()=>{
 const p=await purchase();await batch(p.lot_id);
 expect(await post('reverse',{operation_id:p.operation_id,reason:'TEST invalid reversal'})).toEqual({error:'INSUFFICIENT_STOCK'});
 expect((await list('purchases')).records[0].reversed).toBe(false);expect((await db.query("select * from public.enzy_inventory_operations where kind='reversal'")).rows).toHaveLength(0);
});
it('pending and field cannot post; employee can read only permitted history',async()=>{
 expect(await list('balances',pending)).toEqual({error:'FORBIDDEN'});expect(await post('production',{},field)).toEqual({error:'FORBIDDEN'});
 expect(await post('location',{label:'TEST',kind:'finished_warehouse'},field)).toEqual({error:'FORBIDDEN'});
 expect(await list('operations',field)).toEqual({error:'FORBIDDEN'});
});
it('client roles cannot read stock tables, call service RPC, or private delta helper',async()=>{
 for(const role of ['anon','authenticated']){
  for(const table of ['enzy_stock_locations','enzy_inventory_operations','enzy_raw_purchases','enzy_production_batches','enzy_inventory_lots','enzy_production_inputs','enzy_inventory_balances','enzy_stock_movements','enzy_inventory_audit','enzy_inventory_requests']){
   await db.exec('savepoint access');await db.exec('set local role '+role);await expect(db.query('select * from public.'+table)).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint access');
  }
  await db.exec('savepoint rpc');await db.exec('set local role '+role);await expect(list('balances')).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint rpc');
 }
 await db.exec('savepoint helper');await db.exec('set local role service_role');await expect(db.query("select enzy_private.apply_stock_delta(null,null,null,null,1)")).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint helper');
});
it('posted records and movements reject update/delete',async()=>{
 await purchase();for(const table of ['enzy_stock_movements','enzy_inventory_operations','enzy_raw_purchases','enzy_inventory_lots','enzy_inventory_audit']){
  await db.exec('savepoint immutable');await expect(db.exec('delete from public.'+table)).rejects.toThrow('append-only');await db.exec('rollback to savepoint immutable');
 }
});
it('all ledger quantities reconcile exactly to projections',async()=>{
 const p=await purchase(),r=await batch(p.lot_id);await post('reverse',{operation_id:r.operation_id,reason:'TEST reconcile'});
 const bad=await db.query(`select b.location_id,b.lot_id from public.enzy_inventory_balances b left join (select business_id,location_id,lot_id,sum(delta) qty from public.enzy_stock_movements group by business_id,location_id,lot_id) m using(business_id,location_id,lot_id) where b.quantity is distinct from coalesce(m.qty,0)`);expect(bad.rows).toEqual([]);
});
it('audit failure rolls back receipt, lot, quantity and request key together',async()=>{
 await db.exec(`create function public.test_inventory_audit_failure() returns trigger language plpgsql as $$begin raise exception 'TEST inventory audit unavailable';end$$;
 create trigger test_inventory_audit before insert on public.enzy_inventory_audit for each row execute function public.test_inventory_audit_failure();`);
 await db.exec('savepoint posting');
 await expect(post('purchase',{supplier_id:supplier,weight_g:1000,goods_cost_rp:7500,acquisition_extra_rp:0,reason:'TEST atomic audit'})).rejects.toThrow('TEST inventory audit unavailable');
 await db.exec('rollback to savepoint posting');
 expect((await list('balances')).count).toBe(0);expect((await list('purchases')).count).toBe(0);
 expect((await db.query('select * from public.enzy_inventory_requests')).rows).toHaveLength(0);
});
it('expired inputs are rejected and lot choices follow earliest known expiry first',async()=>{
 const days=(n:number)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
 const unknown=await purchase(),later=await purchase({expiry_date:days(5)}),earlier=await purchase({expiry_date:days(1)});
 expect((await list('lots')).records.map((r:any)=>r.id)).toEqual([earlier.lot_id,later.lot_id,unknown.lot_id]);
 const expired=await purchase({occurred_at:new Date(Date.now()-3*86400000).toISOString(),expiry_date:days(-1)});
 expect(await batch(expired.lot_id)).toEqual({error:'EXPIRED_LOT'});
});
it('revoked custody destination is blocked but owner can recover stock already held there',async()=>{
 const p=await purchase(),r=await batch(p.lot_id),loc=await post('location',{label:'TEST field stock',kind:'field_custody',device_id:fieldDevice});
 const transfer={lot_id:r.lot_id,from_location_id:finished,to_location_id:loc.location_id,quantity:20,reason:'TEST load'};
 expect((await post('transfer',transfer)).ok).toBe(true);
 await db.exec(`update public.enzy_devices set status='revoked',revoked_at=now() where id='${fieldDevice}'`);
 expect(await post('transfer',transfer)).toEqual({error:'INVALID_REFERENCE'});expect(await list('balances',field)).toEqual({error:'FORBIDDEN'});
 expect((await post('transfer',{...transfer,from_location_id:loc.location_id,to_location_id:finished,reason:'TEST recovery'})).ok).toBe(true);
});
it('quarantine cannot be bypassed through normal transfer and posted costs cannot be edited',async()=>{
 const p=await purchase(),r=await batch(p.lot_id);
 const quarantine=(await db.query<{id:string}>("select id from public.enzy_stock_locations where system_key='quarantine'")).rows[0].id;
 expect(await post('transfer',{lot_id:r.lot_id,from_location_id:finished,to_location_id:quarantine,quantity:1,reason:'TEST invalid quarantine flow'})).toEqual({error:'FORBIDDEN'});
 await db.exec('savepoint cost');await expect(db.exec('update public.enzy_raw_purchases set goods_cost_rp=1')).rejects.toThrow('append-only');await db.exec('rollback to savepoint cost');
});
