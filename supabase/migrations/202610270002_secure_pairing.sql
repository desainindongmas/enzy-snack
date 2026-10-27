-- Phase 2. Review and apply manually to TEST first; never run from frontend/build.
-- Requires 001 exactly. Existing unrelated/legacy schema must be reviewed separately.
begin;
create table public.enzy_pairing_limits (
 bucket text not null, window_start timestamptz not null,
 attempts integer not null check(attempts>0), primary key(bucket,window_start)
);
alter table public.enzy_pairing_limits enable row level security;
alter table public.enzy_pairing_limits force row level security;
revoke all on public.enzy_pairing_limits from public,anon,authenticated;
create index enzy_pairing_limits_window_idx on public.enzy_pairing_limits(window_start);
alter table public.enzy_pairing_invites add constraint enzy_invite_hash_format check(code_hash ~ '^[0-9a-f]{64}$');

-- PRIVATE service backend only: actor must come from auth.getUser(verified bearer JWT).
-- Browser cannot execute this function and cannot choose actor/IP bucket.
create function public.enzy_pairing_action(p_actor uuid,p_action text,p_ip_hash text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 d public.enzy_devices; inviter public.enzy_devices; target public.enzy_devices;
 inv public.enzy_pairing_invites; v_hash text; v_label text; v_role text;
 v_id uuid; v_exp timestamptz; v_count integer; v_limit integer; v_key text;
 v_window timestamptz := date_trunc('minute',clock_timestamp());
 v_devices jsonb;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then
  return jsonb_build_object('error','UNAUTHORIZED'); end if;
 if p_action not in ('status','list','issue','redeem','revoke') or p_action is null
 or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_payload) is distinct from 'object' then
  return jsonb_build_object('error','INVALID_REQUEST'); end if;
 -- Atomic persisted minute buckets. Keep failed attempts: return errors, do not raise.
 -- Same order for every caller avoids crossed bucket locks.
 foreach v_key in array array['global:'||p_action,'ip:'||p_action||':'||p_ip_hash,'uid:'||p_action||':'||p_actor::text] loop
  v_limit := case when p_action in ('status','list') then
   case when v_key like 'global:%' then 3000 when v_key like 'ip:%' then 180 else 60 end
   when p_action='redeem' then
   case when v_key like 'global:%' then 100 when v_key like 'ip:%' then 15 else 5 end
   else case when v_key like 'global:%' then 50 when v_key like 'ip:%' then 10 else 5 end end;
  insert into public.enzy_pairing_limits(bucket,window_start,attempts) values(v_key,v_window,1)
  on conflict(bucket,window_start) do update set attempts=enzy_pairing_limits.attempts+1
  returning attempts into v_count;
  if v_count>v_limit then return jsonb_build_object('error','RATE_LIMITED'); end if;
 end loop;
 -- Serialize attempts for same auth identity, including two different invitations.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text,0));
 select * into d from public.enzy_devices where auth_user_id=p_actor for share;
 if p_action='status' then
  return jsonb_build_object('device',case when d.id is null then
   jsonb_build_object('status','pending','role',null,'id',null,'device_label',null)
   else jsonb_build_object('status',d.status,'role',case when d.status='active' and d.revoked_at is null then d.role else null end,'id',d.id,'device_label',d.device_label) end);
 end if;
 if p_action='redeem' then
  if d.status='revoked' or d.revoked_at is not null then return jsonb_build_object('error','DEVICE_REVOKED'); end if;
  if d.status='active' then return jsonb_build_object('error','ALREADY_ACTIVE'); end if;
  v_hash := p_payload->>'code_hash';
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','INVALID_CODE'); end if;
  select * into inv from public.enzy_pairing_invites where code_hash=v_hash for update;
  if inv.id is null then
   insert into public.enzy_device_audit(action,metadata) values('pairing_rejected',jsonb_build_object('auth_user_id',p_actor));
   return jsonb_build_object('error','INVALID_CODE'); end if;
  select * into inviter from public.enzy_devices where id=inv.created_by_device_id for share;
  if inv.consumed_at is not null or inv.expires_at<=clock_timestamp() or inviter.status is distinct from 'active'
   or inviter.role is distinct from 'owner' or inviter.revoked_at is not null then
   update public.enzy_pairing_invites set failed_attempts=failed_attempts+1 where id=inv.id;
   insert into public.enzy_device_audit(action,metadata) values('pairing_rejected',jsonb_build_object('auth_user_id',p_actor));
   return jsonb_build_object('error','INVALID_CODE'); end if;
  insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at)
   values(p_actor,inv.device_label,inv.intended_role,'active',clock_timestamp())
   on conflict(auth_user_id) do update set device_label=excluded.device_label,role=excluded.role,status='active',paired_at=excluded.paired_at
   where enzy_devices.status='pending' and enzy_devices.revoked_at is null returning id into v_id;
  if v_id is null then return jsonb_build_object('error','DEVICE_REVOKED'); end if;
  update public.enzy_pairing_invites set consumed_at=clock_timestamp(),claimed_by_auth_user_id=p_actor where id=inv.id;
  insert into public.enzy_device_audit(device_id,actor_device_id,action) values(v_id,inviter.id,'device_paired');
  return jsonb_build_object('ok',true);
 end if;
 if d.id is null or d.status<>'active' or d.role is distinct from 'owner' or d.revoked_at is not null then
  return jsonb_build_object('error','FORBIDDEN'); end if;
 if p_action='list' then
  select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) into v_devices from (
   select id,device_label,role,status,paired_at,revoked_at from public.enzy_devices order by created_at desc limit 100
  ) x;
  return jsonb_build_object('devices',v_devices);
 end if;
 if p_action='issue' then
  v_hash:=p_payload->>'code_hash'; v_role:=p_payload->>'role'; v_label:=btrim(p_payload->>'device_label');
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' or v_role is null or v_role not in ('production','field')
   or v_label is null or length(v_label) not between 1 and 100 then return jsonb_build_object('error','INVALID_REQUEST'); end if;
  v_exp:=clock_timestamp()+interval '10 minutes';
  insert into public.enzy_pairing_invites(code_hash,intended_role,device_label,created_by_device_id,expires_at)
   values(v_hash,v_role,v_label,d.id,v_exp) returning id into v_id;
  insert into public.enzy_device_audit(device_id,actor_device_id,action,metadata)
   values(d.id,d.id,'invite_issued',jsonb_build_object('invite_id',v_id,'role',v_role));
  return jsonb_build_object('ok',true,'expires_at',v_exp);
 end if;
 if p_action='revoke' then
  if coalesce(p_payload->>'device_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return jsonb_build_object('error','INVALID_REQUEST'); end if;
  select * into target from public.enzy_devices where id=(p_payload->>'device_id')::uuid for update;
  if target.id is null or target.role='owner' then return jsonb_build_object('error','FORBIDDEN'); end if;
  if target.status='revoked' then return jsonb_build_object('ok',true); end if;
  update public.enzy_devices set status='revoked',revoked_at=clock_timestamp() where id=target.id;
  insert into public.enzy_device_audit(device_id,actor_device_id,action) values(target.id,d.id,'device_revoked');
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('error','INVALID_REQUEST');
end $$;
revoke all on function public.enzy_pairing_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enzy_pairing_action(uuid,text,text,jsonb) to service_role;
-- Maintenance: rate buckets can be deleted by admin after retention, never audits.
commit;
