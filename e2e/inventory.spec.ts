import {test,expect,type Page} from '@playwright/test';
import {fixture} from './fixtures';
async function stockFixture(page:Page,role='owner'){
 await fixture(page,role);
 const supplier={id:crypto.randomUUID(),name:'TEST supplier'},product={id:crypto.randomUUID(),name:'TEST product',sku_code:'TEST-20',weight_g:20,pcs_per_pack:25};
 const locations=[{id:crypto.randomUUID(),label:'TEST raw warehouse',kind:'raw_warehouse',system_key:'raw_primary'},{id:crypto.randomUUID(),label:'TEST finished warehouse',kind:'finished_warehouse',system_key:'finished_primary'},{id:crypto.randomUUID(),label:'TEST second warehouse',kind:'finished_warehouse'}];
 const lots:Record<string,any>[]=[],batches:Record<string,any>[]=[],purchases:Record<string,any>[]=[],posts:Record<string,any>[]=[],balances:Record<string,any>[]=[];
 function balance(lot:Record<string,any>,loc:string,quantity:number){return {id:lot.id+loc,lot_id:lot.id,lot_code:lot.lot_code,lot_kind:lot.lot_kind,product_name:lot.product_name,location_id:loc,location_label:locations.find(l=>l.id===loc)!.label,quantity,unit:lot.unit,cost_status:lot.cost_status}}
 await page.route('**/api/inventory**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='GET'){
   const kind=url.searchParams.get('kind');let records:Record<string,any>[]=[];
   if(kind==='catalog_suppliers')records=[supplier];if(kind==='catalog_products')records=[product];if(kind==='locations')records=locations;
   if(kind==='balances')records=balances;if(kind==='batches')records=batches;if(kind==='purchases')records=purchases;
   if(kind==='lots')records=lots.map(l=>({...l,quantity:balances.filter(b=>b.lot_id===l.id&&(!url.searchParams.get('location_id')||b.location_id===url.searchParams.get('location_id'))).reduce((s,b)=>s+b.quantity,0)})).filter(l=>l.quantity>0&&(!url.searchParams.get('lot_kind')||l.lot_kind===url.searchParams.get('lot_kind')));
   await route.fulfill({json:{records:records.filter(r=>!(kind==='balances'&&r.quantity<=0)),count:records.length,page:1}});return;
  }
  const body=route.request().postDataJSON(),r=body.record;posts.push({action:url.pathname.split('/').at(-1),...body});
  const id=crypto.randomUUID();let receipt:Record<string,any>={ok:true,operation_id:id};
  if(url.pathname.endsWith('/purchase')){
   const lot={id:crypto.randomUUID(),lot_code:r.lot_code||'TEST-RAW',lot_kind:'raw',quantity:r.weight_g,unit:'g',cost_status:r.acquisition_extra_rp===null?'COST_INCOMPLETE':'COST_COMPLETE'};lots.push(lot);balances.push(balance(lot,locations[0].id,r.weight_g));purchases.push({id,weight_g:r.weight_g,supplier_name_snapshot:supplier.name,lot_code:lot.lot_code});receipt={...receipt,lot_id:lot.id,lot_code:lot.lot_code,quantity:r.weight_g,unit:'g',cost_status:lot.cost_status};
  }else if(url.pathname.endsWith('/production')){
   for(const line of r.inputs)balances.find(b=>b.lot_id===line.lot_id&&b.location_id===locations[0].id)!.quantity-=line.grams;
   const lot={id:crypto.randomUUID(),lot_code:r.lot_code||'TEST-FINISHED',lot_kind:'finished',product_name:product.name,quantity:r.good_pcs,unit:'pcs',cost_status:'COST_INCOMPLETE'};
   lots.push(lot);balances.push(balance(lot,locations[1].id,r.good_pcs));batches.push({id,product_name:product.name,good_pcs:r.good_pcs,good_output_weight_g:r.good_output_weight_g,defect_weight_g:r.defect_weight_g,waste_g:r.waste_g,cost_status:lot.cost_status,known_cost_rp:9999,unit_cost_rp:222});receipt={...receipt,lot_id:lot.id,lot_code:lot.lot_code,quantity:r.good_pcs,unit:'pcs',cost_status:lot.cost_status};
  }else if(url.pathname.endsWith('/transfer')){
   const source=balances.find(b=>b.lot_id===r.lot_id&&b.location_id===r.from_location_id)!;
   if(!source||source.quantity<r.quantity){await route.fulfill({status:400,json:{error:'INSUFFICIENT_STOCK'}});return}
   source.quantity-=r.quantity;const lot=lots.find(l=>l.id===r.lot_id)!;const destination=balances.find(b=>b.lot_id===r.lot_id&&b.location_id===r.to_location_id);
   if(destination)destination.quantity+=r.quantity;else balances.push(balance(lot,r.to_location_id,r.quantity));receipt={...receipt,lot_id:r.lot_id,lot_code:lot.lot_code,quantity:r.quantity,unit:'pcs'};
  }
  await route.fulfill({json:receipt});
 });
 return {supplier,product,locations,lots,batches,purchases,posts,balances,balance};
}
test('owner reviews a raw receipt and repacking before server confirmation at 360px',async({page})=>{
 const state=await stockFixture(page);await page.goto('/');await page.getByRole('button',{name:'Produksi & Stok',exact:true}).click();await page.getByRole('button',{name:'Terima bahan',exact:true}).click();
 await page.getByLabel('Supplier',{exact:true}).selectOption(state.supplier.id);await page.getByLabel('Berat bahan diterima (gram)').fill('10000');await page.getByLabel('Harga total bahan (Rp)').fill('75000');await page.getByLabel('Catatan kejadian').fill('TEST receipt');
 await page.getByRole('button',{name:'Lihat ringkasan',exact:true}).click();expect(state.posts).toHaveLength(0);await expect(page.getByText(state.supplier.name,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Posting sekarang',exact:true}).click();await expect(page.getByText('Posting dikonfirmasi server',{exact:true})).toBeVisible();expect(state.posts[0].record.acquisition_extra_rp).toBeNull();
 await page.getByRole('button',{name:'Repacking',exact:true}).click();await page.getByLabel('Produk yang dibuat',{exact:true}).selectOption(state.product.id);await page.getByLabel('Lot bahan 1',{exact:true}).selectOption(state.lots[0].id);
 await page.getByLabel('Gram dari lot 1',{exact:true}).fill('1000');await page.getByLabel('Jumlah bungkus baik (pcs)').fill('45');await page.getByLabel('Berat isi produk baik total (gram)').fill('900');await page.getByLabel('Berat bahan pada produk cacat (gram)').fill('0');await page.getByLabel('Susut atau bahan terbuang (gram)').fill('100');await page.getByLabel('Catatan kejadian').fill('TEST batch');
 await page.getByRole('button',{name:'Lihat ringkasan',exact:true}).click();expect(state.posts).toHaveLength(1);await page.getByRole('button',{name:'Posting sekarang',exact:true}).click();
 await expect(page.getByText('Posting dikonfirmasi server',{exact:true})).toBeVisible();await expect(page.getByText('45 pcs',{exact:true}).first()).toBeVisible();expect(state.balances.find(b=>b.lot_kind==='raw')!.quantity).toBe(9000);
 expect(state.posts[1].record.packaging_cost_rp).toBeNull();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'work/phase4-mobile.png',fullPage:true});
});
test('insufficient transfer keeps review and does not claim success or alter local display',async({page})=>{
 const state=await stockFixture(page);const lot={id:crypto.randomUUID(),lot_code:'TEST-TRANSFER',lot_kind:'finished',product_name:state.product.name,quantity:50,unit:'pcs',cost_status:'COST_INCOMPLETE'};state.lots.push(lot);state.balances.push(state.balance(lot,state.locations[1].id,50));
 await page.goto('/');await page.getByRole('button',{name:'Produksi & Stok',exact:true}).click();await page.getByRole('button',{name:'Transfer stok',exact:true}).click();
 await page.getByLabel('Lokasi asal',{exact:true}).selectOption(state.locations[1].id);await page.getByLabel('Lot produk jadi',{exact:true}).selectOption(lot.id);await page.getByLabel('Lokasi tujuan',{exact:true}).selectOption(state.locations[2].id);await page.getByLabel('Jumlah dipindahkan (pcs)').fill('60');await page.getByLabel('Catatan kejadian').fill('TEST transfer');await page.getByRole('button',{name:'Lihat ringkasan',exact:true}).click();
 await expect(page.getByText(state.locations[1].label,{exact:true})).toBeVisible();await expect(page.getByText(state.locations[2].label,{exact:true})).toBeVisible();await page.getByRole('button',{name:'Posting sekarang',exact:true}).click();await expect(page.getByText(/Stok di lokasi asal tidak cukup/)).toBeVisible();await expect(page.getByText('Posting dikonfirmasi server',{exact:true})).toHaveCount(0);expect(state.balances[0].quantity).toBe(50);
 await page.getByRole('button',{name:'Ubah isian',exact:true}).click();await page.getByLabel('Jumlah dipindahkan (pcs)').fill('20');await page.getByRole('button',{name:'Lihat ringkasan',exact:true}).click();await page.getByRole('button',{name:'Posting sekarang',exact:true}).click();await expect(page.getByText('Posting dikonfirmasi server',{exact:true})).toBeVisible();expect(state.balances.map(b=>b.quantity).sort()).toEqual([20,30]);
});
test('production sees operational batches without costs or owner posting controls',async({page})=>{
 const state=await stockFixture(page,'production');state.batches.push({id:crypto.randomUUID(),product_name:'TEST batch restricted',good_pcs:45,known_cost_rp:9999,unit_cost_rp:222,cost_status:'COST_INCOMPLETE'});
 await page.goto('/');await expect(page.getByRole('heading',{name:'Selamat datang, Produksi'})).toBeVisible();await page.getByRole('button',{name:'Produksi',exact:true}).click();await expect(page.getByRole('heading',{name:'TEST batch restricted'})).toBeVisible();
 await expect(page.getByText(/Subtotal biaya diketahui/)).toHaveCount(0);await expect(page.getByText(/Biaya per pcs/)).toHaveCount(0);for(const label of ['Terima bahan','Transfer stok','Tambah lokasi','Koreksi'])await expect(page.getByRole('button',{name:label,exact:true})).toHaveCount(0);
});
test('missing Phase 4 migration leaves master data and devices available',async({page})=>{
 await stockFixture(page);await page.route('**/api/inventory**',route=>route.fulfill({status:503,json:{error:'INVENTORY_REQUIRED'}}));await page.goto('/');await page.getByRole('button',{name:'Produksi & Stok',exact:true}).click();await expect(page.getByText(/Jalankan SQL Phase 4/)).toBeVisible();await page.getByRole('button',{name:'Perangkat tim',exact:true}).click();await expect(page.getByRole('button',{name:'Buat kode pairing',exact:true})).toBeVisible();
});
