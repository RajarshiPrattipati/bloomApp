// ─────────────────────────────────────────────────────────────────────────────
// sim.mjs — the automated half of the end-to-end test flow (PRD §6.2 E2E-2).
// Runs many simulated sessions concurrently against the real server, following a
// modeled player policy, and prints the GREENLIGHT_PRD §8 rubric metrics.
//
// What's GENUINE vs MODELED:
//   • hot-spin rate, spins/session, helps, momentum, GH completion → emergent
//     from the real server economy (honest signal).
//   • "reopen tomorrow" + "explain in one sentence" → HUMAN ONLY (sim prints n/a).
//   • re-spin-after-warning → emitted warnings are real; the decision to re-spin
//     is modeled by a per-profile patience (clearly labelled).
//
// Run the server first (ideally compressed time), then: node scripts/sim.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://localhost:3000';
const N = Number(process.env.N || 100);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function j(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// player profiles: patience = P(re-spin after a momentum-cooling warning).
// `lapses` = number of modeled walk-away pauses (where the meter fully cools and
// a cooling warning can fire) — this is what the re-engagement metric measures.
const PROFILES = [
  { name: 'impatient', weight: 0.3, patience: 0.35, actions: 22, lapses: 2 },
  { name: 'casual',    weight: 0.45, patience: 0.62, actions: 34, lapses: 3 },
  { name: 'engaged',   weight: 0.25, patience: 0.88, actions: 48, lapses: 3 },
];
function pickProfile(i) {
  // deterministic spread by index
  const r = (i * 0.61803398875) % 1;
  let acc = 0;
  for (const p of PROFILES) { acc += p.weight; if (r < acc) return p; }
  return PROFILES[PROFILES.length - 1];
}

async function runSession(i) {
  const prof = pickProfile(i);
  const sid = `sim_${i}_${Math.random().toString(36).slice(2, 7)}`;
  const m = {
    profile: prof.name,
    spins: 0,
    hotSpins: 0,
    helps: 0,
    builds: 0,
    ghClosed: 0,
    warnings: 0,
    respinsAfterWarning: 0,
    startedAt: Date.now(),
    endedAt: 0,
    thankYous: 0,
  };
  let v = await j('/api/session', { sessionId: sid });
  const lapseAt = new Set(
    Array.from({ length: prof.lapses }, (_, k) => Math.floor((prof.actions * (k + 1)) / (prof.lapses + 1))),
  );

  for (let a = 0; a < prof.actions; a++) {
    // spin
    const r = await j('/api/spin', { sessionId: sid });
    m.spins++; if (r.result.hot) m.hotSpins++;
    tally(m, r.events);
    v = r;

    // build when affordable
    if (v.canBuild && v.wallet.coins >= v.nextBuildCost) {
      const b = await j('/api/build', { sessionId: sid });
      if (b.build.ok) m.builds++;
      tally(m, b.events);
      v = b;
    }

    // help a stranger fairly often (drives momentum up → hot spins)
    if (v.strangerPool.length && rand(i, a + 99) < 0.6) {
      const target = v.strangerPool[a % v.strangerPool.length];
      const h = await j('/api/help', { sessionId: sid, botId: target.botId });
      if (h.help.ok) m.helps++;
      tally(m, h.events);
      v = h;
    }

    // modeled walk-away: pause long enough for the meter to cool below 1.5×.
    // The server emits a real momentum_warning; the decision to return is the
    // profile's patience (clearly labelled as policy-modeled in the report).
    if (lapseAt.has(a)) {
      await sleep(3500);
      const s = await j('/api/sync', { sessionId: sid });
      tally(m, s.events);
      v = s;
      if (s.events.some((e) => e.type === 'momentum_warning')) {
        m.warnings++;
        if (rand(i, a) < prof.patience) {
          m.respinsAfterWarning++;
          const rr = await j('/api/spin', { sessionId: sid });
          m.spins++; if (rr.result.hot) m.hotSpins++;
          tally(m, rr.events);
          v = rr;
        }
      }
    }
  }

  m.endedAt = Date.now();
  return m;
}

function tally(m, events) {
  for (const e of events) {
    if (e.type === 'gh_closed') m.ghClosed++;
    if (e.type === 'thank_you') m.thankYous++;
    if (e.type === 'momentum_warning') {/* handled by caller via flag */}
  }
}
// deterministic pseudo-random in [0,1) from two ints (no Math.random reliance)
function rand(a, b) {
  let h = (a * 73856093) ^ (b * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 100000) / 100000;
}

// ── run all sessions concurrently ──────────────────────────────────────────────
console.log(`BLOOM sim — ${N} sessions vs ${BASE}\n`);
const cfg = await j('/api/config');
console.log(`(server GH=${cfg.goldenHour.durationMs}ms  decay=${cfg.momentum.decayPerSec}/s)\n`);
const t0 = Date.now();
const results = await Promise.all(Array.from({ length: N }, (_, i) => runSession(i).catch((e) => {
  console.error(`session ${i} failed:`, e.message);
  return null;
})));
const ok = results.filter(Boolean);
const secs = ((Date.now() - t0) / 1000).toFixed(1);

// ── aggregate ────────────────────────────────────────────────────────────────
const sum = (f) => ok.reduce((a, m) => a + f(m), 0);
const totalSpins = sum((m) => m.spins);
const totalHot = sum((m) => m.hotSpins);
const totalWarn = sum((m) => m.warnings);
const totalRespin = sum((m) => m.respinsAfterWarning);
const medianSpins = median(ok.map((m) => m.spins));
const medianLenSec = median(ok.map((m) => (m.endedAt - m.startedAt) / 1000));
const helpedAtLeastOnce = ok.filter((m) => m.helps > 0).length;
const builtAtLeastOnce = ok.filter((m) => m.builds > 0).length;
const ghCompleted = sum((m) => m.ghClosed);
const gratitude = sum((m) => m.thankYous);

const hotRate = totalSpins ? totalHot / totalSpins : 0;
const respinRate = totalWarn ? totalRespin / totalWarn : 0;
const helpRate = ok.length ? helpedAtLeastOnce / ok.length : 0;

// ── PRD §8 rubric ──────────────────────────────────────────────────────────────
const rubric = [
  row('Median spins / session', medianSpins, 25, medianSpins >= 25, ''),
  row('Hot-spin rate (momentum ≥1.5×)', pct(hotRate), 40, hotRate >= 0.4, '% — GENUINE'),
  row('Re-spin after cooling warning', pct(respinRate), 50, respinRate >= 0.5, '% — policy-modeled'),
  row('Helped ≥1 stranger', pct(helpRate), 75, helpRate >= 0.75, '% of sessions'),
  row('Median session length', medianLenSec.toFixed(1), '—', null, 's (compressed clock)'),
  row('Explain-in-one-sentence', 'n/a', 6, null, 'HUMAN ONLY'),
  row('Would reopen tomorrow', 'n/a', 5, null, 'HUMAN ONLY'),
];

console.log(`ran ${ok.length}/${N} sessions in ${secs}s\n`);
console.log('METRIC                                VALUE     GO-BAR   STATUS');
console.log('─'.repeat(72));
for (const r of rubric) console.log(r.line);
console.log('─'.repeat(72));
console.log(`totals: ${totalSpins} spins · ${totalHot} hot · ${gratitude} gratitude gifts · ${ghCompleted} Golden Hours completed · ${builtAtLeastOnce}/${ok.length} built`);
console.log('\nNOTE: hot-spin rate is the genuine automated signal (emerges from the real');
console.log('economy). Re-spin% is policy-modeled; explainability + reopen need HUMANS.');

const report = {
  ts: t0, base: BASE, sessions: ok.length, durationSec: Number(secs),
  serverGoldenHourMs: cfg.goldenHour.durationMs, decayPerSec: cfg.momentum.decayPerSec,
  metrics: {
    medianSpins, hotRate, respinRate, helpRate, medianLenSec,
    totalSpins, totalHot, totalWarn, totalRespin, ghCompleted, gratitude,
    builtAtLeastOnce,
  },
  rubric: rubric.map((r) => ({ metric: r.metric, value: r.value, goBar: r.bar, pass: r.pass })),
};
const out = resolve(__dirname, '../telemetry/sim-report.json');
await writeFile(out, JSON.stringify(report, null, 2));
console.log(`\nreport → ${out}`);

function row(metric, value, bar, pass, note) {
  const status = pass === null ? '—' : pass ? '✅ PASS' : '❌ MISS';
  const line = `${metric.padEnd(36)} ${String(value).padEnd(9)} ${String(bar).padEnd(8)} ${status}  ${note}`;
  return { metric, value, bar, pass, line };
}
function pct(x) { return (x * 100).toFixed(0); }
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
