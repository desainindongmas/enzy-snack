import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const {getSession,signInAnonymously,createClient}=vi.hoisted(()=>({getSession:vi.fn(),signInAnonymously:vi.fn(),createClient:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubEnv('VITE_SUPABASE_URL','https://example.supabase.co');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','public-test-key');createClient.mockReturnValue({auth:{getSession,signInAnonymously}})});
afterEach(()=>vi.unstubAllEnvs());
it('reuses persisted session without new anonymous account',async()=>{getSession.mockResolvedValue({data:{session:{user:{id:'existing'}}},error:null});const{initializeSession}=await import('../src/lib/supabase');expect(await initializeSession()).toBe('existing');expect(signInAnonymously).not.toHaveBeenCalled()});
it('coalesces concurrent startup into one anonymous request',async()=>{getSession.mockResolvedValue({data:{session:null},error:null});signInAnonymously.mockResolvedValue({data:{user:{id:'new'}},error:null});const{initializeSession}=await import('../src/lib/supabase');expect(await Promise.all([initializeSession(),initializeSession()])).toEqual(['new','new']);expect(signInAnonymously).toHaveBeenCalledTimes(1)});
it('does not fabricate a session after auth failure',async()=>{getSession.mockResolvedValue({data:{session:null},error:null});signInAnonymously.mockResolvedValue({data:{user:null},error:new Error('unavailable')});const{initializeSession}=await import('../src/lib/supabase');await expect(initializeSession()).rejects.toThrow('unavailable')});
it('missing configuration fails closed without creating client',async()=>{vi.stubEnv('VITE_SUPABASE_URL','');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','');const{initializeSession}=await import('../src/lib/supabase');await expect(initializeSession()).rejects.toThrow();expect(createClient).not.toHaveBeenCalled()});
it('failed attempt can be retried without reloading or fabricating identity',async()=>{
 getSession.mockResolvedValue({data:{session:null},error:null});
 signInAnonymously.mockResolvedValueOnce({data:{user:null},error:{code:'anonymous_provider_disabled'}}).mockResolvedValueOnce({data:{user:{id:'retry-success'}},error:null});
 const {initializeSession}=await import('../src/lib/supabase');
 await expect(initializeSession()).rejects.toMatchObject({code:'anonymous_provider_disabled'});
 expect(await initializeSession()).toBe('retry-success');expect(signInAnonymously).toHaveBeenCalledTimes(2);
});
it('invalid client config fails closed without crashing module import',async()=>{
 createClient.mockImplementationOnce(()=>{throw new Error('fixture-provider-detail')});
 const {initializeSession}=await import('../src/lib/supabase');
 await expect(initializeSession()).rejects.toMatchObject({setupCode:'CONFIG_INVALID'});
 expect(signInAnonymously).not.toHaveBeenCalled();
});
