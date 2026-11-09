import {it,expect} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {normalizeSupabaseUrl} from '../src/lib/supabase-url';
it.each(['https://fixture.supabase.co','https://fixture.supabase.co/','https://fixture.supabase.co/rest/v1',' https://fixture.supabase.co/rest/v1/ '])('normalizes SDK project root from %s',input=>{
 expect(normalizeSupabaseUrl(input)).toBe('https://fixture.supabase.co');
});
it.each(['https://fixture.supabase.co/rest/v1/stores','https://fixture.supabase.co/auth/v1','https://fixture.supabase.co/?key=fixture','https://fixture.supabase.co/#fixture','https://user:password@fixture.supabase.co','http://fixture.supabase.co','not-a-url'])('rejects unsafe or unrelated config %s',input=>expect(()=>normalizeSupabaseUrl(input)).toThrow());
it('preserves custom root and local development origins',()=>{
 expect(normalizeSupabaseUrl('https://api.fixture.invalid/rest/v1/')).toBe('https://api.fixture.invalid');
 expect(normalizeSupabaseUrl('http://localhost:54321/')).toBe('http://localhost:54321');
});
it('real SDK sends anonymous signup to /auth/v1/signup, not /rest/v1/auth/v1/signup',async()=>{
 const requests:string[]=[];
 const client=createClient(normalizeSupabaseUrl('https://fixture.supabase.co/rest/v1/'),'fixture-public-key',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:async(input)=>{
   requests.push(String(input));
   return new Response(JSON.stringify({code:'anonymous_provider_disabled',msg:'Fixture response'}),{status:422,headers:{'content-type':'application/json'}});
  }}
 });
 const {error}=await client.auth.signInAnonymously();
 expect(error).not.toBeNull();expect(requests).toEqual(['https://fixture.supabase.co/auth/v1/signup']);
});
it('real SDK sends backend RPC to a single /rest/v1 path',async()=>{
 const requests:string[]=[];
 const client=createClient(normalizeSupabaseUrl('https://fixture.supabase.co/rest/v1/'),'fixture-server-key',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:async(input)=>{requests.push(String(input));return new Response(JSON.stringify({device:{status:'pending'}}),{status:200,headers:{'content-type':'application/json'}})}}
 });
 const {data,error}=await client.rpc('enzy_pairing_action',{p_actor:'fixture'});
 expect(error).toBeNull();expect(data).toEqual({device:{status:'pending'}});
 expect(requests).toEqual(['https://fixture.supabase.co/rest/v1/rpc/enzy_pairing_action']);
});
