import { z } from 'zod';

/** Canonical date format used everywhere: `YYYY-MM-DD` (UTC, no time component). */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Canonical timestamp format used by the event log: `YYYY-MM-DDTHH:mm:ssZ`. */
export const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export const isoDateSchema = z.string().regex(ISO_DATE_PATTERN, 'Expected an ISO date (YYYY-MM-DD)');
export const isoDateTimeSchema = z
  .string()
  .regex(ISO_DATETIME_PATTERN, 'Expected an ISO timestamp (YYYY-MM-DDTHH:mm:ssZ)');

export type IsoDate = z.infer<typeof isoDateSchema>;
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;

/**
 * The explicit "unknown / prefer not to say" sentinel.
 *
 * PolicyPulse never coerces a missing value into a passing value. Every optional
 * attribute is one of: a real value, or the literal string `UNKNOWN`.
 */
export const UNKNOWN = 'UNKNOWN';
export type Unknown = typeof UNKNOWN;

export function isUnknown(value: unknown): value is Unknown {
  return value === UNKNOWN;
}

export const isKnown = <T>(value: T | Unknown): value is T => value !== UNKNOWN;

/** JSON-ish scalar used in rule values and observed values. */
export type RuleValue = string | number | boolean;
export type RuleValueList = readonly RuleValue[];

export const CURRENCY_INR = 'INR';
export type Currency = typeof CURRENCY_INR;

export const DEMO_DATA_BADGE = 'DEMO DATA';
