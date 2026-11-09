-- Phase 5. Apply manually after Phase 4. No fixture, cash or opening stock.
begin;
-- Posting order is the actual insert time, including multi-action transactions.
alter table public.enzy_inventory_operations alter column created_at set default clock_timestamp();
alter table public.enzy_stock_locations drop constraint enzy_stock_locations_kind_check;
alter table public.enzy_stock_locations add constraint enzy_stock_locations_kind_check check(kind in ('raw_warehouse','finished_warehouse','field_custody','agent_custody','return_quarantine','store_consignment'));
alter table public.enzy_stock_locations add column store_id uuid;
alter table public.enzy_stock_locations add constraint enzy_location_store_fk foreign key(business_id,store_id) references public.enzy_stores(business_id,id);
-- Replace generated shape check (its generated name depends on PostgreSQL).
do $$declare r record;begin for r in select conname from pg_constraint where conrelid='public.enzy_stock_locations'::regclass and contype='c' and pg_get_constraintdef(oid) like '%device_id%' loop execute format('alter table public.enzy_stock_locations drop constraint %I',r.conname);end loop;end$$;
alter table public.enzy_stock_locations add constraint enzy_location_shape check(
 (kind='field_custody' and device_id is not null and agent_id is null and store_id is null) or
 (kind='agent_custody' and agent_id is not null and device_id is null and store_id is null) or
 (kind='store_consignment' and store_id is not null and device_id is null and agent_id is null) or
 (kind in ('raw_warehouse','finished_warehouse','return_quarantine') and device_id is null and agent_id is null and store_id is null));
create unique index enzy_location_store_unique on public.enzy_stock_locations(business_id,store_id) where store_id is not null;
alter table public.enzy_inventory_operations drop constraint enzy_inventory_operations_kind_check;
alter table public.enzy_inventory_operations add constraint enzy_inventory_operations_kind_check check(kind in ('purchase','production','transfer','reversal','visit'));
create table public.enzy_store_assignments(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,store_id uuid not null,field_device_id uuid references public.enzy_devices(id),
 channel text not null check(channel in ('direct','agent')),agent_id uuid,agent_name_snapshot text,
 reason text not null check(length(btrim(reason)) between 1 and 500),created_by_device_id uuid not null references public.enzy_devices(id),created_at timestamptz not null default now(),
 unique(business_id,id),foreign key(business_id,store_id) references public.enzy_stores(business_id,id),foreign key(business_id,agent_id) references public.enzy_agents(business_id,id),
 check((channel='direct' and agent_id is null) or(channel='agent' and agent_id is not null)));
create index enzy_assign_store_idx on public.enzy_store_assignments(business_id,store_id,created_at desc);
create index enzy_assign_field_idx on public.enzy_store_assignments(field_device_id);
create index enzy_assign_agent_idx on public.enzy_store_assignments(business_id,agent_id);
create index enzy_assign_actor_idx on public.enzy_store_assignments(created_by_device_id);
create table public.enzy_visits(
 operation_id uuid primary key,business_id uuid not null,store_id uuid not null,store_name_snapshot text not null,assignment_id uuid not null,
 previous_visit_id uuid,closed_cycle_id uuid,occurred_at timestamptz not null,reason text not null,
 gross_sales_rp bigint not null check(gross_sales_rp>=0),enzy_due_rp bigint not null check(enzy_due_rp>=0),commission_earned_rp bigint not null check(commission_earned_rp>=0),
 unique(business_id,operation_id),foreign key(business_id,operation_id) references public.enzy_inventory_operations(business_id,id),
 foreign key(business_id,store_id) references public.enzy_stores(business_id,id),foreign key(business_id,assignment_id) references public.enzy_store_assignments(business_id,id),
 foreign key(business_id,previous_visit_id) references public.enzy_visits(business_id,operation_id),check(gross_sales_rp=enzy_due_rp+commission_earned_rp));
create index enzy_visit_store_idx on public.enzy_visits(business_id,store_id,occurred_at desc);
create index enzy_visit_assignment_idx on public.enzy_visits(business_id,assignment_id);
create index enzy_visit_previous_idx on public.enzy_visits(business_id,previous_visit_id);
create table public.enzy_consignment_cycles(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,store_id uuid not null,opening_visit_id uuid not null unique,
 assignment_id uuid not null,channel text not null,agent_id uuid,created_at timestamptz not null default now(),
 unique(business_id,id),foreign key(business_id,store_id) references public.enzy_stores(business_id,id),
 foreign key(business_id,opening_visit_id) references public.enzy_visits(business_id,operation_id),foreign key(business_id,assignment_id) references public.enzy_store_assignments(business_id,id),
 foreign key(business_id,agent_id) references public.enzy_agents(business_id,id));
alter table public.enzy_visits add constraint enzy_visit_closed_fk foreign key(business_id,closed_cycle_id) references public.enzy_consignment_cycles(business_id,id);
create index enzy_visit_closed_idx on public.enzy_visits(business_id,closed_cycle_id);
create index enzy_cycle_store_idx on public.enzy_consignment_cycles(business_id,store_id);
create index enzy_cycle_assignment_idx on public.enzy_consignment_cycles(business_id,assignment_id);
create index enzy_cycle_agent_idx on public.enzy_consignment_cycles(business_id,agent_id);
create table public.enzy_consignment_lines(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,cycle_id uuid not null,lot_id uuid not null,source_location_id uuid not null,
 product_name_snapshot text not null,sku_code_snapshot text not null,lot_code_snapshot text not null,expiry_date date,
 quantity bigint not null check(quantity between 1 and 1000000),price_id uuid not null,store_price_rp bigint not null check(store_price_rp>0),enzy_share_rp bigint not null check(enzy_share_rp>=0 and enzy_share_rp<=store_price_rp),
 unique(business_id,id),unique(cycle_id,lot_id),foreign key(business_id,cycle_id) references public.enzy_consignment_cycles(business_id,id),
 foreign key(business_id,lot_id) references public.enzy_inventory_lots(business_id,id),foreign key(business_id,source_location_id) references public.enzy_stock_locations(business_id,id),foreign key(business_id,price_id) references public.enzy_price_agreements(business_id,id));
create index enzy_consign_lot_idx on public.enzy_consignment_lines(business_id,lot_id);
create index enzy_consign_source_idx on public.enzy_consignment_lines(business_id,source_location_id);
create index enzy_consign_price_idx on public.enzy_consignment_lines(business_id,price_id);
create table public.enzy_visit_results(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,visit_id uuid not null,line_id uuid not null,
 sold bigint not null check(sold>=0),returned_good bigint not null check(returned_good>=0),returned_damaged bigint not null check(returned_damaged>=0),returned_expired bigint not null check(returned_expired>=0),lost bigint not null check(lost>=0),
 unique(visit_id,line_id),unique(business_id,id),foreign key(business_id,visit_id) references public.enzy_visits(business_id,operation_id),foreign key(business_id,line_id) references public.enzy_consignment_lines(business_id,id));
create index enzy_result_line_idx on public.enzy_visit_results(business_id,line_id);
create table public.enzy_return_inspections(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,result_id uuid not null unique,actor_device_id uuid not null references public.enzy_devices(id),
 note text not null check(length(btrim(note)) between 1 and 500),disposition text not null default 'inspected_hold' check(disposition='inspected_hold'),created_at timestamptz not null default now(),
 foreign key(business_id,result_id) references public.enzy_visit_results(business_id,id));
create index enzy_inspection_actor_idx on public.enzy_return_inspections(actor_device_id);
create table public.enzy_store_state(
 business_id uuid not null,store_id uuid not null,current_assignment_id uuid,current_cycle_id uuid,last_visit_id uuid,version bigint not null default 1 check(version>0),primary key(business_id,store_id),
 foreign key(business_id,store_id) references public.enzy_stores(business_id,id),foreign key(business_id,current_assignment_id) references public.enzy_store_assignments(business_id,id),
 foreign key(business_id,current_cycle_id) references public.enzy_consignment_cycles(business_id,id),foreign key(business_id,last_visit_id) references public.enzy_visits(business_id,operation_id));
create index enzy_state_assignment_idx on public.enzy_store_state(business_id,current_assignment_id);
create index enzy_state_cycle_idx on public.enzy_store_state(business_id,current_cycle_id);
create index enzy_state_visit_idx on public.enzy_store_state(business_id,last_visit_id);
create table public.enzy_visit_requests(actor_device_id uuid not null references public.enzy_devices(id),request_id uuid not null,payload_hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_device_id,request_id));
do $$declare t text;begin foreach t in array array['enzy_store_assignments','enzy_visits','enzy_consignment_cycles','enzy_consignment_lines','enzy_visit_results','enzy_return_inspections','enzy_store_state','enzy_visit_requests'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);
 if t not in ('enzy_store_state','enzy_visit_requests') then execute format('create trigger %I before update or delete on public.%I for each row execute function public.enzy_audit_append_only()',t||'_immutable',t);end if;
end loop;end$$;
-- Shared validation and pricing for preview/post. Never trusts client prices,
-- actor, calculated sales, commission, return totals or remaining stock.
create function enzy_private.visit_plan(b uuid,d public.enzy_devices,rec jsonb,posting boolean)
returns jsonb language plpgsql set search_path='' as $$
declare s public.enzy_stores;st public.enzy_store_state;a public.enzy_store_assignments;l public.enzy_consignment_lines;lot public.enzy_inventory_lots;loc public.enzy_stock_locations;p public.enzy_price_agreements;
 k text;item jsonb;drops jsonb:=coalesce(rec->'drops','[]'::jsonb);results jsonb:=coalesce(rec->'results','[]'::jsonb);lines jsonb:='[]';closed jsonb:='[]';when_at timestamptz;
 n bigint;sold bigint;good bigint;damaged bigint;expired bigint;lost bigint;gross bigint:=0;due bigint:=0;oldcount int;
begin
 if jsonb_typeof(rec) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 for k in select jsonb_object_keys(rec) loop if k not in ('store_id','expected_version','occurred_at','reason','drops','results') then raise exception 'INVALID_REQUEST';end if;end loop;
 select * into s from public.enzy_stores where business_id=b and id=(rec->>'store_id')::uuid for share;
 select * into st from public.enzy_store_state where business_id=b and store_id=s.id;
 select * into a from public.enzy_store_assignments where business_id=b and id=st.current_assignment_id;
 if s.id is null or a.id is null then raise exception 'ASSIGNMENT_REQUIRED';end if;
 if d.role<>'owner' and (d.role<>'field' or a.field_device_id is distinct from d.id) then raise exception 'FORBIDDEN';end if;
 if enzy_private.stock_int(rec,'expected_version',false,1000000000,1)<>st.version then raise exception 'CONFLICT';end if;
 if length(btrim(coalesce(rec->>'reason',''))) not between 1 and 500 then raise exception 'INVALID_REQUEST';end if;
 if nullif(rec->>'occurred_at','') is not null and rec->>'occurred_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'INVALID_REQUEST';end if;
 when_at:=coalesce(nullif(rec->>'occurred_at','')::timestamptz,clock_timestamp());
 if not isfinite(when_at) or when_at>clock_timestamp()+interval '5 minutes' or when_at<a.created_at or exists(select 1 from public.enzy_visits where operation_id=st.last_visit_id and occurred_at>when_at) then raise exception 'INVALID_REQUEST';end if;
 if jsonb_typeof(drops)<>'array' or jsonb_typeof(results)<>'array' then raise exception 'INVALID_REQUEST';end if;
 if jsonb_array_length(drops)>20 or jsonb_array_length(results)>20 then raise exception 'INVALID_REQUEST';end if;
 if jsonb_array_length(drops)=0 and st.current_cycle_id is null then raise exception 'INVALID_REQUEST';end if;
 if jsonb_array_length(drops)>0 and (not s.is_active or (a.agent_id is not null and not exists(select 1 from public.enzy_agents where id=a.agent_id and business_id=b and is_active))) then raise exception 'INVALID_REFERENCE';end if;
 select count(*) into oldcount from public.enzy_consignment_lines where business_id=b and cycle_id=st.current_cycle_id;
 if oldcount<>jsonb_array_length(results) or (select count(*)<>count(distinct value->>'line_id') from jsonb_array_elements(results)) then raise exception 'VISIT_RECONCILIATION';end if;
 for item in select value from jsonb_array_elements(results) loop
 if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) x where x not in ('line_id','sold','returned_good','returned_damaged','returned_expired','lost')) then raise exception 'INVALID_REQUEST';end if;
 select * into l from public.enzy_consignment_lines where business_id=b and cycle_id=st.current_cycle_id and id=(item->>'line_id')::uuid;
 if l.id is null then raise exception 'INVALID_REFERENCE';end if;
 sold:=enzy_private.stock_int(item,'sold',false,1000000);good:=enzy_private.stock_int(item,'returned_good',false,1000000);damaged:=enzy_private.stock_int(item,'returned_damaged',false,1000000);expired:=enzy_private.stock_int(item,'returned_expired',false,1000000);lost:=enzy_private.stock_int(item,'lost',false,1000000);
 if sold+good+damaged+expired+lost<>l.quantity then raise exception 'VISIT_RECONCILIATION';end if;
 gross:=gross+sold*l.store_price_rp;due:=due+sold*l.enzy_share_rp;
 closed:=closed||jsonb_build_array(item||jsonb_build_object('lot_id',l.lot_id,'quantity',l.quantity,'product_name',l.product_name_snapshot,'lot_code',l.lot_code_snapshot,'store_price_rp',l.store_price_rp::text));
 end loop;
 if (select count(*)<>count(distinct value->>'lot_id') from jsonb_array_elements(drops)) then raise exception 'INVALID_REQUEST';end if;
 for item in select value from jsonb_array_elements(drops) loop
 if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) x where x not in ('lot_id','source_location_id','quantity','price_id')) then raise exception 'INVALID_REQUEST';end if;
 n:=enzy_private.stock_int(item,'quantity',false,1000000,1);
 select * into lot from public.enzy_inventory_lots where id=(item->>'lot_id')::uuid and business_id=b and kind='finished';
 select * into loc from public.enzy_stock_locations where id=(item->>'source_location_id')::uuid and business_id=b;
 if lot.id is null or loc.id is null or loc.kind not in ('finished_warehouse','field_custody','agent_custody') then raise exception 'INVALID_REFERENCE';end if;
 if d.role='field' and (loc.kind<>'field_custody' or loc.device_id is distinct from d.id) then raise exception 'FORBIDDEN';end if;
 if loc.kind='agent_custody' and (a.channel<>'agent' or a.agent_id is distinct from loc.agent_id) then raise exception 'INVALID_REFERENCE';end if;
 if loc.kind='field_custody' and not exists(select 1 from public.enzy_devices where id=loc.device_id and role='field' and status='active' and revoked_at is null) then raise exception 'INVALID_REFERENCE';end if;
 if lot.expiry_date is not null and lot.expiry_date<(greatest(when_at,clock_timestamp()) at time zone 'Asia/Jakarta')::date then raise exception 'EXPIRED_LOT';end if;
 if exists(select 1 from public.enzy_inventory_operations where id=lot.production_batch_id and occurred_at>when_at) then raise exception 'INVALID_REQUEST';end if;
 if coalesce((select quantity from public.enzy_inventory_balances where business_id=b and location_id=loc.id and lot_id=lot.id),0)<n then raise exception 'INSUFFICIENT_STOCK';end if;
 select * into p from public.enzy_price_agreements where business_id=b and product_id=lot.product_id and channel=a.channel
 and ((a.channel='direct' and store_id=s.id and agent_id is null) or(a.channel='agent' and agent_id=a.agent_id and (store_id=s.id or store_id is null)))
 and valid_from<=when_at and (valid_to is null or when_at<valid_to) order by (store_id is not null) desc limit 1 for share;
 if p.id is null then raise exception 'PRICE_REQUIRED';end if;
 if posting and (item->>'price_id')::uuid is distinct from p.id then raise exception 'PRICE_CHANGED';end if;
 lines:=lines||jsonb_build_array(jsonb_build_object('lot_id',lot.id,'source_location_id',loc.id,'quantity',n,'price_id',p.id,'product_name',lot.product_name_snapshot,'sku_code',lot.sku_code_snapshot,'lot_code',lot.lot_code,'expiry_date',lot.expiry_date,'store_price_rp',p.store_price_rp::text,'enzy_share_rp',coalesce(p.enzy_share_rp,p.store_price_rp)::text));
 end loop;
 return jsonb_build_object('store_id',s.id,'store_name',s.name,'assignment_id',a.id,'channel',a.channel,'agent_id',a.agent_id,'previous_visit_id',st.last_visit_id,'closed_cycle_id',st.current_cycle_id,'expected_version',st.version,'occurred_at',when_at,'reason',btrim(rec->>'reason'),'drops',lines,'results',closed,'gross_sales_rp',gross::text,'enzy_due_rp',due::text,'commission_earned_rp',(gross-due)::text);
end$$;
revoke all on function enzy_private.visit_plan(uuid,public.enzy_devices,jsonb,boolean) from public,anon,authenticated,service_role;
create function enzy_private.visit_read(b uuid,d public.enzy_devices,p jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare k text:=p->>'kind';q text:='%'||coalesce(p->>'search','')||'%';page_n int:=coalesce((p->>'page')::int,1);sid uuid:=(p->>'store_id')::uuid;answer jsonb;base text;
begin
 if page_n not between 1 and 10000 or length(q)>122 then raise exception 'INVALID_REQUEST';end if;
 if k='detail' then
 if not exists(select 1 from public.enzy_stores s left join public.enzy_store_state st on st.business_id=s.business_id and st.store_id=s.id left join public.enzy_store_assignments a on a.business_id=st.business_id and a.id=st.current_assignment_id where s.id=sid and s.business_id=b and (d.role='owner' or a.field_device_id=d.id)) then raise exception 'FORBIDDEN';end if;
 select jsonb_build_object('store_id',s.id,'store_name',s.name,'version',coalesce(st.version,1),'assignment_id',a.id,'channel',a.channel,'agent_id',a.agent_id,'field_device_id',a.field_device_id,'cycle_id',st.current_cycle_id,'last_visit_id',st.last_visit_id,'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'lot_id',l.lot_id,'product_name',l.product_name_snapshot,'lot_code',l.lot_code_snapshot,'quantity',l.quantity,'expiry_date',l.expiry_date,'store_price_rp',l.store_price_rp::text)||case when d.role='owner' then jsonb_build_object('enzy_share_rp',l.enzy_share_rp::text) else '{}'::jsonb end order by l.id) from public.enzy_consignment_lines l where l.business_id=b and l.cycle_id=st.current_cycle_id),'[]'::jsonb)) into answer from public.enzy_stores s left join public.enzy_store_state st on st.business_id=s.business_id and st.store_id=s.id left join public.enzy_store_assignments a on a.business_id=st.business_id and a.id=st.current_assignment_id where s.id=sid and s.business_id=b;
 return answer;
 elsif k='stores' then
 base:=$q$select jsonb_build_object('id',s.id,'name',s.name,'address',s.address,'is_active',s.is_active,'version',coalesce(st.version,1),'assignment_id',a.id,'field_device_id',a.field_device_id,'field_name',d2.device_label,'channel',a.channel,'agent_name',a.agent_name_snapshot,'agent_id',a.agent_id,'cycle_id',st.current_cycle_id,'last_visit_id',st.last_visit_id,'last_visit_at',v.occurred_at,'due_at',v.occurred_at+s.visit_interval_days*interval '1 day') data,s.created_at sort_at,s.id sort_id
 from public.enzy_stores s left join public.enzy_store_state st on st.business_id=s.business_id and st.store_id=s.id left join public.enzy_store_assignments a on a.business_id=st.business_id and a.id=st.current_assignment_id left join public.enzy_devices d2 on d2.id=a.field_device_id left join public.enzy_visits v on v.operation_id=st.last_visit_id
 where s.business_id=$1 and s.name ilike $3 and ($2='owner' or a.field_device_id=$4)$q$;
 elsif k='visits' then
 base:=$q$select jsonb_build_object('id',v.operation_id,'store_id',v.store_id,'store_name',v.store_name_snapshot,'occurred_at',v.occurred_at,'reason',v.reason,'gross_sales_rp',v.gross_sales_rp::text,'closed_cycle_id',v.closed_cycle_id,'reversed',exists(select 1 from public.enzy_inventory_operations r where r.reverse_of=v.operation_id),'sold',coalesce((select sum(sold) from public.enzy_visit_results where visit_id=v.operation_id),0),'returned',coalesce((select sum(returned_good+returned_damaged+returned_expired) from public.enzy_visit_results where visit_id=v.operation_id),0),'lost',coalesce((select sum(lost) from public.enzy_visit_results where visit_id=v.operation_id),0))||case when $2='owner' then jsonb_build_object('enzy_due_rp',v.enzy_due_rp::text,'commission_earned_rp',v.commission_earned_rp::text) else '{}'::jsonb end data,o.created_at sort_at,v.operation_id sort_id
 from public.enzy_visits v join public.enzy_inventory_operations o on o.id=v.operation_id left join public.enzy_store_state st on st.business_id=v.business_id and st.store_id=v.store_id left join public.enzy_store_assignments a on a.business_id=st.business_id and a.id=st.current_assignment_id
 where v.business_id=$1 and v.store_name_snapshot ilike $3 and ($5 is null or v.store_id=$5) and ($2='owner' or a.field_device_id=$4)$q$;
 elsif k='returns' then
 if d.role<>'owner' then raise exception 'FORBIDDEN';end if;
 base:=$q$select jsonb_build_object('id',r.id,'visit_id',v.operation_id,'store_name',v.store_name_snapshot,'product_name',l.product_name_snapshot,'lot_code',l.lot_code_snapshot,'returned_good',r.returned_good,'returned_damaged',r.returned_damaged,'returned_expired',r.returned_expired,'lost',r.lost,'inspected',i.id is not null,'inspection_note',i.note,'disposition',i.disposition,'reversed',exists(select 1 from public.enzy_inventory_operations rev where rev.reverse_of=v.operation_id)) data,o.created_at sort_at,r.id sort_id
 from public.enzy_visit_results r join public.enzy_visits v on v.operation_id=r.visit_id join public.enzy_inventory_operations o on o.id=v.operation_id join public.enzy_consignment_lines l on l.id=r.line_id left join public.enzy_return_inspections i on i.result_id=r.id
 where r.business_id=$1 and r.returned_good+r.returned_damaged+r.returned_expired>0 and (v.store_name_snapshot ilike $3 or l.lot_code_snapshot ilike $3)$q$;
 else raise exception 'INVALID_REQUEST';end if;
 execute 'with visible as ('||base||'),paged as (select * from visible order by sort_at desc,sort_id limit 20 offset $6) select jsonb_build_object(''records'',coalesce((select jsonb_agg(data) from paged),''[]''::jsonb),''count'',(select count(*) from visible),''page'',$7)' into answer using b,d.role,q,d.id,sid,(page_n-1)*20,page_n;
 return answer;
end$$;
revoke all on function enzy_private.visit_read(uuid,public.enzy_devices,jsonb) from public,anon,authenticated,service_role;
create function public.enzy_visit_action(p_actor uuid,p_action text,p_ip_hash text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.enzy_devices;b uuid;rid uuid;fingerprint text;previous public.enzy_visit_requests;rec jsonb;plan jsonb;answer jsonb;item jsonb;k text;
 st public.enzy_store_state;a public.enzy_store_assignments;agent public.enzy_agents;device public.enzy_devices;v public.enzy_visits;r public.enzy_visit_results;m public.enzy_stock_movements;
 op uuid;cycle uuid;store_loc uuid;quarantine uuid;sid uuid;assignment uuid;key_name text;attempts_n int;window_at timestamptz:=date_trunc('minute',clock_timestamp());
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then return jsonb_build_object('error','UNAUTHORIZED');end if;
 if p_action is null or p_action not in ('list','preview','post','assign','inspect','reverse') or jsonb_typeof(p_payload) is distinct from 'object' or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 foreach key_name in array array['global:visit','ip:visit:'||p_ip_hash,'uid:visit:'||p_actor::text] loop
 insert into public.enzy_pairing_limits(bucket,window_start,attempts) values(key_name,window_at,1) on conflict(bucket,window_start) do update set attempts=enzy_pairing_limits.attempts+1 returning attempts into attempts_n;
 if attempts_n>(case when key_name like 'global:%' then 3000 when key_name like 'ip:%' then 300 else 100 end) then return jsonb_build_object('error','RATE_LIMITED');end if;
 end loop;
 select * into d from public.enzy_devices where auth_user_id=p_actor for share;
 if d.id is null or d.status is distinct from 'active' or d.revoked_at is not null or d.role not in ('owner','field') then return jsonb_build_object('error','FORBIDDEN');end if;
 select id into b from public.enzy_businesses where singleton;
 if b is null then return jsonb_build_object('error','SETUP_REQUIRED');end if;
 begin
 if p_action='list' then return enzy_private.visit_read(b,d,p_payload);end if;
 if p_action in ('assign','inspect','reverse') and d.role<>'owner' then return jsonb_build_object('error','FORBIDDEN');end if;
 rec:=p_payload->'record';if jsonb_typeof(rec) is distinct from 'object' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 -- Same lock as Phase 4: visits and ordinary stock posts cannot overspend a bucket.
 perform pg_advisory_xact_lock(hashtextextended('inventory:'||b::text,0));
 if p_action<>'preview' then
 rid:=(p_payload->>'request_id')::uuid;if rid is null then return jsonb_build_object('error','INVALID_REQUEST');end if;
 fingerprint:=encode(sha256(convert_to(p_action||p_payload::text,'UTF8')),'hex');
 select * into previous from public.enzy_visit_requests where actor_device_id=d.id and request_id=rid;
 if previous.request_id is not null then
 if previous.payload_hash<>fingerprint then return jsonb_build_object('error','CONFLICT');end if;
 -- Reassignment removes even receipt replay access from the previous field device.
 if d.role='field' and not exists(select 1 from public.enzy_store_state ss join public.enzy_store_assignments aa on aa.business_id=ss.business_id and aa.id=ss.current_assignment_id where ss.business_id=b and ss.store_id=(previous.result->>'store_id')::uuid and aa.field_device_id=d.id) then return jsonb_build_object('error','FORBIDDEN');end if;
 -- Receipt deliberately contains no monetary fields across later role changes.
 return previous.result||jsonb_build_object('replayed',true);end if;
 end if;
 if p_action in ('preview','post') then
 plan:=enzy_private.visit_plan(b,d,rec,p_action='post');
 if p_action='preview' then
 if d.role<>'owner' then
 plan:=plan-'enzy_due_rp'-'commission_earned_rp';select coalesce(jsonb_agg(value-'enzy_share_rp'),'[]') into item from jsonb_array_elements(plan->'drops');plan:=jsonb_set(plan,'{drops}',item);end if;
 return plan;
 end if;
 sid:=(plan->>'store_id')::uuid;
 insert into public.enzy_stock_locations(business_id,label,kind,store_id,created_by_device_id)
 select b,'Titipan · '||left(plan->>'store_name',80),'store_consignment',sid,d.id where not exists(select 1 from public.enzy_stock_locations where business_id=b and store_id=sid);
 select id into store_loc from public.enzy_stock_locations where business_id=b and store_id=sid;
 select id into quarantine from public.enzy_stock_locations where business_id=b and system_key='quarantine';
 op:=gen_random_uuid();
 insert into public.enzy_inventory_operations(id,business_id,kind,actor_device_id,occurred_at,reason) values(op,b,'visit',d.id,(plan->>'occurred_at')::timestamptz,plan->>'reason');
 insert into public.enzy_visits(operation_id,business_id,store_id,store_name_snapshot,assignment_id,previous_visit_id,closed_cycle_id,occurred_at,reason,gross_sales_rp,enzy_due_rp,commission_earned_rp)
 values(op,b,sid,plan->>'store_name',(plan->>'assignment_id')::uuid,(plan->>'previous_visit_id')::uuid,(plan->>'closed_cycle_id')::uuid,(plan->>'occurred_at')::timestamptz,plan->>'reason',(plan->>'gross_sales_rp')::bigint,(plan->>'enzy_due_rp')::bigint,(plan->>'commission_earned_rp')::bigint);
 for item in select value from jsonb_array_elements(plan->'results') loop
 insert into public.enzy_visit_results(business_id,visit_id,line_id,sold,returned_good,returned_damaged,returned_expired,lost)
 values(b,op,(item->>'line_id')::uuid,(item->>'sold')::bigint,(item->>'returned_good')::bigint,(item->>'returned_damaged')::bigint,(item->>'returned_expired')::bigint,(item->>'lost')::bigint);
 perform enzy_private.apply_stock_delta(b,op,store_loc,(item->>'lot_id')::uuid,-(item->>'quantity')::bigint);
 perform enzy_private.apply_stock_delta(b,op,quarantine,(item->>'lot_id')::uuid,(item->>'returned_good')::bigint+(item->>'returned_damaged')::bigint+(item->>'returned_expired')::bigint);
 end loop;
 if jsonb_array_length(plan->'drops')>0 then
 cycle:=gen_random_uuid();insert into public.enzy_consignment_cycles(id,business_id,store_id,opening_visit_id,assignment_id,channel,agent_id) values(cycle,b,sid,op,(plan->>'assignment_id')::uuid,plan->>'channel',(plan->>'agent_id')::uuid);
 for item in select value from jsonb_array_elements(plan->'drops') loop
 insert into public.enzy_consignment_lines(business_id,cycle_id,lot_id,source_location_id,product_name_snapshot,sku_code_snapshot,lot_code_snapshot,expiry_date,quantity,price_id,store_price_rp,enzy_share_rp)
 values(b,cycle,(item->>'lot_id')::uuid,(item->>'source_location_id')::uuid,item->>'product_name',item->>'sku_code',item->>'lot_code',(item->>'expiry_date')::date,(item->>'quantity')::bigint,(item->>'price_id')::uuid,(item->>'store_price_rp')::bigint,(item->>'enzy_share_rp')::bigint);
 perform enzy_private.apply_stock_delta(b,op,(item->>'source_location_id')::uuid,(item->>'lot_id')::uuid,-(item->>'quantity')::bigint);
 perform enzy_private.apply_stock_delta(b,op,store_loc,(item->>'lot_id')::uuid,(item->>'quantity')::bigint);
 end loop;end if;
 update public.enzy_store_state set current_cycle_id=cycle,last_visit_id=op,version=version+1 where business_id=b and store_id=sid;
 answer:=jsonb_build_object('ok',true,'operation_id',op,'store_id',sid,'cycle_id',cycle);
 elsif p_action='assign' then
 for k in select jsonb_object_keys(rec) loop if k not in ('store_id','field_device_id','channel','agent_id','reason','expected_version') then raise exception 'INVALID_REQUEST';end if;end loop;
 sid:=(rec->>'store_id')::uuid;
 if not exists(select 1 from public.enzy_stores where business_id=b and id=sid and is_active) then raise exception 'INVALID_REFERENCE';end if;
 insert into public.enzy_store_state(business_id,store_id) values(b,sid) on conflict do nothing;
 select * into st from public.enzy_store_state where business_id=b and store_id=sid for update;
 if enzy_private.stock_int(rec,'expected_version',false,1000000000,1)<>st.version then raise exception 'CONFLICT';end if;
 if st.current_cycle_id is not null then raise exception 'OPEN_CYCLE';end if;
 if rec->>'channel' is null or rec->>'channel' not in ('direct','agent') or length(btrim(coalesce(rec->>'reason',''))) not between 1 and 500 then raise exception 'INVALID_REQUEST';end if;
 if nullif(rec->>'field_device_id','') is not null then
 select * into device from public.enzy_devices where id=(rec->>'field_device_id')::uuid for share;
 if device.id is null or device.role<>'field' or device.status<>'active' or device.revoked_at is not null then raise exception 'INVALID_REFERENCE';end if;end if;
 if rec->>'channel'='agent' then select * into agent from public.enzy_agents where business_id=b and id=(rec->>'agent_id')::uuid and is_active for share;if agent.id is null then raise exception 'INVALID_REFERENCE';end if;
 elsif nullif(rec->>'agent_id','') is not null then raise exception 'INVALID_REQUEST';end if;
 insert into public.enzy_store_assignments(business_id,store_id,field_device_id,channel,agent_id,agent_name_snapshot,reason,created_by_device_id) values(b,sid,device.id,rec->>'channel',agent.id,agent.name,btrim(rec->>'reason'),d.id) returning id into assignment;
 update public.enzy_store_state set current_assignment_id=assignment,version=version+1 where business_id=b and store_id=sid;
 answer:=jsonb_build_object('ok',true,'assignment_id',assignment);
 elsif p_action='inspect' then
 for k in select jsonb_object_keys(rec) loop if k not in ('result_id','reason') then raise exception 'INVALID_REQUEST';end if;end loop;
 if length(btrim(coalesce(rec->>'reason',''))) not between 1 and 500 then raise exception 'INVALID_REQUEST';end if;
 select * into r from public.enzy_visit_results where business_id=b and id=(rec->>'result_id')::uuid;
 if r.id is null or r.returned_good+r.returned_damaged+r.returned_expired=0 then raise exception 'INVALID_REFERENCE';end if;
 if exists(select 1 from public.enzy_inventory_operations where reverse_of=r.visit_id) then raise exception 'CONFLICT';end if;
 insert into public.enzy_return_inspections(business_id,result_id,actor_device_id,note) values(b,r.id,d.id,btrim(rec->>'reason')) returning id into op;
 answer:=jsonb_build_object('ok',true,'inspection_id',op);
 elsif p_action='reverse' then
 for k in select jsonb_object_keys(rec) loop if k not in ('operation_id','reason') then raise exception 'INVALID_REQUEST';end if;end loop;
 if length(btrim(coalesce(rec->>'reason',''))) not between 1 and 500 then raise exception 'INVALID_REQUEST';end if;
 select * into v from public.enzy_visits where business_id=b and operation_id=(rec->>'operation_id')::uuid;
 if v.operation_id is null then raise exception 'NOT_FOUND';end if;
 select * into st from public.enzy_store_state where business_id=b and store_id=v.store_id for update;
 if st.last_visit_id is distinct from v.operation_id or exists(select 1 from public.enzy_inventory_operations where reverse_of=v.operation_id) then raise exception 'CONFLICT';end if;
 -- Reassignment creates a new authority context; reverse before reassignment.
 if st.current_assignment_id is distinct from v.assignment_id then raise exception 'CONFLICT';end if;
 op:=gen_random_uuid();insert into public.enzy_inventory_operations(id,business_id,kind,actor_device_id,occurred_at,reason,reverse_of) values(op,b,'reversal',d.id,clock_timestamp(),btrim(rec->>'reason'),v.operation_id);
 for m in select * from public.enzy_stock_movements where business_id=b and operation_id=v.operation_id order by location_id,lot_id,id loop
 perform enzy_private.apply_stock_delta(b,op,m.location_id,m.lot_id,-m.delta);end loop;
 update public.enzy_store_state set current_cycle_id=v.closed_cycle_id,last_visit_id=v.previous_visit_id,version=version+1 where business_id=b and store_id=v.store_id;
 answer:=jsonb_build_object('ok',true,'operation_id',op,'reverse_of',v.operation_id);
 end if;
 insert into public.enzy_inventory_audit(business_id,actor_device_id,action,entity_id) values(b,d.id,'visit_'||p_action,coalesce(op,assignment));
 insert into public.enzy_visit_requests(actor_device_id,request_id,payload_hash,result) values(d.id,rid,fingerprint,answer);
 return answer;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or not_null_violation or check_violation then return jsonb_build_object('error','INVALID_REQUEST');
 when unique_violation then return jsonb_build_object('error','CONFLICT');when foreign_key_violation then return jsonb_build_object('error','INVALID_REFERENCE');
 when raise_exception then if SQLERRM in ('INVALID_REQUEST','FORBIDDEN','CONFLICT','ASSIGNMENT_REQUIRED','VISIT_RECONCILIATION','INVALID_REFERENCE','EXPIRED_LOT','INSUFFICIENT_STOCK','PRICE_REQUIRED','PRICE_CHANGED','OPEN_CYCLE','NOT_FOUND') then return jsonb_build_object('error',SQLERRM);end if;raise;
 end;
end$$;
revoke all on function public.enzy_visit_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enzy_visit_action(uuid,text,text,jsonb) to service_role;
-- Keep Phase 4 clients compatible, but prohibit generic stock transfer/reversal
-- from bypassing consignment state, reconciliation and verified sales records.
alter function public.enzy_inventory_action(uuid,text,text,jsonb) set schema enzy_private;
alter function enzy_private.enzy_inventory_action(uuid,text,text,jsonb) rename to inventory_action_v4;
revoke all on function enzy_private.inventory_action_v4(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.enzy_inventory_action(p_actor uuid,p_action text,p_ip_hash text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.enzy_devices;loc uuid;
begin
 select * into d from public.enzy_devices where auth_user_id=p_actor;
 if d.id is null or d.status<>'active' or d.revoked_at is not null then return jsonb_build_object('error','FORBIDDEN');end if;
 begin
 if p_action='reverse' and exists(select 1 from public.enzy_visits where operation_id=(p_payload->'record'->>'operation_id')::uuid) then return jsonb_build_object('error','VISIT_CORRECTION_REQUIRED');end if;
 if p_action='transfer' and exists(select 1 from public.enzy_stock_locations where kind='store_consignment' and id in ((p_payload->'record'->>'from_location_id')::uuid,(p_payload->'record'->>'to_location_id')::uuid)) then return jsonb_build_object('error','FORBIDDEN');end if;
 exception when invalid_text_representation then return jsonb_build_object('error','INVALID_REQUEST');end;
 return enzy_private.inventory_action_v4(p_actor,p_action,p_ip_hash,p_payload);
end$$;
revoke all on function public.enzy_inventory_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enzy_inventory_action(uuid,text,text,jsonb) to service_role;
commit;
