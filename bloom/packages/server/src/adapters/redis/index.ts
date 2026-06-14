// Redis cache adapter (ioredis). TTL-based keys are a natural fit for nonce
// replay windows and rate-limit counters (GDD §18).

import Redis from 'ioredis';
import type { Cache } from '../../ports/cache.js';

export class RedisCache implements Cache {
  private redis: Redis;
  constructor(url: string) {
    this.redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
  }
  async get(key: string) {
    return this.redis.get(key);
  }
  async set(key: string, value: string, ttlSec?: number) {
    if (ttlSec) await this.redis.set(key, value, 'EX', ttlSec);
    else await this.redis.set(key, value);
  }
  async incr(key: string) {
    return this.redis.incr(key);
  }
  async expire(key: string, ttlSec: number) {
    await this.redis.expire(key, ttlSec);
  }
  async setIfAbsent(key: string, value: string, ttlSec: number) {
    // SET key val NX EX ttl → 'OK' if newly set, null if it already existed.
    const res = await this.redis.set(key, value, 'EX', ttlSec, 'NX');
    return res === 'OK';
  }
  async close() {
    await this.redis.quit();
  }
}
