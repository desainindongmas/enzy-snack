import {useState} from 'react';
import {Leaf} from 'lucide-react';
// The unchanged original PNG supplied by the owner; also used by the PWA.
const logo='/brand/enzy-snack-logo.png';
export function Brand({large=false}:{large?:boolean}){
 const [failed,setFailed]=useState(false);
 return !failed?<img className={large?'brand-logo-large':'brand-logo'} src={logo} width={1254} height={1254} decoding="async" alt="Enzy Snack · Keripik Singkong, Renyah & Gurih" onError={()=>setFailed(true)}/>:<span className={'brand-fallback '+(large?'large':'')}><Leaf aria-hidden="true"/><span><strong>ENZY</strong><b>SNACK</b><small>KERIPIK SINGKONG</small></span></span>;
}
