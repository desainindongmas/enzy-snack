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
let cash:string,bank:string;
async function fc(action:string,payload:Record<string,unknown>,actor=owner){return (await db.query<{r:Record<string,any>}>('select public.enzy_finance_action($1::uuid,$2,$3,$4::jsonb) r',[actor,action,ip,JSON.stringify(payload)])).rows[0].r}
async function fp(action:string,record:Record<string,unknown>,actor=owner,key=crypto.randomUUID()){const r=await fc(action,{record,request_id:key},actor);await db.exec('set constraints all immediate;set constraints all deferred');return r}
const fr=(kind:string,actor=owner)=>fc('list',{kind},actor);
async function directSale(){await quotePost(await body([drop()]));const sale=await quotePost(await body([],await settle()));expect(sale.ok).toBe(true);return sale.operation_id as string}
async function agentSale(){
 const a=await vp('assign',{store_id:store,expected_version:(await detail()).version,field_device_id:fieldDevice,channel:'agent',agent_id:agentId,reason:'TEST agent assignment'});expect(a.ok).toBe(true);
 await db.query("insert into public.enzy_price_agreements(business_id,product_id,agent_id,channel,store_price_rp,enzy_share_rp,valid_from,change_reason,created_by_device_id) select id,$1::uuid,$2::uuid,'agent',1500,1300,now()-interval '1 day','TEST agent price',$3::uuid from public.enzy_businesses",[product,agentId,ownerDevice]);return directSale();
}
async function balances(){return (await fr('accounts')).records}
async function balance(id:string){return (await balances()).find((r:any)=>r.id===id)?.balance_rp??'0'}
beforeAll(async()=>{
 const a=await fp('account',{name:'TEST cash',kind:'cash',reason:'TEST account'}),b=await fp('account',{name:'TEST bank',kind:'bank',reason:'TEST account'});expect(a.ok).toBe(true);expect(b.ok).toBe(true);cash=a.account_id;bank=b.account_id;
},30000);
it('creates configuration only; balances opening values and profit are not fabricated',async()=>{
 expect((await fr('invoices')).count).toBe(0);expect((await fr('history')).count).toBe(0);expect((await fr('summary')).profit_rp).toBeNull();expect((await db.query('select * from public.enzy_money_ledger')).rows).toHaveLength(0);
});
it('visit sale atomically recognizes receivable/revenue with no cash; consigning recognizes nothing',async()=>{
 await quotePost(await body([drop()]));expect((await fr('invoices')).count).toBe(0);const sale=await quotePost(await body([],await settle()));expect(sale.ok).toBe(true);
 const i=(await fr('invoices')).records[0];expect(i).toMatchObject({gross_sales_rp:'18000',collected_rp:'0',outstanding_rp:'18000'});expect(await balance(cash)).toBe('0');await db.exec('set constraints all immediate');
 expect((await fr('summary')).sales_rp).toBe('18000');
});
it('direct payment received by owner reduces receivable and increases only selected cash account',async()=>{
 const visit=await directSale();expect((await fp('collect',{visit_id:visit,amount_rp:'10000',withheld_rp:'0',account_id:cash,reason:'TEST partial receipt'})).ok).toBe(true);
 expect(await balance(cash)).toBe('10000');expect(await balance(bank)).toBe('0');expect((await fr('invoices')).records[0]).toMatchObject({collected_rp:'10000',outstanding_rp:'8000'});expect((await fr('summary')).sales_rp).toBe('18000');
});
it('field payment goes to own custody, not Enzy cash; field cannot confirm receipt',async()=>{
 const visit=await directSale();expect((await fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'0',reason:'TEST field receipt'},field)).ok).toBe(true);
 const accounts=(await fr('accounts',field)).records;const custody=accounts.find((r:any)=>r.kind==='field');expect(custody.balance_rp).toBe('18000');expect(accounts.find((r:any)=>r.id===cash).balance_rp).toBeUndefined();expect(await balance(cash)).toBe('0');
 expect(await fp('confirm',{},field)).toEqual({error:'FORBIDDEN'});expect(await fr('summary',field)).toEqual({error:'FORBIDDEN'});
});
it('agent commission earned only on verified sold, withholding explicit and not paid twice',async()=>{
 const visit=await agentSale();const i=(await fr('invoices')).records[0];expect(i.commission_earned_rp).toBe('2400');expect(i.withheld_rp).toBe('0');
 expect((await fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'2400',reason:'TEST agent received gross less commission'})).ok).toBe(true);
 const acc=(await balances()).find((r:any)=>r.kind==='agent');expect(acc.balance_rp).toBe('15600');expect(await balance(cash)).toBe('0');expect((await fr('invoices')).records[0]).toMatchObject({outstanding_rp:'0',withheld_rp:'2400',commission_remaining_rp:'0'});
 expect(await fp('commission_payment',{visit_id:visit,amount_rp:'1',account_id:cash,reason:'TEST double commission'})).toEqual({error:'OVER_COMMISSION'});
});
it('partial collection explicitly allocates withheld commission without assuming pro rata',async()=>{
 const visit=await agentSale();expect((await fp('collect',{visit_id:visit,amount_rp:'5000',withheld_rp:'1000',reason:'TEST partial agent'})).ok).toBe(true);
 expect((await fr('invoices')).records[0]).toMatchObject({outstanding_rp:'13000',withheld_rp:'1000',commission_remaining_rp:'1400'});expect((await balances()).find((r:any)=>r.kind==='agent').balance_rp).toBe('4000');
});
it('overcollection, negative and fabricated currency fields are rejected without postings',async()=>{
 const visit=await directSale();for(const bad of [{amount_rp:'18001'},{amount_rp:'-1'},{amount_rp:'1.2'},{amount_rp:'100',withheld_rp:'1'},{amount_rp:'100',business_id:crypto.randomUUID()}]){
 const r=await fp('collect',{visit_id:visit,amount_rp:'100',withheld_rp:'0',account_id:cash,reason:'TEST invalid money',...bad});expect(r.error).toBeTruthy();}
 expect((await fr('invoices')).records[0].collected_rp).toBe('0');expect(await balance(cash)).toBe('0');
});
it('agency proposal reserves custody but creates no revenue or cash; owner confirms partial amounts',async()=>{
 const visit=await agentSale();await fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'2400',reason:'TEST agent receipt'});const source=(await balances()).find((r:any)=>r.kind==='agent');
 const p=await fp('propose',{account_id:source.id,destination_account_id:bank,amount_rp:'15600',reason:'TEST remit pending'});expect(p.ok).toBe(true);expect(await balance(bank)).toBe('0');expect((await fr('proposals')).records[0]).toMatchObject({confirmed_rp:'0',remaining_rp:'15600'});
 expect((await fp('confirm',{proposal_id:p.proposal_id,amount_rp:'10000',reason:'TEST actual received'})).ok).toBe(true);expect(await balance(bank)).toBe('10000');expect(await balance(source.id)).toBe('5600');expect((await fr('summary')).sales_rp).toBe('18000');expect((await fr('proposals')).records[0].remaining_rp).toBe('5600');
 expect((await fp('confirm',{proposal_id:p.proposal_id,amount_rp:'5600',reason:'TEST remainder received'})).ok).toBe(true);expect(await balance(bank)).toBe('15600');expect(await balance(source.id)).toBe('0');
});
it('two pending proposals cannot reserve the same money and overconfirmation is blocked',async()=>{
 const visit=await directSale();await fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'0',reason:'TEST field receipt'},field);const a=(await balances()).find((r:any)=>r.kind==='field');
 const p=await fp('propose',{account_id:a.id,destination_account_id:cash,amount_rp:'15000',reason:'TEST proposal'},field);
 expect(await fp('propose',{account_id:a.id,destination_account_id:cash,amount_rp:'4000',reason:'TEST duplicate reserve'},field)).toEqual({error:'INSUFFICIENT_FUNDS'});
 expect(await fp('confirm',{proposal_id:p.proposal_id,amount_rp:'15001',reason:'TEST excessive receipt'})).toEqual({error:'OVER_REMITTANCE'});
});
it('cancelling unconfirmed remainder releases reservations without moving cash',async()=>{
 const visit=await directSale();await fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'0',reason:'TEST field receipt'},field);const a=(await balances()).find((r:any)=>r.kind==='field');
 const p=await fp('propose',{account_id:a.id,destination_account_id:cash,amount_rp:'18000',reason:'TEST proposal'},field);await fp('confirm',{proposal_id:p.proposal_id,amount_rp:'5000',reason:'TEST received'});
 expect((await fp('cancel',{proposal_id:p.proposal_id,reason:'TEST cancel remaining'},field)).ok).toBe(true);expect(await balance(cash)).toBe('5000');expect(await balance(a.id)).toBe('13000');expect((await balances()).find((r:any)=>r.id===a.id).reserved_rp).toBe('0');expect(await fp('confirm',{proposal_id:p.proposal_id,amount_rp:'1',reason:'TEST cancelled'})).toEqual({error:'OVER_REMITTANCE'});
});
it('cash out and capital are actual cash flow; cannot overspend or fabricate revenue/profit',async()=>{
 expect(await fp('cash_out',{account_id:cash,amount_rp:'1',category:'other',reason:'TEST no opening money'})).toEqual({error:'INSUFFICIENT_FUNDS'});
 await fp('capital_in',{account_id:cash,amount_rp:'100000',reason:'TEST new real capital'});await fp('cash_out',{account_id:cash,amount_rp:'25000',category:'supplier_payment',reason:'TEST vendor payment'});expect(await balance(cash)).toBe('75000');expect((await fr('summary')).sales_rp).toBe('0');expect((await fr('summary')).profit_rp).toBeNull();
 expect(await fp('capital_out',{account_id:cash,amount_rp:'75001',reason:'TEST overdraw'})).toEqual({error:'INSUFFICIENT_FUNDS'});
});
it('commission not withheld may be paid separately only from available Enzy money',async()=>{
 const visit=await agentSale();await fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'0',reason:'TEST no deduction'});await fp('capital_in',{account_id:cash,amount_rp:'3000',reason:'TEST owner capital'});
 expect((await fp('commission_payment',{visit_id:visit,account_id:cash,amount_rp:'2400',reason:'TEST commission paid separately'})).ok).toBe(true);expect(await balance(cash)).toBe('600');expect((await fr('invoices')).records[0]).toMatchObject({withheld_rp:'0',commission_paid_rp:'2400',commission_remaining_rp:'0'});
});
it('field cannot read/post other accounts, agency collections or owner controls',async()=>{
 const visit=await directSale();expect(await fp('collect',{visit_id:visit,amount_rp:'100',withheld_rp:'0',account_id:cash,reason:'TEST other field'},otherField)).toEqual({error:'FORBIDDEN'});
 for(const action of ['account','recognize','reverse','capital_in','capital_out','cash_out','commission_payment','confirm'])expect(await fp(action,{},field)).toEqual({error:'FORBIDDEN'});
 expect(await fr('accounts',production)).toEqual({error:'FORBIDDEN'});expect(await fr('accounts',pending)).toEqual({error:'FORBIDDEN'});
});
it('retry records one payment, changed payload conflicts and revoked cannot replay',async()=>{
 const visit=await directSale(),key=crypto.randomUUID(),rec={visit_id:visit,amount_rp:'10000',withheld_rp:'0',account_id:cash,reason:'TEST retry'};
 const a=await fp('collect',rec,owner,key),b=await fp('collect',rec,owner,key);expect(b).toMatchObject({operation_id:a.operation_id,replayed:true});expect(await balance(cash)).toBe('10000');expect(await fp('collect',{...rec,amount_rp:'9000'},owner,key)).toEqual({error:'CONFLICT'});
 await db.query("update public.enzy_devices set status='revoked',revoked_at=now() where auth_user_id=$1",[owner]);expect(await fp('collect',rec,owner,key)).toEqual({error:'FORBIDDEN'});
});
it('payment reversal blocked by pending remittance; cancel then reverse reopens receivable',async()=>{
 const visit=await directSale();const c=await fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'0',reason:'TEST field'},field),a=(await balances()).find((r:any)=>r.kind==='field');const p=await fp('propose',{account_id:a.id,destination_account_id:cash,amount_rp:'18000',reason:'TEST pending'},field);
 expect(await fp('reverse',{operation_id:c.operation_id,reason:'TEST dependency'})).toEqual({error:'FUNDS_RESERVED'});await fp('cancel',{proposal_id:p.proposal_id,reason:'TEST cancel'},field);expect((await fp('reverse',{operation_id:c.operation_id,reason:'TEST corrected'})).ok).toBe(true);expect((await fr('invoices')).records[0].outstanding_rp).toBe('18000');expect(await balance(a.id)).toBe('0');
});
it('reverse confirmed remittance first; cannot reverse money already spent',async()=>{
 const visit=await directSale();const c=await fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'0',reason:'TEST field'},field),a=(await balances()).find((r:any)=>r.kind==='field');const p=await fp('propose',{account_id:a.id,destination_account_id:cash,amount_rp:'18000',reason:'TEST pending'},field);const received=await fp('confirm',{proposal_id:p.proposal_id,amount_rp:'18000',reason:'TEST cash received'});
 expect(await fp('reverse',{operation_id:c.operation_id,reason:'TEST wrong order'})).toEqual({error:'INSUFFICIENT_FUNDS'});const spent=await fp('cash_out',{account_id:cash,amount_rp:'1000',category:'other',reason:'TEST spent'});expect(await fp('reverse',{operation_id:received.operation_id,reason:'TEST insufficient destination'})).toEqual({error:'INSUFFICIENT_FUNDS'});
 await fp('reverse',{operation_id:spent.operation_id,reason:'TEST undo spending'});expect((await fp('reverse',{operation_id:received.operation_id,reason:'TEST undo settlement'})).ok).toBe(true);expect(await balance(cash)).toBe('0');expect((await fr('proposals')).records[0].remaining_rp).toBe('18000');
});
it('visit reversal cannot bypass financial dependencies; clearing payments reverses sales atomically',async()=>{
 const visit=await directSale(),c=await fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'0',account_id:cash,reason:'TEST receipt'});
 expect(await vp('reverse',{operation_id:visit,reason:'TEST bypass finance'})).toEqual({error:'FINANCE_DEPENDENCY'});expect((await detail()).cycle_id).toBeNull();expect((await fr('summary')).sales_rp).toBe('18000');
 await fp('reverse',{operation_id:c.operation_id,reason:'TEST undo cash'});expect((await vp('reverse',{operation_id:visit,reason:'TEST undo visit'})).ok).toBe(true);expect((await fr('summary')).sales_rp).toBe('0');expect((await fr('invoices')).count).toBe(0);expect((await detail()).lines).toHaveLength(1);await db.exec('set constraints all immediate');
});
it('legacy verified sales need explicit owner review; no money is imported automatically',async()=>{
 await db.exec('alter table public.enzy_visits disable trigger enzy_visit_money');const visit=await directSale();await db.exec('alter table public.enzy_visits enable trigger enzy_visit_money');expect((await fr('legacy')).count).toBe(1);expect((await fr('invoices')).count).toBe(0);
 expect((await fp('recognize',{visit_id:visit,reason:'TEST reviewed no historic payment'})).ok).toBe(true);expect((await fr('legacy')).count).toBe(0);expect((await fr('invoices')).records[0].outstanding_rp).toBe('18000');expect(await balance(cash)).toBe('0');
});
it('posting history and ledger are immutable; every projection and journal balances exactly',async()=>{
 const visit=await agentSale();await fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'2400',reason:'TEST accounting'});
 expect((await db.query('select operation_id from public.enzy_money_ledger group by operation_id having sum(delta_rp)<>0')).rows).toEqual([]);
 expect((await db.query('select b.account_id from public.enzy_money_balances b left join (select business_id,account_id,sum(delta_rp) n from public.enzy_money_ledger group by business_id,account_id) l using(business_id,account_id) where b.balance_rp is distinct from coalesce(l.n,0)')).rows).toEqual([]);
 for(const table of ['enzy_money_operations','enzy_money_ledger','enzy_money_accounts']){await db.exec('savepoint immutable');await expect(db.exec('delete from public.'+table)).rejects.toThrow('append-only');await db.exec('rollback to savepoint immutable');}
});
it('deferred database constraint rejects unbalanced headers even outside RPC',async()=>{
 await db.exec('savepoint unbalanced');await db.query("insert into public.enzy_money_operations(business_id,kind,actor_device_id,amount_rp,reason) select id,'capital_in',$1::uuid,1,'TEST malformed admin journal' from public.enzy_businesses",[ownerDevice]);await expect(db.exec('set constraints all immediate')).rejects.toThrow('UNBALANCED_JOURNAL');await db.exec('rollback to savepoint unbalanced');
});
it('audit failure rolls back cash, financial header, journal and idempotency receipt',async()=>{
 const visit=await directSale();await db.exec("create function public.test_money_audit_fail() returns trigger language plpgsql as $$begin raise exception 'TEST money audit unavailable';end$$;create trigger test_money_audit_fail before insert on public.enzy_inventory_audit for each row execute function public.test_money_audit_fail();");
 await db.exec('savepoint failure');await expect(fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'0',account_id:cash,reason:'TEST atomic'})).rejects.toThrow('TEST money audit unavailable');await db.exec('rollback to savepoint failure');expect(await balance(cash)).toBe('0');expect((await fr('invoices')).records[0].collected_rp).toBe('0');
});
it('client roles cannot read money tables or invoke RPC/private helpers; service RPC works',async()=>{
 for(const role of ['anon','authenticated'])for(const table of ['enzy_money_accounts','enzy_money_proposals','enzy_money_cancellations','enzy_money_operations','enzy_money_balances','enzy_money_ledger','enzy_money_requests']){await db.exec('savepoint denied');await db.exec('set local role '+role);await expect(db.query('select * from public.'+table)).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint denied');}
 await db.exec('savepoint rpc');await db.exec('set local role authenticated');await expect(fr('accounts')).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint rpc');
 await db.exec('savepoint service');await db.exec('set local role service_role');expect((await fr('accounts')).count).toBe(2);await expect(db.query("select enzy_private.money_reserved(null,null)")).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint service');
});
it('reassignment removes prior field invoice visibility and payment replay access',async()=>{
 const visit=await directSale(),key=crypto.randomUUID(),rec={visit_id:visit,amount_rp:'1000',withheld_rp:'0',reason:'TEST field receipt'};expect((await fp('collect',rec,field,key)).ok).toBe(true);
 await vp('assign',{store_id:store,expected_version:(await detail()).version,channel:'direct',field_device_id:null,reason:'TEST assignment removed'});expect((await fr('invoices',field)).count).toBe(0);expect(await fp('collect',rec,field,key)).toEqual({error:'FORBIDDEN'});
});
it('field cannot target other custody or receive an agent invoice',async()=>{
 const visit=await directSale();expect(await fp('collect',{visit_id:visit,amount_rp:'100',withheld_rp:'0',collector_device_id:ownerDevice,reason:'TEST fake collector'},field)).toEqual({error:'FORBIDDEN'});
 await fp('collect',{visit_id:visit,amount_rp:'100',withheld_rp:'0',reason:'TEST own receipt'},field);const a=(await balances()).find((r:any)=>r.kind==='field');expect(await fp('propose',{account_id:a.id,destination_account_id:cash,amount_rp:'100',reason:'TEST other custody'},otherField)).toEqual({error:'FORBIDDEN'});
 const agentVisit=await agentSale();expect(await fp('collect',{visit_id:agentVisit,amount_rp:'100',withheld_rp:'0',reason:'TEST field cannot collect agency'},field)).toEqual({error:'FORBIDDEN'});
});
it('full withholding with zero Enzy share still has balanced ledger without fabricating cash',async()=>{
 await db.query("insert into public.enzy_price_agreements(business_id,product_id,agent_id,channel,store_price_rp,enzy_share_rp,valid_from,change_reason,created_by_device_id) select id,$1::uuid,$2::uuid,'agent',1500,0,now()-interval '1 day','TEST no share',$3::uuid from public.enzy_businesses",[product,agentId,ownerDevice]);
 await vp('assign',{store_id:store,expected_version:(await detail()).version,channel:'agent',agent_id:agentId,reason:'TEST zero share'});const visit=await directSale();expect((await fp('collect',{visit_id:visit,amount_rp:'18000',withheld_rp:'18000',reason:'TEST all earned commission'})).ok).toBe(true);expect((await fr('invoices')).records[0].outstanding_rp).toBe('0');expect((await fr('summary')).enzy_cash_movement_rp).toBe('0');
});
it('financial audit failure during visit posting rolls back physical stock and cycle as well',async()=>{
 await quotePost(await body([drop()]));const before=await detail();await db.exec("create function public.test_sale_audit_fail() returns trigger language plpgsql as $$begin if NEW.action='money_sale' then raise exception 'TEST sale audit unavailable';end if;return NEW;end$$;create trigger test_sale_audit before insert on public.enzy_inventory_audit for each row execute function public.test_sale_audit_fail();");
 await db.exec('savepoint atomic_visit');await expect(quotePost(await body([],await settle()))).rejects.toThrow('TEST sale audit unavailable');await db.exec('rollback to savepoint atomic_visit');expect((await detail()).cycle_id).toBe(before.cycle_id);expect((await fr('invoices')).count).toBe(0);expect((await vr('visits')).count).toBe(1);
});
it('finance-dependent visit failures persist throttling while rolling back all business changes',async()=>{
 const visit=await directSale();await fp('collect',{visit_id:visit,amount_rp:'100',withheld_rp:'0',account_id:cash,reason:'TEST received'});
 const before=(await db.query<{n:number}>("select sum(attempts)::int n from public.enzy_pairing_limits where bucket='uid:visit:'||$1",[owner])).rows[0].n;
 expect(await vp('reverse',{operation_id:visit,reason:'TEST dependency throttle'})).toEqual({error:'FINANCE_DEPENDENCY'});
 const after=(await db.query<{n:number}>("select sum(attempts)::int n from public.enzy_pairing_limits where bucket='uid:visit:'||$1",[owner])).rows[0].n;expect(after).toBe(before+1);expect((await fr('summary')).sales_rp).toBe('18000');
});
