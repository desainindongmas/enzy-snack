-- Phase 3: new owner-only master data. Existing devices/invites are preserved.
-- Apply manually to TEST after reviewing, never from build/deploy.
begin;
create table public.enzy_businesses (
 id uuid primary key default gen_random_uuid(), name text not null,
 singleton boolean not null default true unique check(singleton),
 timezone text not null default 'Asia/Jakarta',currency text not null default 'IDR'
);
insert into public.enzy_businesses(name) values('Enzy Snack');
create table public.enzy_suppliers (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.enzy_businesses(id),
 name text not null check(length(btrim(name)) between 1 and 120), phone text, address text,
 notes text check(length(notes)<=1000), is_active boolean not null default true,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by_device_id uuid not null references public.enzy_devices(id),
 unique(business_id,id)
);
create index enzy_suppliers_list_idx on public.enzy_suppliers(business_id,is_active,created_at desc,id);
create index enzy_suppliers_actor_idx on public.enzy_suppliers(created_by_device_id);
create table public.enzy_agents (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.enzy_businesses(id),
 name text not null check(length(btrim(name)) between 1 and 120), phone text, address text,
 notes text check(length(notes)<=1000), is_active boolean not null default true,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by_device_id uuid not null references public.enzy_devices(id),
 unique(business_id,id)
);
create index enzy_agents_list_idx on public.enzy_agents(business_id,is_active,created_at desc,id);
create index enzy_agents_actor_idx on public.enzy_agents(created_by_device_id);
create table public.enzy_stores (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.enzy_businesses(id),
 name text not null check(length(btrim(name)) between 1 and 120), phone text, address text,visit_interval_days integer not null default 14 check(visit_interval_days between 1 and 365),
 notes text check(length(notes)<=1000), is_active boolean not null default true,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by_device_id uuid not null references public.enzy_devices(id),
 unique(business_id,id)
);
create index enzy_stores_list_idx on public.enzy_stores(business_id,is_active,created_at desc,id);
create index enzy_stores_actor_idx on public.enzy_stores(created_by_device_id);
create table public.enzy_products (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.enzy_businesses(id),
 name text not null check(length(btrim(name)) between 1 and 120), sku_code text not null, weight_g integer not null check(weight_g between 1 and 10000), pcs_per_pack integer not null default 25 check(pcs_per_pack between 1 and 1000),
 notes text check(length(notes)<=1000), is_active boolean not null default true,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by_device_id uuid not null references public.enzy_devices(id),
 unique(business_id,id)
);
create index enzy_products_list_idx on public.enzy_products(business_id,is_active,created_at desc,id);
create index enzy_products_actor_idx on public.enzy_products(created_by_device_id);
create unique index enzy_product_code_unique on public.enzy_products(business_id,lower(sku_code));
create table public.enzy_price_agreements (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.enzy_businesses(id),
 product_id uuid not null,store_id uuid,agent_id uuid,
 channel text not null check(channel in ('direct','agent')),
 store_price_rp bigint not null check(store_price_rp between 1 and 999999999),
 enzy_share_rp bigint check(enzy_share_rp between 0 and 999999999),
 valid_from timestamptz not null,valid_to timestamptz,
 replaces_id uuid unique,change_reason text not null check(length(btrim(change_reason)) between 1 and 500),
 created_by_device_id uuid not null references public.enzy_devices(id),created_at timestamptz not null default now(),
 unique(business_id,id),
 foreign key(business_id,product_id) references public.enzy_products(business_id,id),
 foreign key(business_id,store_id) references public.enzy_stores(business_id,id),
 foreign key(business_id,agent_id) references public.enzy_agents(business_id,id),
 foreign key(business_id,replaces_id) references public.enzy_price_agreements(business_id,id),
 check(valid_to is null or valid_to>valid_from),
 check(isfinite(valid_from) and (valid_to is null or isfinite(valid_to))),
 check((channel='direct' and store_id is not null and agent_id is null and enzy_share_rp is null)
 or (channel='agent' and agent_id is not null and enzy_share_rp is not null and enzy_share_rp<=store_price_rp))
);
create index enzy_prices_scope_idx on public.enzy_price_agreements(business_id,product_id,channel,store_id,agent_id,valid_from);
create index enzy_prices_store_idx on public.enzy_price_agreements(business_id,store_id);
create index enzy_prices_agent_idx on public.enzy_price_agreements(business_id,agent_id);
create index enzy_prices_actor_idx on public.enzy_price_agreements(created_by_device_id);
create table public.enzy_master_audit (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.enzy_businesses(id),
 actor_device_id uuid not null references public.enzy_devices(id),kind text not null,entity_id uuid not null,
 action text not null,before_data jsonb,after_data jsonb,created_at timestamptz not null default now()
);
create index enzy_master_audit_business_idx on public.enzy_master_audit(business_id,created_at desc);
create index enzy_master_audit_actor_idx on public.enzy_master_audit(actor_device_id);
create trigger enzy_master_audit_immutable before update or delete on public.enzy_master_audit
for each row execute function public.enzy_audit_append_only();
create table public.enzy_master_requests (
 actor_device_id uuid not null references public.enzy_devices(id),request_id uuid not null,
 payload_hash text not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(actor_device_id,request_id)
);
do $$ declare t text;begin
 foreach t in array array['enzy_businesses','enzy_suppliers','enzy_products','enzy_agents','enzy_stores','enzy_price_agreements','enzy_master_audit','enzy_master_requests'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
-- Guard applies even to accidental direct admin writes. Only closing an open
-- interval is permitted on a prior row; prices/scope remain immutable.
create function public.enzy_price_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'Price history is immutable';end if;
 if TG_OP='UPDATE' and ((to_jsonb(NEW)-'valid_to') is distinct from (to_jsonb(OLD)-'valid_to')
 or OLD.valid_to is not null or NEW.valid_to is null or NEW.valid_to<statement_timestamp()) then
 raise exception 'Price history is immutable';end if;
 perform pg_advisory_xact_lock(hashtextextended(NEW.business_id::text||NEW.product_id::text||NEW.channel||coalesce(NEW.store_id::text,'')||coalesce(NEW.agent_id::text,''),0));
 if exists(select 1 from public.enzy_price_agreements p where p.business_id=NEW.business_id
 and p.product_id=NEW.product_id and p.channel=NEW.channel and p.store_id is not distinct from NEW.store_id
 and p.agent_id is not distinct from NEW.agent_id and p.id<>NEW.id
 and tstzrange(p.valid_from,p.valid_to,'[)') && tstzrange(NEW.valid_from,NEW.valid_to,'[)')) then
 raise exception using errcode='23P01',message='Overlapping price interval';end if;
 return NEW;
end $$;
create trigger enzy_price_immutable before insert or update or delete on public.enzy_price_agreements
for each row execute function public.enzy_price_guard();
revoke all on function public.enzy_price_guard() from public,anon,authenticated;

create function public.enzy_master_action(p_actor uuid,p_action text,p_kind text,p_ip_hash text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 d public.enzy_devices;b uuid;tbl text;rec jsonb;oldrec jsonb;newrec jsonb;answer jsonb;
 rid uuid;eid uuid;fingerprint text;previous public.enzy_master_requests;
 k text;v_count int;v_limit int;v_key text;v_window timestamptz:=date_trunc('minute',clock_timestamp());
 v_page int;v_search text;v_archived boolean;v_total bigint;rows_json jsonb;
 v_from timestamptz;v_to timestamptz;v_old_price public.enzy_price_agreements;
 v_product uuid;v_store uuid;v_agent uuid;v_channel text;v_old_id uuid;cols text;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then return jsonb_build_object('error','UNAUTHORIZED');end if;
 if p_action is null or p_action not in ('list','save','archive','price') or p_kind is null
 or p_kind not in ('suppliers','products','stores','agents','prices')
 or jsonb_typeof(p_payload) is distinct from 'object' or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
 return jsonb_build_object('error','INVALID_REQUEST');end if;
 foreach v_key in array array['global:master','ip:master:'||p_ip_hash,'uid:master:'||p_actor::text] loop
 v_limit:=case when v_key like 'global:%' then 1000 when v_key like 'ip:%' then 150 else 60 end;
 insert into public.enzy_pairing_limits(bucket,window_start,attempts) values(v_key,v_window,1)
 on conflict(bucket,window_start) do update set attempts=enzy_pairing_limits.attempts+1 returning attempts into v_count;
 if v_count>v_limit then return jsonb_build_object('error','RATE_LIMITED');end if;
 end loop;
 select * into d from public.enzy_devices where auth_user_id=p_actor for share;
 if d.id is null or d.role is distinct from 'owner' or d.status is distinct from 'active' or d.revoked_at is not null then return jsonb_build_object('error','FORBIDDEN');end if;
 select id into b from public.enzy_businesses where singleton;
 if b is null then return jsonb_build_object('error','SETUP_REQUIRED');end if;
 tbl:=case p_kind when 'prices' then 'enzy_price_agreements' else 'enzy_'||p_kind end;
 begin
 if p_action='list' then
 v_page:=coalesce((p_payload->>'page')::int,1);v_search:=coalesce(p_payload->>'search','');v_archived:=coalesce((p_payload->>'include_archived')::boolean,false);
 if v_page not between 1 and 10000 or length(v_search)>120 then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if p_kind='prices' then
 select count(*) into v_total from public.enzy_price_agreements where business_id=b;
 select coalesce(jsonb_agg(x.data),'[]'::jsonb) into rows_json from (
 select to_jsonb(p)||jsonb_build_object('product_name',pr.name,'sku_code',pr.sku_code,'store_name',s.name,'agent_name',a.name) data
 from public.enzy_price_agreements p join public.enzy_products pr on pr.business_id=p.business_id and pr.id=p.product_id
 left join public.enzy_stores s on s.business_id=p.business_id and s.id=p.store_id
 left join public.enzy_agents a on a.business_id=p.business_id and a.id=p.agent_id
 where p.business_id=b order by p.valid_from desc,p.id limit 20 offset (v_page-1)*20) x;
 else
 execute format('select count(*) from public.%I where business_id=$1 and ($2 or is_active) and name ilike $3',tbl) into v_total using b,v_archived,'%'||v_search||'%';
 execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from (select * from public.%I where business_id=$1 and ($2 or is_active) and name ilike $3 order by created_at desc,id limit 20 offset $4) x',tbl)
 into rows_json using b,v_archived,'%'||v_search||'%',(v_page-1)*20;
 end if;
 return jsonb_build_object('records',rows_json,'count',v_total,'page',v_page);
 end if;
 if coalesce(p_payload->>'request_id','') !~ '^[0-9a-fA-F-]{36}$' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 rid:=(p_payload->>'request_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(d.id::text||rid::text,0));
 fingerprint:=encode(sha256(convert_to(p_action||p_kind||p_payload::text,'UTF8')),'hex');
 select * into previous from public.enzy_master_requests where actor_device_id=d.id and request_id=rid;
 if previous.request_id is not null then
 if previous.payload_hash<>fingerprint then return jsonb_build_object('error','CONFLICT');end if;
 return previous.result||jsonb_build_object('replayed',true);end if;
 rec:=p_payload->'record';
 if jsonb_typeof(rec) is distinct from 'object' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if p_action='price' then
 if p_kind<>'prices' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 for k in select jsonb_object_keys(rec) loop
 if k not in ('product_id','store_id','agent_id','channel','store_price_rp','enzy_share_rp','valid_from','valid_to','replaces_id','change_reason') then return jsonb_build_object('error','INVALID_REQUEST');end if;end loop;
 v_product:=(rec->>'product_id')::uuid;v_store:=nullif(rec->>'store_id','')::uuid;v_agent:=nullif(rec->>'agent_id','')::uuid;v_channel:=rec->>'channel';v_old_id:=nullif(rec->>'replaces_id','')::uuid;
 if not exists(select 1 from public.enzy_products where id=v_product and business_id=b and is_active)
 or (v_store is not null and not exists(select 1 from public.enzy_stores where id=v_store and business_id=b and is_active))
 or (v_agent is not null and not exists(select 1 from public.enzy_agents where id=v_agent and business_id=b and is_active)) then return jsonb_build_object('error','INVALID_REFERENCE');end if;
 if coalesce(rec->>'store_price_rp','') !~ '^[0-9]{1,9}$' or (rec->>'enzy_share_rp' is not null and rec->>'enzy_share_rp' !~ '^[0-9]{1,9}$') then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if v_channel is null or v_channel not in ('direct','agent') or (rec->>'store_price_rp')::bigint<1
 or (v_channel='direct' and (v_store is null or v_agent is not null or rec->>'enzy_share_rp' is not null))
 or (v_channel='agent' and (v_agent is null or rec->>'enzy_share_rp' is null or (rec->>'enzy_share_rp')::bigint>(rec->>'store_price_rp')::bigint)) then return jsonb_build_object('error','INVALID_REQUEST');end if;
 v_from:=coalesce(nullif(rec->>'valid_from','')::timestamptz,clock_timestamp());v_to:=nullif(rec->>'valid_to','')::timestamptz;
 if not isfinite(v_from) or (v_to is not null and not isfinite(v_to)) then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if v_to is not null and v_to<=v_from then return jsonb_build_object('error','INVALID_REQUEST');end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text||v_product::text||coalesce(v_channel,'')||coalesce(v_store::text,'')||coalesce(v_agent::text,''),0));
 if v_old_id is not null then
 select * into v_old_price from public.enzy_price_agreements where id=v_old_id and business_id=b for update;
 if v_old_price.id is null or v_old_price.valid_to is not null or v_old_price.product_id<>v_product or v_old_price.channel is distinct from v_channel
 or v_old_price.store_id is distinct from v_store or v_old_price.agent_id is distinct from v_agent
 or v_from<=v_old_price.valid_from or v_from<statement_timestamp() then return jsonb_build_object('error','CONFLICT');end if;
 oldrec:=to_jsonb(v_old_price);
 update public.enzy_price_agreements set valid_to=v_from where id=v_old_id and business_id=b;
 end if;
 insert into public.enzy_price_agreements(business_id,product_id,store_id,agent_id,channel,store_price_rp,enzy_share_rp,valid_from,valid_to,replaces_id,change_reason,created_by_device_id)
 values(b,v_product,v_store,v_agent,v_channel,(rec->>'store_price_rp')::bigint,(rec->>'enzy_share_rp')::bigint,v_from,v_to,v_old_id,btrim(rec->>'change_reason'),d.id)
 returning to_jsonb(enzy_price_agreements) into newrec;
 else
 if p_kind='prices' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 for k in select jsonb_object_keys(rec) loop
 if not (k=any(case when p_action='archive' then array['id','version'] when p_kind='products' then array['id','version','name','notes','sku_code','weight_g','pcs_per_pack']
 when p_kind='stores' then array['id','version','name','notes','phone','address','visit_interval_days'] else array['id','version','name','notes','phone','address'] end)) then return jsonb_build_object('error','INVALID_REQUEST');end if;end loop;
 eid:=nullif(rec->>'id','')::uuid;
 if eid is not null then
 execute format('select to_jsonb(t) from public.%I t where id=$1 and business_id=$2 for update',tbl) into oldrec using eid,b;
 if oldrec is null then return jsonb_build_object('error','NOT_FOUND');end if;
 if (rec->>'version')::int is distinct from (oldrec->>'version')::int then return jsonb_build_object('error','CONFLICT');end if;
 newrec:=oldrec;
 else
 if p_action='archive' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 eid:=gen_random_uuid();newrec:=jsonb_build_object('id',eid,'business_id',b,'is_active',true,'version',0,'created_at',clock_timestamp(),'created_by_device_id',d.id,'pcs_per_pack',25,'visit_interval_days',14);
 end if;
 if p_action='archive' then
 newrec:=newrec||jsonb_build_object('is_active',false);
 else
 newrec:=newrec||(rec-'id'-'version');
 newrec:=newrec||jsonb_build_object('name',btrim(newrec->>'name'),'notes',nullif(btrim(newrec->>'notes'),''));
 if p_kind='products' then
 if coalesce(newrec->>'sku_code','') !~ '^[A-Za-z0-9_-]{1,40}$' or coalesce(newrec->>'weight_g','') !~ '^[0-9]{1,5}$' or coalesce(newrec->>'pcs_per_pack','') !~ '^[0-9]{1,4}$' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 newrec:=newrec||jsonb_build_object('sku_code',upper(newrec->>'sku_code'));
 else
 if length(coalesce(newrec->>'phone',''))>40 or length(coalesce(newrec->>'address',''))>500 then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if p_kind='stores' and coalesce(newrec->>'visit_interval_days','') !~ '^[0-9]{1,3}$' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 end if;
 end if;
 newrec:=newrec||jsonb_build_object('version',(newrec->>'version')::int+1,'updated_at',clock_timestamp());
 cols:=case when p_kind='products' then 'name,notes,sku_code,weight_g,pcs_per_pack,is_active,version,updated_at'
 when p_kind='stores' then 'name,notes,phone,address,visit_interval_days,is_active,version,updated_at'
 else 'name,notes,phone,address,is_active,version,updated_at' end;
 if oldrec is null then
 execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).* returning to_jsonb(%I)',tbl,tbl,tbl) into newrec using newrec;
 else
 execute format('update public.%I set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1)) where id=$2 and business_id=$3 returning to_jsonb(%I)',tbl,cols,cols,tbl,tbl) into newrec using newrec,eid,b;
 end if;
 end if;
 insert into public.enzy_master_audit(business_id,actor_device_id,kind,entity_id,action,before_data,after_data)
 values(b,d.id,p_kind,(newrec->>'id')::uuid,p_action,oldrec,newrec);
 answer:=jsonb_build_object('ok',true,'record',newrec);
 insert into public.enzy_master_requests(actor_device_id,request_id,payload_hash,result) values(d.id,rid,fingerprint,answer);
 return answer;
 exception
 when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range or not_null_violation or check_violation then return jsonb_build_object('error','INVALID_REQUEST');
 when unique_violation or exclusion_violation then return jsonb_build_object('error','CONFLICT');
 when foreign_key_violation then return jsonb_build_object('error','INVALID_REFERENCE');
 end;
end $$;
revoke all on function public.enzy_master_action(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enzy_master_action(uuid,text,text,text,jsonb) to service_role;
commit;
