-- Run as the database administrator after Phase 7 exists. No repairs or writes.
begin transaction read only;
select jsonb_pretty(enzy_private.readiness_report(id)) as laporan_konsistensi
from public.enzy_businesses where singleton;
rollback;
