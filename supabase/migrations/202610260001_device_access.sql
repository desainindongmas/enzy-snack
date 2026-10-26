-- DRAFT: apply manually to disposable test project only after review. Never run automatically.
begin;
-- Fresh installation only. A legacy DB needs a separate reviewed transition.
do $$ begin
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p','v','m') and c.relname like 'enzy\_%' escape '\') then
 raise exception 'Existing Enzy schema detected; reconcile legacy data and access before migrating';
 end if;
end $$;
create table public.enzy_devices (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid not null unique references auth.users(id),
 device_label text not null check(length(device_label) between 1 and 100),
 role text check(role in ('owner','production','field')),
 status text not null default 'pending' check(status in ('pending','active','revoked')),
 paired_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now(), last_seen_at timestamptz,
 check(status <> 'active' or (role is not null and paired_at is not null and revoked_at is null)),
 check(status <> 'revoked' or revoked_at is not null)
);
create index enzy_devices_status_idx on public.enzy_devices(status);
create table public.enzy_pairing_invites (
 id uuid primary key default gen_random_uuid(), code_hash text not null unique,
 intended_role text not null check(intended_role in ('production','field')),
 device_label text not null check(length(device_label) between 1 and 100),
 created_by_device_id uuid not null references public.enzy_devices(id),
 expires_at timestamptz not null, consumed_at timestamptz,
 claimed_by_auth_user_id uuid references auth.users(id),
 failed_attempts integer not null default 0 check(failed_attempts >= 0),
 created_at timestamptz not null default now(),
 check(expires_at > created_at),
 check((consumed_at is null) = (claimed_by_auth_user_id is null))
);
create index enzy_invites_expiry_idx on public.enzy_pairing_invites(expires_at);
create table public.enzy_device_audit (
 id uuid primary key default gen_random_uuid(),
 device_id uuid references public.enzy_devices(id),
 actor_device_id uuid references public.enzy_devices(id),
 action text not null, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.enzy_devices enable row level security;
alter table public.enzy_devices force row level security;
alter table public.enzy_pairing_invites enable row level security;
alter table public.enzy_pairing_invites force row level security;
alter table public.enzy_device_audit enable row level security;
alter table public.enzy_device_audit force row level security;
revoke all on public.enzy_devices, public.enzy_pairing_invites, public.enzy_device_audit from public, anon, authenticated;
-- No client policies; no client access, including authenticated anonymous users.
create index enzy_invites_creator_idx on public.enzy_pairing_invites(created_by_device_id);
create index enzy_invites_claimed_uid_idx on public.enzy_pairing_invites(claimed_by_auth_user_id);
create index enzy_audit_device_idx on public.enzy_device_audit(device_id);
create index enzy_audit_actor_idx on public.enzy_device_audit(actor_device_id);
create index enzy_audit_created_idx on public.enzy_device_audit(created_at desc);
create function public.current_device_id() returns uuid
language sql stable security definer set search_path = '' as $$
 select id from public.enzy_devices where auth_user_id = auth.uid() and status = 'active' and revoked_at is null
$$;
create function public.current_device_role() returns text
language sql stable security definer set search_path = '' as $$
 select role from public.enzy_devices where auth_user_id = auth.uid() and status = 'active' and revoked_at is null
$$;
revoke all on function public.current_device_id(), public.current_device_role() from public, anon, authenticated;
-- Functions remain admin-only until Phase 2 policies are reviewed and tested.
create function public.enzy_audit_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Audit records are append-only'; end $$;
create trigger enzy_audit_immutable before update or delete on public.enzy_device_audit
for each row execute function public.enzy_audit_append_only();
revoke all on function public.enzy_audit_append_only() from public, anon, authenticated;
commit;
