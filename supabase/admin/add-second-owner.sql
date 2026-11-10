-- ADMIN ONLY. Adds one verified NEW device as the second owner, not a public invite.
-- Run manually in the intended Supabase SQL editor. Never a migration/build/API.
-- Replace only the zero UUID with the full identity shown on owner 2's live device,
-- after matching the same anonymous user in Authentication > Users.
begin;
set local lock_timeout='10s';
do $second_owner$
declare
 target uuid := '00000000-0000-0000-0000-000000000000';
 primary_owner public.enzy_devices; existing public.enzy_devices; device_id uuid;
begin
 if current_user<>'postgres' then raise exception 'Use the project admin SQL editor';end if;
 if target='00000000-0000-0000-0000-000000000000' then raise exception 'Replace the zero UUID with the verified second device Auth UUID';end if;
 if not exists(select 1 from auth.users where id=target and is_anonymous=true) then raise exception 'Verified anonymous identity missing';end if;
 -- Same lock as first-owner bootstrap; no concurrent additional-owner creation.
 perform pg_advisory_xact_lock(20261026);
 select * into existing from public.enzy_devices where auth_user_id=target for update;
 if existing.status='active' and existing.role='owner' and existing.revoked_at is null then
  if exists(select 1 from public.enzy_device_audit a where a.device_id=existing.id and a.action='admin_second_owner_added') then return;end if;
  raise exception 'This device is already an owner. Use the NEW second device UUID';
 end if;
 if (select count(*) from public.enzy_devices where role='owner' and status='active' and revoked_at is null)<>1 then
  raise exception 'Exactly one active first owner is required; this script does not add a third owner or recover ownership';end if;
 select * into primary_owner from public.enzy_devices where role='owner' and status='active' and revoked_at is null for share;
 if existing.id is not null and (existing.status is distinct from 'pending' or existing.revoked_at is not null or existing.role is not null) then
  raise exception 'Use a new unpaired device. Existing employee/revoked devices are not promoted';end if;
 if existing.id is null then
  insert into public.enzy_devices(auth_user_id,device_label,display_name,role,status,paired_at)
  values(target,'Perangkat pemilik kedua','Pemilik kedua','owner','active',clock_timestamp()) returning id into device_id;
 else
  update public.enzy_devices set device_label='Perangkat pemilik kedua',display_name='Pemilik kedua',role='owner',status='active',paired_at=clock_timestamp()
  where id=existing.id returning id into device_id;
 end if;
 insert into public.enzy_device_audit(device_id,actor_device_id,action,metadata)
 values(device_id,primary_owner.id,'admin_second_owner_added',jsonb_build_object('admin',session_user,'scope','verified second owner device'));
end;
$second_owner$;
commit;
select device_label,display_name,role,status from public.enzy_devices
where role='owner' and status='active' and revoked_at is null order by paired_at,id;
