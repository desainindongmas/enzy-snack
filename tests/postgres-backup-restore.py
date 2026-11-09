"""Restore rehearsal against synthetic PostgreSQL 17 only. No URL/remote inputs.
Creates a disposable offline container and two fresh databases, encrypts a custom
pg_dump, restores it into the empty target, and compares data/ACLs and behavior.
This does not claim Supabase managed Auth/Storage/provider recovery was tested.
"""
import hashlib,json,os,subprocess,sys,tempfile,time,uuid
from datetime import datetime,timezone
from pathlib import Path
if len(sys.argv)!=1:raise SystemExit('This local fixture test accepts no database URL or restore target.')
ROOT=Path(__file__).resolve().parents[1]
DOCKER=['env','-u','DOCKER_HOST','-u','DOCKER_CONTEXT','-u','DOCKER_TLS','-u','DOCKER_TLS_VERIFY','-u','DOCKER_CERT_PATH','docker','--host=unix:///var/run/docker.sock']
NAME='enzy-restore-test-'+str(os.getpid());IMAGE='postgres:17-alpine@sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac'
OWNER='11111111-1111-4111-8111-111111111111';FIELD='33333333-3333-4333-8333-333333333333';REVOKED='44444444-4444-4444-8444-444444444444';IP='a'*64

def run(args,**kw):
 r=subprocess.run(args,capture_output=True,**kw)
 if r.returncode:raise RuntimeError(r.stderr.decode() if isinstance(r.stderr,bytes) else r.stderr)
 return r.stdout

def psql(database):return DOCKER+['exec','-i',NAME,'psql','-X','-q','-t','-A','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1']
def q(sql,database='enzy_source'):return run(psql(database),input="set timezone='UTC';"+sql,text=True).strip()
def quote(value):return "'"+str(value).replace("'","''")+"'"
def call(domain,action,record=None,actor=OWNER,key=None,database='enzy_source',payload=None):
 body=payload if payload is not None else {'record':record,'request_id':key or str(uuid.uuid4())}
 value=json.loads(q(f"select public.enzy_{domain}_action({quote(actor)}::uuid,{quote(action)},{quote(IP)},{quote(json.dumps(body))}::jsonb);",database))
 return value

def fingerprints(database):
 tables=q("select schemaname||'.'||tablename from pg_tables where schemaname in ('auth','public') and (tablename like 'enzy_%' or schemaname='auth') order by schemaname,tablename;",database).splitlines()
 result={}
 for table in tables:
  digest=q(f"select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') from {table} t;",database)
  result[table]=digest
 return result

def security(database):
 # pg_dump can reorder ACL entries. Compare normalized effective grants, not
 # textual ACL array order; default ACLs are expanded before comparison.
 return q("""select coalesce(jsonb_agg(x order by x::text)::text,'[]') from (
 select jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',
 (select jsonb_agg(to_jsonb(a) order by grantor,grantee,privilege_type,is_grantable) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a))::text x
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'enzy_%' and c.relkind='r'
 union all select jsonb_build_object('function',p.oid::regprocedure::text,'definer',p.prosecdef,'definition',md5(pg_get_functiondef(p.oid)),'acl',
 (select jsonb_agg(to_jsonb(a) order by grantor,grantee,privilege_type,is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a))::text
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','enzy_private') and p.prokind='f' and (p.proname like 'enzy_%' or n.nspname='enzy_private')) state;""",database)

try:
 run(DOCKER+['run','--rm','--detach','--name',NAME,'--network=none','-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE],text=True)
 for _ in range(100):
  if subprocess.run(DOCKER+['exec',NAME,'sh','-c','test "$(cat /proc/1/comm)" = postgres && pg_isready -U postgres'],capture_output=True).returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('Local PostgreSQL was not ready')
 q('create database enzy_source;','postgres');q('create database enzy_restored;','postgres')
 q(f"create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema auth;create table auth.users(id uuid primary key,is_anonymous boolean default true);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public to anon,authenticated,service_role;insert into auth.users(id) values('{OWNER}'),('{FIELD}'),('{REVOKED}');")
 for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):q(migration.read_text())
 q(f"insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at,revoked_at) values('{OWNER}','TEST restore owner','owner','active',now(),null),('{FIELD}','TEST restore field','field','active',now(),null),('{REVOKED}','TEST revoked','field','revoked',now(),now());")
 owner_device=q(f"select id from public.enzy_devices where auth_user_id='{OWNER}';");field_device=q(f"select id from public.enzy_devices where auth_user_id='{FIELD}';")
 product=q(f"insert into public.enzy_products(business_id,name,sku_code,weight_g,pcs_per_pack,created_by_device_id) select id,'TEST restore product','RESTORE-20',20,25,'{owner_device}' from public.enzy_businesses returning id;")
 raw=q("select id from public.enzy_stock_locations where system_key='raw_primary';");finished=q("select id from public.enzy_stock_locations where system_key='finished_primary';")
 cash=call('finance','account',{'name':'TEST restore cash','kind':'cash','reason':'TEST config'})['account_id']
 opening={'effective_at':datetime.now(timezone.utc).isoformat(),'reason':'TEST counted opening','physical_confirmed':True,'legacy_resolved':True,'stock':[{'kind':'raw','lot_code':'TEST-RESTORE-RAW','location_id':raw,'quantity':10000},{'kind':'finished','lot_code':'TEST-RESTORE-FIN','product_id':product,'location_id':finished,'quantity':45}],'money':[{'holder':'enzy','account_id':cash,'amount_rp':'100000'}]}
 opened=call('readiness','opening_post',opening);assert opened.get('ok'),opened
 lot=q("select id from public.enzy_inventory_lots where lot_code='TEST-RESTORE-FIN';")
 def sale(channel='direct',agent=None):
  store=q(f"insert into public.enzy_stores(business_id,name,created_by_device_id) select id,'TEST restore {channel} store','{owner_device}' from public.enzy_businesses returning id;")
  assigned=call('visit','assign',{'store_id':store,'expected_version':1,'field_device_id':field_device,'channel':channel,'agent_id':agent,'reason':'TEST restore assignment'});assert assigned.get('ok'),assigned
  q(f"insert into public.enzy_price_agreements(business_id,product_id,store_id,agent_id,channel,store_price_rp,enzy_share_rp,valid_from,change_reason,created_by_device_id) select id,'{product}','{store}',{quote(agent)+'::uuid' if agent else 'null'},'{channel}',1500,{'1300' if agent else 'null'},now()-interval '1 day','TEST restore price','{owner_device}' from public.enzy_businesses;")
  def post_visit(drops,results):
   version=int(q(f"select version from public.enzy_store_state where store_id='{store}';"));rec={'store_id':store,'expected_version':version,'occurred_at':None,'reason':'TEST restore visit','drops':drops,'results':results}
   plan=call('visit','preview',rec);assert 'error' not in plan,plan;rec['occurred_at']=plan['occurred_at'];rec['drops']=[{k:r[k] for k in ['lot_id','source_location_id','quantity','price_id']} for r in plan['drops']];posted=call('visit','post',rec);assert posted.get('ok'),posted;return posted
  first=post_visit([{'lot_id':lot,'source_location_id':finished,'quantity':20}],[]);line=q(f"select id from public.enzy_consignment_lines where cycle_id='{first['cycle_id']}';")
  return post_visit([],[{'line_id':line,'sold':12,'returned_good':8,'returned_damaged':0,'returned_expired':0,'lost':0}])['operation_id']
 visit=sale();collection={'visit_id':visit,'amount_rp':'18000','withheld_rp':'0','reason':'TEST restore field money'};request_id=str(uuid.uuid4());received=call('finance','collect',collection,FIELD,request_id);assert received.get('ok'),received
 custody=q(f"select id from public.enzy_money_accounts where device_id='{field_device}';")
 proposed=call('finance','propose',{'account_id':custody,'destination_account_id':cash,'amount_rp':'18000','reason':'TEST pending remittance'},FIELD);assert proposed.get('ok'),proposed
 confirmed=call('finance','confirm',{'proposal_id':proposed['proposal_id'],'amount_rp':'5000','reason':'TEST received partial'});assert confirmed.get('ok'),confirmed
 agent=q(f"insert into public.enzy_agents(business_id,name,created_by_device_id) select id,'TEST restore agent','{owner_device}' from public.enzy_businesses returning id;")
 agent_visit=sale('agent',agent);agent_paid=call('finance','collect',{'visit_id':agent_visit,'amount_rp':'18000','withheld_rp':'2400','reason':'TEST restore commission'});assert agent_paid.get('ok'),agent_paid
 checked=call('readiness','report',payload={});assert checked['integrity_ok'],checked
 before=fingerprints('enzy_source');acl_before=security('enzy_source')
 with tempfile.TemporaryDirectory(prefix='enzy-private-restore-') as folder:
  folder=Path(folder);original=folder/'source.dump';encrypted=folder/'backup.enzybak';decrypted=folder/'restored.dump'
  archive=run(DOCKER+['exec',NAME,'pg_dump','-U','postgres','-d','enzy_source','--format=custom'])
  with os.fdopen(os.open(original,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f:f.write(archive)
  code="import {encryptBackup,decryptBackup} from './scripts/backup-crypto.mjs';const [i,e,o]=process.argv.slice(1);await encryptBackup(i,e,'TEST-only-restore-password-2026');await decryptBackup(e,o,'TEST-only-restore-password-2026');"
  run(['node','--input-type=module','-e',code,str(original),str(encrypted),str(decrypted)],cwd=ROOT,text=True)
  assert hashlib.sha256(archive).digest()==hashlib.sha256(decrypted.read_bytes()).digest()
  assert encrypted.stat().st_mode&0o777==0o600 and decrypted.stat().st_mode&0o777==0o600
  print('PASS: PostgreSQL custom dump encrypted/authenticated; decrypted archive SHA256 identical and private permissions')
  run(DOCKER+['exec','-i',NAME,'pg_restore','-U','postgres','-d','enzy_restored','--single-transaction','--exit-on-error','--no-owner'],input=decrypted.read_bytes())
 assert fingerprints('enzy_restored')==before,'Restored data fingerprints differ'
 assert security('enzy_restored')==acl_before,'Restored ACL/RLS/function privileges differ'
 print('PASS: all Auth fixture/business rows, immutable ledgers, requests and opening snapshots restored exactly; ACL/RLS unchanged')
 restored=call('readiness','report',payload={},database='enzy_restored');assert restored['integrity_ok'] and restored['opening'] and not restored['opening_eligible'],restored
 assert call('readiness','report',actor=FIELD,payload={},database='enzy_restored')=={'error':'FORBIDDEN'}
 assert call('finance','list',actor=REVOKED,payload={'kind':'accounts'},database='enzy_restored')=={'error':'FORBIDDEN'}
 denied=subprocess.run(psql('enzy_restored'),input='set role authenticated;select * from public.enzy_money_ledger;',text=True,capture_output=True);assert denied.returncode!=0 and 'permission denied' in denied.stderr
 print('PASS: restored database reconciles stock/money/cycles and still denies client roles/revoked devices')
 replay=call('finance','collect',collection,FIELD,request_id,database='enzy_restored');assert replay.get('replayed') and replay['operation_id']==received['operation_id'],replay
 finish=call('finance','confirm',{'proposal_id':proposed['proposal_id'],'amount_rp':'13000','reason':'TEST complete after restore'},database='enzy_restored');assert finish.get('ok'),finish
 assert q(f"select balance_rp from public.enzy_money_balances where account_id='{cash}';",'enzy_restored')=='118000'
 summary=call('finance','list',payload={'kind':'summary'},database='enzy_restored');assert summary['sales_rp']=='36000',summary
 assert call('readiness','report',payload={},database='enzy_restored')['integrity_ok']
 print('PASS: replay remains idempotent after restore; pending remittance resumes without second revenue; projections remain consistent')
finally:
 subprocess.run(DOCKER+['rm','--force',NAME],capture_output=True)
