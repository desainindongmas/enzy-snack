import {api} from './supabase';
export {visitMoney as moneyText} from './visits';
export type MoneyKind='accounts'|'invoices'|'proposals'|'history'|'legacy';
export type MoneyAction='account'|'collect'|'propose'|'confirm'|'cancel'|'capital_in'|'capital_out'|'cash_out'|'commission_payment'|'reverse'|'recognize';
export interface MoneyRow {id:string;name?:string;kind?:string;device_id?:string;agent_id?:string;balance_rp?:string;reserved_rp?:string;available_rp?:string;store_name?:string;channel?:string;occurred_at?:string;gross_sales_rp?:string;collected_rp?:string;outstanding_rp?:string;commission_earned_rp?:string;withheld_rp?:string;commission_paid_rp?:string;commission_remaining_rp?:string;agent_name?:string;destination_name?:string;source_account_id?:string;amount_rp?:string;confirmed_rp?:string;remaining_rp?:string;cancelled?:boolean;reason?:string;category?:string;reversed?:boolean;reverse_of?:string}
export interface MoneyPage {records:MoneyRow[];count:number;page:number}
export interface MoneyReceipt {ok:true;operation_id?:string;account_id?:string;proposal_id?:string;replayed?:boolean}
export interface MoneySummary {sales_rp:string;collected_rp:string;outstanding_rp:string;earned_rp:string;withheld_rp:string;commission_paid_rp:string;enzy_cash_movement_rp:string;profit_rp:null}
export const moneyLabels:Record<MoneyAction|string,string>={account:'Tambah kas / bank',collect:'Catat pembayaran warung',propose:'Ajukan setoran',confirm:'Konfirmasi uang diterima',cancel:'Batalkan sisa usulan',capital_in:'Catat modal masuk',capital_out:'Kembalikan modal',cash_out:'Catat pengeluaran',commission_payment:'Bayar komisi tersisa',reverse:'Balikkan transaksi uang',recognize:'Tinjau tagihan kunjungan lama',sale:'Penjualan terverifikasi',collection:'Pembayaran warung',confirmation:'Setoran diterima',reversal:'Pembalikan'};
export const readMoney=(kind:MoneyKind|'summary',search='',page=1)=>api<MoneyPage>('finance?'+new URLSearchParams({kind,search,page:String(page)}));
export const readMoneySummary=()=>api<MoneySummary>('finance?kind=summary');
export const postMoney=(action:MoneyAction,record:Record<string,unknown>,request_id:string)=>api<MoneyReceipt>('finance/'+action,{record,request_id});
