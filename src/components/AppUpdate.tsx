import {useRegisterSW} from 'virtual:pwa-register/react';
export function AppUpdate(){
 const {needRefresh:[needsUpdate],updateServiceWorker}=useRegisterSW();
 return needsUpdate?<div className="app-update" role="status"><span>Versi baru Enzy Snack tersedia.</span><button onClick={()=>void updateServiceWorker(true)}>Perbarui aplikasi</button></div>:null;
}
