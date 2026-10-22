/** Indian-format rupee, e.g. 350000 -> "₹3,50,000". */
export function formatINR(amount: number): string {
  const negative = amount < 0;
  const rounded = Math.round(Math.abs(amount));
  const digits = String(rounded);
  let grouped = '';
  for (let index = 0; index < digits.length; index += 1) {
    const fromEnd = digits.length - index;
    grouped += digits[index];
    if (fromEnd > 1 && (fromEnd - 1) % 2 === 0) grouped += ',';
  }
  return `${negative ? '-' : ''}₹${grouped}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatHours(hours: number): string {
  if (hours === 0) return '0h';
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (whole === 0) return `${minutes}m`;
  if (minutes === 0) return `${whole}h`;
  return `${whole}h ${minutes}m`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function truncate(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
