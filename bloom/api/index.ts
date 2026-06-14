// Vercel serverless entry for the BLOOM API (pure serverless — no WebSockets).
//
// A single Node function at /api handles every route: vercel.json rewrites
// `/api/(.*)` → `/api`, and Vercel preserves the original request URL, so Fastify
// still routes nested paths (/api/auth/device, /api/team/list) internally. (An
// `api/[...path]` catch-all only matched one segment, 404ing nested routes.) The
// app is built once per
// warm instance (module scope) and reused; we never register the `/ws` realtime
// layer here, and AUTO_MIGRATE is forced off so cold starts don't run schema
// bootstrap on every invocation (run `npm run db:migrate` once at deploy time).
//
// Requests are handed to Fastify via `server.emit('request', ...)` so the raw
// request stream reaches Fastify's content-type parser untouched — that exact
// byte stream is what the HMAC signature is verified against. We deliberately do
// NOT read `req.body`, which would consume the stream and break signing.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createContext } from '../packages/server/src/app/context.js';
import { loadEnv } from '../packages/server/src/config/env.js';
import { buildServer } from '../packages/server/src/http/server.js';

type FastifyApp = Awaited<ReturnType<typeof buildServer>>;

let appPromise: Promise<FastifyApp> | null = null;

async function getApp(): Promise<FastifyApp> {
  // STORAGE=postgres + CACHE=redis are required for a correct serverless deploy
  // (in-memory adapters would lose nonce/replay + rate-limit state between the
  // isolated invocations). Those, plus secrets and DATABASE_URL/REDIS_URL, come
  // from Vercel project env vars. AUTO_MIGRATE is pinned off here.
  const env = loadEnv({ AUTO_MIGRATE: 'false' });
  const ctx = await createContext(env);
  const app = await buildServer(ctx);
  await app.ready();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const app = await (appPromise ??= getApp().catch((err) => {
      appPromise = null; // let the next request retry a failed cold start
      throw err;
    }));
    app.server.emit('request', req, res);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'server_init_failed', message: String((err as Error)?.message ?? err) }));
  }
}
