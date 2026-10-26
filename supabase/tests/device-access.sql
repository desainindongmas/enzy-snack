-- Run ONLY in disposable Supabase test DB after reviewed draft migration.
-- Entire fixture rolls back. Execute as project admin.
begin;
insert into auth.users(id,is_anonymous) values ('11111111-1111-4111-8111-111111111111',true);
insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at)
values('11111111-1111-4111-8111-111111111111','test device','owner','active',now());
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 if public.current_device_role() <> 'owner' then raise exception 'Active owner lookup failed'; end if;
end $$;
update public.enzy_devices set status='revoked',revoked_at=now()
where auth_user_id='11111111-1111-4111-8111-111111111111';
do $$ begin
 if public.current_device_role() is not null or public.current_device_id() is not null then
 raise exception 'Revoked device authorized'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform * from public.enzy_devices; raise exception 'Unexpected device read';
 exception when insufficient_privilege then null; end;
 begin perform * from public.enzy_pairing_invites; raise exception 'Unexpected invite read';
 exception when insufficient_privilege then null; end;
 begin insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at)
 values(auth.uid(),'forged owner','owner','active',now()); raise exception 'Unexpected owner insert';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.enzy_devices; raise exception 'Unexpected anon read';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
-- Business table tests must be added once the missing blueprint/schema is reconciled.
