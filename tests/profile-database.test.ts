import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
const owner='11111111-1111-4111-8111-111111111111',worker='22222222-2222-4222-8222-222222222222',pending='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444';
let db:PGlite,ownerId:string,workerId:string,otherId:string;
async function call(action:string,payload:Record<string,unknown>={},actor=owner){return (await db.query<{r:any}>('select public.enzy_pairing_action($1::uuid,$2,$3,$4::jsonb) r',[actor,action,'a'.repeat(64),JSON.stringify(payload)])).rows[0].r}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema auth;create table auth.users(id uuid primary key,is_anonymous boolean default true);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public to anon,authenticated,service_role;insert into auth.users(id) values('${owner}'),('${worker}'),('${pending}'),('${other}');`);
 for(const name of readdirSync(new URL('../supabase/migrations',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.exec(`insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at) values('${owner}','TEST owner','owner','active',now()),('${worker}','TEST worker','production','active',now()),('${other}','TEST other owner','owner','active',now());`);
 const rows=(await db.query<{id:string;auth_user_id:string}>('select id,auth_user_id from public.enzy_devices')).rows;ownerId=rows.find(r=>r.auth_user_id===owner)!.id;workerId=rows.find(r=>r.auth_user_id===worker)!.id;otherId=rows.find(r=>r.auth_user_id===other)!.id;
},30000);
afterAll(async()=>db.close());beforeEach(async()=>{await db.exec('begin')});afterEach(async()=>{await db.exec('rollback')});
it('named invitation redeems into persistent greeting without changing role rules',async()=>{
 const code_hash='b'.repeat(64);expect((await call('issue',{code_hash,role:'field',device_label:'TEST field HP',display_name:'  TEST Ani  '})).ok).toBe(true);
 expect((await call('redeem',{code_hash},pending)).ok).toBe(true);expect((await call('status',{},pending)).device).toMatchObject({display_name:'TEST Ani',role:'field',device_label:'TEST field HP'});
 expect((await call('redeem',{code_hash},pending)).error).toBe('ALREADY_ACTIVE');
});
it('old invitations and existing devices remain valid with optional null names',async()=>{
 expect((await call('status')).device.display_name).toBeNull();const code_hash='b'.repeat(64);await call('issue',{code_hash,role:'production',device_label:'TEST old invite'});await call('redeem',{code_hash},pending);expect((await call('status',{},pending)).device.display_name).toBeNull();
});
it('owner may name self and employees, audited once per actual change',async()=>{
 for(const id of [ownerId,workerId])expect((await call('profile',{device_id:id,display_name:'TEST Sapaan'})).ok).toBe(true);
 expect((await call('profile',{device_id:workerId,display_name:'TEST Sapaan'})).ok).toBe(true);
 expect((await call('list')).devices.find((d:any)=>d.id===workerId).display_name).toBe('TEST Sapaan');
 expect((await db.query("select * from public.enzy_device_audit where action='device_profile_updated'")).rows).toHaveLength(2);
 expect((await call('status',{},worker)).device.role).toBe('production');
});
it('employees, pending devices and other owner targets cannot edit profiles',async()=>{
 for(const actor of [worker,pending])expect((await call('profile',{device_id:ownerId,display_name:'TEST'},actor)).error).toBe('FORBIDDEN');
 expect((await call('profile',{device_id:otherId,display_name:'TEST'})).error).toBe('FORBIDDEN');await call('revoke',{device_id:workerId});expect((await call('profile',{device_id:workerId,display_name:'TEST'})).error).toBe('FORBIDDEN');
});
it('rejects invalid names and extra privilege fields without writes',async()=>{
 for(const display_name of ['', ' ', 'a'.repeat(81),'bad\nname',null])expect((await call('profile',{device_id:workerId,display_name})).error).toBe('INVALID_REQUEST');
 await db.exec('delete from public.enzy_pairing_limits');expect((await call('profile',{device_id:workerId,display_name:'TEST',role:'owner'})).error).toBe('INVALID_REQUEST');expect((await call('status',{},worker)).device.display_name).toBeNull();
});
it('profile write rolls back if its audit cannot be recorded',async()=>{
 await db.exec("create function public.test_audit_failure() returns trigger language plpgsql as $$begin raise exception 'TEST audit unavailable'; end$$;create trigger test_audit_failure before insert on public.enzy_device_audit for each row execute function public.test_audit_failure();savepoint failure;");
 await expect(call('profile',{device_id:workerId,display_name:'TEST'})).rejects.toThrow('TEST audit unavailable');await db.exec('rollback to savepoint failure');expect((await call('status',{},worker)).device.display_name).toBeNull();
});
it('profile capability and pairing RPCs are inaccessible to browser roles',async()=>{
 for(const role of ['anon','authenticated'])for(const fn of ['enzy_pairing_action','enzy_profile_action'])expect((await db.query<{ok:boolean}>('select has_function_privilege($1,$2,\'execute\') ok',[role,'public.'+fn+'(uuid,text,text,jsonb)'])).rows[0].ok).toBe(false);
 expect((await db.query<{ok:boolean}>("select has_function_privilege('service_role','public.enzy_profile_action(uuid,text,text,jsonb)','execute') ok")).rows[0].ok).toBe(true);
});
