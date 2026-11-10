-- ADMIN ONLY: one explicitly authorized reset of TEST training data. Never a migration/API.
-- Fill the two NULL parameters only after verifying project, TEST-only scope and backup.
-- Project expected for this request: Enzy Snack Test (iuhdzbsorndyyretgcfs).
-- Preserve Auth, devices/profiles/revocation, device audit, pairing limits and business identity.
-- Invalidates unclaimed invites. Deletes all business master/history/ledger/requests/evidence.
-- This intentionally bypasses row DELETE guards using a bounded, atomic TRUNCATE RESTRICT.
-- No CASCADE, disabled triggers, public function or changed grants. Repeat reset_ref is rejected.
begin;
set local lock_timeout='10s';
set local statement_timeout='60s';
do $reset$
declare
 expected_business_id uuid := null; -- SET_VERIFIED_TEST_BUSINESS_ID
 reset_ref text := null; -- SET_UNIQUE_AUTHORIZED_TRAINING_RESET_REF
 expected_tables text[] := array['enzy_agents','enzy_businesses','enzy_consignment_cycles','enzy_consignment_lines','enzy_device_audit','enzy_devices','enzy_inventory_audit','enzy_inventory_balances','enzy_inventory_lots','enzy_inventory_operations','enzy_inventory_requests','enzy_master_audit','enzy_master_requests','enzy_money_accounts','enzy_money_balances','enzy_money_cancellations','enzy_money_ledger','enzy_money_operations','enzy_money_proposals','enzy_money_requests','enzy_openings','enzy_pairing_invites','enzy_pairing_limits','enzy_price_agreements','enzy_production_batches','enzy_production_inputs','enzy_products','enzy_raw_purchases','enzy_readiness_evidence','enzy_readiness_requests','enzy_return_inspections','enzy_stock_locations','enzy_stock_movements','enzy_store_assignments','enzy_store_state','enzy_stores','enzy_suppliers','enzy_visit_requests','enzy_visit_results','enzy_visits'];
 reset_tables text[] := array['enzy_agents','enzy_consignment_cycles','enzy_consignment_lines','enzy_inventory_audit','enzy_inventory_balances','enzy_inventory_lots','enzy_inventory_operations','enzy_inventory_requests','enzy_master_audit','enzy_master_requests','enzy_money_accounts','enzy_money_balances','enzy_money_cancellations','enzy_money_ledger','enzy_money_operations','enzy_money_proposals','enzy_money_requests','enzy_openings','enzy_price_agreements','enzy_production_batches','enzy_production_inputs','enzy_products','enzy_raw_purchases','enzy_readiness_evidence','enzy_readiness_requests','enzy_return_inspections','enzy_stock_locations','enzy_stock_movements','enzy_store_assignments','enzy_store_state','enzy_stores','enzy_suppliers','enzy_visit_requests','enzy_visit_results','enzy_visits'];
 actual_tables text[]; t text; row_count bigint; b uuid; actor uuid;
 counts_before jsonb := '{}'::jsonb; devices_before jsonb; business_before jsonb;
 report jsonb; pending_invites bigint; audit_count bigint;
begin
 if current_user<>'postgres' then raise exception 'Admin postgres required';end if;
 if expected_business_id is null or reset_ref is null or reset_ref !~ '^ENZY-LATIHAN-TIM-[0-9]{8}-[0-9]{2}$' then
  raise exception 'Verified TEST business UUID and explicit unique training reset reference required';end if;
 select array_agg(tablename::text order by tablename) into actual_tables from pg_tables
 where schemaname='public' and tablename like 'enzy\_%' escape '\';
 if actual_tables is distinct from expected_tables or exists(select 1 from pg_tables where schemaname='enzy_private') then
  raise exception 'Unexpected schema; reset is refused';end if;
 -- Lock before snapshots; serialize with device management and every business writer.
 execute 'lock table '||(select string_agg(format('public.%I',x),',' order by x) from unnest(expected_tables)x)||' in access exclusive mode';
 if exists(select 1 from pg_trigger tr join pg_class c on c.oid=tr.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not tr.tgisinternal and (tr.tgtype & 32)<>0 and n.nspname in('public','enzy_private')) then
  raise exception 'Unexpected TRUNCATE trigger; reset is refused';end if;
 if (select count(*) from public.enzy_businesses)<>1 or not exists(select 1 from public.enzy_businesses where id=expected_business_id and singleton) then
  raise exception 'Verified TEST business does not match';end if;
 b:=expected_business_id;
 if exists(select 1 from public.enzy_device_audit where action='training_session_reset' and metadata->>'reset_ref'=reset_ref) then
  raise exception 'This session was already reset. New training data will not be deleted';end if;
 select id into actor from public.enzy_devices where role='owner' and status='active' and revoked_at is null order by created_at,id limit 1;
 if actor is null then raise exception 'No active owner; reset refused';end if;
 select jsonb_agg(to_jsonb(d) order by id) into devices_before from public.enzy_devices d;
 select to_jsonb(x) into business_before from public.enzy_businesses x where id=b;
 select count(*) into audit_count from public.enzy_device_audit;
 foreach t in array reset_tables loop
  execute format('select count(*) from public.%I',t) into row_count;
  counts_before:=counts_before||jsonb_build_object(t,row_count);
 end loop;
 -- Explicit complete list. External FK dependencies cause refusal instead of cascading.
 execute 'truncate table '||(select string_agg(format('public.%I',x),',' order by x) from unnest(reset_tables)x)||' restrict';
 insert into public.enzy_stock_locations(business_id,label,kind,system_key) values
  (b,'Gudang bahan baku','raw_warehouse','raw_primary'),
  (b,'Gudang produk jadi','finished_warehouse','finished_primary'),
  (b,'Karantina retur','return_quarantine','quarantine');
 insert into public.enzy_money_accounts(business_id,label,kind,system_key)
 select b,x.label,x.kind,x.kind from(values
  ('Piutang penjualan','receivable'),('Penjualan terverifikasi','revenue'),
  ('Komisi diperoleh','commission_expense'),('Komisi belum dipotong/dibayar','commission_payable'),
  ('Modal pemilik','capital'),('Pengeluaran kas tercatat','cash_outlay'),
  ('Penyeimbang saldo awal','opening_equity'))x(label,kind);
 delete from public.enzy_pairing_invites where consumed_at is null;
 get diagnostics pending_invites=row_count;
 if devices_before is distinct from(select jsonb_agg(to_jsonb(d) order by id) from public.enzy_devices d)
 or business_before is distinct from(select to_jsonb(x) from public.enzy_businesses x where id=b) then
  raise exception 'Identity changed; rolling back reset';end if;
 foreach t in array reset_tables loop
  execute format('select count(*) from public.%I',t) into row_count;
  if row_count<>(case t when 'enzy_stock_locations' then 3 when 'enzy_money_accounts' then 7 else 0 end) then
   raise exception 'Nonzero residual data in %; rolling back reset',t;end if;
 end loop;
 report:=enzy_private.readiness_report(b);
 if report->>'integrity_ok' is distinct from 'true' or report->>'opening_eligible' is distinct from 'true' then
  raise exception 'Freshness or consistency failed: %',report->'checks';end if;
 insert into public.enzy_device_audit(device_id,actor_device_id,action,metadata)
 values(actor,actor,'training_session_reset',jsonb_build_object('reset_ref',reset_ref,'scope','TEST training business data only',
 'removed_rows',counts_before,'pending_invites_invalidated',pending_invites,'devices_preserved',jsonb_array_length(devices_before),
 'integrity_ok',true,'opening_eligible',true));
 if (select count(*) from public.enzy_device_audit)<>audit_count+1 then raise exception 'Reset audit failed';end if;
end;
$reset$;
commit;
select action,metadata->>'reset_ref' as training_session,metadata->'integrity_ok' as integrity_ok,
 metadata->'opening_eligible' as opening_eligible,metadata->'devices_preserved' as devices_preserved
from public.enzy_device_audit where action='training_session_reset' order by created_at desc,id desc limit 1;
