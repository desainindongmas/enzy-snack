import type {Page} from '@playwright/test';
export async function fixture(page:Page,role='owner'){
 const records:Record<string,Record<string,any>[]>={products:[],stores:[],agents:[],suppliers:[],prices:[]};
 const uid='11111111-1111-4111-8111-111111111111';
 const user={id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true};
 const payload={sub:uid,aud:'authenticated',role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600};
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+Buffer.from('test-fixture-only-signature').toString('base64url');
 await page.route('https://fixture.supabase.co/**',async route=>{
  const data=route.request().url().includes('/signup')?{access_token:token,refresh_token:'test-fixture-only-refresh',expires_in:3600,token_type:'bearer',user}:user;
  await route.fulfill({json:data});
 });
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());const body=route.request().method()==='POST'?route.request().postDataJSON():{};
  let result:unknown={ok:true};
  if(url.pathname==='/api/device')result={device:{id:uid,device_label:'TEST owner device',status:'active',role}};
  else if(url.pathname==='/api/devices')result={devices:[]};
  else if(url.pathname==='/api/master'){
   const kind=url.searchParams.get('kind')!,q=url.searchParams.get('search')?.toLowerCase()??'',include=url.searchParams.get('include_archived')==='true';
   let rows=records[kind].filter(r=>kind==='prices'||(include||r.is_active)&&r.name.toLowerCase().includes(q));
   if(kind==='prices')rows=rows.map(r=>({...r,product_name:records.products.find(p=>p.id===r.product_id)?.name,store_name:records.stores.find(p=>p.id===r.store_id)?.name,agent_name:records.agents.find(p=>p.id===r.agent_id)?.name}));
   result={records:rows,count:rows.length,page:1};
  }else if(url.pathname==='/api/master/save'){
   const rows=records[body.kind],old=rows.find(r=>r.id===body.record.id);
   const record={...(old??{}),...body.record,id:old?.id??crypto.randomUUID(),version:(old?.version??0)+1,is_active:old?.is_active??true};
   if(old)Object.assign(old,record);else rows.push(record);result={ok:true,record};
  }else if(url.pathname==='/api/master/archive'){
   const r=records[body.kind].find(r=>r.id===body.record.id)!;r.is_active=false;r.version++;result={ok:true,record:r};
  }else if(url.pathname==='/api/master/price'){
   const record={...body.record,id:crypto.randomUUID(),valid_from:body.record.valid_from??new Date().toISOString()};records.prices.push(record);result={ok:true,record};
  }
  await route.fulfill({json:result});
 });
 return records;
}

export async function navigate(page:Page,label:string){
 const discard=async()=>{if(await page.getByRole('dialog').isVisible())await page.getByRole('button',{name:'Tinggalkan isian',exact:true}).click()};
 const button=page.getByRole('button',{name:label,exact:true});
 if(!await button.isVisible()){await page.getByRole('button',{name:'Lainnya',exact:true}).click();await discard()}
 await button.click();await discard();
}
