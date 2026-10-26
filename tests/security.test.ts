import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {denyPairing} from '../supabase/functions/_shared/deny';
const migration=readFileSync(new URL('../supabase/migrations/202610260001_device_access.sql',import.meta.url),'utf8');
describe('Phase 1 fail-closed endpoints',()=>{
 for(const scenario of ['anonymous','revoked','expired','reused','wrong-code','forged-owner'])it(`rejects ${scenario}`,async()=>{
 const r=denyPairing(new Request('https://example.invalid/redeem-pairing',{method:'POST',body:JSON.stringify({scenario,role:'owner',status:'active'})}));
 expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'PAIRING_NOT_ENABLED'});
 });
 it('rejects malformed requests too',()=>expect(denyPairing(new Request('https://example.invalid')).status).toBe(503));
});
describe('migration structural checks (not live RLS proof)',()=>{
 it('revokes every client table privilege',()=>{expect(migration).toContain('from public, anon, authenticated;');expect(migration).not.toMatch(/create policy|grant select|grant all/i)});
 it('checks active status and revocation on both permission helpers',()=>expect(migration.match(/status = 'active' and revoked_at is null/g)).toHaveLength(2));
 it('has no public owner-claim function',()=>expect(migration).not.toMatch(/create function.*(claim_owner|signup_owner|first_user)/i));
});
