import { describe, expect, it } from 'vitest';
import {
  combineResults,
  eligibilityFromResults,
  toEligibilityStatus,
} from '@/domain/rules/threeValued';

describe('three-valued (Kleene) combination', () => {
  it('maps FAIL to INELIGIBLE, UNKNOWN to POTENTIALLY_ELIGIBLE, PASS to ELIGIBLE', () => {
    expect(toEligibilityStatus('FAIL')).toBe('INELIGIBLE');
    expect(toEligibilityStatus('UNKNOWN')).toBe('POTENTIALLY_ELIGIBLE');
    expect(toEligibilityStatus('PASS')).toBe('ELIGIBLE');
  });

  it('one FAIL dominates everything else', () => {
    expect(combineResults(['PASS', 'FAIL', 'PASS'])).toBe('FAIL');
    expect(combineResults(['UNKNOWN', 'FAIL', 'UNKNOWN'])).toBe('FAIL');
    expect(combineResults(['FAIL'])).toBe('FAIL');
  });

  it('UNKNOWN dominates PASS but never FAIL', () => {
    expect(combineResults(['PASS', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(combineResults(['PASS', 'PASS'])).toBe('PASS');
    expect(combineResults(['UNKNOWN', 'PASS', 'UNKNOWN'])).toBe('UNKNOWN');
  });

  it('an empty criteria set is vacuously PASS', () => {
    expect(combineResults([])).toBe('PASS');
    expect(eligibilityFromResults([])).toBe('ELIGIBLE');
  });

  it('is commutative and idempotent', () => {
    const a: ('PASS' | 'FAIL' | 'UNKNOWN')[] = ['PASS', 'UNKNOWN'];
    const b: ('PASS' | 'FAIL' | 'UNKNOWN')[] = ['UNKNOWN', 'PASS'];
    expect(combineResults(a)).toBe(combineResults(b));
    expect(combineResults(['PASS'])).toBe(combineResults(['PASS', 'PASS']));
  });

  it('is monotone: adding a FAIL can never improve the outcome', () => {
    const worse = combineResults(['PASS', 'UNKNOWN', 'FAIL']);
    expect(worse).toBe('FAIL');
    expect(worse === 'PASS').toBe(false);
  });
});
