import {api} from './supabase';
export type VisitKind='stores'|'visits'|'returns';
export interface VisitLine {id:string;lot_id:string;lot_code:string;product_name:string;quantity:number;store_price_rp:string;expiry_date?:string|null}
export interface VisitStore {store_id:string;store_name:string;version:number;assignment_id:string|null;channel:'direct'|'agent'|null;agent_id:string|null;field_device_id:string|null;cycle_id:string|null;last_visit_id:string|null;lines:VisitLine[]}
export interface VisitRow {id:string;name?:string;store_name?:string;address?:string;version?:number;assignment_id?:string|null;field_name?:string;channel?:string;agent_name?:string;agent_id?:string;field_device_id?:string;cycle_id?:string|null;last_visit_at?:string;due_at?:string;occurred_at?:string;reason?:string;gross_sales_rp?:string;enzy_due_rp?:string;commission_earned_rp?:string;sold?:number;returned?:number;lost?:number;reversed?:boolean;lot_code?:string;product_name?:string;returned_good?:number;returned_damaged?:number;returned_expired?:number;inspected?:boolean;inspection_note?:string;disposition?:string}
export interface VisitPage {records:VisitRow[];count:number;page:number}
export interface VisitReceipt {ok:true;operation_id?:string;assignment_id?:string;inspection_id?:string;cycle_id?:string|null;replayed?:boolean}
export interface VisitPreview {store_name:string;occurred_at:string;channel:string;gross_sales_rp:string;enzy_due_rp?:string;commission_earned_rp?:string;drops:{lot_id:string;source_location_id:string;quantity:number;price_id:string;product_name:string;lot_code:string;store_price_rp:string}[];results:Record<string,unknown>[]}
export const readVisits=(kind:VisitKind,search='',page=1)=>api<VisitPage>('visits?'+new URLSearchParams({kind,search,page:String(page)}));
export const readVisitStore=(store_id:string)=>api<VisitStore>('visits?'+new URLSearchParams({kind:'detail',store_id}));
export const previewVisit=(record:Record<string,unknown>)=>api<VisitPreview>('visits/preview',{record});
export const writeVisit=(action:'post'|'assign'|'inspect'|'reverse',record:Record<string,unknown>,request_id:string)=>api<VisitReceipt>('visits/'+action,{record,request_id});
export const visitMoney=(value:string|undefined)=>{if(value==null)return 'Belum diketahui';try{return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(BigInt(value))}catch{return 'Nominal belum tersedia'}};
