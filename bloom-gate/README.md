# BLOOM — Greenlight Gate (complete vertical slice)

A server-authoritative, cooperative spin-builder. Pure JS/TS, mobile-web, runs in the
iOS Simulator. This is the **full greenlight gate**: the loop `Spin → Build → Golden Hour →
Momentum`, plus the end-to-end test flow that turns "is it fun?" into evidence.

Built per `../GREENLIGHT_PRD.md` and `../PRE_DEV_PLAN.md`.

## Run it
```bash
npm install          # once
npm run dev          # server :3000 + client :5173
```
Open **http://localhost:5173/** in the iOS Simulator's Safari (localhost == host), or
`http://<mac-ip>:5173/` on a real phone (same Wi-Fi). Tap **SPIN**. Append `?demo=16`
to auto-drive the loop for a hands-free demo.

## The end-to-end test flow (the point of the gate)
| Command | What it does |
|---|---|
| `npm run smoke` | Headless server check: full loop + drop distribution. |
| `npm run sim` | 100 simulated sessions → prints the PRD §8 rubric metrics. |
| `npm run e2e` | Playwright (WebKit/Safari engine, mobile viewport) drives the real loop end-to-end. |
| `npm run verdict` | Computes the rubric from **real** telemetry → GO / PIVOT / KILL. |

Compressed-time runs (for sim/e2e) use env knobs: `BLOOM_GH_MS`, `BLOOM_DECAY_PER_SEC`,
`BLOOM_BOT_PERIOD_MS`, `BLOOM_BOT_OPEN_MS`, `PORT`.

## What's implemented
- **Spin** — server-authoritative, seeded RNG, full drop table, <400ms reel + juice.
- **Build / village** — 6 slots, cost curve `200·1.45^level`, Build Boost discount.
- **Golden Hour** — opens on build; bot helpers join on cadence; caps (10/20%/diminishing);
  milestones grant spins/coins; on close, helpers refund part of the cost.
- **Stranger pool** — live bot Golden Hours you can HELP (solves cold-start); gratitude /
  Thank-You boosts return spins.
- **Momentum** — 1.0×–3.0×, multiplies coin spins; real-time decay; hot / cooling states;
  decay-warning telemetry (the urgency engine).
- **Juice** — confetti, toasts, floating rewards, WebAudio SFX, haptics.
- **Telemetry** — every tap/spin/build/help/gratitude → `telemetry/events.jsonl`.

## Layout
- `server/` — Fastify. `src/balance.ts` is the **single source of tunable truth**;
  `src/world.ts` is the lazy, deterministic simulation (momentum/GH/bots advance from
  timestamps on each request).
- `client/` — Vite + PixiJS v8, one screen. Decides nothing; fetches `/api/config`,
  polls `/api/sync`. A `window.__bloom` test hook drives the loop for E2E.
- `scripts/` — `smoke`, `sim`, `verdict` harnesses.
- `e2e/` — Playwright full-loop spec.
- `telemetry/` — JSONL events + `sim-report.json`.

## Tuning feel (no rebuild)
Edit `server/src/balance.ts` — drop weights, coin curve, `momentum.decayPerSec`,
`goldenHour.durationMs`/cadence, bot timings. The server (tsx watch) hot-reloads.

## After the gate
Real CC0 art (Kenney) drops in over the emoji placeholders; then Teams, Cards, Season Pass,
and the Godot production port. The automated E2E + sim carry forward as regression protection.
