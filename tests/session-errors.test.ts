import {it,expect} from 'vitest';
import {SessionSetupError,sessionFailureMessage} from '../src/lib/session-errors';
it('separates missing build config from disabled anonymous provider',()=>{
 expect(sessionFailureMessage(new SessionSetupError('CONFIG_MISSING'))).toContain('SETUP-01');
 expect(sessionFailureMessage({code:'anonymous_provider_disabled'})).toContain('SETUP-03');
});
it('identifies CAPTCHA, throttle, key rejection and network failures',()=>{
 for(const [error,code] of [
  [{code:'captcha_failed'},'SETUP-04'],[{status:429},'SETUP-05'],
  [{status:401},'SETUP-07'],[{name:'AuthRetryableFetchError'},'SETUP-06'],
  [{name:'SecurityError'},'SETUP-09']
 ] as const)expect(sessionFailureMessage(error)).toContain(code);
});
it('never exposes unknown provider messages or credentials in errors',()=>{
 const marker='fixture-sensitive-value-must-never-appear';
 const message=sessionFailureMessage({message:marker,code:marker});
 expect(message).toContain('SETUP-08');expect(message).not.toContain(marker);
 expect(sessionFailureMessage(null)).toContain('SETUP-08');
});
