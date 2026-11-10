import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
const owner='11111111-1111-4111-8111-111111111111',next='22222222-2222-4222-8222-222222222222',worker='33333333-3333-4333-8333-333333333333',third='44444444-4444-4444-8444-444444444444';
let db:PGlite,ownerDevice:string;
const source=readFileSync(new URL('../supabase/admin/add-second-owner.sql',import.meta.url),'utf8');
const sql=(id=next)=>source.replace('00000000-0000-0000-0000-000000000000',id).replace(/^begin;$/m,'').replace(/^commit;$/m,'');
async function execute(s:string){await db.exec('savepoint add_owner');try{return await db.exec(s)}catch(e){await db.exec('rollback to savepoint add_owner');throw e}}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema auth;create table auth.users(id uuid primary key,is_anonymous boolean default true);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public to anon,authenticated,service_role;insert into auth.users(id) values('${owner}'),('${next}'),('${worker}'),('${third}');`);
 for(const n of readdirSync(new URL('../supabase/migrations',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())await db.exec(readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8'));
 await db.exec(`insert into public.enzy_devices(auth_user_id,device_label,display_name,role,status,paired_at) values('${owner}','TEST owner','TEST Nur','owner','active',now()),('${worker}','TEST worker','TEST Ani','field','active',now());`);
 ownerDevice=(await db.query<{id:string}>('select id from public.enzy_devices where auth_user_id=$1',[owner])).rows[0].id;
},30000);
afterAll(async()=>db.close());beforeEach(async()=>{await db.exec('begin')});afterEach(async()=>{await db.exec('rollback')});
it('adds second owner without changing first owner, audits once and resolves owner access',async()=>{
 const before=(await db.query('select * from public.enzy_devices where id=$1',[ownerDevice])).rows;
 await execute(sql());await execute(sql());expect((await db.query("select * from public.enzy_devices where role='owner' and status='active'")).rows).toHaveLength(2);expect((await db.query('select * from public.enzy_devices where id=$1',[ownerDevice])).rows).toEqual(before);
 const audit=(await db.query("select * from public.enzy_device_audit where action='admin_second_owner_added'")).rows;expect(audit).toHaveLength(1);expect(audit[0].actor_device_id).toBe(ownerDevice);
 const result=(await db.query<{r:any}>('select public.enzy_pairing_action($1,\'status\',$2) r',[next,'a'.repeat(64)])).rows[0].r;expect(result.device).toMatchObject({role:'owner',status:'active',display_name:'Pemilik kedua'});
});
it('refuses placeholder, unknown identity, first owner UUID and employee promotion',async()=>{
 await expect(execute(sql('00000000-0000-0000-0000-000000000000'))).rejects.toThrow('zero UUID');await expect(execute(sql(crypto.randomUUID()))).rejects.toThrow('identity missing');await expect(execute(sql(owner))).rejects.toThrow('already an owner');await expect(execute(sql(worker))).rejects.toThrow('not promoted');
});
it('supports a pending unpaired row but never restores revoked access',async()=>{
 await db.exec(`insert into public.enzy_devices(auth_user_id,device_label) values('${next}','TEST pending')`);await execute(sql());expect((await db.query("select * from public.enzy_devices where role='owner'")).rows).toHaveLength(2);
 await db.exec('rollback to savepoint add_owner');await db.exec(`update public.enzy_devices set status='revoked',revoked_at=now() where auth_user_id='${next}'`);await expect(execute(sql())).rejects.toThrow('not promoted');
});
it('does not add third owner or bootstrap after loss of first owner',async()=>{
 await execute(sql());await expect(execute(sql(third))).rejects.toThrow('Exactly one');await db.exec(`update public.enzy_devices set status='revoked',revoked_at=now() where role='owner'`);await expect(execute(sql(third))).rejects.toThrow('Exactly one');
});
it('audit failure rolls back owner creation',async()=>{
 await db.exec("create function public.test_owner_audit_failure() returns trigger language plpgsql as $$begin raise exception 'TEST audit unavailable';end$$;create trigger test_owner_audit_failure before insert on public.enzy_device_audit for each row execute function public.test_owner_audit_failure();");await expect(execute(sql())).rejects.toThrow('TEST audit unavailable');expect((await db.query('select * from public.enzy_devices where auth_user_id=$1',[next])).rows).toHaveLength(0);
});
