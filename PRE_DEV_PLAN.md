# BLOOM — Pre-Development Plan (Greenlight Gate)
### *Phased, Claude-Code-buildable, ~$30 budget, end-to-end-test-first.*

> **Executes:** `GREENLIGHT_PRD.md`
> **Builder:** Claude Code (writes + runs + iterates everything)
> **Stack:** TypeScript · Vite · PixiJS (client) · Node · Fastify (server) · Playwright (E2E) · SQLite/JSONL (telemetry)
> **Total budget:** $0 tooling + **≤ $30** one-time AI art. **Total time:** ~10–12 working days solo.
> **North star:** every phase ends with *the loop running end-to-end on a phone URL* — we never have a non-runnable week.

---

## Operating principles

1. **E2E-first, not E2E-last.** The automated test flow is scaffolded in Phase 1 and grows with each feature — so "discovering the end-to-end test flow" *is* the build process, not an afterthought.
2. **Vertical, never horizontal.** Every phase ships a thinner *whole loop*, never a finished isolated system.
3. **Assets are borrowed, not made.** CC0 first (Kenney), AI only for 2–3 hero pieces. Art never blocks code.
4. **One config to rule feel.** All tunables in `balance.config.ts` from day one.
5. **Phase exit = a runnable demo + telemetry rows + a green E2E run.** No exit on "it compiles."

---

## Asset & tool budget plan (the $30)

| Item | Source | Cost | Use |
|---|---|---|---|
| UI kit, coins, buttons, fx | **Kenney.nl** (CC0) | $0 | Spin button, coins, panels, particles |
| Building / village sprites | **Kenney "Tiny Town" / itch.io CC0 packs** | $0 | The one building + bot villages |
| SFX (spin, win, jackpot, pop) | **Kenney Audio** / freesound CC0 | $0 | Juice |
| Font | Google Fonts | $0 | Readability |
| **2–3 hero sprites** (signature building, helper char, spin icon) | **AI gen** — one cheap option below | **≤ $30** | Distinctiveness only |

**AI art — cheapest viable path (pick ONE):**
- Use an image model via low-cost API credits or a single month of a consumer tier ($10–$20), generate ~10 candidates, keep 3. *Cap spend, don't subscribe long-term.*
- **Rule:** generate only what CC0 can't give us a *recognizable* version of. Everything functional = CC0. AI = the 3 things a screenshot needs to feel like *our* game.

> If AI art slips or disappoints, the gate still ships on 100% CC0. Art is never on the critical path to a feel verdict.

---

## Phase 0 — Foundations & the empty loop (Day 1)

**Goal:** A runnable, deployable skeleton with the test harness wired before any gameplay exists.

- Repo + monorepo layout (`/client`, `/server`, `/e2e`, `/sim`, `/assets`, `balance.config.ts`).
- `npm run dev` → Vite client + Fastify server up together.
- PixiJS renders one portrait screen with a placeholder SPIN button.
- Telemetry sink: `POST /event` → append JSONL + SQLite row.
- **Playwright installed**; a trivial E2E that loads the page and clicks SPIN (asserts a network call). *The test flow exists on day one.*
- Mobile-web basics: viewport lock, no-zoom, audio-unlock stub, `navigator.vibrate` ping on tap.
- Deploy path proven: `vite --host` over LAN / free tunnel → opens on a phone.

**Exit:** open a URL on your phone, tap SPIN, see a logged event, E2E green. Nothing fun yet — but the *pipeline* is end-to-end.

---

## Phase 1 — Server-authoritative Spin (Days 2–3)

**Goal:** The real spin, decided by the server, with juice.

- `POST /spin` returns an outcome from the §4.1 drop table; **seeded server RNG**; every spin logged.
- Client renders reel deceleration <400ms, SFX, haptic, coin-count tween, jackpot/spark bursts (Kenney fx).
- Coins/Help-Tokens/Spins balances on screen; free-spin seed so testers never dry out.
- `balance.config.ts` holds drop weights + coin formula.
- **E2E grows:** assert each outcome type can occur over N spins; assert client state matches server response (no client-side reward invention).
- **Sim harness v1 (`npm run sim`):** 1,000 spins → prints outcome distribution → confirm it matches the table.

**Exit:** spinning *feels* good on a phone; distribution verified by sim; E2E green.

---

## Phase 2 — Build + economy (Day 4)

**Goal:** Spin earns toward a real building.

- One building, cost `200 × 1.45^level`, tap-to-build when affordable, Build Boost reduces cost.
- Build completion emits a `build` event and **fires the (stub) Golden Hour open hook**.
- Permanent building; level increments; coin formula scales.
- **E2E grows:** spin → accumulate → build → assert Golden-Hour-open event fires.

**Exit:** the earn→spend half-loop is real and instrumented.

---

## Phase 3 — Golden Hour + bot helpers (Days 5–6)

**Goal:** The rally moment, faked convincingly with bots.

- On build, open a **compressed Golden Hour** (config 2–3 min) with countdown + community progress bar.
- **Bot helpers** join on randomized cadence (8–20s), each: add coins/time, fire gratitude ping, milestone confetti, enforce caps (10 helpers / 20% / diminishing).
- Window close → lock discount + grant bonus.
- **Bot stranger pool:** `/help-others` returns 3–5 live bot Golden Hours; player can HELP them → earns tokens/momentum; bots send delayed Thank-You Boosts (return spins).
- **E2E grows:** open Golden Hour → assert bots arrive → assert caps hold → assert close grants bonus → assert helping a bot returns a thank-you.

**Exit:** the world feels *alive and grateful* with zero real players. This is the make-or-break illusion — tune cadence here.

---

## Phase 4 — Momentum Multiplier + decay (Day 7)

**Goal:** The urgency engine; the hypothesis made tangible.

- Visible 1.0×–3.0× meter, multiplies coin spins only.
- Gains: +0.2×/help, +0.3×/spark, milestone bumps. **Real-time decay** (config −0.1×/30s), visible bleed + a "cooling off 🔥→❄️" warning state.
- Hot-spin coin bursts read bigger and louder at high momentum.
- **E2E grows + the key assertion:** drive to high momentum → idle → assert decay ticks logged → assert decay-warning event → (sim) measure re-spin behavior.
- **Telemetry derivations live:** hot-spin rate, decay-warning→re-spin rate.

**Exit:** you personally feel the "spin while hot" pull. The single most important signal is now measurable.

---

## Phase 5 — Feel & asset pass (Day 8)

**Goal:** Make it readable, juicy, screenshot-able — *no scope growth.*

- Swap placeholders for CC0 sprites (building, coins, panels, particles); drop in the ≤$30 AI hero pieces.
- Audio pass: spin loop, win, jackpot, help-pop, milestone fanfare (Kenney/CC0).
- Haptic + screen-shake + particle polish on jackpot/spark/milestone.
- One pass on layout for one-thumb reach (PRD §5).

**Exit:** a stranger glancing at one screenshot understands "cozy spin-builder," and the moment-to-moment feel is sticky. **Hard stop on art here.**

---

## Phase 6 — Lock the end-to-end test flow (Day 9)

**Goal:** Turn the growing E2E into the deliverable the PRD demands.

- **Automated full-loop E2E** (Playwright, mobile-emulated): open → spin → build → Golden Hour → momentum → decay-warning → help bot → loop; asserts every transition + telemetry row. Runs via `npm run e2e`.
- **Overnight sim (`npm run sim` v2):** 100 simulated sessions with varied "player patience" profiles → telemetry CSV → auto-print the §8 rubric metrics. *We read the verdict-shaped numbers before touching a human.*
- **Human-playtest kit:** the 10-min script, 4 questions, observer sheet, and a one-tap "reset session" build for back-to-back testers.
- Deploy a stable URL (free host / tunnel) for phones.

**Exit:** `npm run e2e` green; `npm run sim` emits a rubric report; a phone-ready URL + a paper playtest kit exist.

---

## Phase 7 — Playtest, measure, decide (Days 10–12)

**Goal:** Produce the GO / PIVOT / KILL verdict with evidence.

- Run **5–8 real-phone sessions** (PRD §6.3). Observe; record the 4 answers; capture telemetry per tester.
- Merge human + automated telemetry into the **§8 rubric scorecard**.
- Tune-and-retest budget: up to **2 fast iterations** on Momentum/Golden Hour constants (config-only, minutes each) if testers like the loop but urgency bars miss.
- Write a 1-page **Greenlight Verdict**: each rubric bar pass/fail, the decisive decay→re-spin number, top 3 felt strengths, top 3 felt problems, and the GO/PIVOT/KILL call.

**Exit:** a decision, backed by numbers and quotes — the actual product of this whole effort.

---

## Timeline at a glance

| Phase | Days | Ships |
|---|---|---|
| 0 Foundations + test pipeline | 1 | Empty loop on a phone, E2E green |
| 1 Server-authoritative spin | 2–3 | Juicy verified spin |
| 2 Build + economy | 4 | Earn→spend half-loop |
| 3 Golden Hour + bots | 5–6 | Living, grateful world |
| 4 Momentum + decay | 7 | The urgency engine |
| 5 Feel & assets | 8 | Readable, juicy, on budget |
| 6 Lock E2E test flow | 9 | Automated loop + sim + playtest kit |
| 7 Playtest + verdict | 10–12 | GO/PIVOT/KILL with evidence |

---

## What we deliberately do NOT do in pre-dev

No accounts, no real multiplayer, no teams/cards/passes/IAP, no Postgres/Redis, no anti-cheat beyond server-authority, no second building, no Godot, no art beyond the $30 hero set. Every one of these is real and in the GDD — and every one is a *distraction from answering "is the loop fun?"* The discipline to skip them is the plan's most valuable feature.

---

## Definition of done (pre-development)

1. A phone-openable URL running the full `Spin → Build → Golden Hour → Momentum` loop against a bot pool.
2. `npm run e2e` drives that loop end-to-end and stays green.
3. `npm run sim` outputs the rubric metrics from 100 simulated sessions.
4. 5–8 human playtests captured against the §8 rubric.
5. A one-page evidence-backed **Greenlight Verdict**.

*Hit these and we've answered the only question that matters — cheaply, fast, and with proof — before committing to Godot, teams, and the rest of the game.*
