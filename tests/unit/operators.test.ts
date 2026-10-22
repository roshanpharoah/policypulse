import { describe, expect, it } from 'vitest';
import { evaluateOperator } from '@/domain/rules/operators';
import type { OperatorContext } from '@/domain/rules/operators';

const context: OperatorContext = { reference: '2026-10-05', deadline: '2026-12-01' };

const run = (operator: Parameters<typeof evaluateOperator>[0]['operator'], observed: unknown, value?: unknown, value2?: unknown) =>
  evaluateOperator({
    operator,
    observed: observed as never,
    value: value as never,
    value2: value2 as never,
    context,
  });

describe('operator interpreter', () => {
  it('never passes a missing value, whatever the operator', () => {
    const operators = [
      'equals',
      'notEquals',
      'lte',
      'gte',
      'lt',
      'gt',
      'between',
      'in',
      'notIn',
      'exists',
      'issuedWithinDays',
      'notExpiredOn',
    ] as const;

    for (const operator of operators) {
      const outcome = run(operator, undefined, 100, 200);
      expect(outcome.result, `${operator} must not pass a missing value`).toBe('UNKNOWN');
    }
  });

  it('equals / notEquals', () => {
    expect(run('equals', 'OBC', 'OBC').result).toBe('PASS');
    expect(run('equals', 'OBC', 'SC').result).toBe('FAIL');
    expect(run('notEquals', 'OBC', 'SC').result).toBe('PASS');
    expect(run('notEquals', 'OBC', 'OBC').result).toBe('FAIL');
    expect(run('equals', 320000, 320000).result).toBe('PASS');
  });

  it('lte / gte / lt / gt respect boundaries', () => {
    expect(run('lte', 299999, 300000).result).toBe('PASS');
    expect(run('lte', 300000, 300000).result).toBe('PASS');
    expect(run('lte', 300001, 300000).result).toBe('FAIL');
    expect(run('gte', 300000, 300000).result).toBe('PASS');
    expect(run('gte', 299999, 300000).result).toBe('FAIL');
    expect(run('lt', 300000, 300000).result).toBe('FAIL');
    expect(run('lt', 299999, 300000).result).toBe('PASS');
    expect(run('gt', 300000, 300000).result).toBe('FAIL');
    expect(run('gt', 300001, 300000).result).toBe('PASS');
  });

  it('reports the margin on both sides of the cap', () => {
    expect(run('lte', 320000, 300000).margin).toEqual({
      value: 20000,
      direction: 'over',
      kind: 'CAP',
    });
    expect(run('lte', 280000, 300000).margin).toEqual({
      value: -20000,
      direction: 'under',
      kind: 'CAP',
    });
    expect(run('lte', 300000, 300000).margin).toBeUndefined();
  });

  it('between is inclusive on both bounds', () => {
    expect(run('between', 100, 100, 200).result).toBe('PASS');
    expect(run('between', 200, 100, 200).result).toBe('PASS');
    expect(run('between', 99, 100, 200).result).toBe('FAIL');
    expect(run('between', 201, 100, 200).result).toBe('FAIL');
    expect(run('between', 50, 100, 200).margin?.kind).toBe('RANGE');
  });

  it('in / notIn', () => {
    expect(run('in', 'OBC', ['SC', 'OBC']).result).toBe('PASS');
    expect(run('in', 'GEN', ['SC', 'OBC']).result).toBe('FAIL');
    expect(run('notIn', 'GEN', ['SC', 'OBC']).result).toBe('PASS');
    expect(run('notIn', 'OBC', ['SC', 'OBC']).result).toBe('FAIL');
  });

  it('exists only checks presence', () => {
    expect(run('exists', 'anything').result).toBe('PASS');
    expect(run('exists', undefined).result).toBe('UNKNOWN');
  });

  it('issuedWithinDays is relative to the reference date', () => {
    expect(run('issuedWithinDays', '2026-10-01', 10).result).toBe('PASS');
    expect(run('issuedWithinDays', '2026-09-25', 10).result).toBe('PASS');
    expect(run('issuedWithinDays', '2026-09-24', 10).result).toBe('FAIL');
    expect(run('issuedWithinDays', '2026-10-01', 10).margin).toEqual({
      value: 6,
      direction: 'under',
      kind: 'FRESHNESS',
    });
  });

  it('notExpiredOn compares against the reference date', () => {
    expect(run('notExpiredOn', '2026-10-05', 1).result).toBe('PASS');
    expect(run('notExpiredOn', '2026-10-06', 1).result).toBe('PASS');
    expect(run('notExpiredOn', '2026-10-04', 1).result).toBe('FAIL');
  });

  it('returns UNKNOWN when the operator cannot apply to the observed type', () => {
    expect(run('lte', 'not-a-number', 100).result).toBe('UNKNOWN');
    expect(run('issuedWithinDays', 42, 30).result).toBe('UNKNOWN');
  });
});
