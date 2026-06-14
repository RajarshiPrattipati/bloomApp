// BLOOM gate server — Fastify, server-authoritative (PRD TR-2).
// Every route advances the world lazily, then drains the client outbox.

import cors from '@fastify/cors';
import Fastify from 'fastify';
import { BALANCE, buildingCost, publicConfig } from './balance.js';
import { resolveSpin } from './spin.js';
import {
  currentBuildingIndex,
  getOrCreateSession,
  snapshot,
  type SessionState,
} from './state.js';
import { logEvent } from './telemetry.js';
import { advance, buildAction, drainOutbox, helpBot, strangerPool } from './world.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = '0.0.0.0';

const app = Fastify({ logger: { level: 'warn' } });
await app.register(cors, { origin: true });

// world view returned by every action (snapshot + pool + drained events)
function view(s: SessionState, now: number) {
  return {
    ...snapshot(s),
    strangerPool: strangerPool(now),
    nextBuildCost: buildingCost(s.level, currentBuildingIndex(s)),
    canBuild: !s.constructing && !s.gh,
    events: drainOutbox(s),
  };
}

app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));
app.get('/api/config', async () => publicConfig());

app.post('/api/session', async (req) => {
  const now = Date.now();
  const body = (req.body ?? {}) as { sessionId?: string };
  const sessionId = body.sessionId || `s_${Math.random().toString(36).slice(2, 10)}`;
  const s = getOrCreateSession(sessionId);
  advance(s, now);
  await logEvent({ ts: now, sessionId, type: 'session_start' });
  return { sessionId, ...view(s, now) };
});

// passive world poll (drives toasts, pool refresh, GH progress, gratitude)
app.post('/api/sync', async (req, reply) => {
  const now = Date.now();
  const body = (req.body ?? {}) as { sessionId?: string };
  if (!body.sessionId) return reply.code(400).send({ error: 'sessionId required' });
  const s = getOrCreateSession(body.sessionId);
  advance(s, now);
  s.lastSyncAt = now;
  return view(s, now);
});

app.post('/api/spin', async (req, reply) => {
  const now = Date.now();
  const body = (req.body ?? {}) as { sessionId?: string };
  if (!body.sessionId) return reply.code(400).send({ error: 'sessionId required' });
  const s = getOrCreateSession(body.sessionId);
  advance(s, now);
  const result = resolveSpin(s, now);
  await logEvent({
    ts: now,
    sessionId: s.sessionId,
    type: 'spin',
    spinId: result.spinId,
    kind: result.kind,
    coinsAwarded: result.coinsAwarded,
    momentumAfter: result.momentumAfter,
    hot: result.hot,
  });
  return { result, ...view(s, now) };
});

app.post('/api/build', async (req, reply) => {
  const now = Date.now();
  const body = (req.body ?? {}) as { sessionId?: string };
  if (!body.sessionId) return reply.code(400).send({ error: 'sessionId required' });
  const s = getOrCreateSession(body.sessionId);
  advance(s, now);
  const res = buildAction(s, now);
  if (res.ok) {
    await logEvent({
      ts: now,
      sessionId: s.sessionId,
      type: 'build',
      level: s.level,
      buildingsBuilt: s.buildingsBuilt,
    });
  }
  return { build: res, ...view(s, now) };
});

app.post('/api/help', async (req, reply) => {
  const now = Date.now();
  const body = (req.body ?? {}) as { sessionId?: string; botId?: number };
  if (!body.sessionId || body.botId === undefined) {
    return reply.code(400).send({ error: 'sessionId and botId required' });
  }
  const s = getOrCreateSession(body.sessionId);
  advance(s, now);
  const res = helpBot(s, body.botId, now);
  if (res.ok) {
    await logEvent({
      ts: now,
      sessionId: s.sessionId,
      type: 'help_given',
      botId: body.botId,
      coins: res.coins,
      momentum: res.momentum,
    });
  }
  return { help: res, ...view(s, now) };
});

// generic client telemetry passthrough
app.post('/api/event', async (req) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  await logEvent({
    ts: Date.now(),
    sessionId: String(body.sessionId ?? 'anon'),
    type: String(body.type ?? 'client_event'),
    ...body,
  });
  return { ok: true };
});

try {
  await app.listen({ port: PORT, host: HOST });
  // eslint-disable-next-line no-console
  console.log(`BLOOM gate server on http://localhost:${PORT}  (GH=${BALANCE.goldenHour.durationMs}ms, decay=${BALANCE.momentum.decayPerSec}/s)`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
