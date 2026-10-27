import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,it,expect,describe} from 'vitest';
import {readFileSync} from 'node:fs';
const owner='11111111-1111-4111-8111-111111111111',field='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const ip='a'.repeat(64),hash='b'.repeat(64);
let db:PGlite;
async function call(actor:string,action:string,payload:Record<string,unknown>={}){
 const r=await db.query<{result:Record<string,any>}>('select public.enzy_pairing_action($1::uuid,$2,$3,$4::jsonb) as result',[actor,action,ip,JSON.stringify(payload)]);return r.rows[0].result;
}
async function issue(role='field',code_hash=hash){return call(owner,'issue',{role,device_label:'TEST device',code_hash})}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
 create schema auth;create table auth.users(id uuid primary key,is_anonymous boolean default true);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public to service_role,anon,authenticated;
 insert into auth.users(id) values('${owner}'),('${field}'),('${other}');`);
 for(const name of ['202610260001_device_access.sql','202610270002_secure_pairing.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
},30000);
afterAll(async()=>{await db?.close()});
beforeEach(async()=>{
 await db.exec(`truncate public.enzy_device_audit,public.enzy_pairing_invites,public.enzy_devices,public.enzy_pairing_limits;
 insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at) values('${owner}','TEST owner','owner','active',now());`);
});
describe('Phase 2 SQL pairing transactions',()=>{
 it('returns pending with no role for anonymous unpaired UID',async()=>{
  const r=await call(field,'status');expect(r.device).toMatchObject({status:'pending',role:null,id:null});
 });
 it('only active owner can issue, list or revoke',async()=>{
  expect(await call(field,'list')).toEqual({error:'FORBIDDEN'});
  expect(await call(field,'issue',{role:'field',device_label:'TEST',code_hash:hash})).toEqual({error:'FORBIDDEN'});
  expect(await call(field,'revoke',{device_id:owner})).toEqual({error:'FORBIDDEN'});
 });
 for(const role of ['production','field'])it(`active ${role} cannot manage devices`,async()=>{
  await issue(role);await call(field,'redeem',{code_hash:hash});
  expect(await call(field,'list')).toEqual({error:'FORBIDDEN'});
  expect(await call(field,'issue',{role:'field',device_label:'TEST',code_hash:'c'.repeat(64)})).toEqual({error:'FORBIDDEN'});
  const ownerDevice=(await call(owner,'status')).device;
  expect(await call(field,'revoke',{device_id:ownerDevice.id})).toEqual({error:'FORBIDDEN'});
 });
 it('rejects invite escalation to owner',async()=>expect(await issue('owner')).toEqual({error:'INVALID_REQUEST'}));
 it('atomically activates bound UID, consumes invite and appends audit',async()=>{
  expect(await issue()).toMatchObject({ok:true});expect(await call(field,'redeem',{code_hash:hash})).toEqual({ok:true});
  expect((await call(field,'status')).device).toMatchObject({role:'field',status:'active',device_label:'TEST device'});
  const invite=await db.query<{claimed_by_auth_user_id:string;consumed_at:unknown}>('select claimed_by_auth_user_id,consumed_at from public.enzy_pairing_invites');
  expect(invite.rows[0].claimed_by_auth_user_id).toBe(field);expect(invite.rows[0].consumed_at).not.toBeNull();
  expect((await db.query("select action from public.enzy_device_audit where action='device_paired'")).rows).toHaveLength(1);
 });
 it('rejects expired code without activating device',async()=>{
  await issue();await db.exec("update public.enzy_pairing_invites set created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes'");
  expect(await call(field,'redeem',{code_hash:hash})).toEqual({error:'INVALID_CODE'});
  expect((await call(field,'status')).device.status).toBe('pending');
 });
 it('rejects reused code by a different UID',async()=>{
  await issue();await call(field,'redeem',{code_hash:hash});expect(await call(other,'redeem',{code_hash:hash})).toEqual({error:'INVALID_CODE'});
 });
 it('does not duplicate activation when requests are retried',async()=>{
  await issue();const results=await Promise.all([call(field,'redeem',{code_hash:hash}),call(field,'redeem',{code_hash:hash})]);
  expect(results).toContainEqual({ok:true});expect(results).toContainEqual({error:'ALREADY_ACTIVE'});
  expect((await db.query("select * from public.enzy_device_audit where action='device_paired'")).rows).toHaveLength(1);
 });
 it('refuses different UID after same code was consumed (queued contender)',async()=>{
  await issue();const results=await Promise.all([call(field,'redeem',{code_hash:hash}),call(other,'redeem',{code_hash:hash})]);
  expect(results.filter(r=>r.ok)).toHaveLength(1);expect(results.filter(r=>r.error==='INVALID_CODE')).toHaveLength(1);
 });
 it('persists wrong-code attempts and blocks sixth request',async()=>{
  for(let i=0;i<5;i++)expect(await call(field,'redeem',{code_hash:''})).toEqual({error:'INVALID_CODE'});
  expect(await call(field,'redeem',{code_hash:''})).toEqual({error:'RATE_LIMITED'});
  expect((await db.query<{attempts:number}>("select attempts from public.enzy_pairing_limits where bucket=$1",['uid:redeem:'+field])).rows[0].attempts).toBe(6);
 });
 it('limits IP across identities, and global issuance across IPs',async()=>{
  await db.exec("insert into public.enzy_pairing_limits values('ip:redeem:"+ip+"',date_trunc('minute',clock_timestamp()),15)");
  expect(await call(field,'redeem',{code_hash:''})).toEqual({error:'RATE_LIMITED'});
  await db.exec("insert into public.enzy_pairing_limits values('global:issue',date_trunc('minute',clock_timestamp()),50)");
  expect(await issue()).toEqual({error:'RATE_LIMITED'});
 });
 it('revokes device immediately, keeps role inactive, forbids reactivation',async()=>{
  await issue();await call(field,'redeem',{code_hash:hash});const d=(await call(field,'status')).device;
  expect(await call(owner,'revoke',{device_id:d.id})).toEqual({ok:true});
  expect((await call(field,'status')).device).toMatchObject({status:'revoked',role:null});
  await issue('production','c'.repeat(64));expect(await call(field,'redeem',{code_hash:'c'.repeat(64)})).toEqual({error:'DEVICE_REVOKED'});
  expect(await call(field,'list')).toEqual({error:'FORBIDDEN'});
 });
 it('invalidates outstanding invitations when issuing owner revoked',async()=>{
  await issue();await db.exec(`update public.enzy_devices set status='revoked',revoked_at=now() where auth_user_id='${owner}'`);
  expect(await call(field,'redeem',{code_hash:hash})).toEqual({error:'INVALID_CODE'});
 });
 it('rejects owner self-revoke and prevents removing last owner through app',async()=>{
  const d=(await call(owner,'status')).device;expect(await call(owner,'revoke',{device_id:d.id})).toEqual({error:'FORBIDDEN'});
 });
 it('authenticated clients cannot call service-only RPC or read rate buckets',async()=>{
  await db.exec('begin;set local role authenticated');
  try{await expect(call(owner,'issue',{role:'field',code_hash:hash,device_label:'forged'})).rejects.toMatchObject({code:'42501'})}finally{await db.exec('rollback')}
  await db.exec('begin;set local role authenticated');
  try{await expect(db.query('select * from public.enzy_pairing_limits')).rejects.toMatchObject({code:'42501'})}finally{await db.exec('rollback')}
 });
 it('service backend alone has executable function privilege',async()=>{
  await db.exec('begin;set local role service_role');
  try{expect((await call(field,'status')).device.status).toBe('pending')}finally{await db.exec('rollback')}
 });
 it('rolls back device and invite if audit insertion fails',async()=>{
  await issue();await db.exec(`create function public.test_reject_audit() returns trigger language plpgsql as $$begin if NEW.action='device_paired' then raise exception 'TEST audit unavailable';end if;return NEW;end$$;
   create trigger test_audit_failure before insert on public.enzy_device_audit for each row execute function public.test_reject_audit();`);
  try{
   await expect(call(field,'redeem',{code_hash:hash})).rejects.toThrow('TEST audit unavailable');
   expect((await call(field,'status')).device.status).toBe('pending');
   expect((await db.query<{consumed_at:unknown}>('select consumed_at from public.enzy_pairing_invites')).rows[0].consumed_at).toBeNull();
  }finally{await db.exec('drop trigger test_audit_failure on public.enzy_device_audit;drop function public.test_reject_audit()')}
 });
});
