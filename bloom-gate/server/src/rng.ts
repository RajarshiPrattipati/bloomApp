// Deterministic, server-authoritative RNG. The client cannot seed, re-roll, or
// predict outcomes — it only sends SPIN_REQUEST (GDD §16 / PRD FR-S1).

// mulberry32 — fast, decent-quality 32-bit PRNG seeded per spin.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a hash to combine (userId + spinCount + salt) into a 32-bit seed.
export function hashSeed(...parts: Array<string | number>): number {
  let h = 2166136261 >>> 0;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
