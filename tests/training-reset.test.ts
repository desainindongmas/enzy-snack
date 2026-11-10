import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
const owner='11111111-1111-4111-8111-111111111111',field='22222222-2222-4222-8222-222222222222',revoked='33333333-3333-4333-8333-333333333333',pending='44444444-4444-4444-8444-444444444444';
let db:PGlite,business:string,actor:string,supplier:string;
const source=readFileSync(new URL('../supabase/admin/reset-training-session.sql',import.meta.url),'utf8');
const ref='ENZY-LATIHAN-TIM-20261110-01';
function reset(b=business,r=ref){return source.replace('expected_business_id uuid := null;',`expected_business_id uuid := '${b}';`).replace('reset_ref text := null;',`reset_ref text := '${r}';`)}
async function count(t:string){return Number((await db.query<{n:string}>(`select count(*) n from public.${t}`)).rows[0].n)}
async function rpc(domain:string,action:string,record:Record<string,unknown>){return(await db.query<{r:any}>(`select public.enzy_${domain}_action($1::uuid,$2,$3,$4::jsonb) r`,[owner,action,'a'.repeat(64),JSON.stringify({record,request_id:crypto.randomUUID()})])).rows[0].r}
async function fixtures(){
 await db.exec(`insert into public.enzy_devices(auth_user_id,device_label,display_name,role,status,paired_at,revoked_at) values('${owner}','TEST owner','TEST Nur','owner','active',now(),null),('${field}','TEST field','TEST Ani','field','active',now(),null),('${revoked}','TEST revoked','TEST Old','production','revoked',now(),now());`);
 actor=(await db.query<{id:string}>('select id from public.enzy_devices where auth_user_id=$1',[owner])).rows[0].id;
 supplier=(await db.query<{id:string}>("insert into public.enzy_suppliers(business_id,name,created_by_device_id) values($1,'TEST supplier',$2) returning id",[business,actor])).rows[0].id;
 await db.exec(`insert into public.enzy_pairing_invites(code_hash,intended_role,device_label,created_by_device_id,expires_at) values('${'b'.repeat(64)}','field','TEST pending','${actor}',now()+interval '10 minutes');insert into public.enzy_device_audit(device_id,actor_device_id,action) values('${actor}','${actor}','TEST prior audit');`);
 expect((await rpc('inventory','purchase',{supplier_id:supplier,weight_g:10000,goods_cost_rp:75000,acquisition_extra_rp:0,reason:'TEST old stock'})).ok).toBe(true);
 const cash=await rpc('finance','account',{name:'TEST cash',kind:'cash',reason:'TEST config'});expect(cash.ok).toBe(true);
 expect((await rpc('finance','capital_in',{account_id:cash.account_id,amount_rp:'50000',reason:'TEST capital'})).ok).toBe(true);
}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema auth;create table auth.users(id uuid primary key,is_anonymous boolean default true);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public to anon,authenticated,service_role;insert into auth.users(id) values('${owner}'),('${field}'),('${revoked}'),('${pending}');`);
 for(const n of readdirSync(new URL('../supabase/migrations',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())await db.exec(readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8'));
 business=(await db.query<{id:string}>('select id from public.enzy_businesses')).rows[0].id;
},30000);
afterAll(async()=>db.close());
// The admin file owns its transaction; snapshot a fresh populated fixture for each test.
beforeEach(async()=>{await db.exec('begin');await fixtures();await db.exec('set constraints all immediate;set constraints all deferred')});
afterEach(async()=>{await db.exec('rollback');});
// Remove only transaction wrappers in tests so fixture rollback remains available.
async function execute(sql:string){const body=sql.replace(/^begin;$/m,'').replace(/^commit;$/m,'');await db.exec('savepoint reset_test');try{return await db.exec(body)}catch(e){await db.exec('rollback to savepoint reset_test');throw e}}
it('clears master/stock/money, reseeds only empty configuration, preserves identity and immutable audit',async()=>{
 const devices=(await db.query('select * from public.enzy_devices order by id')).rows,identities=(await db.query('select * from auth.users order by id')).rows;
 const reportBefore=(await db.query<{r:any}>('select enzy_private.readiness_report($1) r',[business])).rows[0].r;expect(reportBefore.integrity_ok).toBe(true);
 await execute(reset());expect(await count('enzy_suppliers')).toBe(0);expect(await count('enzy_inventory_operations')).toBe(0);expect(await count('enzy_money_operations')).toBe(0);expect(await count('enzy_stock_locations')).toBe(3);expect(await count('enzy_money_accounts')).toBe(7);
 expect((await db.query('select * from public.enzy_devices order by id')).rows).toEqual(devices);expect((await db.query('select * from auth.users order by id')).rows).toEqual(identities);
 expect((await db.query("select * from public.enzy_device_audit where action='TEST prior audit'")).rows).toHaveLength(1);expect((await db.query("select * from public.enzy_device_audit where action='training_session_reset'")).rows).toHaveLength(1);
 expect(await count('enzy_pairing_invites')).toBe(0);const report=(await db.query<{r:any}>('select enzy_private.readiness_report($1) r',[business])).rows[0].r;expect(report.integrity_ok).toBe(true);expect(report.opening_eligible).toBe(true);
});
it('same reset reference cannot erase newly entered training records',async()=>{
 await execute(reset());await db.query("insert into public.enzy_suppliers(business_id,name,created_by_device_id) values($1,'TEST new session',$2)",[business,actor]);await expect(execute(reset())).rejects.toThrow('already reset');expect(await count('enzy_suppliers')).toBe(1);
});
it('refuses unconfigured file, wrong business UUID and unrecognized tables',async()=>{
 await expect(execute(source)).rejects.toThrow('Verified TEST');await expect(execute(reset(crypto.randomUUID()))).rejects.toThrow('does not match');await db.exec('create table public.enzy_future(id integer)');await expect(execute(reset())).rejects.toThrow('Unexpected schema');expect(await count('enzy_suppliers')).toBe(1);
});
it('an outside foreign key prevents cascading deletion and preserves all old records',async()=>{
 await db.exec('create table public.test_dependency(id uuid references public.enzy_suppliers(id))');await db.query('insert into public.test_dependency values($1)',[supplier]);await expect(execute(reset())).rejects.toThrow();expect(await count('enzy_suppliers')).toBe(1);expect(await count('enzy_money_operations')).toBe(1);expect(await count('enzy_pairing_invites')).toBe(1);
});
it('audit failure rolls back truncation, fresh configurations and invite invalidation together',async()=>{
 await db.exec("create function public.test_reset_failure() returns trigger language plpgsql as $$begin if NEW.action='training_session_reset' then raise exception 'TEST audit failure';end if;return NEW;end$$;create trigger test_reset_failure before insert on public.enzy_device_audit for each row execute function public.test_reset_failure();");
 await expect(execute(reset())).rejects.toThrow('TEST audit failure');expect(await count('enzy_suppliers')).toBe(1);expect(await count('enzy_inventory_operations')).toBe(1);expect(await count('enzy_money_operations')).toBe(1);expect(await count('enzy_pairing_invites')).toBe(1);
});
it('reset leaves default-deny ACL and append-only triggers in place',async()=>{
 await execute(reset());await db.exec('savepoint client');await db.exec('set local role authenticated');await expect(db.exec('select * from public.enzy_money_ledger')).rejects.toThrow('permission denied');await db.exec('rollback to savepoint client');await db.exec('savepoint audit');await expect(db.exec('delete from public.enzy_device_audit')).rejects.toThrow('append-only');await db.exec('rollback to savepoint audit');
});
