import {test,expect,type Page} from '@playwright/test';
async function fixture(page:Page,role='owner'){
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
test('owner manages product and archives it at 360px without horizontal scroll',async({page})=>{
 await fixture(page);await page.goto('/');await expect(page.getByRole('heading',{name:'Selamat datang, Pemilik'})).toBeVisible();
 await page.getByRole('button',{name:'Tambah produk',exact:true}).click();
 await page.getByLabel('Nama produk',{exact:true}).fill('TEST Keripik');await page.getByLabel('Kode produk / SKU').fill('TEST-20');await page.getByLabel('Berat nominal per bungkus (gram)').fill('20');
 await page.getByRole('button',{name:'Simpan data',exact:true}).click();await expect(page.getByRole('heading',{name:'TEST Keripik',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Ubah',exact:true}).click();await page.getByLabel('Nama produk',{exact:true}).fill('TEST Keripik Baru');await page.getByRole('button',{name:'Simpan data',exact:true}).click();
 await expect(page.getByRole('heading',{name:'TEST Keripik Baru',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Arsipkan',exact:true}).click();await page.getByRole('button',{name:'Ya, arsipkan',exact:true}).click();
 await expect(page.getByRole('heading',{name:'TEST Keripik Baru',exact:true})).toHaveCount(0);
 await page.getByLabel('Tampilkan arsip juga').check();await expect(page.getByText('Diarsipkan',{exact:true})).toBeVisible();
});
test('owner configures agent price and store override with searchable selectors',async({page})=>{
 const records=await fixture(page);
 records.products.push({id:crypto.randomUUID(),name:'TEST Product',sku_code:'TEST-20',is_active:true,version:1});records.stores.push({id:crypto.randomUUID(),name:'TEST Store',is_active:true,version:1});records.agents.push({id:crypto.randomUUID(),name:'TEST Agent',is_active:true,version:1});
 await page.goto('/');await page.getByRole('button',{name:'Harga & Riwayat',exact:true}).click();await page.getByRole('button',{name:'Tambah harga',exact:true}).click();
 await page.getByLabel('Produk',{exact:true}).selectOption(records.products[0].id);
 await page.getByLabel('Jalur penjualan').selectOption('agent');await page.getByLabel('Agen',{exact:true}).selectOption(records.agents[0].id);
 await page.getByLabel('Harga khusus untuk warung tertentu').check();await page.getByLabel('Cari Warung',{exact:true}).fill('TEST');
 await page.getByLabel('Warung',{exact:true}).selectOption(records.stores[0].id);
 await page.getByLabel('Harga ke warung per pcs (Rp)').fill('1500');await page.getByLabel('Hak Enzy per pcs (Rp)').fill('1300');
 await expect(page.getByText(/Komisi per pcs laku:/)).toContainText('200');
 await page.getByLabel('Alasan penetapan/perubahan harga').fill('TEST agreement');await page.getByRole('button',{name:'Simpan periode harga',exact:true}).click();
 await expect(page.getByRole('heading',{name:'TEST Product',exact:true})).toBeVisible();await expect(page.getByText('TEST agreement',{exact:true})).toBeVisible();
 expect(records.prices[0].store_id).toBe(records.stores[0].id);
});
test('production has no owner data controls and offline hides owner workspace',async({page,context})=>{
 await fixture(page,'production');await page.goto('/');await expect(page.getByRole('heading',{name:'Selamat datang, Produksi'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Data usaha',exact:true})).toHaveCount(0);
 await context.setOffline(true);await expect(page.getByRole('heading',{name:'Selamat datang, Produksi'})).toHaveCount(0);await expect(page.getByText(/Kamu sedang offline/)).toBeVisible();
});
test('missing Phase 3 migration keeps device management accessible',async({page})=>{
 await fixture(page);await page.route('**/api/master?**',route=>route.fulfill({status:503,json:{error:'MIGRATION_REQUIRED'}}));
 await page.goto('/');await expect(page.getByText(/Jalankan SQL Phase 3/)).toBeVisible();await page.getByRole('button',{name:'Perangkat tim',exact:true}).click();await expect(page.getByRole('button',{name:'Buat kode pairing',exact:true})).toBeVisible();
});
for(const source of ['Produk','Warung','Agen'])test(`opens price history after populated ${source} without crashing`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const records=await fixture(page);
 const product={id:crypto.randomUUID(),name:'TEST source product',sku_code:'TEST-20',weight_g:20,pcs_per_pack:25,is_active:true,version:1};
 const store={id:crypto.randomUUID(),name:'TEST source store',is_active:true,version:1};
 const agent={id:crypto.randomUUID(),name:'TEST source agent',is_active:true,version:1};
 records.products.push(product);records.stores.push(store);records.agents.push(agent);
 records.prices.push({id:crypto.randomUUID(),product_id:product.id,store_id:store.id,channel:'direct',store_price_rp:1500,valid_from:new Date().toISOString(),valid_to:null,change_reason:'TEST existing history'});
 await page.goto('/');await expect(page.getByRole('heading',{name:product.name,exact:true})).toBeVisible();
 if(source!=='Produk'){
  await page.getByRole('button',{name:source,exact:true}).click();
  await expect(page.getByRole('heading',{name:source==='Warung'?store.name:agent.name,exact:true})).toBeVisible();
 }
 await page.getByRole('button',{name:'Harga & Riwayat',exact:true}).click();
 await expect(page.getByText('TEST existing history',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Produk',exact:true}).click();
 await expect(page.getByRole('heading',{name:product.name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Harga & Riwayat',exact:true}).click();
 await expect(page.getByText('TEST existing history',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:product.name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Harga & Riwayat',exact:true}).click();
 await expect(page.getByText('TEST existing history',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
