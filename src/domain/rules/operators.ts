import { diffDays } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import type { IsoDate, RuleValue, RuleValueList } from '@/types/common';
import type { CriterionResult } from '@/types/decision';
import type { Operator } from '@/types/opportunity';
import type { RawMargin } from './margin';

export interface OperatorContext {
  /** Reference date for the operator — "today" or the deadline, depending on the rule. */
  reference: IsoDate;
  /** The application deadline, always available for context. */
  deadline: IsoDate;
}

export interface OperatorInput {
  operator: Operator;
  value?: RuleValue | RuleValueList;
  value2?: RuleValue;
  /** `undefined` means "not provided". Never a pass. */
  observed: RuleValue | undefined;
  context: OperatorContext;
}

export interface OperatorOutcome {
  result: CriterionResult;
  observed: string;
  observedRaw?: RuleValue;
  margin?: RawMargin;
}

function isNumeric(value: RuleValue | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function valuesEqual(a: RuleValue, b: RuleValue): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return String(a) === String(b);
}

export function asList(value: RuleValue | RuleValueList | undefined): RuleValue[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return [...(value as RuleValue[])];
  return [value as RuleValue];
}

/**
 * The operator interpreter.
 *
 * Contract, in one sentence: **a missing observed value never passes.** Every operator
 * returns `UNKNOWN` when `observed` is `undefined`; the caller then applies the
 * criterion's `onUnknown` policy (`unknown` by default, `fail` when the scheme treats
 * silence as disqualification).
 */
export function evaluateOperator(input: OperatorInput): OperatorOutcome {
  const { operator, value, value2, observed, context } = input;

  if (observed === undefined) {
    return { result: 'UNKNOWN', observed: 'Unknown' };
  }

  switch (operator) {
    case 'exists':
      return { result: 'PASS', observed: describe(observed), observedRaw: observed };

    case 'equals': {
      const target = asList(value)[0];
      const ok = target !== undefined && valuesEqual(observed, target);
      return {
        result: ok ? 'PASS' : 'FAIL',
        observed: describe(observed),
        observedRaw: observed,
        margin: ok ? undefined : { value: 0, direction: 'under', kind: 'MISMATCH' },
      };
    }

    case 'notEquals': {
      const target = asList(value)[0];
      const ok = target === undefined || !valuesEqual(observed, target);
      return {
        result: ok ? 'PASS' : 'FAIL',
        observed: describe(observed),
        observedRaw: observed,
        margin: ok ? undefined : { value: 0, direction: 'over', kind: 'MISMATCH' },
      };
    }

    case 'lte':
    case 'lt':
    case 'gte':
    case 'gt': {
      const threshold = asList(value)[0];
      if (!isNumeric(observed) || !isNumeric(threshold)) {
        return { result: 'UNKNOWN', observed: describe(observed), observedRaw: observed };
      }
      const passes =
        operator === 'lte'
          ? observed <= threshold
          : operator === 'lt'
            ? observed < threshold
            : operator === 'gte'
              ? observed >= threshold
              : observed > threshold;
      const delta = observed - threshold;
      const margin: RawMargin | undefined =
        delta === 0
          ? undefined
          : {
              value: delta,
              direction: delta > 0 ? 'over' : 'under',
              kind: operator === 'lte' || operator === 'lt' ? 'CAP' : 'FLOOR',
            };
      return { result: passes ? 'PASS' : 'FAIL', observed: describe(observed), observedRaw: observed, margin };
    }

    case 'between': {
      const lower = asList(value)[0];
      const upper = value2;
      if (!isNumeric(observed) || !isNumeric(lower) || !isNumeric(upper)) {
        return { result: 'UNKNOWN', observed: describe(observed), observedRaw: observed };
      }
      const passes = observed >= lower && observed <= upper;
      const delta = observed < lower ? lower - observed : observed > upper ? observed - upper : 0;
      const margin: RawMargin | undefined =
        delta === 0
          ? undefined
          : {
              value: delta,
              direction: observed < lower ? 'under' : 'over',
              kind: 'RANGE',
            };
      return { result: passes ? 'PASS' : 'FAIL', observed: describe(observed), observedRaw: observed, margin };
    }

    case 'in':
    case 'notIn': {
      const list = asList(value);
      const included = list.some((item) => valuesEqual(item, observed));
      const passes = operator === 'in' ? included : !included;
      return {
        result: passes ? 'PASS' : 'FAIL',
        observed: describe(observed),
        observedRaw: observed,
        margin: passes ? undefined : { value: 0, direction: 'under', kind: 'MISMATCH' },
      };
    }

    case 'issuedWithinDays': {
      const maxAge = asList(value)[0];
      if (!isNumeric(maxAge) || typeof observed !== 'string') {
        return { result: 'UNKNOWN', observed: describe(observed), observedRaw: observed };
      }
      const age = diffDays(observed, context.reference);
      const passes = age >= 0 && age <= maxAge;
      const margin: RawMargin | undefined = passes
        ? { value: maxAge - age, direction: 'under', kind: 'FRESHNESS' }
        : {
            value: Math.abs(age - maxAge),
            direction: age > maxAge ? 'over' : 'under',
            kind: 'FRESHNESS',
          };
      return { result: passes ? 'PASS' : 'FAIL', observed: describe(observed), observedRaw: observed, margin };
    }

    case 'notExpiredOn': {
      if (typeof observed !== 'string') {
        return { result: 'UNKNOWN', observed: describe(observed), observedRaw: observed };
      }
      // Positive when the observed date is after the reference date.
      const daysUntilExpiry = diffDays(context.reference, observed);
      const passes = daysUntilExpiry >= 0;
      const margin: RawMargin | undefined = passes
        ? undefined
        : { value: Math.abs(daysUntilExpiry), direction: 'under', kind: 'VALIDITY' };
      return { result: passes ? 'PASS' : 'FAIL', observed: describe(observed), observedRaw: observed, margin };
    }

    default:
      return { result: 'UNKNOWN', observed: describe(observed), observedRaw: observed };
  }
}

export function describe(value: RuleValue | undefined): string {
  if (value === undefined) return 'Unknown';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatNumber(value);
  return value;
}
