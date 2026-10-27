import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRight,ChevronDown,LockKeyhole,ShieldCheck,Smartphone} from 'lucide-react';
import {Button} from './components/ui/button';
import {Brand} from './components/Brand';
import {AppUpdate} from './components/AppUpdate';
import DeviceWorkspace from './components/DeviceWorkspace';
import {initializeSession,getDevice,redeemPairing,type Device} from './lib/supabase';
import {sessionFailureMessage} from './lib/session-errors';
export default function App(){
 const [id,setId]=useState(''),[code,setCode]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[online,setOnline]=useState(navigator.onLine),[device,setDevice]=useState<Device|null>(null);
 const sessionReady=useRef(false);
 const refresh=useCallback(async()=>{
  if(!sessionReady.current)return;
  if(!navigator.onLine){setDevice(null);return}
  try{setDevice(await getDevice());setNotice('')}catch(e){setDevice(null);setNotice((e as Error).message)}
 },[]);
 useEffect(()=>{let live=true;
  initializeSession().then(async uid=>{if(!live)return;sessionReady.current=true;setId(uid);await refresh()}).catch(error=>{if(live)setNotice(sessionFailureMessage(error))}).finally(()=>{if(live)setLoading(false)});
  const update=()=>{setOnline(navigator.onLine);if(!navigator.onLine)setDevice(null);else void refresh()};
  const visible=()=>{if(document.hidden)setDevice(null);else void refresh()};
  const timer=setInterval(()=>{if(!document.hidden)void refresh()},30000);
  window.addEventListener('online',update);window.addEventListener('offline',update);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
  return()=>{live=false;clearInterval(timer);window.removeEventListener('online',update);window.removeEventListener('offline',update);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible)};
 },[refresh]);
 async function retrySession(){
  if(loading||!navigator.onLine)return;
  setLoading(true);setNotice('');
  try{const uid=await initializeSession();sessionReady.current=true;setId(uid);await refresh()}
  catch(error){sessionReady.current=false;setNotice(sessionFailureMessage(error))}
  finally{setLoading(false)}
 }
 async function submit(e:FormEvent){e.preventDefault();if(!id||!online||busy||device?.status==='revoked')return;setBusy(true);setNotice('');try{await redeemPairing(code.trim());setCode('');await refresh()}catch(e){setNotice((e as Error).message)}finally{setBusy(false)}}
 const active=online&&device?.status==='active'&&device.role;
 return <div className="app"><header><a className="brand" href="/" aria-label="Enzy Snack"><Brand/></a><span className="header-label"><LockKeyhole size={14}/>Ruang kerja Enzy</span></header><AppUpdate/><main><section className="intro"><div className="eyebrow">● KERIPIK SINGKONG · SEJAK 2023</div><h1>Renyah rasanya.<br/>Rapi <span>kerjanya.</span></h1><p>Satu tempat untuk langkah kecil<br/>di balik setiap bungkus Enzy Snack.</p><div className="brand-showcase"><Brand large/><div className="made">Renyah & Gurih</div></div><div className="intro-foot">Dari dapur, untuk semua.</div></section>{active?<DeviceWorkspace device={device!} onRefresh={refresh}/>:<section className="activation"><div className="step">AKTIVASI PERANGKAT <span>01 / 01</span></div><div className="phone"><Smartphone size={29}/><span><LockKeyhole size={12}/></span></div><div className="status">● {device?.status==='revoked'?'Akses perangkat dicabut':'Perangkat belum terhubung'}</div><h2>Halo, keluarga Enzy!</h2><p className="description">Hubungkan perangkatmu untuk mulai bekerja.<br/>Minta kode aktivasi dari pemilik, lalu masukkan di bawah ini.</p>{device?.status!=='revoked'&&<form onSubmit={submit}><label htmlFor="pairing">Kode aktivasi</label><input id="pairing" value={code} onChange={e=>setCode(e.target.value)} placeholder="Tempel kode dari pemilik" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} minLength={64} pattern="[0-9a-fA-F]{64}" required aria-describedby="code-help"/><p id="code-help" className="help">Kode 64 karakter, sekali pakai. Kedaluwarsa setelah 10 menit.</p><Button disabled={loading||!id||!online||code.trim().length!==64||busy}>{loading?'Menyiapkan perangkat…':busy?'Menghubungkan…':'Hubungkan perangkat'}<ArrowRight size={17}/></Button></form>}<p role="status" className="notice">{!online?'Kamu sedang offline. Hubungkan internet untuk memeriksa akses.':device?.status==='revoked'?'Hubungi pemilik untuk pemulihan melalui admin.':notice}</p><button type="button" className="text-button" onClick={id?refresh:retrySession} disabled={!online||loading}>{id?'Periksa status perangkat':'Coba koneksi lagi'}</button>{id&&<><details className="identity"><summary>Identitas untuk admin<ChevronDown size={15}/></summary><p>Untuk penyiapan pemilik pertama, admin perlu mencocokkan ID ini melalui prosedur Supabase. ID bukan kode pairing.</p><code>{id}</code></details></>}<div className="security"><ShieldCheck size={22}/><p><strong>Perangkatmu, aksesmu.</strong><span>Hanya perangkat yang disetujui pemilik yang dapat mengakses ruang kerja.</span></p></div><details><summary>Perlu bantuan untuk menghubungkan?<ChevronDown size={15}/></summary><p>Minta kode baru kepada pemilik jika kode kedaluwarsa atau telah dipakai. Jika data browser dihapus atau perangkat diganti, perangkat perlu dihubungkan kembali.</p></details></section>}</main><footer><span>© {new Date().getFullYear()} Enzy Snack</span><span>Teman renyah, kerja lebih mudah.</span></footer></div>;
}
