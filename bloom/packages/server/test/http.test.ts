import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContext } from '../src/app/context.js';
import { loadEnv } from '../src/config/env.js';
import { FixedClock } from '../src/ports/clock.js';
import { buildServer } from '../src/http/server.js';
import { signPayload } from '../src/http/signing.js';

const env = loadEnv({ NODE_ENV: 'test', STORAGE: 'memory', CACHE: 'memory' });
const clock = new FixedClock(1_700_000_000_000);
let app: Awaited<ReturnType<typeof buildServer>>;
let ctx: Awaited<ReturnType<typeof createContext>>;

let nonceCounter = 0;
function signedHeaders(body: object, token?: string) {
  const raw = JSON.stringify(body);
  const nonce = `n${nonceCounter++}_${Math.random().toString(36).slice(2)}`;
  const ts = String(clock.now());
  const sig = signPayload(env.HMAC_SECRET, nonce, ts, raw);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-bloom-nonce': nonce,
    'x-bloom-ts': ts,
    'x-bloom-signature': sig,
  };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return { headers, raw, nonce, ts };
}

async function post(url: string, body: object, token?: string) {
  const { headers, raw } = signedHeaders(body, token);
  return app.inject({ method: 'POST', url, headers, payload: raw });
}

beforeAll(async () => {
  ctx = await createContext(env, clock);
  app = await buildServer(ctx);
});
afterAll(async () => {
  await app.close();
  await ctx.close();
});

describe('open routes', () => {
  it('health + config are public', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    const cfg = await app.inject({ method: 'GET', url: '/api/config' });
    expect(cfg.statusCode).toBe(200);
    expect(cfg.json().dropTable.length).toBe(8);
  });
});

describe('auth + integrity', () => {
  it('registers a device and issues a token', async () => {
    const res = await post('/api/auth/device', { deviceId: 'device-abcd1234', platform: 'ios' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.playerId).toMatch(/[0-9a-f-]{36}/);
  });

  it('rejects unsigned requests', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/session', payload: '{}', headers: { 'content-type': 'application/json' } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a protected route without a JWT', async () => {
    const res = await post('/api/session', {});
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('rejects replayed nonces', async () => {
    const reg = await post('/api/auth/device', { deviceId: 'dev-replay-99', platform: 'web' });
    const token = reg.json().token;
    const { headers, raw } = signedHeaders({}, token);
    const first = await app.inject({ method: 'POST', url: '/api/session', headers, payload: raw });
    const second = await app.inject({ method: 'POST', url: '/api/session', headers, payload: raw });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(401);
    expect(second.json().error.code).toBe('replay_detected');
  });

  it('rejects a tampered signature', async () => {
    const reg = await post('/api/auth/device', { deviceId: 'dev-tamper-1', platform: 'web' });
    const token = reg.json().token;
    const { headers, raw } = signedHeaders({}, token);
    headers['x-bloom-signature'] = 'deadbeef';
    const res = await app.inject({ method: 'POST', url: '/api/session', headers, payload: raw });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('bad_signature');
  });

  it('rejects a stale timestamp', async () => {
    const reg = await post('/api/auth/device', { deviceId: 'dev-stale-1', platform: 'web' });
    const token = reg.json().token;
    const raw = JSON.stringify({});
    const nonce = `stale_${Math.random()}`;
    const ts = String(clock.now() - 10 * 60 * 1000); // 10 min old
    const sig = signPayload(env.HMAC_SECRET, nonce, ts, raw);
    const res = await app.inject({
      method: 'POST', url: '/api/session', payload: raw,
      headers: { 'content-type': 'application/json', 'x-bloom-nonce': nonce, 'x-bloom-ts': ts, 'x-bloom-signature': sig, authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('stale_request');
  });
});

describe('core loop over HTTP', () => {
  it('runs session → spin → help → build authentically', async () => {
    const reg = await post('/api/auth/device', { deviceId: 'dev-loop-1', platform: 'ios' });
    const token = reg.json().token;

    const session = await post('/api/session', {}, token);
    expect(session.statusCode).toBe(200);
    expect(session.json().wallet.spins).toBeGreaterThan(0);

    // spin until we can afford a build (bounded), collecting a valid result each time
    let view = session.json();
    for (let i = 0; i < 70 && !(view.canBuild && view.wallet.coins >= view.nextBuildCost) && view.wallet.spins > 0; i++) {
      const r = await post('/api/spin', {}, token);
      expect(r.statusCode).toBe(200);
      const j = r.json();
      expect(j.result.kind).toBeTruthy();
      view = j.view; // /api/spin returns { result, view }
    }

    // help a stranger (positive-sum)
    if (view.strangerPool.length) {
      const h = await post('/api/help', { botId: view.strangerPool[0].botId }, token);
      expect(h.statusCode).toBe(200);
      expect(typeof h.json().ok).toBe('boolean');
    }

    // build (ok if affordable, else a known reason — both are valid responses)
    const b = await post('/api/build', {}, token);
    expect(b.statusCode).toBe(200);
    expect(typeof b.json().ok).toBe('boolean');
  });
});
