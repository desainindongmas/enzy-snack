import {useState} from 'react';
import {Leaf} from 'lucide-react';
const logo=Object.values(import.meta.glob<string>('../assets/enzy-snack-logo.{png,jpg,jpeg,webp}',{eager:true,query:'?url',import:'default'}))[0];
// Original artwork is bundled only when supplied; no missing image requests.
// No generated approximation is presented as the user's original artwork.
export function Brand({large=false}:{large?:boolean}){
 const [failed,setFailed]=useState(false);
 return logo&&!failed?<img className={large?'brand-logo-large':'brand-logo'} src={logo} alt="Enzy Snack · Keripik Singkong, Renyah & Gurih" onError={()=>setFailed(true)}/>:<span className={'brand-fallback '+(large?'large':'')}><Leaf aria-hidden="true"/><span><strong>ENZY</strong><b>SNACK</b><small>KERIPIK SINGKONG</small></span></span>;
}
