// ─────────────────────────────────────────────────────────────────────────────
// verdict.mjs — computes the GREENLIGHT_PRD §8 rubric from REAL telemetry
// (human playtests) and renders a GO / PIVOT / KILL recommendation.
//
//   node scripts/verdict.mjs [--since <ms-epoch>] [--prefix s_]
//
// Human-only signals (explain-in-one-sentence, reopen-tomorrow) are read from
// telemetry/playtest-human.json if present (fill it from PLAYTEST_KIT.md), else
// shown as n/a. Sim sessions (sim_/smoke_) are excluded automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const args = process.argv.slice(2);
const since = Number(getArg('--since', 0));
const prefix = getArg('--prefix', '');

const raw = await readFile(resolve(root, 'telemetry/events.jsonl'), 'utf8').catch(() => '');
const lines = raw.split('\n').filter(Boolean).map((l) => safeParse(l)).filter(Boolean);

// group events by session, excluding bots/smoke and applying filters
const sessions = new Map();
for (const e of lines) {
  if (!e.sessionId) continue;
  if (e.sessionId.startsWith('sim_') || e.sessionId.startsWith('smoke_')) continue;
  if (prefix && !e.sessionId.startsWith(prefix)) continue;
  if (since && e.ts < since) continue;
  if (!sessions.has(e.sessionId)) sessions.set(e.sessionId, []);
  sessions.get(e.sessionId).push(e);
}

const rows = [];
for (const [sid, evs] of sessions) {
  evs.sort((a, b) => a.ts - b.ts);
  const spins = evs.filter((e) => e.type === 'spin');
  if (!spins.length) continue;
  const hot = spins.filter((e) => e.hot).length;
  const helps = evs.filter((e) => e.type === 'help_given').length;
  const builds = evs.filter((e) => e.type === 'build').length;
  const warnings = evs.filter((e) => e.type === 'momentum_decay_warning');
  // re-spin after warning: a spin_tap within 30s after a warning
  const taps = evs.filter((e) => e.type === 'spin_tap');
  let respins = 0;
  for (const w of warnings) {
    if (taps.some((t) => t.ts > w.ts && t.ts - w.ts < 30_000)) respins++;
  }
  rows.push({
    sid,
    spins: spins.length,
    hot,
    helps,
    builds,
    warnings: warnings.length,
    respins,
    lenSec: (evs[evs.length - 1].ts - evs[0].ts) / 1000,
  });
}

const human = await readFile(resolve(root, 'telemetry/playtest-human.json'), 'utf8')
  .then((t) => JSON.parse(t))
  .catch(() => null);

console.log(`\nBLOOM — Greenlight Verdict  (real human telemetry)`);
console.log(`sessions analysed: ${rows.length}${since ? `  since ${new Date(since).toISOString()}` : ''}\n`);
if (!rows.length) {
  console.log('No human sessions found. Run playtests (see PLAYTEST_KIT.md), then:');
  console.log('  node scripts/verdict.mjs --since <session-start-epoch-ms>\n');
  process.exit(0);
}

const totalSpins = sum((r) => r.spins);
const totalHot = sum((r) => r.hot);
const totalWarn = sum((r) => r.warnings);
const totalRespin = sum((r) => r.respins);
const medSpins = median(rows.map((r) => r.spins));
const medLen = median(rows.map((r) => r.lenSec));
const helpedRate = rows.filter((r) => r.helps > 0).length / rows.length;
const hotRate = totalSpins ? totalHot / totalSpins : 0;
const respinRate = totalWarn ? totalRespin / totalWarn : 0;

const N = rows.length;
const explain = human ? `${human.explainedCorrectly}/${human.testers}` : 'n/a';
const reopen = human ? `${human.wouldReopen}/${human.testers}` : 'n/a';

const bars = [
  bar('Explain in one sentence', explain, '≥6/8', human ? human.explainedCorrectly / human.testers >= 0.75 : null),
  bar('Median session length (s)', medLen.toFixed(0), '≥180', medLen >= 180),
  bar('Spins / session (median)', medSpins, '≥25', medSpins >= 25),
  bar('Hot-spin rate', pct(hotRate) + '%', '≥40%', hotRate >= 0.4),
  bar('Decay-warning → re-spin', totalWarn ? pct(respinRate) + '%' : 'n/a', '≥50%', totalWarn ? respinRate >= 0.5 : null),
  bar('Helped a stranger', pct(helpedRate) + '%', '≥75%', helpedRate >= 0.75),
  bar('Would reopen tomorrow', reopen, '≥5/8', human ? human.wouldReopen / human.testers >= 0.625 : null),
];

console.log('SIGNAL                          VALUE     GO-BAR   STATUS');
console.log('─'.repeat(64));
for (const b of bars) console.log(b.line);
console.log('─'.repeat(64));

const decided = bars.filter((b) => b.pass !== null);
const passed = decided.filter((b) => b.pass).length;
const decayBar = bars.find((b) => b.name.startsWith('Decay-warning'));
const decayOK = decayBar.pass === true;

let decision = 'PIVOT';
if (passed >= 6 && decayOK) decision = 'GO';
else if (bars.find((b) => b.name.startsWith('Explain')).pass === false &&
         bars.find((b) => b.name.startsWith('Would reopen')).pass === false) decision = 'KILL';

console.log(`\nbars met: ${passed}/${decided.length}   decay→re-spin (hypothesis): ${decayBar.pass === null ? 'n/a' : decayOK ? 'PASS' : 'MISS'}`);
console.log(`\n  ►  RECOMMENDATION: ${decision}`);
console.log(
  decision === 'GO'
    ? '     The core loop clears the bar. Greenlight the meta (teams, cards, pass, Godot).'
    : decision === 'KILL'
    ? '     Players cannot explain it and would not return. Stop; the loop is not it.'
    : '     Liked but urgency/clarity bars miss. Tune Momentum/Golden Hour, re-test (≤2 iters).',
);
console.log('\nNote: GO requires the decay→re-spin (hypothesis) bar — non-negotiable per PRD §8.');
if (!human) console.log('Fill telemetry/playtest-human.json from PLAYTEST_KIT.md for explainability + reopen.\n');

function bar(name, value, goBar, pass) {
  const status = pass === null ? '—  (needs data)' : pass ? '✅ PASS' : '❌ MISS';
  return { name, pass, line: `${name.padEnd(30)} ${String(value).padEnd(9)} ${goBar.padEnd(8)} ${status}` };
}
function getArg(flag, d) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : d; }
function safeParse(l) { try { return JSON.parse(l); } catch { return null; } }
function sum(f) { return rows.reduce((a, r) => a + f(r), 0); }
function pct(x) { return (x * 100).toFixed(0); }
function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
