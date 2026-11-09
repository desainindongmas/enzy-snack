"""Disposable official PostgreSQL 17 Docker test. No host ports, network or credentials.
Run only against the managed LOCAL daemon. Never accepts a live database URL.
"""
import json,os,subprocess,time,uuid
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DOCKER=['env','-u','DOCKER_HOST','-u','DOCKER_CONTEXT','-u','DOCKER_TLS','-u','DOCKER_TLS_VERIFY','-u','DOCKER_CERT_PATH','docker','--host=unix:///var/run/docker.sock']
NAME='enzy-stock-test-'+str(os.getpid())
IMAGE='postgres:17-alpine@sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac'
PSQL=DOCKER+['exec','-i',NAME,'psql','-X','-q','-t','-A','-U','postgres','-v','ON_ERROR_STOP=1']
OWNER='11111111-1111-4111-8111-111111111111';OTHER='66666666-6666-4666-8666-666666666666';IP='a'*64

def sql_quote(value):return "'"+str(value).replace("'","''")+"'"
def q(sql):
 r=subprocess.run(PSQL,input=sql,text=True,capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr.strip())
 return r.stdout.strip()
def statement(action,record,actor=OWNER,key=None):
 body=json.dumps({'record':record,'request_id':key or str(uuid.uuid4())})
 return f"select public.enzy_inventory_action({sql_quote(actor)}::uuid,{sql_quote(action)},{sql_quote(IP)},{sql_quote(body)}::jsonb);"
def post(action,record,actor=OWNER,key=None):return json.loads(q(statement(action,record,actor,key)))
def race(first_sql,second_sql):
 first=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 first.stdin.write("set application_name='enzy_first';begin;"+first_sql+"select pg_sleep(2);commit;\n");first.stdin.close()
 for _ in range(100):
  held=q("select exists(select 1 from pg_stat_activity a join pg_locks l on a.pid=l.pid where a.application_name='enzy_first' and l.locktype='advisory' and l.granted);")
  if held=='t':break
  time.sleep(.02)
 else:raise AssertionError('First transaction did not acquire posting lock')
 second=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 second.stdin.write("set application_name='enzy_second';"+second_sql+'\n');second.stdin.close()
 blocked=False
 for _ in range(20):
  blocked=q("select exists(select 1 from pg_stat_activity where application_name='enzy_second' and wait_event_type='Lock');")=='t'
  if blocked:break
  time.sleep(.02)
 a_text=first.stdout.read();a_err=first.stderr.read();a_status=first.wait()
 b_text=second.stdout.read();b_err=second.stderr.read();b_status=second.wait()
 assert a_status==0,a_err;assert b_status==0,b_err;assert blocked,'Second connection did not overlap first transaction'
 a=[json.loads(x) for x in a_text.splitlines() if x.startswith('{')][0]
 b=[json.loads(x) for x in b_text.splitlines() if x.startswith('{')][0]
 return a,b
try:
 subprocess.run(DOCKER+['run','--rm','--detach','--name',NAME,'--network=none','-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE],check=True,capture_output=True,text=True)
 for _ in range(100):
  ready=subprocess.run(DOCKER+['exec',NAME,'sh','-c','test "$(cat /proc/1/comm)" = postgres && pg_isready -U postgres'],capture_output=True).returncode==0
  if ready:break
  time.sleep(.2)
 else:raise AssertionError('Disposable PostgreSQL did not become ready')
 q(f"create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema auth;create table auth.users(id uuid primary key,is_anonymous boolean default true);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public to anon,authenticated,service_role;insert into auth.users(id) values('{OWNER}'),('{OTHER}');")
 for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):q(migration.read_text())
 q(f"insert into public.enzy_devices(auth_user_id,device_label,role,status,paired_at) values('{OWNER}','TEST owner','owner','active',now()),('{OTHER}','TEST second owner','owner','active',now());")
 device=q(f"select id from public.enzy_devices where auth_user_id='{OWNER}';")
 supplier=q(f"insert into public.enzy_suppliers(business_id,name,created_by_device_id) select id,'TEST concurrency supplier','{device}' from public.enzy_businesses returning id;")
 product=q(f"insert into public.enzy_products(business_id,name,sku_code,weight_g,pcs_per_pack,created_by_device_id) select id,'TEST concurrency product','TEST-20',20,25,'{device}' from public.enzy_businesses returning id;")
 warehouse=q("select id from public.enzy_stock_locations where system_key='finished_primary';")
 destination=post('location',{'label':'TEST destination','kind':'finished_warehouse'})['location_id']
 def make_batch():
  purchase=post('purchase',{'supplier_id':supplier,'weight_g':1000,'goods_cost_rp':7500,'acquisition_extra_rp':0,'reason':'TEST concurrency receipt'});assert purchase.get('ok'),purchase
  batch=post('production',{'product_id':product,'inputs':[{'lot_id':purchase['lot_id'],'grams':1000}],'good_pcs':50,'good_output_weight_g':1000,'defect_weight_g':0,'waste_g':0,'packaging_cost_rp':0,'labor_cost_rp':0,'other_cost_rp':0,'reason':'TEST concurrency batch'});assert batch.get('ok'),batch;return batch
 batch=make_batch()
 transfer={'lot_id':batch['lot_id'],'from_location_id':warehouse,'to_location_id':destination,'quantity':30,'reason':'TEST competing transfer'}
 a,b=race(statement('transfer',transfer),statement('transfer',transfer,OTHER))
 assert a.get('ok') and b=={'error':'INSUFFICIENT_STOCK'},(a,b)
 assert q(f"select quantity from public.enzy_inventory_balances where lot_id='{batch['lot_id']}' and location_id='{warehouse}';")=='20'
 print('PASS: two real concurrent transfers, one succeeds and one insufficient; balance never negative')
 batch=make_batch();key=str(uuid.uuid4());transfer.update(lot_id=batch['lot_id'],quantity=10)
 a,b=race(statement('transfer',transfer,key=key),statement('transfer',transfer,key=key))
 assert a.get('ok') and b.get('replayed') and a['operation_id']==b['operation_id'],(a,b)
 assert q(f"select quantity from public.enzy_inventory_balances where lot_id='{batch['lot_id']}' and location_id='{warehouse}';")=='40'
 assert q(f"select count(*) from public.enzy_stock_movements where operation_id='{a['operation_id']}';")=='2'
 print('PASS: simultaneous identical request key produces one receipt and one ledger pair')
 batch=make_batch();transfer.update(lot_id=batch['lot_id'],quantity=10)
 a,b=race(statement('transfer',transfer),statement('reverse',{'operation_id':batch['operation_id'],'reason':'TEST reverse race'},OTHER))
 assert a.get('ok') and b=={'error':'INSUFFICIENT_STOCK'},(a,b)
 print('PASS: distinct action transfer/reversal race serializes and rejects dependent reversal atomically')
 # Phase 5 uses the same stock lock as Phase 4, across RPC boundaries.
 def vs(action,record,actor=OWNER,key=None):
  body=json.dumps({'record':record,'request_id':key or str(uuid.uuid4())})
  return f"select public.enzy_visit_action({sql_quote(actor)}::uuid,{sql_quote(action)},{sql_quote(IP)},{sql_quote(body)}::jsonb);"
 def vpost(action,record):return json.loads(q(vs(action,record)))
 def vbody(store,drops=None,results=None):
  version=int(q(f"select version from public.enzy_store_state where store_id='{store}';"))
  rec={'store_id':store,'expected_version':version,'occurred_at':datetime.now(timezone.utc).isoformat(),'reason':'TEST concurrent visit','drops':drops or [],'results':results or []}
  plan=vpost('preview',rec);assert 'error' not in plan,plan
  rec['drops']=[{k:d[k] for k in ['lot_id','source_location_id','quantity','price_id']} for d in plan['drops']]
  return rec
 def make_store():
  store=q(f"insert into public.enzy_stores(business_id,name,created_by_device_id) select id,'TEST concurrent store','{device}' from public.enzy_businesses returning id;")
  assigned=vpost('assign',{'store_id':store,'expected_version':1,'channel':'direct','reason':'TEST concurrent assignment'});assert assigned.get('ok'),assigned
  q(f"insert into public.enzy_price_agreements(business_id,product_id,store_id,channel,store_price_rp,valid_from,change_reason,created_by_device_id) select id,'{product}','{store}','direct',1500,now()-interval '1 day','TEST concurrency price','{device}' from public.enzy_businesses;")
  return store
 store=make_store();batch=make_batch()
 opening=vbody(store,[{'lot_id':batch['lot_id'],'source_location_id':warehouse,'quantity':20}])
 transfer.update(lot_id=batch['lot_id'],quantity=40)
 a,b=race(vs('post',opening),statement('transfer',transfer,OTHER))
 assert a.get('ok') and b=={'error':'INSUFFICIENT_STOCK'},(a,b)
 print('PASS: visit and ordinary transfer share stock lock; no cross-RPC overspending')
 line=q(f"select id from public.enzy_consignment_lines where cycle_id='{a['cycle_id']}';")
 closing=vbody(store,results=[{'line_id':line,'sold':12,'returned_good':4,'returned_damaged':2,'returned_expired':1,'lost':1}])
 a,b=race(vs('post',closing),vs('post',closing,OTHER))
 assert a.get('ok') and b=={'error':'CONFLICT'},(a,b)
 assert q(f"select count(*) from public.enzy_visit_results where line_id='{line}';")=='1'
 assert q(f"select gross_sales_rp from public.enzy_visits where operation_id='{a['operation_id']}';")=='18000'
 print('PASS: simultaneous closing recognizes sold/returns once; stale cycle cannot close twice')
 store=make_store();batch=make_batch();opening=vbody(store,[{'lot_id':batch['lot_id'],'source_location_id':warehouse,'quantity':20}]);key=str(uuid.uuid4())
 a,b=race(vs('post',opening,key=key),vs('post',opening,key=key))
 assert a.get('ok') and b.get('replayed') and a['operation_id']==b['operation_id'],(a,b)
 assert q(f"select count(*) from public.enzy_visits where store_id='{store}';")=='1'
 print('PASS: simultaneous visit request replay returns one cycle and one immutable visit')
 # Phase 6 financial posting uses the same lock as stock/visits.
 def fs(action,record,actor=OWNER,key=None):
  body=json.dumps({'record':record,'request_id':key or str(uuid.uuid4())})
  return f"select public.enzy_finance_action({sql_quote(actor)}::uuid,{sql_quote(action)},{sql_quote(IP)},{sql_quote(body)}::jsonb);"
 def fpost(action,record):return json.loads(q(fs(action,record)))
 cash=fpost('account',{'name':'TEST cash concurrency','kind':'cash','reason':'TEST account'})['account_id']
 line=q(f"select id from public.enzy_consignment_lines where cycle_id='{a['cycle_id']}';")
 closing=vbody(store,results=[{'line_id':line,'sold':20,'returned_good':0,'returned_damaged':0,'returned_expired':0,'lost':0}])
 closed=vpost('post',closing);assert closed.get('ok'),closed
 collection={'visit_id':closed['operation_id'],'amount_rp':'20000','withheld_rp':'0','account_id':cash,'reason':'TEST simultaneous payment'}
 a,b=race(fs('collect',collection),fs('collect',collection,OTHER))
 assert a.get('ok') and b=={'error':'OVER_COLLECTION'},(a,b)
 print('PASS: simultaneous payments cannot overcollect one verified invoice')
 collection['amount_rp']='10000';key=str(uuid.uuid4());a,b=race(fs('collect',collection,key=key),fs('collect',collection,key=key))
 assert a.get('ok') and b.get('replayed') and a['operation_id']==b['operation_id'],(a,b)
 assert q(f"select balance_rp from public.enzy_money_balances where account_id='{cash}';")=='30000'
 print('PASS: duplicate financial request creates one collection and one balanced journal')
 expense={'account_id':cash,'amount_rp':'20000','category':'other','reason':'TEST competing cash out'}
 a,b=race(fs('cash_out',expense),fs('cash_out',expense,OTHER))
 assert a.get('ok') and b=={'error':'INSUFFICIENT_FUNDS'},(a,b)
 print('PASS: simultaneous cash out cannot spend the same Enzy funds twice')
 store=make_store();batch=make_batch();opening=vpost('post',vbody(store,[{'lot_id':batch['lot_id'],'source_location_id':warehouse,'quantity':10}]))
 line=q(f"select id from public.enzy_consignment_lines where cycle_id='{opening['cycle_id']}';")
 closed=vpost('post',vbody(store,results=[{'line_id':line,'sold':10,'returned_good':0,'returned_damaged':0,'returned_expired':0,'lost':0}]))
 a,b=race(fs('collect',{'visit_id':closed['operation_id'],'amount_rp':'15000','withheld_rp':'0','account_id':cash,'reason':'TEST payment vs reversal'}),vs('reverse',{'operation_id':closed['operation_id'],'reason':'TEST simultaneous visit reversal'},OTHER))
 assert a.get('ok') and b=={'error':'FINANCE_DEPENDENCY'},(a,b)
 print('PASS: visit reversal vs payment serializes; stock/sale cannot reverse around received money')
 agent=q(f"insert into public.enzy_agents(business_id,name,created_by_device_id) select id,'TEST concurrency agent','{device}' from public.enzy_businesses returning id;")
 version=int(q(f"select version from public.enzy_store_state where store_id='{store}';"))
 assigned=vpost('assign',{'store_id':store,'expected_version':version,'channel':'agent','agent_id':agent,'reason':'TEST agent assignment'});assert assigned.get('ok'),assigned
 q(f"insert into public.enzy_price_agreements(business_id,product_id,agent_id,channel,store_price_rp,enzy_share_rp,valid_from,change_reason,created_by_device_id) select id,'{product}','{agent}','agent',1500,1300,now()-interval '1 day','TEST agent price','{device}' from public.enzy_businesses;")
 batch=make_batch();opening=vpost('post',vbody(store,[{'lot_id':batch['lot_id'],'source_location_id':warehouse,'quantity':20}]))
 line=q(f"select id from public.enzy_consignment_lines where cycle_id='{opening['cycle_id']}';")
 closed=vpost('post',vbody(store,results=[{'line_id':line,'sold':12,'returned_good':8,'returned_damaged':0,'returned_expired':0,'lost':0}]))
 collected=fpost('collect',{'visit_id':closed['operation_id'],'amount_rp':'18000','withheld_rp':'2400','reason':'TEST agent paid'});assert collected.get('ok'),collected
 custody=q(f"select id from public.enzy_money_accounts where agent_id='{agent}';")
 proposed=fpost('propose',{'account_id':custody,'destination_account_id':cash,'amount_rp':'15600','reason':'TEST agent remittance'});assert proposed.get('ok'),proposed
 revenue_before=q("select sum(balance_rp) from public.enzy_money_balances b join public.enzy_money_accounts a on a.id=b.account_id where a.kind='revenue';")
 confirm={'proposal_id':proposed['proposal_id'],'amount_rp':'10000','reason':'TEST competing confirmation'}
 a,b=race(fs('confirm',confirm),fs('confirm',confirm,OTHER))
 assert a.get('ok') and b=={'error':'OVER_REMITTANCE'},(a,b)
 assert q("select sum(balance_rp) from public.enzy_money_balances b join public.enzy_money_accounts a on a.id=b.account_id where a.kind='revenue';")==revenue_before
 assert q(f"select balance_rp from public.enzy_money_balances where account_id='{custody}';")=='5600'
 print('PASS: simultaneous remittance confirmations cannot overreceive; revenue unchanged')
 assert q("select count(*) from (select operation_id from public.enzy_money_ledger group by operation_id having sum(delta_rp)<>0) x;")=='0'
 assert q("select count(*) from public.enzy_money_balances b left join (select business_id,account_id,sum(delta_rp) n from public.enzy_money_ledger group by business_id,account_id) l using(business_id,account_id) where b.balance_rp is distinct from coalesce(l.n,0);")=='0'
 print('PASS: financial journals balanced and every account projection equals ledger after races')
 bad=q("select count(*) from public.enzy_inventory_balances b left join (select business_id,location_id,lot_id,sum(delta) qty from public.enzy_stock_movements group by business_id,location_id,lot_id) m using(business_id,location_id,lot_id) where b.quantity<>coalesce(m.qty,0) or b.quantity<0;")
 assert bad=='0',bad
 print('PASS: every projection equals ledger sum after races; no negative stock')
finally:
 subprocess.run(DOCKER+['rm','--force',NAME],capture_output=True)
