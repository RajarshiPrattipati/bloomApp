// Composition root. Builds the dependency graph from env: memory vs Postgres,
// memory vs Redis. Everything downstream depends on AppContext, not concretes.

import pino, { type Logger } from 'pino';
import { memoryRepositories, MemoryCache } from '../adapters/memory/index.js';
import { createPg, type PgHandle } from '../adapters/postgres/client.js';
import { migrate } from '../adapters/postgres/migrate.js';
import { pgRepositories } from '../adapters/postgres/repos.js';
import { RedisCache } from '../adapters/redis/index.js';
import type { Env } from '../config/env.js';
import type { Cache } from '../ports/cache.js';
import { systemClock, type Clock } from '../ports/clock.js';
import type { Repositories } from '../ports/repositories.js';

export interface AppContext {
  env: Env;
  log: Logger;
  clock: Clock;
  repos: Repositories;
  cache: Cache;
  close(): Promise<void>;
}

export async function createContext(env: Env, clock: Clock = systemClock): Promise<AppContext> {
  const log = pino({ level: env.LOG_LEVEL });

  let repos: Repositories;
  let pg: PgHandle | null = null;
  if (env.STORAGE === 'postgres') {
    if (!env.DATABASE_URL) throw new Error('STORAGE=postgres requires DATABASE_URL');
    if (env.AUTO_MIGRATE) await migrate(env.DATABASE_URL);
    pg = createPg(env.DATABASE_URL);
    repos = pgRepositories(pg.db);
    log.info('storage: postgres');
  } else {
    repos = memoryRepositories();
    log.info('storage: memory');
  }

  let cache: Cache;
  if (env.CACHE === 'redis') {
    if (!env.REDIS_URL) throw new Error('CACHE=redis requires REDIS_URL');
    cache = new RedisCache(env.REDIS_URL);
    log.info('cache: redis');
  } else {
    cache = new MemoryCache();
    log.info('cache: memory');
  }

  return {
    env,
    log,
    clock,
    repos,
    cache,
    async close() {
      await pg?.close();
      await cache.close?.();
    },
  };
}
