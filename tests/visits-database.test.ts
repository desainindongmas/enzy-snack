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
let store:string,otherStore:string,finishedLot:string,fieldLoc:string,agentId:string;
async function visitCall(action:string,payload:Record<string,unknown>,actor=owner){return (await db.query<{r:Record<string,any>}>('select public.enzy_visit_action($1::uuid,$2,$3,$4::jsonb) r',[actor,action,ip,JSON.stringify(payload)])).rows[0].r}
const vp=(action:string,record:Record<string,unknown>,actor=owner,id=crypto.randomUUID())=>visitCall(action,{record,request_id:id},actor);
const vr=(kind:string,actor=owner,extra:Record<string,unknown>={})=>visitCall('list',{kind,...extra},actor);
const detail=(actor=owner)=>vr('detail',actor,{store_id:store});
async function body(drops:Record<string,unknown>[]=[],results:Record<string,unknown>[]=[],actor=owner){const s=await detail(actor);return {store_id:store,expected_version:s.version,occurred_at:new Date().toISOString(),reason:'TEST visit',drops,results}}
const drop=(quantity=20,source=finished)=>({source_location_id:source,lot_id:finishedLot,quantity});
async function quotePost(rec:Record<string,unknown>,actor=owner,id=crypto.randomUUID()){
 const plan=await vp('preview',rec,actor);if(plan.error)return plan;
 return vp('post',{...rec,drops:plan.drops.map((d:any)=>({source_location_id:d.source_location_id,lot_id:d.lot_id,quantity:d.quantity,price_id:d.price_id}))},actor,id);
}
async function settle(sold=12,good=4,damaged=2,expired=1,lost=1){const s=await detail();return [{line_id:s.lines[0].id,sold,returned_good:good,returned_damaged:damaged,returned_expired:expired,lost}]}
beforeAll(async()=>{
 store=(await db.query<{id:string}>("insert into public.enzy_stores(business_id,name,created_by_device_id) select id,'TEST warung',$1::uuid from public.enzy_businesses returning id",[ownerDevice])).rows[0].id;
 otherStore=(await db.query<{id:string}>("insert into public.enzy_stores(business_id,name,created_by_device_id) select id,'TEST private warung',$1::uuid from public.enzy_businesses returning id",[ownerDevice])).rows[0].id;
 agentId=(await db.query<{id:string}>("insert into public.enzy_agents(business_id,name,created_by_device_id) select id,'TEST agent',$1::uuid from public.enzy_businesses returning id",[ownerDevice])).rows[0].id;
 await db.query("insert into public.enzy_price_agreements(business_id,product_id,store_id,channel,store_price_rp,valid_from,change_reason,created_by_device_id) select id,$1::uuid,$2::uuid,'direct',1500,now()-interval '1 day','TEST initial price',$3::uuid from public.enzy_businesses",[product,store,ownerDevice]);
 const assignment=await vp('assign',{store_id:store,expected_version:1,field_device_id:fieldDevice,channel:'direct',reason:'TEST assignment'});expect(assignment.ok).toBe(true);
 const p=await purchase();const result=await batch(p.lot_id,{good_pcs:100,good_output_weight_g:1000,waste_g:0});expect(result.ok).toBe(true);finishedLot=result.lot_id;
 const loc=await post('location',{label:'TEST field stock',kind:'field_custody',device_id:fieldDevice});fieldLoc=loc.location_id;
},30000);
it('creates no visits, consignments, sales or store stock seed',async()=>{expect((await vr('visits')).count).toBe(0);expect((await vr('stores')).count).toBe(2);expect((await db.query('select * from public.enzy_consignment_cycles')).rows).toHaveLength(0)});
it('assignment is owner-only and immutable; field sees only currently assigned store',async()=>{
 expect(await vp('assign',{store_id:store},field)).toEqual({error:'FORBIDDEN'});expect((await vr('stores',field)).records.map((r:any)=>r.id)).toEqual([store]);expect((await vr('stores',otherField)).count).toBe(0);
 expect(await vr('detail',field,{store_id:otherStore})).toEqual({error:'FORBIDDEN'});expect(await vr('stores',production)).toEqual({error:'FORBIDDEN'});expect(await vr('stores',pending)).toEqual({error:'FORBIDDEN'});
 await db.exec('savepoint immutable');await expect(db.exec('delete from public.enzy_store_assignments')).rejects.toThrow('append-only');await db.exec('rollback to savepoint immutable');
});
it('preview is read-only; opening consigns pieces with frozen price and no revenue',async()=>{
 const rec=await body([drop()]);const before=(await db.query('select * from public.enzy_inventory_operations')).rows.length;
 const plan=await vp('preview',rec);expect(plan.gross_sales_rp).toBe('0');expect(plan.drops[0].store_price_rp).toBe('1500');expect((await db.query('select * from public.enzy_inventory_operations')).rows).toHaveLength(before);
 const r=await quotePost(rec);expect(r.ok).toBe(true);expect((await detail()).lines[0]).toMatchObject({quantity:20,store_price_rp:'1500'});
 const v=(await vr('visits')).records[0];expect(v.gross_sales_rp).toBe('0');expect(v.commission_earned_rp).toBe('0');expect((await list('balances')).records.find((x:any)=>x.location_kind==='store_consignment').quantity).toBe(20);
});
it('closes every old piece explicitly; loss is not sold; returns all categories to quarantine',async()=>{
 await quotePost(await body([drop()]));const r=await quotePost(await body([],await settle()));expect(r.ok).toBe(true);expect((await detail()).cycle_id).toBeNull();
 const v=(await vr('visits')).records[0];expect(v).toMatchObject({sold:12,returned:7,lost:1,gross_sales_rp:'18000',enzy_due_rp:'18000',commission_earned_rp:'0'});
 expect((await list('balances')).records.find((x:any)=>x.location_kind==='return_quarantine').quantity).toBe(7);expect((await vr('returns')).records[0]).toMatchObject({returned_good:4,returned_damaged:2,returned_expired:1,inspected:false});
});
it('cannot skip an old line, infer losses as sales, oversettle or duplicate line',async()=>{
 await quotePost(await body([drop()]));const results=await settle();const before=(await vr('visits')).count;
 for(const bad of [[],[...results,results[0]],[{...results[0],sold:13}],[{...results[0],lost:-1}]]){
  const r=await quotePost(await body([],bad));expect(r.error).toBeTruthy();expect((await vr('visits')).count).toBe(before);
 }
});
it('can close an old cycle and open a new one atomically without circulating returns',async()=>{
 await quotePost(await body([drop()]));const old=(await detail()).cycle_id;
 expect((await quotePost(await body([drop(15)],await settle()))).ok).toBe(true);
 const s=await detail();expect(s.cycle_id).not.toBe(old);expect(s.lines[0].quantity).toBe(15);
 const balances=(await list('balances')).records;expect(balances.find((r:any)=>r.location_kind==='store_consignment').quantity).toBe(15);expect(balances.find((r:any)=>r.location_id===finished).quantity).toBe(65);
});
it('rejects missing historical prices and changed quote IDs',async()=>{
 const rec=await body([drop()]);const plan=await vp('preview',rec);
 expect(await vp('post',{...rec,drops:[{...drop(),price_id:crypto.randomUUID()}]})).toEqual({error:'PRICE_CHANGED'});
 await db.exec('savepoint hideprice');await db.exec('alter table public.enzy_price_agreements disable trigger enzy_price_immutable;delete from public.enzy_price_agreements');expect(await vp('preview',rec)).toEqual({error:'PRICE_REQUIRED'});await db.exec('rollback to savepoint hideprice');expect(plan.drops[0].price_id).toBeTruthy();
});
it('closing uses original price after current master price changes',async()=>{
 await quotePost(await body([drop()]));
 const initial=(await db.query<{id:string}>('select id from public.enzy_price_agreements')).rows[0].id;
 const changed=await db.query<{r:any}>("select public.enzy_master_action($1,'price','prices',$2,$3::jsonb) r",[owner,ip,JSON.stringify({request_id:crypto.randomUUID(),record:{product_id:product,store_id:store,channel:'direct',store_price_rp:1700,enzy_share_rp:null,replaces_id:initial,change_reason:'TEST replacement',valid_from:new Date(Date.now()+1000).toISOString()}})]);expect(changed.rows[0].r.ok).toBe(true);
 expect((await quotePost(await body([],await settle()))).ok).toBe(true);expect((await vr('visits')).records[0].gross_sales_rp).toBe('18000');
});
it('agent price override takes precedence, commission earned only on verified sold',async()=>{
 await vp('assign',{store_id:store,expected_version:(await detail()).version,field_device_id:fieldDevice,channel:'agent',agent_id:agentId,reason:'TEST agent'});
 await db.query("insert into public.enzy_price_agreements(business_id,product_id,store_id,agent_id,channel,store_price_rp,enzy_share_rp,valid_from,change_reason,created_by_device_id) select id,$1::uuid,scope.store_id,$2::uuid,'agent',scope.price,scope.share,now()-interval '1 day','TEST agent price',$3::uuid from public.enzy_businesses cross join (values(null::uuid,1500,1300),($4::uuid,1600,1350)) scope(store_id,price,share)",[product,agentId,ownerDevice,store]);
 const plan=await vp('preview',await body([drop()]));expect(plan.drops[0].store_price_rp).toBe('1600');expect(plan.drops[0].enzy_share_rp).toBe('1350');
 await quotePost(await body([drop()]));await quotePost(await body([],await settle()));const v=(await vr('visits')).records[0];expect(v).toMatchObject({gross_sales_rp:'19200',enzy_due_rp:'16200',commission_earned_rp:'3000'});
});
it('field can post only assigned stores from own custody; monetary costs/share redacted',async()=>{
 expect(await quotePost(await body([drop()],[],field),field)).toEqual({error:'FORBIDDEN'});
 await post('transfer',{lot_id:finishedLot,from_location_id:finished,to_location_id:fieldLoc,quantity:25,reason:'TEST load'});
 const rec=await body([drop(20,fieldLoc)],[],field);const plan=await vp('preview',rec,field);expect(plan.drops[0].enzy_share_rp).toBeUndefined();expect(plan.enzy_due_rp).toBeUndefined();expect((await quotePost(rec,field)).ok).toBe(true);
 expect((await detail(field)).lines[0].enzy_share_rp).toBeUndefined();expect((await vr('visits',field)).records[0].commission_earned_rp).toBeUndefined();expect(await vr('returns',field)).toEqual({error:'FORBIDDEN'});
});
it('all mutations reject wrong role, forged data and revoked identities',async()=>{
 expect(await vp('post',{},production)).toEqual({error:'FORBIDDEN'});expect(await vp('inspect',{},field)).toEqual({error:'FORBIDDEN'});expect(await vp('reverse',{},field)).toEqual({error:'FORBIDDEN'});
 const rec=await body([drop()]);expect(await vp('preview',{...rec,gross_sales_rp:999})).toEqual({error:'INVALID_REQUEST'});
 await db.query("update public.enzy_devices set status='revoked',revoked_at=now() where auth_user_id=$1",[owner]);expect(await vp('preview',rec)).toEqual({error:'FORBIDDEN'});
});
it('idempotent retry writes one visit and conflicting payload is rejected',async()=>{
 const rec=await body([drop()]);const plan=await vp('preview',rec);const record={...rec,drops:plan.drops.map((d:any)=>({lot_id:d.lot_id,source_location_id:d.source_location_id,quantity:d.quantity,price_id:d.price_id}))};const id=crypto.randomUUID();
 const a=await vp('post',record,owner,id),b=await vp('post',record,owner,id);expect(b).toMatchObject({operation_id:a.operation_id,replayed:true});expect((await vr('visits')).count).toBe(1);expect(await vp('post',{...record,reason:'different'},owner,id)).toEqual({error:'CONFLICT'});
});
it('stale store version and reassignment with open cycle are rejected',async()=>{
 const rec=await body([drop()]);await quotePost(rec);expect(await vp('preview',rec)).toEqual({error:'CONFLICT'});
 expect(await vp('assign',{store_id:store,expected_version:(await detail()).version,channel:'direct',reason:'TEST switch'})).toEqual({error:'OPEN_CYCLE'});
});
it('rejects insufficient or expired stock with all closing/new movements rolled back',async()=>{
 await quotePost(await body([drop()]));const rec=await body([drop(1000)],await settle());expect(await quotePost(rec)).toEqual({error:'INSUFFICIENT_STOCK'});expect((await vr('visits')).count).toBe(1);expect((await detail()).lines[0].quantity).toBe(20);
 await db.exec('savepoint expiry');await db.exec('alter table public.enzy_inventory_lots disable trigger enzy_inventory_lots_immutable');await db.query("update public.enzy_inventory_lots set expiry_date=current_date-1 where id=$1",[finishedLot]);expect(await vp('preview',await body([drop(5)],await settle()))).toEqual({error:'EXPIRED_LOT'});await db.exec('rollback to savepoint expiry');
});
it('ordinary Phase 4 transfer and reversal cannot bypass visit reconciliation',async()=>{
 const r=await quotePost(await body([drop()]));const loc=(await db.query<{id:string}>("select id from public.enzy_stock_locations where store_id=$1",[store])).rows[0].id;
 expect(await post('transfer',{lot_id:finishedLot,from_location_id:loc,to_location_id:finished,quantity:1,reason:'TEST bypass'})).toEqual({error:'FORBIDDEN'});
 expect(await post('reverse',{operation_id:r.operation_id,reason:'TEST bypass'})).toEqual({error:'VISIT_CORRECTION_REQUIRED'});
});
it('inspection confirms hold only, cannot release stock or inspect twice',async()=>{
 await quotePost(await body([drop()]));await quotePost(await body([],await settle()));const r=(await vr('returns')).records[0];const before=(await list('balances')).records;
 expect((await vp('inspect',{result_id:r.id,reason:'TEST physical inspection'})).ok).toBe(true);expect((await vr('returns')).records[0]).toMatchObject({inspected:true,disposition:'inspected_hold'});expect((await list('balances')).records).toEqual(before);
 expect(await vp('inspect',{result_id:r.id,reason:'TEST second'})).toEqual({error:'CONFLICT'});
});
it('visit reversal restores previous cycle and removes recognized sales without deleting history',async()=>{
 const first=await quotePost(await body([drop()]));const old=(await detail()).cycle_id;const second=await quotePost(await body([drop(15)],await settle()));
 expect(await vp('reverse',{operation_id:first.operation_id,reason:'TEST wrong order'})).toEqual({error:'CONFLICT'});
 expect((await vp('reverse',{operation_id:second.operation_id,reason:'TEST correction'})).ok).toBe(true);expect((await detail()).cycle_id).toBe(old);expect((await vr('visits')).records.find((x:any)=>x.id===second.operation_id).reversed).toBe(true);
 expect((await vp('reverse',{operation_id:first.operation_id,reason:'TEST undo original'})).ok).toBe(true);expect((await detail()).cycle_id).toBeNull();expect((await list('balances')).records.find((r:any)=>r.lot_id===finishedLot).quantity).toBe(100);
});
it('reverse then corrected close can settle the same original cycle again',async()=>{
 await quotePost(await body([drop()]));const second=await quotePost(await body([],await settle()));await vp('reverse',{operation_id:second.operation_id,reason:'TEST mistake'});
 expect((await quotePost(await body([],await settle(10,6,2,1,1)))).ok).toBe(true);expect((await vr('visits')).records[0].gross_sales_rp).toBe('15000');
});
it('reversal makes prior inspections void while preserving audit',async()=>{
 await quotePost(await body([drop()]));const visit=await quotePost(await body([],await settle()));const row=(await vr('returns')).records[0];await vp('inspect',{result_id:row.id,reason:'TEST inspected'});
 expect((await vp('reverse',{operation_id:visit.operation_id,reason:'TEST correction'})).ok).toBe(true);expect((await vr('returns')).records[0]).toMatchObject({inspected:true,reversed:true});
});
it('all business tables and service RPC/private helpers deny browser roles',async()=>{
 for(const role of ['anon','authenticated'])for(const table of ['enzy_store_assignments','enzy_visits','enzy_consignment_cycles','enzy_consignment_lines','enzy_visit_results','enzy_return_inspections','enzy_store_state','enzy_visit_requests']){
 await db.exec('savepoint deny');await db.exec('set local role '+role);await expect(db.query('select * from public.'+table)).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint deny');}
 await db.exec('savepoint deny_rpc');await db.exec('set local role authenticated');await expect(vr('stores')).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint deny_rpc');
 await db.exec('savepoint deny_helper');await db.exec('set local role service_role');await expect(db.query("select enzy_private.inventory_action_v4(null,'list',null,'{}')")).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint deny_helper');
});
it('audit failure rolls back visit header, state, ledger and request',async()=>{
 await db.exec("create function public.test_visit_audit_fail() returns trigger language plpgsql as $$begin raise exception 'TEST visit audit unavailable';end$$;create trigger test_visit_fail before insert on public.enzy_inventory_audit for each row execute function public.test_visit_audit_fail();");
 await db.exec('savepoint posting');await expect(quotePost(await body([drop()]))).rejects.toThrow('TEST visit audit unavailable');await db.exec('rollback to savepoint posting');expect((await vr('visits')).count).toBe(0);expect((await detail()).cycle_id).toBeNull();expect((await db.query('select * from public.enzy_visit_requests where result ? \'operation_id\'')).rows).toHaveLength(0);
});
it('all balance projections reconcile to ledger after visits, inspection and reversal',async()=>{
 await quotePost(await body([drop()]));const second=await quotePost(await body([drop(10)],await settle()));await vp('reverse',{operation_id:second.operation_id,reason:'TEST reconcile'});
 expect((await db.query('select b.lot_id from public.enzy_inventory_balances b left join (select business_id,location_id,lot_id,sum(delta) qty from public.enzy_stock_movements group by business_id,location_id,lot_id) m using(business_id,location_id,lot_id) where b.quantity<0 or b.quantity is distinct from coalesce(m.qty,0)')).rows).toEqual([]);
});
it('other store lines, duplicated lot drops and backdated visits cannot be forged',async()=>{
 await quotePost(await body([drop()]));const wrong=await settle();wrong[0].line_id=crypto.randomUUID();expect(await quotePost(await body([],wrong))).toEqual({error:'INVALID_REFERENCE'});
 expect(await vp('preview',await body([drop(),drop()],await settle()))).toEqual({error:'INVALID_REQUEST'});
 const back={...await body([],await settle()),occurred_at:'2000-01-01T00:00:00Z'};expect(await vp('preview',back)).toEqual({error:'INVALID_REQUEST'});
});
it('reassignment removes prior field visibility and replay access immediately',async()=>{
 await post('transfer',{lot_id:finishedLot,from_location_id:finished,to_location_id:fieldLoc,quantity:20,reason:'TEST field load'});
 const rec=await body([drop(20,fieldLoc)],[],field),plan=await vp('preview',rec,field);const prepared={...rec,drops:plan.drops.map((r:any)=>({lot_id:r.lot_id,source_location_id:r.source_location_id,quantity:r.quantity,price_id:r.price_id}))};const key=crypto.randomUUID();await vp('post',prepared,field,key);await quotePost(await body([],await settle()));
 await vp('assign',{store_id:store,expected_version:(await detail()).version,channel:'direct',field_device_id:null,reason:'TEST remove assignment'});
 expect((await vr('stores',field)).count).toBe(0);expect(await detail(field)).toEqual({error:'FORBIDDEN'});expect(await vp('post',prepared,field,key)).toEqual({error:'FORBIDDEN'});
});
it('visit headers, lines, results and inspection evidence are immutable',async()=>{
 await quotePost(await body([drop()]));await quotePost(await body([],await settle()));const r=(await vr('returns')).records[0];await vp('inspect',{result_id:r.id,reason:'TEST inspected'});
 for(const table of ['enzy_visits','enzy_consignment_cycles','enzy_consignment_lines','enzy_visit_results','enzy_return_inspections']){await db.exec('savepoint immutable');await expect(db.exec('delete from public.'+table)).rejects.toThrow('append-only');await db.exec('rollback to savepoint immutable');}
});
it('reversing original visit twice is rejected and cannot reverse a reversal ID',async()=>{
 const first=await quotePost(await body([drop()]));const reversed=await vp('reverse',{operation_id:first.operation_id,reason:'TEST reverse'});expect(reversed.ok).toBe(true);
 expect(await vp('reverse',{operation_id:first.operation_id,reason:'TEST repeat'})).toEqual({error:'CONFLICT'});expect(await vp('reverse',{operation_id:reversed.operation_id,reason:'TEST reversal'})).toEqual({error:'NOT_FOUND'});
});
it('blank event time uses server time in preview and a frozen timestamp in posting',async()=>{
 const rec={...await body([drop()]),occurred_at:null};const plan=await vp('preview',rec);expect(plan.error).toBeUndefined();expect(Number.isFinite(Date.parse(plan.occurred_at))).toBe(true);
 const r=await vp('post',{...rec,occurred_at:plan.occurred_at,drops:plan.drops.map((d:any)=>({lot_id:d.lot_id,source_location_id:d.source_location_id,quantity:d.quantity,price_id:d.price_id}))});expect(r.ok).toBe(true);expect((await vr('visits')).records[0].occurred_at).toBe(plan.occurred_at);
});
it('service-role RPC works through private helpers without exposing table grants',async()=>{
 await db.exec('savepoint service_rpc');await db.exec('set local role service_role');expect((await vr('stores')).count).toBe(2);expect((await list('locations')).count).toBe(4);await db.exec('rollback to savepoint service_rpc');
});
