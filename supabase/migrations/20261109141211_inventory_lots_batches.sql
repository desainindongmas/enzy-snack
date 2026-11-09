-- Phase 4. Review/apply manually to TEST after migrations 001-003.
-- No opening quantities, purchases, products, or financial entries are seeded.
begin;
create schema if not exists enzy_private;
revoke all on schema enzy_private from public,anon,authenticated,service_role;
create table public.enzy_stock_locations (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.enzy_businesses(id),
 label text not null check(length(btrim(label)) between 1 and 100),
 kind text not null check(kind in ('raw_warehouse','finished_warehouse','field_custody','agent_custody','return_quarantine')),
 system_key text,device_id uuid references public.enzy_devices(id),agent_id uuid,
 created_at timestamptz not null default now(),created_by_device_id uuid references public.enzy_devices(id),
 unique(business_id,id),unique(business_id,system_key),
 foreign key(business_id,agent_id) references public.enzy_agents(business_id,id),
 check((kind='field_custody' and device_id is not null and agent_id is null) or
 (kind='agent_custody' and agent_id is not null and device_id is null) or
 (kind in ('raw_warehouse','finished_warehouse','return_quarantine') and device_id is null and agent_id is null))
);
create index enzy_locations_device_idx on public.enzy_stock_locations(device_id);
create index enzy_locations_agent_idx on public.enzy_stock_locations(business_id,agent_id);
create index enzy_locations_actor_idx on public.enzy_stock_locations(created_by_device_id);
insert into public.enzy_stock_locations(business_id,label,kind,system_key)
select id,'Gudang bahan baku','raw_warehouse','raw_primary' from public.enzy_businesses where singleton;
insert into public.enzy_stock_locations(business_id,label,kind,system_key)
select id,'Gudang produk jadi','finished_warehouse','finished_primary' from public.enzy_businesses where singleton;
insert into public.enzy_stock_locations(business_id,label,kind,system_key)
select id,'Karantina retur','return_quarantine','quarantine' from public.enzy_businesses where singleton;
create table public.enzy_inventory_operations (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.enzy_businesses(id),
 kind text not null check(kind in ('purchase','production','transfer','reversal')),
 actor_device_id uuid not null references public.enzy_devices(id),
 occurred_at timestamptz not null check(isfinite(occurred_at)),created_at timestamptz not null default now(),
 reason text not null check(length(reason) between 1 and 500),reverse_of uuid unique,
 unique(business_id,id),foreign key(business_id,reverse_of) references public.enzy_inventory_operations(business_id,id),
 check((kind='reversal')=(reverse_of is not null))
);
create index enzy_inventory_ops_list_idx on public.enzy_inventory_operations(business_id,created_at desc,id);
create index enzy_inventory_ops_actor_idx on public.enzy_inventory_operations(actor_device_id);
create table public.enzy_raw_purchases (
 operation_id uuid primary key,business_id uuid not null,supplier_id uuid not null,supplier_name_snapshot text not null,
 weight_g bigint not null check(weight_g between 1 and 1000000000),
 goods_cost_rp bigint not null check(goods_cost_rp between 0 and 1000000000000),
 acquisition_extra_rp bigint check(acquisition_extra_rp between 0 and 1000000000000),
 unique(business_id,operation_id),
 foreign key(business_id,operation_id) references public.enzy_inventory_operations(business_id,id),
 foreign key(business_id,supplier_id) references public.enzy_suppliers(business_id,id)
);
create index enzy_raw_purchase_supplier_idx on public.enzy_raw_purchases(business_id,supplier_id);
create table public.enzy_production_batches (
 operation_id uuid primary key,business_id uuid not null,product_id uuid not null,
 product_name_snapshot text not null,sku_code_snapshot text not null,nominal_weight_g integer not null,
 good_pcs bigint not null check(good_pcs between 1 and 1000000000),good_output_weight_g bigint not null check(good_output_weight_g>0),
 defect_weight_g bigint not null check(defect_weight_g>=0),waste_g bigint not null check(waste_g>=0),
 packaging_cost_rp bigint check(packaging_cost_rp between 0 and 1000000000000),
 labor_cost_rp bigint check(labor_cost_rp between 0 and 1000000000000),
 other_cost_rp bigint check(other_cost_rp between 0 and 1000000000000),
 known_cost_rp numeric(28,8) not null check(known_cost_rp>=0),
 cost_status text not null check(cost_status in ('COST_INCOMPLETE','COST_COMPLETE')),
 unit_cost_rp numeric(28,8),unique(business_id,operation_id),
 foreign key(business_id,operation_id) references public.enzy_inventory_operations(business_id,id),
 foreign key(business_id,product_id) references public.enzy_products(business_id,id),
 check((cost_status='COST_COMPLETE')=(unit_cost_rp is not null))
);
create index enzy_batch_product_idx on public.enzy_production_batches(business_id,product_id);
create table public.enzy_inventory_lots (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.enzy_businesses(id),
 lot_code text not null check(length(lot_code) between 1 and 80),kind text not null check(kind in ('raw','finished')),
 raw_purchase_id uuid,production_batch_id uuid,initial_quantity bigint not null check(initial_quantity>0),
 product_id uuid,product_name_snapshot text,sku_code_snapshot text,expiry_date date,
 known_cost_rp numeric(28,8) not null check(known_cost_rp>=0),cost_status text not null check(cost_status in ('COST_INCOMPLETE','COST_COMPLETE')),
 unit_cost_rp numeric(28,8),created_at timestamptz not null default now(),
 unique(business_id,id),unique(business_id,lot_code),unique(raw_purchase_id),unique(production_batch_id),
 foreign key(business_id,raw_purchase_id) references public.enzy_raw_purchases(business_id,operation_id),
 foreign key(business_id,production_batch_id) references public.enzy_production_batches(business_id,operation_id),
 foreign key(business_id,product_id) references public.enzy_products(business_id,id),
 check((kind='raw' and raw_purchase_id is not null and production_batch_id is null and product_id is null)
 or(kind='finished' and raw_purchase_id is null and production_batch_id is not null and product_id is not null)),
 check((cost_status='COST_COMPLETE')=(unit_cost_rp is not null)),check(expiry_date is null or isfinite(expiry_date))
);
create index enzy_inventory_lot_product_idx on public.enzy_inventory_lots(business_id,product_id);
create index enzy_inventory_lot_list_idx on public.enzy_inventory_lots(business_id,kind,created_at desc,id);
create table public.enzy_production_inputs (
 business_id uuid not null,batch_id uuid not null,lot_id uuid not null,grams bigint not null check(grams>0),
 known_cost_rp numeric(28,8) not null,final_cost_rp numeric(28,8),primary key(batch_id,lot_id),
 foreign key(business_id,batch_id) references public.enzy_production_batches(business_id,operation_id),
 foreign key(business_id,lot_id) references public.enzy_inventory_lots(business_id,id)
);
create index enzy_production_input_lot_idx on public.enzy_production_inputs(business_id,lot_id);
create table public.enzy_inventory_balances (
 business_id uuid not null,location_id uuid not null,lot_id uuid not null,
 quantity bigint not null default 0 check(quantity>=0),version bigint not null default 1 check(version>0),
 primary key(business_id,location_id,lot_id),
 foreign key(business_id,location_id) references public.enzy_stock_locations(business_id,id),
 foreign key(business_id,lot_id) references public.enzy_inventory_lots(business_id,id)
);
create index enzy_inventory_balance_lot_idx on public.enzy_inventory_balances(business_id,lot_id);
create table public.enzy_stock_movements (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,operation_id uuid not null,
 location_id uuid not null,lot_id uuid not null,delta bigint not null check(delta<>0),created_at timestamptz not null default now(),
 foreign key(business_id,operation_id) references public.enzy_inventory_operations(business_id,id),
 foreign key(business_id,location_id) references public.enzy_stock_locations(business_id,id),
 foreign key(business_id,lot_id) references public.enzy_inventory_lots(business_id,id)
);
create index enzy_movement_operation_idx on public.enzy_stock_movements(business_id,operation_id);
create index enzy_movement_balance_idx on public.enzy_stock_movements(business_id,location_id,lot_id,created_at desc);
create table public.enzy_inventory_audit (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.enzy_businesses(id),
 actor_device_id uuid not null references public.enzy_devices(id),action text not null,entity_id uuid not null,
 created_at timestamptz not null default now()
);
create index enzy_inventory_audit_business_idx on public.enzy_inventory_audit(business_id,created_at desc);
create index enzy_inventory_audit_actor_idx on public.enzy_inventory_audit(actor_device_id);
create table public.enzy_inventory_requests (
 actor_device_id uuid not null references public.enzy_devices(id),request_id uuid not null,
 payload_hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_device_id,request_id)
);
do $$ declare t text;begin
 foreach t in array array['enzy_stock_locations','enzy_inventory_operations','enzy_raw_purchases','enzy_production_batches','enzy_inventory_lots','enzy_production_inputs','enzy_inventory_balances','enzy_stock_movements','enzy_inventory_audit','enzy_inventory_requests'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 if t not in ('enzy_inventory_balances','enzy_inventory_requests') then
 execute format('create trigger %I before update or delete on public.%I for each row execute function public.enzy_audit_append_only()',t||'_immutable',t);
 end if;
 end loop;
end $$;
-- Invoker helper is private and has no client/service grant. The checked RPC calls
-- it under its definer identity; quantity, projection and ledger always move together.
create function enzy_private.apply_stock_delta(b uuid,op uuid,loc uuid,lot uuid,amount bigint)
returns void language plpgsql set search_path='' as $$
declare q bigint;
begin
 if amount=0 then return;end if;
 insert into public.enzy_inventory_balances(business_id,location_id,lot_id,quantity) values(b,loc,lot,0) on conflict do nothing;
 select quantity into q from public.enzy_inventory_balances where business_id=b and location_id=loc and lot_id=lot for update;
 if q+amount<0 then raise exception using errcode='P0001',message='INSUFFICIENT_STOCK';end if;
 update public.enzy_inventory_balances set quantity=quantity+amount,version=version+1 where business_id=b and location_id=loc and lot_id=lot;
 insert into public.enzy_stock_movements(business_id,operation_id,location_id,lot_id,delta) values(b,op,loc,lot,amount);
end $$;
revoke all on function enzy_private.apply_stock_delta(uuid,uuid,uuid,uuid,bigint) from public,anon,authenticated,service_role;
create function enzy_private.inventory_read(b uuid,actor uuid,role_name text,p_kind text,p_payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare base text;answer jsonb;page_num int:=coalesce((p_payload->>'page')::int,1);
 q text:='%'||coalesce(p_payload->>'search','')||'%';lk text:=nullif(p_payload->>'lot_kind','');loc uuid:=nullif(p_payload->>'location_id','')::uuid;
begin
 if page_num not between 1 and 10000 or length(q)>122 or (lk is not null and lk not in ('raw','finished')) then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if p_kind='locations' then
 base:=$q$select jsonb_build_object('id',l.id,'label',l.label,'kind',l.kind,'system_key',l.system_key,'device_id',l.device_id,'agent_id',l.agent_id) data,l.created_at sort_at,l.id sort_id
 from public.enzy_stock_locations l where l.business_id=$1 and l.label ilike $4 and ($3='owner' or ($3='production' and l.kind in ('raw_warehouse','finished_warehouse')) or ($3='field' and l.device_id=$2 and l.kind='field_custody'))$q$;
 elsif p_kind in ('balances','lots') then
 if p_kind='balances' then
 base:=$q$select jsonb_build_object('id',bl.lot_id::text||bl.location_id::text,'lot_id',l.id,'lot_code',l.lot_code,'lot_kind',l.kind,'product_name',l.product_name_snapshot,'sku_code',l.sku_code_snapshot,'location_id',s.id,'location_label',s.label,'location_kind',s.kind,'quantity',bl.quantity,'unit',case when l.kind='raw' then 'g' else 'pcs' end,'expiry_date',l.expiry_date,'cost_status',l.cost_status) || case when $3='owner' then jsonb_build_object('unit_cost_rp',l.unit_cost_rp) else '{}'::jsonb end data,l.created_at sort_at,l.id sort_id
 from public.enzy_inventory_balances bl join public.enzy_inventory_lots l on l.business_id=bl.business_id and l.id=bl.lot_id join public.enzy_stock_locations s on s.business_id=bl.business_id and s.id=bl.location_id
 where bl.business_id=$1 and bl.quantity>0 and ($5 is null or l.kind=$5) and ($6 is null or s.id=$6)
 and (l.lot_code ilike $4 or l.product_name_snapshot ilike $4) and ($3='owner' or ($3='production' and s.kind in ('raw_warehouse','finished_warehouse')) or ($3='field' and s.device_id=$2 and s.kind='field_custody'))$q$;
 else
 base:=$q$select jsonb_build_object('id',l.id,'lot_code',l.lot_code,'lot_kind',l.kind,'product_id',l.product_id,'product_name',l.product_name_snapshot,'sku_code',l.sku_code_snapshot,'quantity',sum(bl.quantity),'initial_quantity',l.initial_quantity,'unit',case when l.kind='raw' then 'g' else 'pcs' end,'expiry_date',l.expiry_date,'cost_status',l.cost_status) || case when $3='owner' then jsonb_build_object('known_cost_rp',l.known_cost_rp,'unit_cost_rp',l.unit_cost_rp) else '{}'::jsonb end data,coalesce(l.expiry_date::timestamptz,'infinity'::timestamptz) sort_at,l.id sort_id
 from public.enzy_inventory_lots l join public.enzy_inventory_balances bl on bl.business_id=l.business_id and bl.lot_id=l.id join public.enzy_stock_locations s on s.business_id=bl.business_id and s.id=bl.location_id
 where l.business_id=$1 and bl.quantity>0 and ($5 is null or l.kind=$5) and ($6 is null or s.id=$6)
 and (l.lot_code ilike $4 or l.product_name_snapshot ilike $4) and ($3='owner' or ($3='production' and s.kind in ('raw_warehouse','finished_warehouse')) or ($3='field' and s.device_id=$2 and s.kind='field_custody'))
 group by l.id$q$;
 end if;
 elsif p_kind='purchases' then
 if role_name<>'owner' then return jsonb_build_object('error','FORBIDDEN');end if;
 base:=$q$select to_jsonb(p)||jsonb_build_object('id',o.id,'occurred_at',o.occurred_at,'reason',o.reason,'lot_code',l.lot_code,'lot_id',l.id,'cost_status',l.cost_status,'known_cost_rp',l.known_cost_rp,'unit_cost_rp',l.unit_cost_rp,'reversed',exists(select 1 from public.enzy_inventory_operations r where r.reverse_of=o.id)) data,o.created_at sort_at,o.id sort_id
 from public.enzy_raw_purchases p join public.enzy_inventory_operations o on o.business_id=p.business_id and o.id=p.operation_id join public.enzy_inventory_lots l on l.business_id=p.business_id and l.raw_purchase_id=p.operation_id
 where p.business_id=$1 and (p.supplier_name_snapshot ilike $4 or l.lot_code ilike $4)$q$;
 elsif p_kind='batches' then
 if role_name='field' then return jsonb_build_object('error','FORBIDDEN');end if;
 base:=$q$select jsonb_build_object('id',o.id,'product_name',p.product_name_snapshot,'sku_code',p.sku_code_snapshot,'good_pcs',p.good_pcs,'good_output_weight_g',p.good_output_weight_g,'defect_weight_g',p.defect_weight_g,'waste_g',p.waste_g,'cost_status',p.cost_status,'occurred_at',o.occurred_at,'lot_code',l.lot_code,'expiry_date',l.expiry_date,'reversed',exists(select 1 from public.enzy_inventory_operations r where r.reverse_of=o.id),'inputs',(select coalesce(jsonb_agg(jsonb_build_object('lot_code',il.lot_code,'grams',i.grams)),'[]'::jsonb) from public.enzy_production_inputs i join public.enzy_inventory_lots il on il.business_id=i.business_id and il.id=i.lot_id where i.business_id=p.business_id and i.batch_id=p.operation_id))||case when $3='owner' then jsonb_build_object('known_cost_rp',p.known_cost_rp,'unit_cost_rp',p.unit_cost_rp,'packaging_cost_rp',p.packaging_cost_rp,'labor_cost_rp',p.labor_cost_rp,'other_cost_rp',p.other_cost_rp) else '{}'::jsonb end data,o.created_at sort_at,o.id sort_id
 from public.enzy_production_batches p join public.enzy_inventory_operations o on o.business_id=p.business_id and o.id=p.operation_id join public.enzy_inventory_lots l on l.business_id=p.business_id and l.production_batch_id=p.operation_id
 where p.business_id=$1 and (p.product_name_snapshot ilike $4 or l.lot_code ilike $4)$q$;
 elsif p_kind='movements' then
 base:=$q$select jsonb_build_object('id',m.id,'operation_id',o.id,'kind',o.kind,'reverse_of',o.reverse_of,'occurred_at',o.occurred_at,'reason',o.reason,'lot_code',l.lot_code,'product_name',l.product_name_snapshot,'location_label',s.label,'delta',m.delta,'unit',case when l.kind='raw' then 'g' else 'pcs' end,'reversed',exists(select 1 from public.enzy_inventory_operations r where r.reverse_of=o.id)) data,m.created_at sort_at,m.id sort_id
 from public.enzy_stock_movements m join public.enzy_inventory_operations o on o.business_id=m.business_id and o.id=m.operation_id join public.enzy_inventory_lots l on l.business_id=m.business_id and l.id=m.lot_id join public.enzy_stock_locations s on s.business_id=m.business_id and s.id=m.location_id
 where m.business_id=$1 and (l.lot_code ilike $4 or l.product_name_snapshot ilike $4 or s.label ilike $4) and ($3='owner' or ($3='production' and s.kind in ('raw_warehouse','finished_warehouse')) or ($3='field' and s.device_id=$2 and s.kind='field_custody'))$q$;
 elsif p_kind='operations' then
 if role_name<>'owner' then return jsonb_build_object('error','FORBIDDEN');end if;
 base:=$q$select jsonb_build_object('id',o.id,'kind',o.kind,'reverse_of',o.reverse_of,'occurred_at',o.occurred_at,'reason',o.reason,'reversed',exists(select 1 from public.enzy_inventory_operations r where r.reverse_of=o.id)) data,o.created_at sort_at,o.id sort_id
 from public.enzy_inventory_operations o where o.business_id=$1 and (o.reason ilike $4 or o.id::text ilike $4)$q$;
 elsif p_kind='catalog_products' then
 if role_name='field' then return jsonb_build_object('error','FORBIDDEN');end if;
 base:=$q$select jsonb_build_object('id',id,'name',name,'sku_code',sku_code,'weight_g',weight_g,'pcs_per_pack',pcs_per_pack) data,created_at sort_at,id sort_id from public.enzy_products where business_id=$1 and is_active and name ilike $4$q$;
 elsif p_kind='catalog_suppliers' then
 if role_name<>'owner' then return jsonb_build_object('error','FORBIDDEN');end if;
 base:=$q$select jsonb_build_object('id',id,'name',name) data,created_at sort_at,id sort_id from public.enzy_suppliers where business_id=$1 and is_active and name ilike $4$q$;
 elsif p_kind='catalog_agents' then
 if role_name<>'owner' then return jsonb_build_object('error','FORBIDDEN');end if;
 base:=$q$select jsonb_build_object('id',id,'name',name) data,created_at sort_at,id sort_id from public.enzy_agents where business_id=$1 and is_active and name ilike $4$q$;
 elsif p_kind='catalog_devices' then
 if role_name<>'owner' then return jsonb_build_object('error','FORBIDDEN');end if;
 base:=$q$select jsonb_build_object('id',id,'name',device_label) data,created_at sort_at,id sort_id from public.enzy_devices where role='field' and status='active' and revoked_at is null and device_label ilike $4$q$;
 else return jsonb_build_object('error','INVALID_REQUEST');
 end if;
 execute 'with visible as ('||base||'),page as (select * from visible order by '||case when p_kind='lots' then 'sort_at asc,sort_id' else 'sort_at desc,sort_id' end||' limit 20 offset $7) select jsonb_build_object(''records'',coalesce((select jsonb_agg(data) from page),''[]''::jsonb),''count'',(select count(*) from visible),''page'',$8)' into answer using b,actor,role_name,q,lk,loc,(page_num-1)*20,page_num;
 return answer;
end $$;
revoke all on function enzy_private.inventory_read(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function enzy_private.stock_int(v jsonb,k text,nullable boolean default false,max_n bigint default 1000000000,min_n bigint default 0)
returns bigint language plpgsql set search_path='' as $$
declare n bigint;s text:=v->>k;
begin
 if s is null and nullable then return null;end if;
 if s is null or s !~ '^[0-9]{1,13}$' then raise exception 'INVALID_REQUEST';end if;
 n:=s::bigint;if n<min_n or n>max_n then raise exception 'INVALID_REQUEST';end if;return n;
end $$;
revoke all on function enzy_private.stock_int(jsonb,text,boolean,bigint,bigint) from public,anon,authenticated,service_role;
create function public.enzy_inventory_action(p_actor uuid,p_action text,p_ip_hash text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 d public.enzy_devices;target_device public.enzy_devices;b uuid;rid uuid;fingerprint text;previous public.enzy_inventory_requests;
 rec jsonb;k text;key_name text;limit_n int;attempts_n int;window_start_at timestamptz:=date_trunc('minute',clock_timestamp());
 op uuid;lot_uuid uuid;source uuid;destination uuid;raw_location uuid;finished_location uuid;
 loc1 public.enzy_stock_locations;loc2 public.enzy_stock_locations;lot public.enzy_inventory_lots;
 supplier public.enzy_suppliers;product public.enzy_products;agent public.enzy_agents;
 weight bigint;goods bigint;extra bigint;qty bigint;good_weight bigint;defect bigint;waste bigint;
 packaging bigint;labor bigint;other_cost bigint;known numeric(28,8);unit_cost numeric(28,8);complete boolean;
 total_g bigint;input_known numeric(28,8);input_final numeric(28,8);inputs jsonb;item jsonb;input_lot uuid;grams bigint;
 occurred timestamptz;expiry date;code text;reason text;answer jsonb;original public.enzy_inventory_operations;m public.enzy_stock_movements;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then return jsonb_build_object('error','UNAUTHORIZED');end if;
 if p_action is null or p_action not in ('list','location','purchase','production','transfer','reverse') or jsonb_typeof(p_payload) is distinct from 'object'
 or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 foreach key_name in array array['global:stock:'||p_action,'ip:stock:'||p_action||':'||p_ip_hash,'uid:stock:'||p_action||':'||p_actor::text] loop
 limit_n:=case when p_action='list' then case when key_name like 'global:%' then 3000 when key_name like 'ip:%' then 300 else 100 end
 else case when key_name like 'global:%' then 500 when key_name like 'ip:%' then 100 else 30 end end;
 insert into public.enzy_pairing_limits(bucket,window_start,attempts) values(key_name,window_start_at,1)
 on conflict(bucket,window_start) do update set attempts=enzy_pairing_limits.attempts+1 returning attempts into attempts_n;
 if attempts_n>limit_n then return jsonb_build_object('error','RATE_LIMITED');end if;
 end loop;
 select * into d from public.enzy_devices where auth_user_id=p_actor for share;
 if d.id is null or d.status is distinct from 'active' or d.revoked_at is not null then return jsonb_build_object('error','FORBIDDEN');end if;
 select id into b from public.enzy_businesses where singleton;
 if b is null then return jsonb_build_object('error','SETUP_REQUIRED');end if;
 begin
 if p_action='list' then return enzy_private.inventory_read(b,d.id,d.role,p_payload->>'kind',p_payload);end if;
 if d.role is distinct from 'owner' and not(d.role='production' and p_action='production') then return jsonb_build_object('error','FORBIDDEN');end if;
 if coalesce(p_payload->>'request_id','') !~ '^[0-9a-fA-F-]{36}$' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 rid:=(p_payload->>'request_id')::uuid;rec:=p_payload->'record';
 if jsonb_typeof(rec) is distinct from 'object' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 -- Small single-business app: serialize stock posting across actors. Balance
 -- buckets are also locked FOR UPDATE in apply_stock_delta. This deliberately
 -- trades posting throughput for deterministic, deadlock-free stock correctness.
 perform pg_advisory_xact_lock(hashtextextended('inventory:'||b::text,0));
 fingerprint:=encode(sha256(convert_to(p_action||p_payload::text,'UTF8')),'hex');
 select * into previous from public.enzy_inventory_requests where actor_device_id=d.id and request_id=rid;
 if previous.request_id is not null then
 if previous.payload_hash<>fingerprint then return jsonb_build_object('error','CONFLICT');end if;
 return previous.result||jsonb_build_object('replayed',true);end if;
 for k in select jsonb_object_keys(rec) loop
 if not(k=any(case p_action
 when 'location' then array['label','kind','device_id','agent_id']
 when 'purchase' then array['supplier_id','weight_g','goods_cost_rp','acquisition_extra_rp','expiry_date','lot_code','occurred_at','reason']
 when 'production' then array['product_id','inputs','good_pcs','good_output_weight_g','defect_weight_g','waste_g','packaging_cost_rp','labor_cost_rp','other_cost_rp','expiry_date','lot_code','occurred_at','reason']
 when 'transfer' then array['lot_id','from_location_id','to_location_id','quantity','occurred_at','reason']
 else array['operation_id','reason'] end)) then return jsonb_build_object('error','INVALID_REQUEST');end if;
 end loop;
 select id into raw_location from public.enzy_stock_locations where business_id=b and system_key='raw_primary';
 select id into finished_location from public.enzy_stock_locations where business_id=b and system_key='finished_primary';
 if p_action='location' then
 if length(btrim(coalesce(rec->>'label',''))) not between 1 and 100 or rec->>'kind' is null or rec->>'kind' not in ('finished_warehouse','field_custody','agent_custody') then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if rec->>'kind'='field_custody' then
 select * into target_device from public.enzy_devices where id=(rec->>'device_id')::uuid for share;
 if target_device.id is null or target_device.role<>'field' or target_device.status<>'active' or target_device.revoked_at is not null or rec->>'agent_id' is not null then return jsonb_build_object('error','INVALID_REFERENCE');end if;
 elsif rec->>'kind'='agent_custody' then
 select * into agent from public.enzy_agents where id=(rec->>'agent_id')::uuid and business_id=b and is_active for share;
 if agent.id is null or rec->>'device_id' is not null then return jsonb_build_object('error','INVALID_REFERENCE');end if;
 elsif rec->>'device_id' is not null or rec->>'agent_id' is not null then return jsonb_build_object('error','INVALID_REQUEST');end if;
 insert into public.enzy_stock_locations(business_id,label,kind,device_id,agent_id,created_by_device_id)
 values(b,btrim(rec->>'label'),rec->>'kind',case when rec->>'kind'='field_custody' then target_device.id else null end,case when rec->>'kind'='agent_custody' then agent.id else null end,d.id) returning id into destination;
 insert into public.enzy_inventory_audit(business_id,actor_device_id,action,entity_id) values(b,d.id,'location',destination);
 answer:=jsonb_build_object('ok',true,'location_id',destination);
 else
 reason:=btrim(coalesce(rec->>'reason',''));if length(reason) not between 1 and 500 then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if nullif(rec->>'occurred_at','') is not null and rec->>'occurred_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 occurred:=coalesce(nullif(rec->>'occurred_at','')::timestamptz,clock_timestamp());
 if not isfinite(occurred) or occurred>clock_timestamp()+interval '5 minutes' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 expiry:=nullif(rec->>'expiry_date','')::date;
 if expiry is not null and (not isfinite(expiry) or expiry<(occurred at time zone 'Asia/Jakarta')::date) then return jsonb_build_object('error','INVALID_REQUEST');end if;
 op:=gen_random_uuid();lot_uuid:=gen_random_uuid();code:=nullif(btrim(rec->>'lot_code'),'');
 if code is null then code:=(case when p_action='purchase' then 'BB-' else 'JD-' end)||upper(replace(lot_uuid::text,'-',''));end if;
 if length(code)>80 then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if p_action='purchase' then
 select * into supplier from public.enzy_suppliers where id=(rec->>'supplier_id')::uuid and business_id=b and is_active for share;
 if supplier.id is null then return jsonb_build_object('error','INVALID_REFERENCE');end if;
 weight:=enzy_private.stock_int(rec,'weight_g',false,1000000000,1);goods:=enzy_private.stock_int(rec,'goods_cost_rp',false,1000000000000,0);extra:=enzy_private.stock_int(rec,'acquisition_extra_rp',true,1000000000000,0);
 complete:=extra is not null;known:=goods+coalesce(extra,0);unit_cost:=case when complete then known/weight else null end;
 insert into public.enzy_inventory_operations(id,business_id,kind,actor_device_id,occurred_at,reason) values(op,b,'purchase',d.id,occurred,reason);
 insert into public.enzy_raw_purchases(operation_id,business_id,supplier_id,supplier_name_snapshot,weight_g,goods_cost_rp,acquisition_extra_rp) values(op,b,supplier.id,supplier.name,weight,goods,extra);
 insert into public.enzy_inventory_lots(id,business_id,lot_code,kind,raw_purchase_id,initial_quantity,expiry_date,known_cost_rp,cost_status,unit_cost_rp)
 values(lot_uuid,b,code,'raw',op,weight,expiry,known,case when complete then 'COST_COMPLETE' else 'COST_INCOMPLETE' end,unit_cost);
 perform enzy_private.apply_stock_delta(b,op,raw_location,lot_uuid,weight);
 answer:=jsonb_build_object('ok',true,'operation_id',op,'lot_id',lot_uuid,'lot_code',code,'quantity',weight,'unit','g','cost_status',case when complete then 'COST_COMPLETE' else 'COST_INCOMPLETE' end);
 elsif p_action='production' then
 select * into product from public.enzy_products where id=(rec->>'product_id')::uuid and business_id=b and is_active for share;
 if product.id is null then return jsonb_build_object('error','INVALID_REFERENCE');end if;
 inputs:=rec->'inputs';if jsonb_typeof(inputs) is distinct from 'array' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if jsonb_array_length(inputs) not between 1 and 20 then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if (select count(*)<>count(distinct value->>'lot_id') from jsonb_array_elements(inputs)) then return jsonb_build_object('error','INVALID_REQUEST');end if;
 qty:=enzy_private.stock_int(rec,'good_pcs',false,1000000000,1);good_weight:=enzy_private.stock_int(rec,'good_output_weight_g',false,1000000000,1);
 defect:=enzy_private.stock_int(rec,'defect_weight_g',false,1000000000,0);waste:=enzy_private.stock_int(rec,'waste_g',false,1000000000,0);
 packaging:=enzy_private.stock_int(rec,'packaging_cost_rp',true,1000000000000,0);labor:=enzy_private.stock_int(rec,'labor_cost_rp',true,1000000000000,0);other_cost:=enzy_private.stock_int(rec,'other_cost_rp',true,1000000000000,0);
 known:=0;complete:=packaging is not null and labor is not null and other_cost is not null;total_g:=0;
 for item in select value from jsonb_array_elements(inputs) order by value->>'lot_id' loop
 if jsonb_typeof(item) is distinct from 'object' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 if exists(select 1 from jsonb_object_keys(item) x where x not in ('lot_id','grams')) then return jsonb_build_object('error','INVALID_REQUEST');end if;
 input_lot:=(item->>'lot_id')::uuid;grams:=enzy_private.stock_int(item,'grams',false,1000000000,1);
 select * into lot from public.enzy_inventory_lots where id=input_lot and business_id=b and kind='raw';
 if lot.id is null then return jsonb_build_object('error','INVALID_REFERENCE');end if;
 if lot.expiry_date is not null and lot.expiry_date<(clock_timestamp() at time zone 'Asia/Jakarta')::date then return jsonb_build_object('error','EXPIRED_LOT');end if;
 total_g:=total_g+grams;known:=known+round(lot.known_cost_rp*grams/lot.initial_quantity,8);complete:=complete and lot.cost_status='COST_COMPLETE';
 end loop;
 if total_g<>good_weight+defect+waste then return jsonb_build_object('error','WEIGHT_MISMATCH');end if;
 known:=known+coalesce(packaging,0)+coalesce(labor,0)+coalesce(other_cost,0);unit_cost:=case when complete then known/qty else null end;
 insert into public.enzy_inventory_operations(id,business_id,kind,actor_device_id,occurred_at,reason) values(op,b,'production',d.id,occurred,reason);
 insert into public.enzy_production_batches(operation_id,business_id,product_id,product_name_snapshot,sku_code_snapshot,nominal_weight_g,good_pcs,good_output_weight_g,defect_weight_g,waste_g,packaging_cost_rp,labor_cost_rp,other_cost_rp,known_cost_rp,cost_status,unit_cost_rp)
 values(op,b,product.id,product.name,product.sku_code,product.weight_g,qty,good_weight,defect,waste,packaging,labor,other_cost,known,case when complete then 'COST_COMPLETE' else 'COST_INCOMPLETE' end,unit_cost);
 for item in select value from jsonb_array_elements(inputs) order by value->>'lot_id' loop
 input_lot:=(item->>'lot_id')::uuid;grams:=(item->>'grams')::bigint;
 select * into lot from public.enzy_inventory_lots where id=input_lot and business_id=b;
 input_known:=round(lot.known_cost_rp*grams/lot.initial_quantity,8);input_final:=case when lot.cost_status='COST_COMPLETE' then input_known else null end;
 insert into public.enzy_production_inputs(business_id,batch_id,lot_id,grams,known_cost_rp,final_cost_rp) values(b,op,input_lot,grams,input_known,input_final);
 perform enzy_private.apply_stock_delta(b,op,raw_location,input_lot,-grams);
 end loop;
 insert into public.enzy_inventory_lots(id,business_id,lot_code,kind,production_batch_id,initial_quantity,product_id,product_name_snapshot,sku_code_snapshot,expiry_date,known_cost_rp,cost_status,unit_cost_rp)
 values(lot_uuid,b,code,'finished',op,qty,product.id,product.name,product.sku_code,expiry,known,case when complete then 'COST_COMPLETE' else 'COST_INCOMPLETE' end,unit_cost);
 perform enzy_private.apply_stock_delta(b,op,finished_location,lot_uuid,qty);
 answer:=jsonb_build_object('ok',true,'operation_id',op,'lot_id',lot_uuid,'lot_code',code,'quantity',qty,'unit','pcs','cost_status',case when complete then 'COST_COMPLETE' else 'COST_INCOMPLETE' end);
 elsif p_action='transfer' then
 lot_uuid:=(rec->>'lot_id')::uuid;source:=(rec->>'from_location_id')::uuid;destination:=(rec->>'to_location_id')::uuid;qty:=enzy_private.stock_int(rec,'quantity',false,1000000000,1);
 if source is null or destination is null or source=destination then return jsonb_build_object('error','INVALID_REQUEST');end if;
 select * into lot from public.enzy_inventory_lots where id=lot_uuid and business_id=b and kind='finished';
 select * into loc1 from public.enzy_stock_locations where id=source and business_id=b;
 select * into loc2 from public.enzy_stock_locations where id=destination and business_id=b;
 if lot.id is null or loc1.id is null or loc2.id is null then return jsonb_build_object('error','INVALID_REFERENCE');end if;
 if loc1.kind in ('raw_warehouse','return_quarantine') or loc2.kind in ('raw_warehouse','return_quarantine') then return jsonb_build_object('error','FORBIDDEN');end if;
 if lot.expiry_date is not null and lot.expiry_date<(clock_timestamp() at time zone 'Asia/Jakarta')::date then return jsonb_build_object('error','EXPIRED_LOT');end if;
 if loc2.kind='field_custody' then
 select * into target_device from public.enzy_devices where id=loc2.device_id for share;
 if target_device.status is distinct from 'active' or target_device.role is distinct from 'field' or target_device.revoked_at is not null then return jsonb_build_object('error','INVALID_REFERENCE');end if;
 elsif loc2.kind='agent_custody' and not exists(select 1 from public.enzy_agents where id=loc2.agent_id and business_id=b and is_active) then return jsonb_build_object('error','INVALID_REFERENCE');end if;
 insert into public.enzy_inventory_operations(id,business_id,kind,actor_device_id,occurred_at,reason) values(op,b,'transfer',d.id,occurred,reason);
 perform enzy_private.apply_stock_delta(b,op,source,lot_uuid,-qty);perform enzy_private.apply_stock_delta(b,op,destination,lot_uuid,qty);
 answer:=jsonb_build_object('ok',true,'operation_id',op,'lot_id',lot_uuid,'lot_code',lot.lot_code,'quantity',qty,'unit','pcs');
 elsif p_action='reverse' then
 select * into original from public.enzy_inventory_operations where id=(rec->>'operation_id')::uuid and business_id=b for update;
 if original.id is null then return jsonb_build_object('error','NOT_FOUND');end if;
 if original.kind='reversal' or exists(select 1 from public.enzy_inventory_operations where reverse_of=original.id) then return jsonb_build_object('error','CONFLICT');end if;
 insert into public.enzy_inventory_operations(id,business_id,kind,actor_device_id,occurred_at,reason,reverse_of) values(op,b,'reversal',d.id,clock_timestamp(),reason,original.id);
 for m in select * from public.enzy_stock_movements where operation_id=original.id and business_id=b order by location_id,lot_id,id loop
 perform enzy_private.apply_stock_delta(b,op,m.location_id,m.lot_id,-m.delta);
 end loop;
 answer:=jsonb_build_object('ok',true,'operation_id',op,'reverse_of',original.id);
 end if;
 insert into public.enzy_inventory_audit(business_id,actor_device_id,action,entity_id) values(b,d.id,p_action,op);
 end if;
 insert into public.enzy_inventory_requests(actor_device_id,request_id,payload_hash,result) values(d.id,rid,fingerprint,answer);
 return answer;
 exception
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or not_null_violation or check_violation then return jsonb_build_object('error','INVALID_REQUEST');
 when unique_violation then return jsonb_build_object('error','CONFLICT');
 when foreign_key_violation then return jsonb_build_object('error','INVALID_REFERENCE');
 when raise_exception then
 if SQLERRM in ('INSUFFICIENT_STOCK','INVALID_REQUEST') then return jsonb_build_object('error',SQLERRM);end if;
 raise;
 end;
end $$;
revoke all on function public.enzy_inventory_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enzy_inventory_action(uuid,text,text,jsonb) to service_role;
commit;
