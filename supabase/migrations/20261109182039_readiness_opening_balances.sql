-- Phase 7: diagnostics and explicitly reviewed opening on a FRESH business only.
-- Existing TEST transactions, balances and owners are never deleted or reset.
begin;
create table public.enzy_openings(
 id uuid primary key default gen_random_uuid(),business_id uuid not null unique references public.enzy_businesses(id),actor_device_id uuid not null references public.enzy_devices(id),
 effective_at timestamptz not null check(isfinite(effective_at)),reason text not null check(length(btrim(reason)) between 1 and 500),
 stock_snapshot jsonb not null,money_snapshot jsonb not null,inventory_operation_id uuid,money_operation_id uuid,created_at timestamptz not null default clock_timestamp(),
 unique(business_id,id),foreign key(business_id,inventory_operation_id) references public.enzy_inventory_operations(business_id,id),foreign key(business_id,money_operation_id) references public.enzy_money_operations(business_id,id));
create index enzy_opening_actor_idx on public.enzy_openings(actor_device_id);
create index enzy_opening_inventory_idx on public.enzy_openings(business_id,inventory_operation_id);
create index enzy_opening_money_idx on public.enzy_openings(business_id,money_operation_id);
create table public.enzy_readiness_evidence(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.enzy_businesses(id),actor_device_id uuid not null references public.enzy_devices(id),
 kind text not null check(kind in ('backup','restore','access_review','uat','cutoff_review')),
 reference text not null check(length(btrim(reference)) between 1 and 200),note text not null check(length(btrim(note)) between 1 and 500),created_at timestamptz not null default clock_timestamp());
create index enzy_evidence_recent_idx on public.enzy_readiness_evidence(business_id,kind,created_at desc);
create index enzy_evidence_actor_idx on public.enzy_readiness_evidence(actor_device_id);
create table public.enzy_readiness_requests(actor_device_id uuid not null references public.enzy_devices(id),request_id uuid not null,payload_hash text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(actor_device_id,request_id));
do $$declare t text;begin foreach t in array array['enzy_openings','enzy_readiness_evidence','enzy_readiness_requests'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);
 if t<>'enzy_readiness_requests' then execute format('create trigger %I before update or delete on public.%I for each row execute function public.enzy_audit_append_only()',t||'_immutable',t);end if;end loop;end$$;
alter table public.enzy_inventory_operations drop constraint enzy_inventory_operations_kind_check;
alter table public.enzy_inventory_operations add constraint enzy_inventory_operations_kind_check check(kind in ('purchase','production','transfer','reversal','visit','opening'));
alter table public.enzy_money_operations drop constraint enzy_money_operations_kind_check;
alter table public.enzy_money_operations add constraint enzy_money_operations_kind_check check(kind in ('sale','collection','confirmation','commission_payment','capital_in','capital_out','cash_out','reversal','opening'));
alter table public.enzy_money_accounts drop constraint enzy_money_accounts_kind_check;
alter table public.enzy_money_accounts add constraint enzy_money_accounts_kind_check check(kind in ('cash','bank','field','agent','receivable','revenue','commission_expense','commission_payable','capital','cash_outlay','opening_equity'));
-- Existing account-shape check already permits system accounts without a party.
insert into public.enzy_money_accounts(business_id,label,kind,system_key) select id,'Penyeimbang saldo awal','opening_equity','opening_equity' from public.enzy_businesses where singleton;
alter table public.enzy_inventory_lots add column opening_id uuid;
alter table public.enzy_inventory_lots add constraint enzy_lot_opening_fk foreign key(business_id,opening_id) references public.enzy_openings(business_id,id);
create index enzy_lot_opening_idx on public.enzy_inventory_lots(business_id,opening_id);
do $$declare r record;begin for r in select conname from pg_constraint where conrelid='public.enzy_inventory_lots'::regclass and contype='c' and pg_get_constraintdef(oid) like '%raw_purchase_id%' loop execute format('alter table public.enzy_inventory_lots drop constraint %I',r.conname);end loop;end$$;
alter table public.enzy_inventory_lots add constraint enzy_lot_origin check(
 (opening_id is null and ((kind='raw' and raw_purchase_id is not null and production_batch_id is null and product_id is null) or(kind='finished' and raw_purchase_id is null and production_batch_id is not null and product_id is not null))) or
 (opening_id is not null and raw_purchase_id is null and production_batch_id is null and ((kind='raw' and product_id is null) or(kind='finished' and product_id is not null))));
create function enzy_private.opening_is_fresh(b uuid) returns boolean language sql stable set search_path='' as $$select
 not exists(select 1 from public.enzy_openings where business_id=b) and not exists(select 1 from public.enzy_inventory_operations where business_id=b) and not exists(select 1 from public.enzy_money_operations where business_id=b)
 and not exists(select 1 from public.enzy_inventory_lots where business_id=b) and not exists(select 1 from public.enzy_inventory_balances where business_id=b) and not exists(select 1 from public.enzy_money_balances where business_id=b)
 and not exists(select 1 from public.enzy_stock_movements where business_id=b) and not exists(select 1 from public.enzy_money_ledger where business_id=b) and not exists(select 1 from public.enzy_visits where business_id=b) and not exists(select 1 from public.enzy_money_proposals where business_id=b)$$;
revoke all on function enzy_private.opening_is_fresh(uuid) from public,anon,authenticated,service_role;
create function enzy_private.readiness_report(b uuid) returns jsonb language sql stable set search_path='' as $$
with stock_ledger as(select location_id,lot_id,sum(delta) qty from public.enzy_stock_movements where business_id=b group by location_id,lot_id),
stock_projection as(select location_id,lot_id,quantity from public.enzy_inventory_balances where business_id=b),
money_ledger as(select account_id,sum(delta_rp) amount from public.enzy_money_ledger where business_id=b group by account_id),
money_projection as(select account_id,balance_rp from public.enzy_money_balances where business_id=b),
expected_store as(select s.id location_id,l.lot_id,sum(l.quantity) qty from public.enzy_store_state st join public.enzy_consignment_lines l on l.business_id=st.business_id and l.cycle_id=st.current_cycle_id join public.enzy_stock_locations s on s.business_id=st.business_id and s.store_id=st.store_id where st.business_id=b group by s.id,l.lot_id),
actual_store as(select bl.location_id,bl.lot_id,bl.quantity qty from public.enzy_inventory_balances bl join public.enzy_stock_locations s on s.business_id=bl.business_id and s.id=bl.location_id where bl.business_id=b and s.kind='store_consignment'),
checks as(select jsonb_build_object(
 'stock_projection',(select count(*) from stock_ledger l full join stock_projection p using(location_id,lot_id) where coalesce(l.qty,0)<>coalesce(p.quantity,0)),
 'money_projection',(select count(*) from money_ledger l full join money_projection p using(account_id) where coalesce(l.amount,0)<>coalesce(p.balance_rp,0)),
 'stock_negative',(select count(*) from stock_projection where quantity<0),
 'journal_balance',(select count(*) from public.enzy_money_operations o where o.business_id=b and ((select count(*) from public.enzy_money_ledger l where l.operation_id=o.id)<2 or (select coalesce(sum(delta_rp),0) from public.enzy_money_ledger l where l.operation_id=o.id)<>0)),
 'cash_sign',(select count(*) from money_projection p join public.enzy_money_accounts a on a.id=p.account_id where (a.kind in ('cash','bank','field','agent','receivable','commission_expense','cash_outlay') and p.balance_rp<0) or (a.kind in ('revenue','capital','commission_payable','opening_equity') and p.balance_rp>0)),
 'reserved_funds',(select count(*) from public.enzy_money_accounts a left join money_projection p on p.account_id=a.id where a.business_id=b and a.kind in ('field','agent') and enzy_private.money_reserved(b,a.id)>coalesce(p.balance_rp,0)),
 'receivable_total',case when coalesce((select sum(bl.balance_rp) from public.enzy_money_balances bl join public.enzy_money_accounts a on a.id=bl.account_id where bl.business_id=b and a.system_key='receivable'),0)<>coalesce((select sum(gross_sales_rp-collected_rp) from enzy_private.money_invoices where business_id=b),0) then 1 else 0 end,
 'revenue_total',case when coalesce((select sum(bl.balance_rp) from public.enzy_money_balances bl join public.enzy_money_accounts a on a.id=bl.account_id where bl.business_id=b and a.system_key='revenue'),0)<>-coalesce((select sum(gross_sales_rp) from enzy_private.money_invoices where business_id=b),0) then 1 else 0 end,
 'commission_totals',(case when coalesce((select sum(bl.balance_rp) from public.enzy_money_balances bl join public.enzy_money_accounts a on a.id=bl.account_id where bl.business_id=b and a.system_key='commission_expense'),0)<>coalesce((select sum(commission_earned_rp) from enzy_private.money_invoices where business_id=b),0) then 1 else 0 end)+(case when coalesce((select sum(bl.balance_rp) from public.enzy_money_balances bl join public.enzy_money_accounts a on a.id=bl.account_id where bl.business_id=b and a.system_key='commission_payable'),0)<>-coalesce((select sum(commission_earned_rp-withheld_rp-commission_paid_rp) from enzy_private.money_invoices where business_id=b),0) then 1 else 0 end),
 'invoice_allocations',(select count(*) from enzy_private.money_invoices where business_id=b and (collected_rp>gross_sales_rp or withheld_rp+commission_paid_rp>commission_earned_rp)),
 'consignment_balance',(select count(*) from expected_store e full join actual_store a using(location_id,lot_id) where coalesce(e.qty,0)<>coalesce(a.qty,0)),
 'cycle_pointer',(select count(*) from public.enzy_store_state st join public.enzy_consignment_cycles c on c.id=st.current_cycle_id where st.business_id=b and (c.assignment_id is distinct from st.current_assignment_id or exists(select 1 from public.enzy_inventory_operations r where r.reverse_of=c.opening_visit_id))),
 'table_access',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'enzy\_%' escape '\' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))),
 'function_access',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'enzy\_%' escape '\' or p.proname in ('current_device_id','current_device_role')) and p.prosecdef and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')))) data)
select jsonb_build_object('checked_at',statement_timestamp(),'checks',checks.data,'integrity_ok',not exists(select 1 from jsonb_each_text(checks.data) x where x.value::bigint<>0),
 'opening_eligible',enzy_private.opening_is_fresh(b),
 'opening',(select jsonb_build_object('id',id,'effective_at',effective_at,'created_at',created_at,'reason',reason) from public.enzy_openings where business_id=b),
 'evidence',coalesce((select jsonb_agg(x.data) from(select distinct on(kind) kind,jsonb_build_object('kind',kind,'reference',reference,'note',note,'created_at',created_at,'verification','owner_reported') data from public.enzy_readiness_evidence where business_id=b order by kind,created_at desc,id) x),'[]'::jsonb),
 'legacy_sales_pending',(select count(*) from public.enzy_visits v where v.business_id=b and v.gross_sales_rp>0 and not exists(select 1 from public.enzy_money_operations o where o.visit_id=v.operation_id and o.kind='sale') and not exists(select 1 from public.enzy_inventory_operations r where r.reverse_of=v.operation_id)),
 'incomplete_lots',(select count(*) from public.enzy_inventory_lots where business_id=b and cost_status='COST_INCOMPLETE'),
 'live_approved',false) from checks;
$$;
revoke all on function enzy_private.readiness_report(uuid) from public,anon,authenticated,service_role;
create function enzy_private.opening_plan(b uuid,rec jsonb) returns jsonb language plpgsql set search_path='' as $$
declare item jsonb;k text;stock jsonb:=rec->'stock';money jsonb:=rec->'money';rows_json jsonb:='[]';funds jsonb:='[]';loc public.enzy_stock_locations;product public.enzy_products;acc public.enzy_money_accounts;device public.enzy_devices;agent public.enzy_agents;qty bigint;amount bigint;total numeric:=0;when_at timestamptz;begin
 if not enzy_private.opening_is_fresh(b) then raise exception 'OPENING_NOT_FRESH';end if;
 if jsonb_typeof(rec) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 for k in select jsonb_object_keys(rec) loop if k not in ('effective_at','reason','stock','money','physical_confirmed','legacy_resolved','zero_stock_confirmed','zero_money_confirmed') then raise exception 'INVALID_REQUEST';end if;end loop;
 if rec->'physical_confirmed' is distinct from 'true'::jsonb or rec->'legacy_resolved' is distinct from 'true'::jsonb then raise exception 'OPENING_REVIEW_REQUIRED';end if;
 if length(btrim(coalesce(rec->>'reason',''))) not between 1 and 500 or coalesce(rec->>'effective_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'INVALID_REQUEST';end if;
 when_at:=(rec->>'effective_at')::timestamptz;if not isfinite(when_at) or when_at<'2000-01-01T00:00:00Z'::timestamptz or when_at>clock_timestamp()+interval '5 minutes' then raise exception 'INVALID_REQUEST';end if;
 if jsonb_typeof(stock) is distinct from 'array' or jsonb_typeof(money) is distinct from 'array' then raise exception 'INVALID_REQUEST';end if;
 if jsonb_array_length(stock)>20 or jsonb_array_length(money)>20 then raise exception 'INVALID_REQUEST';end if;
 if jsonb_array_length(stock)=0 and rec->'zero_stock_confirmed' is distinct from 'true'::jsonb then raise exception 'OPENING_REVIEW_REQUIRED';end if;
 if jsonb_array_length(money)=0 and rec->'zero_money_confirmed' is distinct from 'true'::jsonb then raise exception 'OPENING_REVIEW_REQUIRED';end if;
 if (select count(*)<>count(distinct lower(btrim(value->>'lot_code'))) from jsonb_array_elements(stock)) then raise exception 'INVALID_REQUEST';end if;
 for item in select value from jsonb_array_elements(stock) loop
 if jsonb_typeof(item) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 for k in select jsonb_object_keys(item) loop if k not in ('kind','lot_code','product_id','location_id','quantity','expiry_date') then raise exception 'INVALID_REQUEST';end if;end loop;
 if item->>'kind' is null or item->>'kind' not in ('raw','finished') or length(btrim(coalesce(item->>'lot_code',''))) not between 1 and 80 then raise exception 'INVALID_REQUEST';end if;
 qty:=enzy_private.stock_int(item,'quantity',false,1000000000,1);select * into loc from public.enzy_stock_locations where business_id=b and id=(item->>'location_id')::uuid;
 if loc.id is null or loc.kind='store_consignment' or (item->>'kind'='raw' and loc.kind not in ('raw_warehouse','return_quarantine')) or (item->>'kind'='finished' and loc.kind not in ('finished_warehouse','field_custody','agent_custody','return_quarantine')) then raise exception 'INVALID_REFERENCE';end if;
 if loc.kind='field_custody' and not exists(select 1 from public.enzy_devices where id=loc.device_id and role='field' and status='active' and revoked_at is null) then raise exception 'INVALID_REFERENCE';end if;
 if loc.kind='agent_custody' and not exists(select 1 from public.enzy_agents where business_id=b and id=loc.agent_id and is_active) then raise exception 'INVALID_REFERENCE';end if;
 if item->>'kind'='finished' then select * into product from public.enzy_products where business_id=b and id=(item->>'product_id')::uuid and is_active;if product.id is null then raise exception 'INVALID_REFERENCE';end if;
 elsif nullif(item->>'product_id','') is not null then raise exception 'INVALID_REQUEST';else product:=null;end if;
 if nullif(item->>'expiry_date','') is not null then
 if not isfinite((item->>'expiry_date')::date) then raise exception 'INVALID_REQUEST';end if;
 if (item->>'expiry_date')::date<(greatest(when_at,clock_timestamp()) at time zone 'Asia/Jakarta')::date and loc.kind<>'return_quarantine' then raise exception 'EXPIRED_LOT';end if;end if;
 rows_json:=rows_json||jsonb_build_array(jsonb_build_object('kind',item->>'kind','lot_code',btrim(item->>'lot_code'),'product_id',product.id,'product_name',product.name,'sku_code',product.sku_code,'location_id',loc.id,'location_name',loc.label,'quantity',qty,'expiry_date',nullif(item->>'expiry_date','')));
 end loop;
 for item in select value from jsonb_array_elements(money) loop
 if jsonb_typeof(item) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 for k in select jsonb_object_keys(item) loop if k not in ('holder','account_id','device_id','agent_id','amount_rp') then raise exception 'INVALID_REQUEST';end if;end loop;
 amount:=enzy_private.stock_int(item,'amount_rp',false,1000000000000,0);total:=total+amount;
 if item->>'holder'='enzy' then
 select * into acc from public.enzy_money_accounts where business_id=b and id=(item->>'account_id')::uuid and kind in ('cash','bank');
 if acc.id is null or nullif(item->>'device_id','') is not null or nullif(item->>'agent_id','') is not null then raise exception 'INVALID_REFERENCE';end if;
 item:=jsonb_build_object('holder','enzy','account_id',acc.id,'name',acc.label,'amount_rp',amount::text);
 elsif item->>'holder'='field' then
 select * into device from public.enzy_devices where id=(item->>'device_id')::uuid and role='field' and status='active' and revoked_at is null;
 if device.id is null or nullif(item->>'account_id','') is not null or nullif(item->>'agent_id','') is not null then raise exception 'INVALID_REFERENCE';end if;
 item:=jsonb_build_object('holder','field','device_id',device.id,'name',device.device_label,'amount_rp',amount::text);
 elsif item->>'holder'='agent' then
 select * into agent from public.enzy_agents where business_id=b and id=(item->>'agent_id')::uuid and is_active;
 if agent.id is null or nullif(item->>'account_id','') is not null or nullif(item->>'device_id','') is not null then raise exception 'INVALID_REFERENCE';end if;
 item:=jsonb_build_object('holder','agent','agent_id',agent.id,'name',agent.name,'amount_rp',amount::text);
 else raise exception 'INVALID_REQUEST';end if;
 funds:=funds||jsonb_build_array(item);
 end loop;
 if (select count(*)<>count(distinct coalesce(value->>'account_id',value->>'device_id',value->>'agent_id')) from jsonb_array_elements(funds)) then raise exception 'INVALID_REQUEST';end if;
 return jsonb_build_object('effective_at',when_at,'reason',btrim(rec->>'reason'),'stock',rows_json,'money',funds,'money_total_rp',total::text,'cost_status','COST_INCOMPLETE');
end$$;
revoke all on function enzy_private.opening_plan(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.enzy_readiness_action(p_actor uuid,p_action text,p_ip_hash text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.enzy_devices;b uuid;rec jsonb;rid uuid;fingerprint text;previous public.enzy_readiness_requests;plan jsonb;answer jsonb;item jsonb;k text;limit_bucket text;attempts_n int;window_at timestamptz:=date_trunc('minute',clock_timestamp());opening uuid:=gen_random_uuid();stock_op uuid;money_op uuid;lot uuid;account uuid;begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then return jsonb_build_object('error','UNAUTHORIZED');end if;
 if p_action is null or p_action not in ('report','opening_preview','opening_post','evidence') or jsonb_typeof(p_payload) is distinct from 'object' or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 foreach limit_bucket in array array['global:readiness','ip:readiness:'||p_ip_hash,'uid:readiness:'||p_actor::text] loop
 insert into public.enzy_pairing_limits(bucket,window_start,attempts) values(limit_bucket,window_at,1) on conflict(bucket,window_start) do update set attempts=enzy_pairing_limits.attempts+1 returning attempts into attempts_n;
 if attempts_n>(case when limit_bucket like 'global:%' then 500 when limit_bucket like 'ip:%' then 100 else 30 end) then return jsonb_build_object('error','RATE_LIMITED');end if;end loop;
 select * into d from public.enzy_devices where auth_user_id=p_actor for share;
 if d.id is null or d.role is distinct from 'owner' or d.status is distinct from 'active' or d.revoked_at is not null then return jsonb_build_object('error','FORBIDDEN');end if;
 select id into b from public.enzy_businesses where singleton;if b is null then return jsonb_build_object('error','SETUP_REQUIRED');end if;
 begin
 if p_action='report' then return enzy_private.readiness_report(b);end if;
 rec:=p_payload->'record';if jsonb_typeof(rec) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory:'||b::text,0));
 if p_action='opening_preview' then return enzy_private.opening_plan(b,rec);end if;
 rid:=(p_payload->>'request_id')::uuid;if rid is null then raise exception 'INVALID_REQUEST';end if;
 fingerprint:=encode(sha256(convert_to(p_action||p_payload::text,'UTF8')),'hex');select * into previous from public.enzy_readiness_requests where actor_device_id=d.id and request_id=rid;
 if previous.request_id is not null then if previous.payload_hash<>fingerprint then raise exception 'CONFLICT';end if;return previous.result||jsonb_build_object('replayed',true);end if;
 if p_action='evidence' then
 for k in select jsonb_object_keys(rec) loop if k not in ('kind','reference','note') then raise exception 'INVALID_REQUEST';end if;end loop;
 insert into public.enzy_readiness_evidence(business_id,actor_device_id,kind,reference,note) values(b,d.id,rec->>'kind',btrim(rec->>'reference'),btrim(rec->>'note')) returning id into opening;
 answer:=jsonb_build_object('ok',true,'evidence_id',opening);
 else
 plan:=enzy_private.opening_plan(b,rec);
 stock_op:=gen_random_uuid();
 insert into public.enzy_inventory_operations(id,business_id,kind,actor_device_id,occurred_at,reason) values(stock_op,b,'opening',d.id,(plan->>'effective_at')::timestamptz,plan->>'reason');
 if (plan->>'money_total_rp')::numeric>0 then
 money_op:=gen_random_uuid();insert into public.enzy_money_operations(id,business_id,kind,actor_device_id,amount_rp,reason) values(money_op,b,'opening',d.id,(plan->>'money_total_rp')::bigint,plan->>'reason');
 end if;
 insert into public.enzy_openings(id,business_id,actor_device_id,effective_at,reason,stock_snapshot,money_snapshot,inventory_operation_id,money_operation_id) values(opening,b,d.id,(plan->>'effective_at')::timestamptz,plan->>'reason',plan->'stock',plan->'money',stock_op,money_op);
 for item in select value from jsonb_array_elements(plan->'stock') loop
 lot:=gen_random_uuid();insert into public.enzy_inventory_lots(id,business_id,lot_code,kind,opening_id,initial_quantity,product_id,product_name_snapshot,sku_code_snapshot,expiry_date,known_cost_rp,cost_status,unit_cost_rp) values(lot,b,item->>'lot_code',item->>'kind',opening,(item->>'quantity')::bigint,(item->>'product_id')::uuid,item->>'product_name',item->>'sku_code',(item->>'expiry_date')::date,0,'COST_INCOMPLETE',null);
 perform enzy_private.apply_stock_delta(b,stock_op,(item->>'location_id')::uuid,lot,(item->>'quantity')::bigint);
 end loop;
 for item in select value from jsonb_array_elements(plan->'money') loop
 if item->>'holder'='enzy' then account:=(item->>'account_id')::uuid;
 elsif item->>'holder'='field' then
 insert into public.enzy_money_accounts(business_id,label,kind,device_id,created_by_device_id) values(b,'Petugas · '||left(item->>'name',80),'field',(item->>'device_id')::uuid,d.id) on conflict do nothing;
 select id into account from public.enzy_money_accounts where business_id=b and device_id=(item->>'device_id')::uuid;
 else
 insert into public.enzy_money_accounts(business_id,label,kind,agent_id,created_by_device_id) values(b,'Agen · '||left(item->>'name',80),'agent',(item->>'agent_id')::uuid,d.id) on conflict do nothing;
 select id into account from public.enzy_money_accounts where business_id=b and agent_id=(item->>'agent_id')::uuid;
 end if;
 if (item->>'amount_rp')::bigint>0 then perform enzy_private.money_delta(b,money_op,account,(item->>'amount_rp')::bigint);end if;
 end loop;
 if money_op is not null then perform enzy_private.money_delta(b,money_op,enzy_private.money_system(b,'opening_equity'),-(plan->>'money_total_rp')::bigint);end if;
 answer:=jsonb_build_object('ok',true,'opening_id',opening);
 end if;
 insert into public.enzy_inventory_audit(business_id,actor_device_id,action,entity_id) values(b,d.id,'readiness_'||p_action,opening);
 insert into public.enzy_readiness_requests(actor_device_id,request_id,payload_hash,result) values(d.id,rid,fingerprint,answer);return answer;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or not_null_violation or check_violation then return jsonb_build_object('error','INVALID_REQUEST');
 when unique_violation then return jsonb_build_object('error','CONFLICT');when foreign_key_violation then return jsonb_build_object('error','INVALID_REFERENCE');
 when raise_exception then if SQLERRM in ('INVALID_REQUEST','INVALID_REFERENCE','CONFLICT','OPENING_NOT_FRESH','OPENING_REVIEW_REQUIRED','EXPIRED_LOT') then return jsonb_build_object('error',SQLERRM);end if;raise;
 end;
end$$;
revoke all on function public.enzy_readiness_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enzy_readiness_action(uuid,text,text,jsonb) to service_role;
-- Opening corrections cannot bypass atomic stock/money cut-off via generic reversal.
alter function public.enzy_inventory_action(uuid,text,text,jsonb) set schema enzy_private;
alter function enzy_private.enzy_inventory_action(uuid,text,text,jsonb) rename to inventory_action_v6;
revoke all on function enzy_private.inventory_action_v6(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.enzy_inventory_action(p_actor uuid,p_action text,p_ip_hash text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$begin
 if p_action='reverse' and exists(select 1 from public.enzy_inventory_operations where id=(p_payload->'record'->>'operation_id')::uuid and kind='opening') then
 if not exists(select 1 from public.enzy_devices where auth_user_id=p_actor and role='owner' and status='active' and revoked_at is null) then return jsonb_build_object('error','FORBIDDEN');end if;
 return jsonb_build_object('error','OPENING_CORRECTION_REQUIRED');end if;
 return enzy_private.inventory_action_v6(p_actor,p_action,p_ip_hash,p_payload);
 exception when invalid_text_representation then return jsonb_build_object('error','INVALID_REQUEST');
end$$;
revoke all on function public.enzy_inventory_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enzy_inventory_action(uuid,text,text,jsonb) to service_role;
alter function public.enzy_finance_action(uuid,text,text,jsonb) set schema enzy_private;
alter function enzy_private.enzy_finance_action(uuid,text,text,jsonb) rename to finance_action_v6;
revoke all on function enzy_private.finance_action_v6(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.enzy_finance_action(p_actor uuid,p_action text,p_ip_hash text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$begin
 if p_action='reverse' and exists(select 1 from public.enzy_money_operations where id=(p_payload->'record'->>'operation_id')::uuid and kind='opening') then
 if not exists(select 1 from public.enzy_devices where auth_user_id=p_actor and role='owner' and status='active' and revoked_at is null) then return jsonb_build_object('error','FORBIDDEN');end if;
 return jsonb_build_object('error','OPENING_CORRECTION_REQUIRED');end if;
 return enzy_private.finance_action_v6(p_actor,p_action,p_ip_hash,p_payload);
 exception when invalid_text_representation then return jsonb_build_object('error','INVALID_REQUEST');
end$$;
revoke all on function public.enzy_finance_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enzy_finance_action(uuid,text,text,jsonb) to service_role;
commit;
