import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/202610260001_device_access.sql',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../supabase/admin/bootstrap-owner.sql',import.meta.url),'utf8');
const owner='11111111-1111-4111-8111-111111111111';
const pending='22222222-2222-4222-8222-222222222222';
const setup=`
 create role anon nologin; create role authenticated nologin;
 create schema auth;
 create table auth.users(id uuid primary key,is_anonymous boolean not null default true);
 create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated;
 grant execute on function auth.uid() to anon,authenticated;
`;
let db:PGlite;
async function asActor(role:'anon'|'authenticated',uid:string,sql:string){
 await db.exec('begin');
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);
  await db.exec(`set local role ${role}`);
  return await db.query(sql);
 }finally{await db.exec('rollback')}
}
beforeAll(async()=>{
 db=new PGlite();await db.exec(setup);await db.exec(migration);
 await db.exec(`insert into auth.users(id) values('${owner}'),('${pending}');
 insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at)
 values('${owner}','TEST ONLY owner','owner','active',now());
 insert into public.enzy_devices(auth_user_id,device_label) values('${pending}','TEST ONLY pending');
 -- Synthetic business probes only; these are NEVER part of a deployed migration.
 create table public.test_business_denied(id int primary key);
 insert into public.test_business_denied values(1);
 alter table public.test_business_denied enable row level security;
 grant select,insert on public.test_business_denied to anon,authenticated;
 create table public.test_business_gated(id int primary key);
 insert into public.test_business_gated values(1);
 alter table public.test_business_gated enable row level security;
 grant select on public.test_business_gated to authenticated;
 create function public.test_actor_is_active() returns boolean language sql stable security definer set search_path='' as $$
 select public.current_device_id() is not null $$;
 revoke all on function public.test_actor_is_active() from public;
 grant execute on function public.test_actor_is_active() to authenticated;
 create policy test_active_device on public.test_business_gated for select to authenticated using(public.test_actor_is_active());`);
},30000);
afterAll(async()=>{await db?.close()});
describe('PostgreSQL WASM integration (simulated Supabase auth context)',()=>{
 it('anonymous Auth identity cannot read default-deny business probe',async()=>{
  expect((await asActor('authenticated',pending,'select * from public.test_business_denied')).rows).toEqual([]);
 });
 it('unauthenticated anon cannot read default-deny business probe',async()=>{
  expect((await asActor('anon','','select * from public.test_business_denied')).rows).toEqual([]);
 });
 it('anonymous Auth identity cannot write default-deny probe',async()=>{
  await expect(asActor('authenticated',pending,'insert into public.test_business_denied values(2)')).rejects.toMatchObject({code:'42501'});
 });
 it('all device, invite and audit tables reject direct authenticated reads',async()=>{
  for(const table of ['enzy_devices','enzy_pairing_invites','enzy_device_audit'])
   await expect(asActor('authenticated',owner,`select * from public.${table}`)).rejects.toMatchObject({code:'42501'});
 });
 it('public client cannot self-promote by inserting owner',async()=>{
  await expect(asActor('authenticated',pending,`insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at) values('${pending}','forged','owner','active',now())`)).rejects.toMatchObject({code:'42501'});
 });
 it('pending role may be unknown and cannot pass active-device policy',async()=>{
  expect((await asActor('authenticated',pending,'select * from public.test_business_gated')).rows).toEqual([]);
 });
 it('revocation blocks next read even with same identity context',async()=>{
  expect((await asActor('authenticated',owner,'select * from public.test_business_gated')).rows).toEqual([{id:1}]);
  await db.exec(`update public.enzy_devices set status='revoked',revoked_at=now() where auth_user_id='${owner}'`);
  try{expect((await asActor('authenticated',owner,'select * from public.test_business_gated')).rows).toEqual([])}
  finally{await db.exec(`update public.enzy_devices set status='active',revoked_at=null where auth_user_id='${owner}'`)}
 });
 it('active device requires a role and cannot keep revoked_at',async()=>{
  await expect(db.exec(`update public.enzy_devices set status='active',paired_at=now() where auth_user_id='${pending}'`)).rejects.toMatchObject({code:'23514'});
  await expect(db.exec(`update public.enzy_devices set revoked_at=now() where auth_user_id='${owner}'`)).rejects.toMatchObject({code:'23514'});
 });
 it('audit rejects updates and deletes',async()=>{
  await db.exec("insert into public.enzy_device_audit(action) values('TEST ONLY')");
  await expect(db.exec("update public.enzy_device_audit set action='changed'")).rejects.toThrow('append-only');
  await expect(db.exec('delete from public.enzy_device_audit')).rejects.toThrow('append-only');
 });
 it('unreplaced bootstrap template fails without creating an owner',async()=>{
  await expect(db.exec(bootstrap)).rejects.toThrow('Replace verified owner UUID');await db.exec('rollback');
 });
 it('public owner claim RPC does not exist',async()=>{
  expect((await db.query("select proname from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname in ('claim_owner','signup_owner','first_user_is_owner')")).rows).toEqual([]);
 });
 it('refuses to apply on a legacy schema without changing it',async()=>{
  const legacy=new PGlite();
  try{
   await legacy.exec(setup);await legacy.exec('create table public.enzy_profiles(user_id uuid)');
   await expect(legacy.exec(migration)).rejects.toThrow('Existing Enzy schema detected');await legacy.exec('rollback');
   expect((await legacy.query("select to_regclass('public.enzy_devices') as devices, to_regclass('public.enzy_profiles') as profiles")).rows).toEqual([{devices:null,profiles:'enzy_profiles'}]);
  }finally{await legacy.close()}
 },30000);
});
