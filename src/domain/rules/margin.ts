import { formatINR, formatNumber } from '@/lib/format';

export type MarginUnit = 'INR' | 'PERCENT' | 'POINTS' | 'DAYS' | 'COUNT' | 'YEARS' | 'GENERIC';

export type MarginKind =
  | 'CAP'
  | 'FLOOR'
  | 'RANGE'
  | 'FRESHNESS'
  | 'VALIDITY'
  | 'MISMATCH';

export interface Margin {
  /** Signed distance from the requirement (the label always shows the magnitude). */
  value: number;
  direction: 'over' | 'under' | 'within';
  /** e.g. "₹40,000 under the cap". */
  label: string;
}

/** Raw margin produced by an operator; the evaluation layer turns it into a sentence. */
export interface RawMargin {
  value: number;
  direction: 'over' | 'under';
  kind: MarginKind;
}

export function formatMarginValue(unit: MarginUnit, value: number): string {
  switch (unit) {
    case 'INR':
      return formatINR(value);
    case 'PERCENT':
      return `${formatNumber(value)}%`;
    case 'POINTS':
      return `${formatNumber(value)} points`;
    case 'DAYS':
      return `${formatNumber(value)} days`;
    case 'COUNT':
      return formatNumber(value);
    case 'YEARS':
      return `${formatNumber(value)} years`;
    default:
      return formatNumber(value);
  }
}

const DEFAULT_LABEL: Record<MarginUnit, string> = {
  INR: 'the cap',
  PERCENT: 'the minimum',
  POINTS: 'the minimum',
  DAYS: 'the freshness window',
  COUNT: 'the minimum',
  YEARS: 'the minimum',
  GENERIC: 'the required value',
};

export interface MarginOptions {
  unit?: MarginUnit;
  /** Overrides the default phrase, e.g. "the ₹3,00,000 income cap". */
  thresholdLabel?: string;
}

/**
 * Builds the human-readable margin sentence shown next to every criterion.
 * The wording is intentionally explicit — "₹40,000 under the cap" — because a bare
 * number is not actionable.
 */
export function formatMargin(
  kind: MarginKind,
  value: number,
  direction: 'over' | 'under',
  options: MarginOptions = {},
): Margin {
  const unit = options.unit ?? 'GENERIC';
  const magnitude = formatMarginValue(unit, Math.abs(value));
  const threshold = options.thresholdLabel ?? DEFAULT_LABEL[unit];

  switch (kind) {
    case 'CAP':
      return { value, direction, label: `${magnitude} ${direction} ${threshold}` };
    case 'FLOOR':
      return {
        value,
        direction,
        label:
          direction === 'under'
            ? `${magnitude} below ${threshold}`
            : `${magnitude} above ${threshold}`,
      };
    case 'RANGE':
      return {
        value,
        direction,
        label:
          direction === 'under'
            ? `${magnitude} below the lower bound`
            : `${magnitude} above the upper bound`,
      };
    case 'FRESHNESS':
      return {
        value,
        direction,
        label:
          direction === 'over'
            ? `${magnitude} beyond ${threshold}`
            : `${magnitude} inside ${threshold}`,
      };
    case 'VALIDITY':
      return {
        value,
        direction,
        label: `${magnitude} short of validity on the reference date`,
      };
    case 'MISMATCH':
    default:
      return { value, direction, label: `${magnitude} away from ${threshold}` };
  }
}
