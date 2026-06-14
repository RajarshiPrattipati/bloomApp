// Server-authoritative RNG. Seeded deterministically from a SERVER-ONLY salt so
// the client can never predict, seed, or re-roll an outcome (GDD §16 Rule 1).
// Deterministic ⇒ outcomes are reproducible for audit and unit tests.

import { createHmac } from 'node:crypto';

export type Rng = () => number;

// mulberry32 — fast 32-bit PRNG.
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// HMAC-SHA256(salt, label) → 32-bit seed. Strong, deterministic, salt never ships.
export function seedFrom(salt: string, ...parts: Array<string | number>): number {
  const mac = createHmac('sha256', salt).update(parts.join('|')).digest();
  return mac.readUInt32BE(0);
}

/** A fresh RNG for one spin: bound to (player, spinCount) so each spin is unique. */
export function spinRng(salt: string, playerId: string, spinCount: number): Rng {
  return mulberry32(seedFrom(salt, 'spin', playerId, spinCount));
}

/** A deterministic RNG for a Golden Hour's helper schedule. */
export function goldenHourRng(salt: string, playerId: string, buildIndex: number): Rng {
  return mulberry32(seedFrom(salt, 'gh', playerId, buildIndex));
}
