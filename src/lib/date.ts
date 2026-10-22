import type { IsoDate, IsoDateTime } from '@/types/common';

/** Parse `YYYY-MM-DD` into a UTC-midnight `Date`. */
export function parseIsoDate(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function toIsoDateTime(date: Date): IsoDateTime {
  return `${date.toISOString().slice(0, 19)}Z`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const next = parseIsoDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return toIsoDate(next);
}

export function addMinutes(dateTime: IsoDateTime, minutes: number): IsoDateTime {
  const next = new Date(`${dateTime.replace('Z', '')}Z`);
  next.setUTCMinutes(next.getUTCMinutes() + minutes);
  return toIsoDateTime(next);
}

/** Whole days from `from` to `to`. Positive when `to` is in the future. */
export function diffDays(from: IsoDate, to: IsoDate): number {
  const ms = parseIsoDate(to).getTime() - parseIsoDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Fractional day distance, used for "time remaining" displays. */
export function diffHours(from: IsoDateTime, to: IsoDateTime): number {
  const a = new Date(`${from.replace('Z', '')}Z`).getTime();
  const b = new Date(`${to.replace('Z', '')}Z`).getTime();
  return (b - a) / 3_600_000;
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return diffDays(b, a) < 0 ? false : parseIsoDate(a).getTime() < parseIsoDate(b).getTime();
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatDate(date: IsoDate): string {
  const parsed = parseIsoDate(date);
  const day = parsed.getUTCDate();
  const month = MONTHS[parsed.getUTCMonth()] ?? 'Jan';
  const year = parsed.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export function formatShortDate(date: IsoDate): string {
  const parsed = parseIsoDate(date);
  const day = parsed.getUTCDate();
  const month = MONTHS[parsed.getUTCMonth()] ?? 'Jan';
  return `${day} ${month}`;
}

export function formatDateTime(dateTime: IsoDateTime): string {
  const date = dateTime.slice(0, 10) as IsoDate;
  const time = dateTime.slice(11, 16);
  return `${formatDate(date)}, ${time}`;
}

export function formatRelativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/** Monday-based start of week. */
export function startOfWeek(date: IsoDate): IsoDate {
  const parsed = parseIsoDate(date);
  const day = parsed.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return toIsoDate(parsed);
}

export function addWeeks(date: IsoDate, weeks: number): IsoDate {
  return addDays(date, weeks * 7);
}
