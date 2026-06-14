// Full-loop server smoke test (no browser). Exercises spin → build → Golden Hour
// → bot helpers → stranger-pool help → gratitude → momentum decay.
// Run the server with compressed time, then: node scripts/smoke.mjs
const BASE = process.env.BASE || 'http://localhost:3000';

async function j(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('health:', await j('/api/health'));
const cfg = await j('/api/config');
console.log('GH duration:', cfg.goldenHour.durationMs, 'ms  decay:', cfg.momentum.decayPerSec, '/s');

const sid = 'smoke_' + Math.random().toString(36).slice(2, 8);
let v = await j('/api/session', { sessionId: sid });
console.log(`\nsession ${sid} — next build cost ${v.nextBuildCost}`);

// 1) spin until we can afford a build
let spins = 0;
while (v.wallet.coins < v.nextBuildCost && spins < 200) {
  const r = await j('/api/spin', { sessionId: sid });
  v = r;
  spins++;
}
console.log(`spun ${spins}x → coins ${v.wallet.coins}, momentum ${v.wallet.momentum}×`);

// 2) build → opens Golden Hour
const b = await j('/api/build', { sessionId: sid });
console.log('build:', b.build, '→ GH open:', !!b.goldenHour, 'msLeft', b.goldenHour?.msLeft);

// 3) help a stranger from the pool (earn momentum + schedule gratitude)
if (v.strangerPool.length) {
  const target = b.strangerPool[0];
  const h = await j('/api/help', { sessionId: sid, botId: target.botId });
  console.log(`helped ${target.name}'s ${target.building}:`, h.help, 'momentum now', h.wallet.momentum, '×');
}

// 4) poll the world while the Golden Hour runs; collect events
console.log('\nwatching Golden Hour + gratitude…');
const seen = {};
const end = Date.now() + Math.min(cfg.goldenHour.durationMs + 8000, 90000);
while (Date.now() < end) {
  await sleep(2000);
  const s = await j('/api/sync', { sessionId: sid });
  for (const e of s.events) {
    seen[e.type] = (seen[e.type] || 0) + 1;
    if (e.type !== 'helper_joined') console.log('  event:', JSON.stringify(e));
    else process.stdout.write(`  helper ${e.helpers} (${e.name})\n`);
  }
  if (!s.goldenHour && seen.gh_closed) break;
}

// 5) confirm momentum decays when idle — bump it FIRST so we're off the floor
let before = (await j('/api/sync', { sessionId: sid })).wallet.momentum;
const probePool = (await j('/api/sync', { sessionId: sid })).strangerPool;
for (const w of probePool) {
  const h = await j('/api/help', { sessionId: sid, botId: w.botId });
  if (h.help.ok) { before = h.wallet.momentum; break; }
}
console.log(`bumped momentum to ${before}× — now idling 4s…`);
await sleep(4000);
const after = (await j('/api/sync', { sessionId: sid })).wallet.momentum;

console.log('\nevent tallies:', seen);
console.log(`momentum decay check: ${before}× → ${after}× after 4s idle (expect lower)`);
console.log(`buildings built: ${(await j('/api/sync', { sessionId: sid })).village.buildingsBuilt}`);

const ok =
  b.build.ok &&
  seen.helper_joined > 0 &&
  seen.gh_closed > 0 &&
  after < before;
console.log(ok ? '\nFULL-LOOP SMOKE OK ✅' : '\nSMOKE INCOMPLETE ⚠️ (check above)');
process.exit(ok ? 0 : 1);
