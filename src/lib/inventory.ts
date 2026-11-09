import {api,type Role} from './supabase';
export type InventoryKind='balances'|'lots'|'locations'|'purchases'|'batches'|'movements'|'operations'|'catalog_products'|'catalog_suppliers'|'catalog_agents'|'catalog_devices';
export type InventoryAction='purchase'|'production'|'transfer'|'location'|'reverse';
export interface InventoryRow {
 id:string;name?:string;label?:string;kind?:string;system_key?:string;device_id?:string;agent_id?:string;
 lot_id?:string;lot_code?:string;lot_kind?:string;product_id?:string;product_name?:string;sku_code?:string;
 quantity?:number;unit?:'g'|'pcs';weight_g?:number;pcs_per_pack?:number;initial_quantity?:number;
 location_id?:string;location_label?:string;location_kind?:string;delta?:number;
 operation_id?:string;occurred_at?:string;reason?:string;reverse_of?:string|null;reversed?:boolean;
 expiry_date?:string|null;cost_status?:'COST_INCOMPLETE'|'COST_COMPLETE';
 supplier_name_snapshot?:string;goods_cost_rp?:number;acquisition_extra_rp?:number|null;
 known_cost_rp?:number;unit_cost_rp?:number|null;good_pcs?:number;good_output_weight_g?:number;defect_weight_g?:number;waste_g?:number;
 inputs?:{lot_code:string;grams:number}[];
}
export interface InventoryPage {records:InventoryRow[];count:number;page:number}
export interface InventoryReceipt {ok:true;operation_id?:string;location_id?:string;lot_id?:string;lot_code?:string;quantity?:number;unit?:string;cost_status?:string;reverse_of?:string;replayed?:boolean}
export const inventoryLabels:Partial<Record<InventoryKind,string>>={balances:'Stok per lokasi',purchases:'Pembelian bahan',batches:'Produksi',locations:'Lokasi stok',movements:'Riwayat gerak',operations:'Koreksi'};
export const operationLabels:Record<string,string>={purchase:'Pembelian bahan',production:'Repacking',transfer:'Transfer stok',reversal:'Pembalikan'};
export const locationLabels:Record<string,string>={raw_warehouse:'Gudang bahan',finished_warehouse:'Gudang produk jadi',field_custody:'Muatan lapangan',agent_custody:'Dalam penguasaan agen',return_quarantine:'Karantina retur'};
export function inventoryKinds(role:Role):InventoryKind[]{return role==='owner'?['balances','purchases','batches','locations','movements','operations']:role==='production'?['balances','batches','movements']:['balances','movements']}
export function listInventory(kind:InventoryKind,search='',page=1,extra:Record<string,string>={}){
 return api<InventoryPage>('inventory?'+new URLSearchParams({kind,search,page:String(page),...extra}));
}
export const postInventory=(action:InventoryAction,record:Record<string,unknown>,request_id:string)=>api<InventoryReceipt>('inventory/'+action,{record,request_id});
export const quantityText=(value:number|undefined,unit?:string)=>value==null?'Belum dicatat':new Intl.NumberFormat('id-ID').format(Number(value))+' '+(unit??'');
export const costText=(value:number|null|undefined)=>value==null?'Belum diketahui':new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value));
