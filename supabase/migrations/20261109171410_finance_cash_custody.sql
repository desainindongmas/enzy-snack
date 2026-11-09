-- Phase 6. Manual TEST migration. No historical cash/opening balance inferred.
begin;
create table public.enzy_money_accounts(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.enzy_businesses(id),label text not null check(length(btrim(label)) between 1 and 100),
 kind text not null check(kind in ('cash','bank','field','agent','receivable','revenue','commission_expense','commission_payable','capital','cash_outlay')),
 system_key text,device_id uuid references public.enzy_devices(id),agent_id uuid,created_at timestamptz not null default clock_timestamp(),created_by_device_id uuid references public.enzy_devices(id),
 unique(business_id,id),unique(business_id,system_key),foreign key(business_id,agent_id) references public.enzy_agents(business_id,id),
 check((kind='field' and device_id is not null and agent_id is null) or(kind='agent' and agent_id is not null and device_id is null) or(kind not in ('field','agent') and device_id is null and agent_id is null)));
create unique index enzy_money_field_unique on public.enzy_money_accounts(business_id,device_id) where device_id is not null;
create unique index enzy_money_agent_unique on public.enzy_money_accounts(business_id,agent_id) where agent_id is not null;
create index enzy_money_account_actor_idx on public.enzy_money_accounts(created_by_device_id);
insert into public.enzy_money_accounts(business_id,label,kind,system_key) select b.id,x.label,x.kind,x.kind from public.enzy_businesses b cross join (values
 ('Piutang penjualan','receivable'),('Penjualan terverifikasi','revenue'),('Komisi diperoleh','commission_expense'),('Komisi belum dipotong/dibayar','commission_payable'),('Modal pemilik','capital'),('Pengeluaran kas tercatat','cash_outlay')) x(label,kind) where b.singleton;
create table public.enzy_money_proposals(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,source_account_id uuid not null,destination_account_id uuid not null,
 amount_rp bigint not null check(amount_rp between 1 and 1000000000000),actor_device_id uuid not null references public.enzy_devices(id),reason text not null check(length(btrim(reason)) between 1 and 500),created_at timestamptz not null default clock_timestamp(),
 unique(business_id,id),foreign key(business_id,source_account_id) references public.enzy_money_accounts(business_id,id),foreign key(business_id,destination_account_id) references public.enzy_money_accounts(business_id,id));
create index enzy_proposal_source_idx on public.enzy_money_proposals(business_id,source_account_id);
create index enzy_proposal_dest_idx on public.enzy_money_proposals(business_id,destination_account_id);
create index enzy_proposal_actor_idx on public.enzy_money_proposals(actor_device_id);
create table public.enzy_money_cancellations(
 proposal_id uuid primary key,business_id uuid not null,actor_device_id uuid not null references public.enzy_devices(id),reason text not null check(length(btrim(reason)) between 1 and 500),created_at timestamptz not null default clock_timestamp(),
 foreign key(business_id,proposal_id) references public.enzy_money_proposals(business_id,id));
create index enzy_cancel_actor_idx on public.enzy_money_cancellations(actor_device_id);
create table public.enzy_money_operations(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.enzy_businesses(id),
 kind text not null check(kind in ('sale','collection','confirmation','commission_payment','capital_in','capital_out','cash_out','reversal')),
 actor_device_id uuid not null references public.enzy_devices(id),visit_id uuid,account_id uuid,proposal_id uuid,reverse_of uuid unique,
 amount_rp bigint not null check(amount_rp>0),withheld_rp bigint not null default 0 check(withheld_rp>=0 and withheld_rp<=amount_rp),
 category text,reason text not null check(length(btrim(reason)) between 1 and 500),created_at timestamptz not null default clock_timestamp(),
 unique(business_id,id),foreign key(business_id,visit_id) references public.enzy_visits(business_id,operation_id),foreign key(business_id,account_id) references public.enzy_money_accounts(business_id,id),
 foreign key(business_id,proposal_id) references public.enzy_money_proposals(business_id,id),foreign key(business_id,reverse_of) references public.enzy_money_operations(business_id,id),check((kind='reversal')=(reverse_of is not null)));
create unique index enzy_money_sale_unique on public.enzy_money_operations(business_id,visit_id) where kind='sale';
create index enzy_money_ops_visit_idx on public.enzy_money_operations(business_id,visit_id);
create index enzy_money_ops_account_idx on public.enzy_money_operations(business_id,account_id);
create index enzy_money_ops_proposal_idx on public.enzy_money_operations(business_id,proposal_id);
create index enzy_money_ops_actor_idx on public.enzy_money_operations(actor_device_id);
create index enzy_money_ops_order_idx on public.enzy_money_operations(business_id,created_at desc,id);
create table public.enzy_money_balances(
 business_id uuid not null,account_id uuid not null,balance_rp numeric(30,0) not null default 0,version bigint not null default 1,
 primary key(business_id,account_id),foreign key(business_id,account_id) references public.enzy_money_accounts(business_id,id));
create table public.enzy_money_ledger(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,operation_id uuid not null,account_id uuid not null,delta_rp bigint not null check(delta_rp<>0),created_at timestamptz not null default clock_timestamp(),
 foreign key(business_id,operation_id) references public.enzy_money_operations(business_id,id),foreign key(business_id,account_id) references public.enzy_money_accounts(business_id,id));
create index enzy_money_ledger_op_idx on public.enzy_money_ledger(business_id,operation_id);
create index enzy_money_ledger_account_idx on public.enzy_money_ledger(business_id,account_id,created_at desc);
create table public.enzy_money_requests(actor_device_id uuid not null references public.enzy_devices(id),request_id uuid not null,payload_hash text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(actor_device_id,request_id));
do $$declare t text;begin foreach t in array array['enzy_money_accounts','enzy_money_proposals','enzy_money_cancellations','enzy_money_operations','enzy_money_balances','enzy_money_ledger','enzy_money_requests'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);
 if t not in ('enzy_money_balances','enzy_money_requests') then execute format('create trigger %I before update or delete on public.%I for each row execute function public.enzy_audit_append_only()',t||'_immutable',t);end if;end loop;end$$;
create view enzy_private.money_invoices with(security_invoker=true) as
 select v.*,a.channel,a.agent_id,a.agent_name_snapshot,
 coalesce((select sum(o.amount_rp) from public.enzy_money_operations o where o.visit_id=v.operation_id and o.kind='collection' and not exists(select 1 from public.enzy_money_operations r where r.reverse_of=o.id)),0) collected_rp,
 coalesce((select sum(o.withheld_rp) from public.enzy_money_operations o where o.visit_id=v.operation_id and o.kind='collection' and not exists(select 1 from public.enzy_money_operations r where r.reverse_of=o.id)),0) withheld_rp,
 coalesce((select sum(o.amount_rp) from public.enzy_money_operations o where o.visit_id=v.operation_id and o.kind='commission_payment' and not exists(select 1 from public.enzy_money_operations r where r.reverse_of=o.id)),0) commission_paid_rp
 from public.enzy_visits v join public.enzy_store_assignments a on a.business_id=v.business_id and a.id=v.assignment_id
 where exists(select 1 from public.enzy_money_operations s where s.visit_id=v.operation_id and s.kind='sale') and not exists(select 1 from public.enzy_inventory_operations r where r.reverse_of=v.operation_id);
create view enzy_private.money_remittances with(security_invoker=true) as
 select p.*,coalesce((select sum(o.amount_rp) from public.enzy_money_operations o where o.proposal_id=p.id and o.kind='confirmation' and not exists(select 1 from public.enzy_money_operations r where r.reverse_of=o.id)),0) confirmed_rp,
 exists(select 1 from public.enzy_money_cancellations c where c.proposal_id=p.id) cancelled from public.enzy_money_proposals p;
revoke all on enzy_private.money_invoices,enzy_private.money_remittances from public,anon,authenticated,service_role;
create function enzy_private.money_reserved(b uuid,account uuid) returns numeric language sql stable set search_path='' as $$select coalesce(sum(amount_rp-confirmed_rp),0) from enzy_private.money_remittances where business_id=b and source_account_id=account and not cancelled$$;
create function enzy_private.money_delta(b uuid,op uuid,account uuid,amount bigint,release_reserved bigint default 0)
returns void language plpgsql set search_path='' as $$
declare q numeric;kind_name text;
begin
 if amount=0 then return;end if;
 select kind into kind_name from public.enzy_money_accounts where business_id=b and id=account;
 if kind_name is null then raise exception 'INVALID_REFERENCE';end if;
 insert into public.enzy_money_balances(business_id,account_id) values(b,account) on conflict do nothing;
 select balance_rp into q from public.enzy_money_balances where business_id=b and account_id=account for update;
 if kind_name in ('cash','bank','field','agent','receivable','commission_expense','cash_outlay') and q+amount<0 then raise exception 'INSUFFICIENT_FUNDS';end if;
 if kind_name in ('revenue','capital','commission_payable') and q+amount>0 then raise exception 'INSUFFICIENT_FUNDS';end if;
 if kind_name in ('field','agent') and amount<0 and q+amount<enzy_private.money_reserved(b,account)-release_reserved then raise exception 'FUNDS_RESERVED';end if;
 update public.enzy_money_balances set balance_rp=balance_rp+amount,version=version+1 where business_id=b and account_id=account;
 insert into public.enzy_money_ledger(business_id,operation_id,account_id,delta_rp) values(b,op,account,amount);
end$$;
create function enzy_private.money_check() returns trigger language plpgsql set search_path='' as $$
begin
 if (select count(*)<2 or coalesce(sum(delta_rp),0)<>0 from public.enzy_money_ledger where operation_id=NEW.id) then raise exception 'UNBALANCED_JOURNAL';end if;return null;
end$$;
create constraint trigger enzy_money_balanced after insert on public.enzy_money_operations deferrable initially deferred for each row execute function enzy_private.money_check();
create function enzy_private.money_system(b uuid,k text) returns uuid language sql stable set search_path='' as $$select id from public.enzy_money_accounts where business_id=b and system_key=k$$;
create function enzy_private.money_sale(v public.enzy_visits,actor uuid,note text)
returns uuid language plpgsql set search_path='' as $$declare op uuid:=gen_random_uuid();begin
 if v.gross_sales_rp<=0 then return null;end if;
 insert into public.enzy_money_operations(id,business_id,kind,actor_device_id,visit_id,amount_rp,reason) values(op,v.business_id,'sale',actor,v.operation_id,v.gross_sales_rp,note);
 perform enzy_private.money_delta(v.business_id,op,enzy_private.money_system(v.business_id,'receivable'),v.gross_sales_rp);
 perform enzy_private.money_delta(v.business_id,op,enzy_private.money_system(v.business_id,'revenue'),-v.gross_sales_rp);
 perform enzy_private.money_delta(v.business_id,op,enzy_private.money_system(v.business_id,'commission_expense'),v.commission_earned_rp);
 perform enzy_private.money_delta(v.business_id,op,enzy_private.money_system(v.business_id,'commission_payable'),-v.commission_earned_rp);
 insert into public.enzy_inventory_audit(business_id,actor_device_id,action,entity_id) values(v.business_id,actor,'money_sale',op);return op;
end$$;
create function enzy_private.money_reverse(b uuid,original uuid,actor uuid,note text)
returns uuid language plpgsql set search_path='' as $$declare old public.enzy_money_operations;leg public.enzy_money_ledger;op uuid:=gen_random_uuid();begin
 select * into old from public.enzy_money_operations where business_id=b and id=original;
 if old.id is null then raise exception 'NOT_FOUND';end if;
 if old.kind='reversal' or exists(select 1 from public.enzy_money_operations where reverse_of=old.id) then raise exception 'CONFLICT';end if;
 if old.kind='sale' and exists(select 1 from public.enzy_money_operations o where o.visit_id=old.visit_id and o.kind in ('collection','commission_payment') and not exists(select 1 from public.enzy_money_operations r where r.reverse_of=o.id)) then raise exception 'FINANCE_DEPENDENCY';end if;
 insert into public.enzy_money_operations(id,business_id,kind,actor_device_id,visit_id,account_id,proposal_id,reverse_of,amount_rp,reason) values(op,b,'reversal',actor,old.visit_id,old.account_id,old.proposal_id,old.id,old.amount_rp,note);
 for leg in select * from public.enzy_money_ledger where operation_id=old.id order by account_id,id loop perform enzy_private.money_delta(b,op,leg.account_id,-leg.delta_rp);end loop;
 return op;
end$$;
create function enzy_private.visit_money_hook() returns trigger language plpgsql set search_path='' as $$declare op uuid;actor uuid;begin
 select actor_device_id into actor from public.enzy_inventory_operations where id=NEW.operation_id;
 perform enzy_private.money_sale(NEW,actor,'Penjualan terverifikasi dari kunjungan');return null;
end$$;
create trigger enzy_visit_money after insert on public.enzy_visits for each row execute function enzy_private.visit_money_hook();
create function enzy_private.visit_money_reverse_hook() returns trigger language plpgsql set search_path='' as $$declare sale_id uuid;begin
 if NEW.kind='reversal' and exists(select 1 from public.enzy_visits where operation_id=NEW.reverse_of) then
 select id into sale_id from public.enzy_money_operations where visit_id=NEW.reverse_of and kind='sale';
 if sale_id is not null then perform enzy_private.money_reverse(NEW.business_id,sale_id,NEW.actor_device_id,NEW.reason);end if;end if;return null;
end$$;
create trigger enzy_visit_money_reverse after insert on public.enzy_inventory_operations for each row execute function enzy_private.visit_money_reverse_hook();
create function enzy_private.money_read(b uuid,d public.enzy_devices,p jsonb)
returns jsonb language plpgsql set search_path='' as $$declare base text;answer jsonb;k text:=p->>'kind';page_n int:=coalesce((p->>'page')::int,1);q text:='%'||coalesce(p->>'search','')||'%';begin
 if page_n not between 1 and 10000 or length(q)>122 then raise exception 'INVALID_REQUEST';end if;
 if k='accounts' then
 base:=$q$select jsonb_build_object('id',a.id,'name',a.label,'kind',a.kind,'device_id',a.device_id,'agent_id',a.agent_id)||case when $2='owner' or a.device_id=$3 then jsonb_build_object('balance_rp',coalesce(bl.balance_rp,0)::text,'reserved_rp',enzy_private.money_reserved(a.business_id,a.id)::text,'available_rp',(coalesce(bl.balance_rp,0)-enzy_private.money_reserved(a.business_id,a.id))::text) else '{}'::jsonb end data,a.created_at sort_at,a.id sort_id
 from public.enzy_money_accounts a left join public.enzy_money_balances bl on bl.business_id=a.business_id and bl.account_id=a.id
 where a.business_id=$1 and a.label ilike $4 and (a.kind in ('cash','bank') or ($2='owner' and a.kind in ('field','agent')) or (a.kind='field' and a.device_id=$3))$q$;
 elsif k='invoices' then
 base:=$q$select jsonb_build_object('id',i.operation_id,'store_name',i.store_name_snapshot,'channel',i.channel,'occurred_at',i.occurred_at,'gross_sales_rp',i.gross_sales_rp::text,'collected_rp',i.collected_rp::text,'outstanding_rp',(i.gross_sales_rp-i.collected_rp)::text)||case when $2='owner' then jsonb_build_object('enzy_due_rp',i.enzy_due_rp::text,'commission_earned_rp',i.commission_earned_rp::text,'withheld_rp',i.withheld_rp::text,'commission_paid_rp',i.commission_paid_rp::text,'commission_remaining_rp',(i.commission_earned_rp-i.withheld_rp-i.commission_paid_rp)::text,'agent_name',i.agent_name_snapshot) else '{}'::jsonb end data,i.occurred_at sort_at,i.operation_id sort_id
 from enzy_private.money_invoices i left join public.enzy_store_state st on st.business_id=i.business_id and st.store_id=i.store_id left join public.enzy_store_assignments a on a.business_id=st.business_id and a.id=st.current_assignment_id
 where i.business_id=$1 and i.store_name_snapshot ilike $4 and ($2='owner' or(i.channel='direct' and a.field_device_id=$3))$q$;
 elsif k='proposals' then
 base:=$q$select jsonb_build_object('id',p.id,'name',s.label,'destination_name',t.label,'source_account_id',s.id,'destination_account_id',t.id,'amount_rp',p.amount_rp::text,'confirmed_rp',p.confirmed_rp::text,'remaining_rp',(p.amount_rp-p.confirmed_rp)::text,'cancelled',p.cancelled,'reason',p.reason) data,p.created_at sort_at,p.id sort_id
 from enzy_private.money_remittances p join public.enzy_money_accounts s on s.business_id=p.business_id and s.id=p.source_account_id join public.enzy_money_accounts t on t.business_id=p.business_id and t.id=p.destination_account_id
 where p.business_id=$1 and s.label ilike $4 and ($2='owner' or s.device_id=$3)$q$;
 elsif k='history' then
 base:=$q$select jsonb_build_object('id',o.id,'kind',o.kind,'visit_id',o.visit_id,'amount_rp',o.amount_rp::text,'withheld_rp',o.withheld_rp::text,'name',a.label,'reason',o.reason,'category',o.category,'occurred_at',o.created_at,'reverse_of',o.reverse_of,'reversed',exists(select 1 from public.enzy_money_operations r where r.reverse_of=o.id)) data,o.created_at sort_at,o.id sort_id
 from public.enzy_money_operations o left join public.enzy_money_accounts a on a.business_id=o.business_id and a.id=o.account_id
 where o.business_id=$1 and o.reason ilike $4 and ($2='owner' or (a.kind='field' and a.device_id=$3 and o.kind in ('collection','confirmation','reversal')))$q$;
 elsif k='legacy' then
 if d.role<>'owner' then raise exception 'FORBIDDEN';end if;
 base:=$q$select jsonb_build_object('id',v.operation_id,'store_name',v.store_name_snapshot,'gross_sales_rp',v.gross_sales_rp::text,'occurred_at',v.occurred_at) data,v.occurred_at sort_at,v.operation_id sort_id from public.enzy_visits v where v.business_id=$1 and v.gross_sales_rp>0 and v.store_name_snapshot ilike $4 and not exists(select 1 from public.enzy_money_operations o where o.visit_id=v.operation_id and o.kind='sale') and not exists(select 1 from public.enzy_inventory_operations r where r.reverse_of=v.operation_id)$q$;
 elsif k='summary' then
 if d.role<>'owner' then raise exception 'FORBIDDEN';end if;
 select jsonb_build_object('sales_rp',coalesce(sum(gross_sales_rp),0)::text,'collected_rp',coalesce(sum(collected_rp),0)::text,'outstanding_rp',coalesce(sum(gross_sales_rp-collected_rp),0)::text,'earned_rp',coalesce(sum(commission_earned_rp),0)::text,'withheld_rp',coalesce(sum(withheld_rp),0)::text,'commission_paid_rp',coalesce(sum(commission_paid_rp),0)::text,'profit_rp',null,'enzy_cash_movement_rp',(select coalesce(sum(bl.balance_rp),0)::text from public.enzy_money_balances bl join public.enzy_money_accounts a on a.business_id=bl.business_id and a.id=bl.account_id where bl.business_id=b and a.kind in ('cash','bank'))) into answer from enzy_private.money_invoices where business_id=b;return answer;
 else raise exception 'INVALID_REQUEST';end if;
 execute 'with visible as ('||base||'),paged as(select * from visible order by sort_at desc,sort_id limit 20 offset $5) select jsonb_build_object(''records'',coalesce((select jsonb_agg(data) from paged),''[]''::jsonb),''count'',(select count(*) from visible),''page'',$6)' into answer using b,d.role,d.id,q,(page_n-1)*20,page_n;return answer;
end$$;
create function public.enzy_finance_action(p_actor uuid,p_action text,p_ip_hash text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.enzy_devices;b uuid;rec jsonb;rid uuid;fingerprint text;previous public.enzy_money_requests;answer jsonb;k text;limit_bucket text;attempts_n int;window_at timestamptz:=date_trunc('minute',clock_timestamp());
 op uuid:=gen_random_uuid();acc public.enzy_money_accounts;dst public.enzy_money_accounts;device public.enzy_devices;invoice enzy_private.money_invoices;proposal enzy_private.money_remittances;old public.enzy_money_operations;v public.enzy_visits;
 amount bigint;withheld bigint:=0;account uuid;collector uuid;reason text;available numeric;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then return jsonb_build_object('error','UNAUTHORIZED');end if;
 if p_action is null or p_action not in ('list','account','collect','propose','confirm','cancel','capital_in','capital_out','cash_out','commission_payment','reverse','recognize') or jsonb_typeof(p_payload) is distinct from 'object' or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','INVALID_REQUEST');end if;
 foreach limit_bucket in array array['global:money','ip:money:'||p_ip_hash,'uid:money:'||p_actor::text] loop
 insert into public.enzy_pairing_limits(bucket,window_start,attempts) values(limit_bucket,window_at,1) on conflict(bucket,window_start) do update set attempts=enzy_pairing_limits.attempts+1 returning attempts into attempts_n;
 if attempts_n>(case when limit_bucket like 'global:%' then 3000 when limit_bucket like 'ip:%' then 300 else 100 end) then return jsonb_build_object('error','RATE_LIMITED');end if;end loop;
 select * into d from public.enzy_devices where auth_user_id=p_actor for share;
 if d.id is null or d.status is distinct from 'active' or d.revoked_at is not null or d.role not in ('owner','field') then return jsonb_build_object('error','FORBIDDEN');end if;
 select id into b from public.enzy_businesses where singleton;if b is null then return jsonb_build_object('error','SETUP_REQUIRED');end if;
 begin
 if p_action='list' then return enzy_private.money_read(b,d,p_payload);end if;
 if d.role<>'owner' and p_action not in ('collect','propose','cancel') then raise exception 'FORBIDDEN';end if;
 rec:=p_payload->'record';rid:=(p_payload->>'request_id')::uuid;
 if rid is null or jsonb_typeof(rec) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory:'||b::text,0));
 fingerprint:=encode(sha256(convert_to(p_action||p_payload::text,'UTF8')),'hex');select * into previous from public.enzy_money_requests where actor_device_id=d.id and request_id=rid;
 if previous.request_id is not null then
 if previous.payload_hash<>fingerprint then raise exception 'CONFLICT';end if;
 if d.role='field' and p_action='collect' and not exists(select 1 from public.enzy_money_operations o join public.enzy_visits prior_visit on prior_visit.operation_id=o.visit_id join public.enzy_store_state st on st.business_id=prior_visit.business_id and st.store_id=prior_visit.store_id join public.enzy_store_assignments a on a.business_id=st.business_id and a.id=st.current_assignment_id where o.id=(previous.result->>'operation_id')::uuid and o.business_id=b and a.field_device_id=d.id) then raise exception 'FORBIDDEN';end if;
 return previous.result||jsonb_build_object('replayed',true);end if;
 for k in select jsonb_object_keys(rec) loop
 if not(k=any(case p_action when 'account' then array['name','kind','reason'] when 'collect' then array['visit_id','amount_rp','withheld_rp','account_id','collector_device_id','reason'] when 'propose' then array['account_id','destination_account_id','amount_rp','reason'] when 'confirm' then array['proposal_id','amount_rp','reason'] when 'cancel' then array['proposal_id','reason'] when 'recognize' then array['visit_id','reason'] when 'reverse' then array['operation_id','reason'] when 'commission_payment' then array['visit_id','account_id','amount_rp','reason'] when 'cash_out' then array['account_id','amount_rp','category','reason'] else array['account_id','amount_rp','reason'] end)) then raise exception 'INVALID_REQUEST';end if;end loop;
 reason:=btrim(coalesce(rec->>'reason',''));if length(reason) not between 1 and 500 then raise exception 'INVALID_REQUEST';end if;
 if p_action='account' then
 if rec->>'kind' is null or rec->>'kind' not in ('cash','bank') or length(btrim(coalesce(rec->>'name',''))) not between 1 and 100 then raise exception 'INVALID_REQUEST';end if;
 insert into public.enzy_money_accounts(business_id,label,kind,created_by_device_id) values(b,btrim(rec->>'name'),rec->>'kind',d.id) returning id into account;answer:=jsonb_build_object('ok',true,'account_id',account);
 elsif p_action='recognize' then
 select * into v from public.enzy_visits where business_id=b and operation_id=(rec->>'visit_id')::uuid;
 if v.operation_id is null or v.gross_sales_rp<=0 or exists(select 1 from public.enzy_inventory_operations where reverse_of=v.operation_id) then raise exception 'INVALID_REFERENCE';end if;
 op:=enzy_private.money_sale(v,d.id,reason);answer:=jsonb_build_object('ok',true,'operation_id',op);
 elsif p_action='reverse' then
 select * into old from public.enzy_money_operations where business_id=b and id=(rec->>'operation_id')::uuid;
 if old.id is null then raise exception 'NOT_FOUND';end if;if old.kind in ('sale','reversal') then raise exception 'VISIT_CORRECTION_REQUIRED';end if;
 op:=enzy_private.money_reverse(b,old.id,d.id,reason);answer:=jsonb_build_object('ok',true,'operation_id',op);
 elsif p_action='cancel' then
 select * into proposal from enzy_private.money_remittances where business_id=b and id=(rec->>'proposal_id')::uuid;
 if proposal.id is null then raise exception 'NOT_FOUND';end if;
 select * into acc from public.enzy_money_accounts where business_id=b and id=proposal.source_account_id;
 if d.role<>'owner' and acc.device_id is distinct from d.id then raise exception 'FORBIDDEN';end if;
 if proposal.cancelled or proposal.confirmed_rp>=proposal.amount_rp then raise exception 'CONFLICT';end if;
 insert into public.enzy_money_cancellations(proposal_id,business_id,actor_device_id,reason) values(proposal.id,b,d.id,reason);op:=proposal.id;answer:=jsonb_build_object('ok',true,'proposal_id',proposal.id);
 else
 amount:=enzy_private.stock_int(rec,'amount_rp',false,1000000000000,1);
 if p_action='collect' then
 select * into invoice from enzy_private.money_invoices where business_id=b and operation_id=(rec->>'visit_id')::uuid;
 if invoice.operation_id is null then raise exception 'INVALID_REFERENCE';end if;
 if d.role='field' and (invoice.channel<>'direct' or not exists(select 1 from public.enzy_store_state st join public.enzy_store_assignments a on a.business_id=st.business_id and a.id=st.current_assignment_id where st.business_id=b and st.store_id=invoice.store_id and a.field_device_id=d.id)) then raise exception 'FORBIDDEN';end if;
 if amount>invoice.gross_sales_rp-invoice.collected_rp then raise exception 'OVER_COLLECTION';end if;
 withheld:=enzy_private.stock_int(rec,'withheld_rp',false,1000000000000,0);
 if withheld>amount or withheld>invoice.commission_earned_rp-invoice.withheld_rp-invoice.commission_paid_rp or (invoice.channel='direct' and withheld<>0) then raise exception 'OVER_COMMISSION';end if;
 if invoice.channel='agent' then
 if nullif(rec->>'collector_device_id','') is not null or nullif(rec->>'account_id','') is not null then raise exception 'INVALID_REQUEST';end if;
 insert into public.enzy_money_accounts(business_id,label,kind,agent_id,created_by_device_id) values(b,'Agen · '||left(invoice.agent_name_snapshot,80),'agent',invoice.agent_id,d.id) on conflict do nothing;
 select id into account from public.enzy_money_accounts where business_id=b and agent_id=invoice.agent_id;
 else
 collector:=case when d.role='field' then d.id else nullif(rec->>'collector_device_id','')::uuid end;
 if d.role='field' and nullif(rec->>'collector_device_id','') is not null and (rec->>'collector_device_id')::uuid<>d.id then raise exception 'FORBIDDEN';end if;
 if collector is not null then
 if nullif(rec->>'account_id','') is not null then raise exception 'INVALID_REQUEST';end if;
 select * into device from public.enzy_devices where id=collector for share;
 if device.role is distinct from 'field' or device.status is distinct from 'active' or device.revoked_at is not null then raise exception 'INVALID_REFERENCE';end if;
 insert into public.enzy_money_accounts(business_id,label,kind,device_id,created_by_device_id) values(b,'Petugas · '||left(device.device_label,80),'field',device.id,d.id) on conflict do nothing;
 select id into account from public.enzy_money_accounts where business_id=b and device_id=device.id;
 else
 select * into acc from public.enzy_money_accounts where business_id=b and id=(rec->>'account_id')::uuid and kind in ('cash','bank');if acc.id is null then raise exception 'INVALID_REFERENCE';end if;account:=acc.id;
 end if;end if;
 insert into public.enzy_money_operations(id,business_id,kind,actor_device_id,visit_id,account_id,amount_rp,withheld_rp,reason) values(op,b,'collection',d.id,invoice.operation_id,account,amount,withheld,reason);
 perform enzy_private.money_delta(b,op,account,amount-withheld);
 perform enzy_private.money_delta(b,op,enzy_private.money_system(b,'commission_payable'),withheld);
 perform enzy_private.money_delta(b,op,enzy_private.money_system(b,'receivable'),-amount);
 elsif p_action='propose' then
 select * into acc from public.enzy_money_accounts where business_id=b and id=(rec->>'account_id')::uuid and kind in ('field','agent');
 select * into dst from public.enzy_money_accounts where business_id=b and id=(rec->>'destination_account_id')::uuid and kind in ('cash','bank');
 if acc.id is null or dst.id is null then raise exception 'INVALID_REFERENCE';end if;
 if d.role<>'owner' and acc.device_id is distinct from d.id then raise exception 'FORBIDDEN';end if;
 available:=coalesce((select balance_rp from public.enzy_money_balances where business_id=b and account_id=acc.id),0)-enzy_private.money_reserved(b,acc.id);
 if amount>available then raise exception 'INSUFFICIENT_FUNDS';end if;
 insert into public.enzy_money_proposals(business_id,source_account_id,destination_account_id,amount_rp,actor_device_id,reason) values(b,acc.id,dst.id,amount,d.id,reason) returning id into op;answer:=jsonb_build_object('ok',true,'proposal_id',op);
 elsif p_action='confirm' then
 select * into proposal from enzy_private.money_remittances where business_id=b and id=(rec->>'proposal_id')::uuid;
 if proposal.id is null then raise exception 'NOT_FOUND';end if;
 if proposal.cancelled or amount>proposal.amount_rp-proposal.confirmed_rp then raise exception 'OVER_REMITTANCE';end if;
 -- The new header reduces only this proposal reservation before custody debit.
 insert into public.enzy_money_operations(id,business_id,kind,actor_device_id,account_id,proposal_id,amount_rp,reason) values(op,b,'confirmation',d.id,proposal.source_account_id,proposal.id,amount,reason);
 perform enzy_private.money_delta(b,op,proposal.source_account_id,-amount);
 perform enzy_private.money_delta(b,op,proposal.destination_account_id,amount);
 elsif p_action in ('capital_in','capital_out','cash_out','commission_payment') then
 select * into acc from public.enzy_money_accounts where business_id=b and id=(rec->>'account_id')::uuid and kind in ('cash','bank');if acc.id is null then raise exception 'INVALID_REFERENCE';end if;
 if p_action='cash_out' and (rec->>'category' is null or rec->>'category' not in ('supplier_payment','packaging','labor','transport','other')) then raise exception 'INVALID_REQUEST';end if;
 if p_action='commission_payment' then
 select * into invoice from enzy_private.money_invoices where business_id=b and operation_id=(rec->>'visit_id')::uuid;
 if invoice.operation_id is null or invoice.channel<>'agent' then raise exception 'INVALID_REFERENCE';end if;
 if amount>invoice.commission_earned_rp-invoice.withheld_rp-invoice.commission_paid_rp then raise exception 'OVER_COMMISSION';end if;end if;
 insert into public.enzy_money_operations(id,business_id,kind,actor_device_id,account_id,visit_id,amount_rp,category,reason) values(op,b,p_action,d.id,acc.id,case when p_action='commission_payment' then invoice.operation_id else null end,amount,rec->>'category',reason);
 if p_action='capital_in' then
 perform enzy_private.money_delta(b,op,acc.id,amount);perform enzy_private.money_delta(b,op,enzy_private.money_system(b,'capital'),-amount);
 else
 perform enzy_private.money_delta(b,op,acc.id,-amount);perform enzy_private.money_delta(b,op,enzy_private.money_system(b,case when p_action='capital_out' then 'capital' when p_action='commission_payment' then 'commission_payable' else 'cash_outlay' end),amount);
 end if;
 end if;
 if answer is null then answer:=jsonb_build_object('ok',true,'operation_id',op);end if;
 end if;
 insert into public.enzy_inventory_audit(business_id,actor_device_id,action,entity_id) values(b,d.id,'money_'||p_action,coalesce(account,op));
 insert into public.enzy_money_requests(actor_device_id,request_id,payload_hash,result) values(d.id,rid,fingerprint,answer);return answer;
 exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation or check_violation then return jsonb_build_object('error','INVALID_REQUEST');
 when unique_violation then return jsonb_build_object('error','CONFLICT');when foreign_key_violation then return jsonb_build_object('error','INVALID_REFERENCE');
 when raise_exception then if SQLERRM in ('INVALID_REQUEST','INVALID_REFERENCE','FORBIDDEN','CONFLICT','NOT_FOUND','INSUFFICIENT_FUNDS','FUNDS_RESERVED','OVER_COLLECTION','OVER_COMMISSION','OVER_REMITTANCE','FINANCE_DEPENDENCY','VISIT_CORRECTION_REQUIRED') then return jsonb_build_object('error',SQLERRM);end if;raise;
 end;
end$$;
revoke all on function public.enzy_finance_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enzy_finance_action(uuid,text,text,jsonb) to service_role;
-- Visit reversal must fail cleanly if money still depends on that visit.
alter function public.enzy_visit_action(uuid,text,text,jsonb) set schema enzy_private;
alter function enzy_private.enzy_visit_action(uuid,text,text,jsonb) rename to visit_action_v5;
revoke all on function enzy_private.visit_action_v5(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
-- Extend the versioned Phase 5 validation handler so failed finance-dependent
-- reversals roll back business writes while preserving persisted rate attempts.
-- The exact source fragment is checked; an unexpected installed version aborts.
do $patch$declare definition text;old_fragment text:='''OPEN_CYCLE'',''NOT_FOUND'') then';begin
 definition:=pg_get_functiondef('enzy_private.visit_action_v5(uuid,text,text,jsonb)'::regprocedure);
 if strpos(definition,old_fragment)=0 then raise exception 'Unexpected Phase 5 function version; review migration compatibility';end if;
 execute replace(definition,old_fragment,'''OPEN_CYCLE'',''NOT_FOUND'',''FINANCE_DEPENDENCY'') then');
end$patch$;

create function public.enzy_visit_action(p_actor uuid,p_action text,p_ip_hash text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$begin
 return enzy_private.visit_action_v5(p_actor,p_action,p_ip_hash,p_payload);
 exception when raise_exception then if SQLERRM='FINANCE_DEPENDENCY' then return jsonb_build_object('error','FINANCE_DEPENDENCY');end if;raise;
end$$;
revoke all on function public.enzy_visit_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enzy_visit_action(uuid,text,text,jsonb) to service_role;
-- Helpers are invoker-only in unexposed schema; no direct service/client usage.
do $$declare r record;begin for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='enzy_private' and (p.proname like 'money_%' or p.proname like 'visit_money%') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);end loop;end$$;
commit;
