// Server entry point. Loads env → composition root → Fastify → listen.

import { createContext } from './app/context.js';
import { loadEnv } from './config/env.js';
import { buildServer } from './http/server.js';
import { registerRealtime } from './realtime/presence.js';

const env = loadEnv();
const ctx = await createContext(env);
const app = await buildServer(ctx);
await registerRealtime(app, ctx);

const shutdown = async (signal: string) => {
  ctx.log.info({ signal }, 'shutting down');
  await app.close();
  await ctx.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  ctx.log.info(`BLOOM server on http://localhost:${env.PORT} (storage=${env.STORAGE} cache=${env.CACHE})`);
} catch (err) {
  ctx.log.error({ err }, 'failed to start');
  process.exit(1);
}
