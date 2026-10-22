/**
 * A tiny, safe wrapper around `window.localStorage`.
 *
 * Storage can be unavailable (private mode, disabled cookies, quota exhausted). The
 * adapter must never crash the app because of that, so every operation degrades to an
 * in-memory map and reports the degradation through `isPersistent`.
 */
export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
  readonly isPersistent: boolean;
}

export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
    },
    remove: (key) => {
      map.delete(key);
    },
    keys: () => [...map.keys()],
    isPersistent: false,
  };
}

export function createLocalStorage(): KeyValueStorage {
  const memory = createMemoryStorage();
  try {
    if (typeof window === 'undefined' || !window.localStorage) return memory;
    const probe = '__policypulse_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch {
    return memory;
  }

  return {
    get: (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memory.get(key);
      }
    },
    set: (key, value) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        memory.set(key, value);
      }
    },
    remove: (key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        memory.remove(key);
      }
    },
    keys: () => {
      try {
        return Object.keys(window.localStorage);
      } catch {
        return memory.keys();
      }
    },
    isPersistent: true,
  };
}

export const STORAGE_KEYS = {
  events: 'policypulse.events.v1',
  profile: 'policypulse.profile.v1',
  documents: 'policypulse.documents.v1',
  applications: 'policypulse.applications.v1',
  preferences: 'policypulse.preferences.v1',
} as const;
