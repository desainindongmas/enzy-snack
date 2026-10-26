-- MANUAL ADMIN TEMPLATE. Not a migration, not invoked by frontend or pipeline.
-- Replace UUID only after verifying auth.users entry against the owner's live device.
-- Execute using Supabase project admin SQL editor against the intended environment.
begin;
do $$
declare target uuid := '00000000-0000-0000-0000-000000000000'; device uuid;
begin
 if target = '00000000-0000-0000-0000-000000000000' then raise exception 'Replace verified owner UUID'; end if;
 if not exists(select 1 from auth.users where id=target and is_anonymous=true) then raise exception 'Anonymous identity missing'; end if;
 perform pg_advisory_xact_lock(20261026);
 if exists(select 1 from public.enzy_devices where role='owner' and status='active') then raise exception 'Owner already exists; use recovery procedure'; end if;
 insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at)
 values(target,'Perangkat pemilik','owner','active',now()) returning id into device;
 insert into public.enzy_device_audit(device_id,actor_device_id,action,metadata)
 values(device,device,'admin_owner_bootstrap',jsonb_build_object('admin',session_user));
end $$;
commit;
