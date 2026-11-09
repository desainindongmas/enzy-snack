import {it,expect} from 'vitest';
import {visitMoney} from '../src/lib/visits';
it('formats bigint currency above Number safe range without rounding away rupiah',()=>{expect(visitMoney('9007199254740993').replace(/\D/g,'')).toBe('9007199254740993')});
it('unknown or invalid monetary values are never presented as known zero',()=>{expect(visitMoney(undefined)).toBe('Belum diketahui');expect(visitMoney('invalid')).toBe('Nominal belum tersedia');expect(visitMoney('0')).toContain('0')});
