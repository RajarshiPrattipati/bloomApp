// Signed end-to-end smoke against a running server (any STORAGE/CACHE backend).
// Verifies the full security + loop path: register → session → spin → build → help.
import { createHmac, randomUUID } from 'node:crypto';

const BASE = process.env.BASE || 'http://localhost:4002';
const HMAC = process.env.HMAC_SECRET || 'dev-only-insecure-secret-please-change-32++';

function sign(nonce, ts, raw) {
  return createHmac('sha256', HMAC).update(`${nonce}.${ts}.${raw}`).digest('hex');
}
async function post(path, body, token) {
  const raw = JSON.stringify(body ?? {});
  const nonce = randomUUID();
  const ts = String(Date.now());
  const headers = {
    'content-type': 'application/json',
    'x-bloom-nonce': nonce,
    'x-bloom-ts': ts,
    'x-bloom-signature': sign(nonce, ts, raw),
  };
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method: 'POST', headers, body: raw });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

console.log('health:', await (await fetch(BASE + '/api/health')).json());

const reg = await post('/api/auth/device', { deviceId: 'smoke-' + randomUUID(), platform: 'web' });
console.log('registered playerId:', reg.playerId);
const token = reg.token;

let view = await post('/api/session', {}, token);
console.log('session spins:', view.wallet.spins, 'nextBuildCost:', view.nextBuildCost);

let spins = 0;
while (view.wallet.spins > 0 && spins < 80) {
  const r = await post('/api/spin', {}, token);
  view = r.view;
  spins++;
}
console.log(`spun ${spins}x → coins ${view.wallet.coins}, momentum ${view.wallet.momentum}×`);

if (view.strangerPool.length) {
  const h = await post('/api/help', { botId: view.strangerPool[0].botId }, token);
  console.log('helped:', h.ok, '→ momentum', h.view.wallet.momentum, '×');
}
const b = await post('/api/build', {}, token);
console.log('build:', b.ok, b.reason ?? '', '→ goldenHour:', !!b.view.goldenHour, '· coins', b.view.wallet.coins);
let coins = b.view.wallet.coins;

// purchase (sandbox) — exercises payments against the real DB (purchase replay table)
const p = await post('/api/purchase/verify', { platform: 'ios', productId: 'spins_120', receipt: 'sandbox-ok:spins_120', transactionId: 'smoke-tx-' + randomUUID() }, token);
console.log('purchase:', p.ok, '→ spins now', p.view?.wallet.spins);

// teams — exercises team tables + project contribution
const team = await post('/api/team/create', { name: 'Smoke Squad' }, token);
console.log('team create:', team.ok, '→', team.team?.name, 'members', team.team?.memberCount);
const amount = Math.max(10, Math.min(1000, Math.floor(coins / 2)));
const contrib = await post('/api/team/contribute', { amount }, token);
console.log(`team contribute ${amount}:`, contrib.ok, contrib.reason ?? '', '→ project pct', contrib.team?.project?.pct, '%');
const list = await post('/api/team/list', {}, token);
console.log('team list count:', list.length);

console.log('\nPROD SMOKE OK ✅ (backend:', process.env.LABEL || 'unknown', ')');
