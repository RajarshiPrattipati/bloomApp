// Cache port — Redis-shaped. Used for rate limits, real-time counters, and
// (critically) nonce/replay protection via setIfAbsent.
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSec: number): Promise<void>;
  /** Atomic set-if-absent with TTL. Returns true if the key was newly set. */
  setIfAbsent(key: string, value: string, ttlSec: number): Promise<boolean>;
  close?(): Promise<void>;
}

/** Replay protection built on the cache: a nonce may be used at most once. */
export class NonceStore {
  constructor(private cache: Cache, private ttlSec = 600) {}
  /** Returns true if the nonce is fresh (and reserves it); false if already seen. */
  async useOnce(nonce: string): Promise<boolean> {
    return this.cache.setIfAbsent(`nonce:${nonce}`, '1', this.ttlSec);
  }
}
