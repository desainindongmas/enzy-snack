import {api} from './supabase';
export type MasterKind='suppliers'|'products'|'stores'|'agents'|'prices';
export interface MasterRecord {
 id:string;name:string;version:number;is_active:boolean;notes?:string|null;phone?:string|null;address?:string|null;
 sku_code?:string;weight_g?:number;pcs_per_pack?:number;visit_interval_days?:number;
 product_id?:string;store_id?:string|null;agent_id?:string|null;channel?:'direct'|'agent';
 store_price_rp?:number;enzy_share_rp?:number|null;valid_from?:string;valid_to?:string|null;
 product_name?:string;store_name?:string|null;agent_name?:string|null;change_reason?:string;
}
export interface MasterPage {records:MasterRecord[];count:number;page:number}
export const masterLabels:Record<MasterKind,string>={products:'Produk',stores:'Warung',agents:'Agen',suppliers:'Supplier',prices:'Harga & Riwayat'};
export function listMaster(kind:MasterKind,search='',page=1,include_archived=false){
 return api<MasterPage>('master?'+new URLSearchParams({kind,search,page:String(page),include_archived:String(include_archived)}));
}
export const mutateMaster=(action:'save'|'archive'|'price',kind:MasterKind,record:Record<string,unknown>,request_id:string)=>api<{ok:true;record:MasterRecord}>('master/'+action,{kind,record,request_id});
export const rupiah=(amount:number)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(amount);
export function jakartaTime(value:string|null|undefined):string {
 if(!value)return 'Tanggal belum tersedia';
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return 'Tanggal tidak valid';
 return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(date)+' WIB';
}
