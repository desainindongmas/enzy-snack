import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from './ui/button';
import {jakartaTime,listMaster,masterLabels,mutateMaster,rupiah,type MasterKind,type MasterRecord} from '../lib/master-data';
function Lookup({kind,label,value,onChange}:{kind:MasterKind;label:string;value:string;onChange:(id:string)=>void}){
 const [q,setQ]=useState(''),[page,setPage]=useState(1),[items,setItems]=useState<MasterRecord[]>([]),[count,setCount]=useState(0),[error,setError]=useState('');
 useEffect(()=>{let live=true;const timer=setTimeout(()=>{listMaster(kind,q,page).then(r=>{if(live){setItems(r.records);setCount(r.count);setError('')}}).catch(e=>{if(live){setItems([]);setError(e.message)}})},250);return()=>{live=false;clearTimeout(timer)}},[kind,q,page]);
 return <fieldset className="lookup"><legend>{label}</legend><input aria-label={'Cari '+label} value={q} placeholder={'Cari '+label.toLowerCase()} onChange={e=>{setQ(e.target.value);setPage(1);onChange('')}}/><select aria-label={label} required value={value} onChange={e=>onChange(e.target.value)}><option value="">Pilih {label.toLowerCase()}</option>{items.map(r=><option key={r.id} value={r.id}>{r.name}{r.sku_code?' · '+r.sku_code:''}</option>)}</select>{count>20&&<div className="pager"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Sebelumnya</button><span>{page}</span><button type="button" disabled={page*20>=count} onClick={()=>setPage(p=>p+1)}>Berikutnya</button></div>}{error&&<p className="notice" role="alert">{error}</p>}</fieldset>;
}
function Editor({kind,record,onDone,onCancel,onError}:{kind:MasterKind;record:MasterRecord|null;onDone:()=>void;onCancel:()=>void;onError:()=>void}){
 const [form,setForm]=useState<Record<string,string>>(()=>{
  const f:Record<string,string>={name:'',notes:'',phone:'',address:'',sku_code:'',weight_g:'',pcs_per_pack:'25',visit_interval_days:'14',channel:'direct',product_id:'',store_id:'',agent_id:'',store_price_rp:'',enzy_share_rp:'',valid_from:'',valid_to:'',change_reason:''};
  if(record)for(const [key,value] of Object.entries(record)){if(value!=null)f[key]=String(value)}
  if(kind==='prices'){f.valid_from='';f.valid_to='';f.change_reason=''}return f;
 });
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[specificStore,setSpecificStore]=useState(!!record?.store_id);
 const attempt=useRef<{body:string;key:string}|null>(null);
 function set(key:string,value:string){setForm(f=>({...f,[key]:value}))}
 function input(key:string,label:string,type='text',required=false,maxLength=120){return <label className="master-field" key={key}>{label}<input type={type} required={required} maxLength={maxLength} value={form[key]??''} onChange={e=>set(key,e.target.value)} {...(type==='number'?{min:key==='enzy_share_rp'?0:1,max:key.includes('_rp')?999999999:key==='weight_g'?10000:key==='pcs_per_pack'?1000:365,step:1,inputMode:'numeric' as const}:{})}/></label>}
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   let data:Record<string,unknown>;
   if(kind==='prices'){
    const price=Number(form.store_price_rp),share=form.channel==='agent'?Number(form.enzy_share_rp):null;
    if(!Number.isSafeInteger(price)||price<=0||(share!==null&&(!Number.isSafeInteger(share)||share<0||share>price)))throw new Error('Harga warung dan hak Enzy harus rupiah bulat; hak Enzy tidak boleh melebihi harga warung.');
    data={product_id:form.product_id,channel:form.channel,store_id:form.store_id||null,agent_id:form.channel==='agent'?form.agent_id:null,store_price_rp:price,enzy_share_rp:share,valid_from:form.valid_from?new Date(form.valid_from).toISOString():null,valid_to:form.valid_to?new Date(form.valid_to).toISOString():null,change_reason:form.change_reason.trim(),...(record?{replaces_id:record.id}:{})};
   }else{
    data={name:form.name.trim(),notes:form.notes.trim()||null,...(record?{id:record.id,version:record.version}:{})};
    if(kind==='products')Object.assign(data,{sku_code:form.sku_code.trim().toUpperCase(),weight_g:Number(form.weight_g),pcs_per_pack:Number(form.pcs_per_pack)});
    else Object.assign(data,{phone:form.phone.trim()||null,address:form.address.trim()||null,...(kind==='stores'?{visit_interval_days:Number(form.visit_interval_days)}:{})});
   }
   const body=JSON.stringify(data);if(attempt.current?.body!==body)attempt.current={body,key:crypto.randomUUID()};
   await mutateMaster(kind==='prices'?'price':'save',kind,data,attempt.current!.key);onDone();
  }catch(e){setError((e as Error).message);onError()}finally{setBusy(false)}
 }
 return <form className="master-editor" onSubmit={submit}><h3>{record?(kind==='prices'?'Ganti harga untuk periode baru':'Ubah '+masterLabels[kind]):'Tambah '+masterLabels[kind]}</h3>{kind==='prices'?<>
  {record?<div className="phase-note">{record.product_name} · {record.channel==='direct'?'Langsung':'Agen'} · {record.store_name??record.agent_name}<br/>Perubahan ini menutup periode lama dan membuat baris baru. Harga lama tidak ditimpa.</div>:<>
   <Lookup kind="products" label="Produk" value={form.product_id} onChange={id=>set('product_id',id)}/>
   <label className="master-field">Jalur penjualan<select value={form.channel} onChange={e=>{set('channel',e.target.value);set('agent_id','');set('store_id','');setSpecificStore(false)}}><option value="direct">Langsung ke warung</option><option value="agent">Melalui agen</option></select></label>
   {form.channel==='agent'&&<Lookup kind="agents" label="Agen" value={form.agent_id} onChange={id=>set('agent_id',id)}/>}
   {(form.channel==='direct'||specificStore)&&<Lookup kind="stores" label="Warung" value={form.store_id} onChange={id=>set('store_id',id)}/>}
   {form.channel==='agent'&&<label className="checkbox-row"><input type="checkbox" checked={specificStore} onChange={e=>{setSpecificStore(e.target.checked);set('store_id','')}}/>Harga khusus untuk warung tertentu</label>}
  </>}
  {input('store_price_rp','Harga ke warung per pcs (Rp)','number',true)}
  {form.channel==='agent'&&<>{input('enzy_share_rp','Hak Enzy per pcs (Rp)','number',true)}<p className="field-help">Komisi per pcs laku: {Number(form.store_price_rp)>=Number(form.enzy_share_rp)?rupiah(Number(form.store_price_rp)-Number(form.enzy_share_rp)):'Periksa harga'}. Ini bukan laba bersih.</p></>}
  {input('valid_from','Berlaku mulai (opsional)','datetime-local')}
  <p className="field-help">Kosong berarti mulai saat disimpan. Tanggal yang diisi mengikuti zona waktu perangkat; riwayat ditampilkan dalam WIB.</p>
  {!record&&input('valid_to','Berlaku sampai (opsional)','datetime-local')}
  {input('change_reason','Alasan penetapan/perubahan harga','text',true,500)}
 </>:<>
  {input('name','Nama '+masterLabels[kind].toLowerCase(),'text',true)}
  {kind==='products'?<>{input('sku_code','Kode produk / SKU','text',true,40)}{input('weight_g','Berat nominal per bungkus (gram)','number',true)}{input('pcs_per_pack','Jumlah pcs per pack','number',true)}</>:<>{input('phone','Nomor telepon (opsional)','tel',false,40)}{input('address','Alamat (opsional)','text',false,500)}</>}
  {kind==='stores'&&input('visit_interval_days','Jarak kunjungan (hari)','number',true)}
  <label className="master-field">Catatan (opsional)<textarea maxLength={1000} value={form.notes} onChange={e=>set('notes',e.target.value)}/></label>
  {kind==='suppliers'&&<p className="field-help">Harga beli mengikuti pembelian/lot. Tidak ditetapkan sebagai harga tetap supplier.</p>}
 </>}
 <p role="alert" className="notice">{error}</p><div className="form-actions"><Button disabled={busy}>{busy?'Menyimpan…':kind==='prices'?'Simpan periode harga':'Simpan data'}</Button><button type="button" className="text-button" disabled={busy} onClick={onCancel}>Batal</button></div></form>;
}
export default function MasterData({onAccessError}:{onAccessError:()=>void}){
 const [kind,setKind]=useState<MasterKind>('products'),[search,setSearch]=useState(''),[page,setPage]=useState(1),[archived,setArchived]=useState(false),[editing,setEditing]=useState<{record:MasterRecord|null}|null>(null),[confirm,setConfirm]=useState<MasterRecord|null>(null),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const [result,setResult]=useState<{key:string;records:MasterRecord[];count:number;loading:boolean;error:string}|null>(null);
 const [actionError,setActionError]=useState('');
 const queryKey=JSON.stringify([kind,search,page,archived,reload]);
 // A tab change renders before useEffect clears old state. Never interpret the
 // previous tab's records with the new tab's renderer, even for that first frame.
 const current=result?.key===queryKey?result:null;
 const rows=current?.records??[],count=current?.count??0,loading=current?.loading??true,error=actionError||current?.error||'';
 const requestKey=useRef<string|null>(null);
 useEffect(()=>{
  let live=true;const key=queryKey;
  setResult({key,records:[],count:0,loading:true,error:''});
  const timer=setTimeout(()=>{listMaster(kind,search,page,archived).then(r=>{
   if(live)setResult({key,records:r.records,count:r.count,loading:false,error:''});
  }).catch(e=>{if(live){setResult({key,records:[],count:0,loading:false,error:e.message});onAccessError()}})},250);
  return()=>{live=false;clearTimeout(timer)};
 },[queryKey,kind,search,page,archived,reload,onAccessError]);
 function done(){setActionError('');setEditing(null);setConfirm(null);requestKey.current=null;setReload(r=>r+1)}
 async function archive(){if(!confirm||busy)return;setBusy(true);setActionError('');try{requestKey.current??=crypto.randomUUID();await mutateMaster('archive',kind,{id:confirm.id,version:confirm.version},requestKey.current);done()}catch(e){setActionError((e as Error).message);onAccessError()}finally{setBusy(false)}}
 return <section className="master-panel"><nav className="master-tabs" aria-label="Data usaha">{(Object.keys(masterLabels) as MasterKind[]).map(k=><button key={k} aria-current={kind===k?'page':undefined} disabled={!!editing||busy} onClick={()=>{setActionError('');setKind(k);setSearch('');setPage(1);setConfirm(null);requestKey.current=null}}>{masterLabels[k]}</button>)}</nav>{editing?<Editor key={kind+(editing.record?.id??'new')} kind={kind} record={editing.record} onDone={done} onCancel={()=>setEditing(null)} onError={onAccessError}/>:<>
 <div className="master-toolbar"><div><h3>{masterLabels[kind]}</h3><p>{kind==='prices'?'Harga dicatat per periode. Riwayat lama tetap tersimpan.':'Kelola data usaha tanpa mengubah stok atau mencatat penjualan.'}</p></div><Button onClick={()=>setEditing({record:null})}>Tambah {kind==='prices'?'harga':masterLabels[kind].toLowerCase()}</Button></div>
 {kind!=='prices'&&<div className="master-filters"><input aria-label="Cari data usaha" placeholder="Cari nama…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/><label className="checkbox-row"><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setPage(1)}}/>Tampilkan arsip juga</label></div>}
 <p className="notice" role="alert">{error}</p>{error&&<button className="text-button" onClick={()=>{setActionError('');setReload(r=>r+1)}}>Coba muat ulang</button>}
 {loading?<p role="status">Memuat data…</p>:!error&&rows.length===0?<div className="empty-state">Belum ada data {masterLabels[kind].toLowerCase()} yang cocok. Tambahkan data milik usahamu untuk memulai.</div>:<ul className="master-list">{rows.map(r=><li key={r.id}><div className="master-card-content"><h4>{kind==='prices'?r.product_name:r.name}</h4>{kind==='prices'?<><p>{r.channel==='direct'?'Langsung':'Agen'} · {r.store_name??r.agent_name}</p><strong>{rupiah(r.store_price_rp!)} / pcs</strong>{r.channel==='agent'&&<p>Hak Enzy {rupiah(r.enzy_share_rp!)} · komisi {rupiah(r.store_price_rp!-r.enzy_share_rp!)} / pcs laku</p>}<p>{jakartaTime(r.valid_from!)} → {r.valid_to?jakartaTime(r.valid_to):'Tanpa tanggal akhir'}</p><p>{r.change_reason}</p></>:<><p>{kind==='products'?`${r.sku_code} · ${r.weight_g} g · ${r.pcs_per_pack} pcs/pack`:r.address||'Alamat belum diisi'}</p>{r.phone&&<p>{r.phone}</p>}{r.visit_interval_days&&<p>Kunjungan setiap {r.visit_interval_days} hari</p>}<span className="record-status">{r.is_active?'Aktif':'Diarsipkan'}</span></>}</div><div className="master-card-actions">{kind==='prices'?(!r.valid_to&&<button className="text-button" onClick={()=>setEditing({record:r})}>Ganti harga</button>):<><button className="text-button" onClick={()=>setEditing({record:r})}>Ubah</button>{r.is_active&&<button className="text-button danger" onClick={()=>{setConfirm(r);requestKey.current=null}}>Arsipkan</button>}</>}</div></li>)}</ul>}
 {!error&&<div className="pager"><button disabled={loading||page===1} onClick={()=>setPage(p=>p-1)}>Sebelumnya</button><span>Halaman {page} · {count} data</span><button disabled={loading||page*20>=count} onClick={()=>setPage(p=>p+1)}>Berikutnya</button></div>}
 {confirm&&<div className="confirm" role="alertdialog" aria-label="Konfirmasi arsip"><p>Arsipkan <strong>{confirm.name}</strong>? Data dan riwayat tidak dihapus.</p><Button disabled={busy} onClick={archive}>Ya, arsipkan</Button><button className="text-button" disabled={busy} onClick={()=>setConfirm(null)}>Batal</button></div>}
 </>}</section>;
}
