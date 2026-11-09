import {expect,it} from 'vitest';
import {jakartaTime} from '../src/lib/master-data';
it('shows valid price timestamps in Jakarta time',()=>{
 const formatted=jakartaTime('2026-11-09T00:00:00Z');
 expect(formatted).toContain('07.00');expect(formatted).toContain('WIB');
});
it('missing or invalid timestamps do not throw during rendering',()=>{
 expect(jakartaTime(undefined)).toBe('Tanggal belum tersedia');
 expect(jakartaTime(null)).toBe('Tanggal belum tersedia');
 expect(jakartaTime('invalid fixture date')).toBe('Tanggal tidak valid');
 expect(jakartaTime('infinity')).toBe('Tanggal tidak valid');
});
