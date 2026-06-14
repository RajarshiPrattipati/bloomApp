// Environment config — validated with zod. Dev-safe defaults so `npm test` and
// local runs need no .env; production refuses to boot with placeholder secrets.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// minimal .env loader (no dependency). Looks up from cwd to repo root.
function loadDotenv(): void {
  for (const dir of ['.', '..', '../..', '../../..']) {
    const p = resolve(process.cwd(), dir, '.env');
    if (existsSync(p)) {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
      }
      return;
    }
  }
}
loadDotenv();

const DEV_SECRET = 'dev-only-insecure-secret-please-change-32++';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16).default(DEV_SECRET),
  HMAC_SECRET: z.string().min(16).default(DEV_SECRET),
  RNG_SALT: z.string().min(16).default(DEV_SECRET),
  STORAGE: z.enum(['memory', 'postgres']).default('memory'),
  CACHE: z.enum(['memory', 'redis']).default('memory'),
  // Run idempotent schema bootstrap on context creation. Long-running servers
  // leave this on; serverless (Vercel) sets it false so cold starts don't migrate
  // on every invocation — run `npm run db:migrate` once at deploy instead.
  AUTO_MIGRATE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  APPLE_SHARED_SECRET: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(overrides: Record<string, string | undefined> = {}): Env {
  const env = EnvSchema.parse({ ...process.env, ...overrides });
  if (env.NODE_ENV === 'production') {
    for (const k of ['JWT_SECRET', 'HMAC_SECRET', 'RNG_SALT'] as const) {
      if (env[k] === DEV_SECRET) throw new Error(`Refusing to boot: ${k} is a dev placeholder in production`);
    }
    if (env.STORAGE === 'postgres' && !env.DATABASE_URL) throw new Error('STORAGE=postgres requires DATABASE_URL');
    if (env.CACHE === 'redis' && !env.REDIS_URL) throw new Error('CACHE=redis requires REDIS_URL');
  }
  return env;
}
