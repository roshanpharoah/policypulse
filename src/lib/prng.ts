/**
 * Deterministic PRNG utilities.
 *
 * The synthetic cohort in the Policy Simulator and every golden-file test must produce
 * byte-identical output on every machine, so `Math.random` is never used for domain data.
 *
 * Algorithm: **mulberry32** — a 32-bit state, 2^32 period, uniform output.
 * Reference: Tommy Ettinger's mulberry32 (public domain).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export class SeededRandom {
  private readonly next: () => number;

  constructor(readonly seed: number) {
    this.next = mulberry32(seed);
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() requires a non-empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Sample `count` distinct items (or fewer if the source array is smaller). */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i += 1) {
      const index = this.int(0, pool.length - 1);
      const [removed] = pool.splice(index, 1);
      if (removed !== undefined) out.push(removed);
    }
    return out;
  }

  /** Box–Muller normal deviate. */
  normal(mean = 0, stdDev = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Log-normal deviate — used for the synthetic family-income distribution. */
  logNormal(mu: number, sigma: number): number {
    return Math.exp(this.normal(mu, sigma));
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }
}
