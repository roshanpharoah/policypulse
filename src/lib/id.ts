/**
 * Identifier helpers.
 *
 * Event ids are session-scoped so that replaying the log in a fresh tab cannot collide
 * with ids from a previous session, while remaining short and readable in the audit UI.
 */
const sessionNonce = Math.random().toString(36).slice(2, 8);
let counter = 0;

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${sessionNonce}${counter.toString(36)}`;
}

/** Deterministic id used by seed data and golden files. */
export function seededId(prefix: string, index: number | string): string {
  return `${prefix}_${String(index).padStart(3, '0')}`;
}

export function resetIdCounter(): void {
  counter = 0;
}
