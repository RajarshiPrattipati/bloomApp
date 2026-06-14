# BLOOM — Greenlight Gate PRD (v1.0)
### *Prove the core loop is fun, on a real phone, with one building and a pool of bots.*

> **Owner:** Solo dev + Claude Code
> **Engine decision:** **Pure JS (web)** — TypeScript + Vite + PixiJS client, Node + Fastify server. Godot deferred to post-greenlight production (see §11).
> **Budget assumption:** $0 tooling; **≤ $30** one-time for AI-generated hero art. Everything else from CC0 asset libraries.
> **Companion doc:** `PRE_DEV_PLAN.md` (the phased build plan that executes this PRD).
> **Parent doc:** `REVISED_GDD.md` §21 (the greenlight gate this PRD operationalizes).

---

## 1. The one question this gate answers

> **Does the loop `Spin → Build → Golden Hour → Momentum` produce a "just one more spin" feeling, with a single building and a pool of *bot* helpers — measured on a real phone?**

If yes → greenlight the meta (teams, cards, passes, Godot port).
If no → we learned it cheaply, in days, for ~$0, before building anything expensive.

**This gate is NOT** about graphics, content volume, monetization, accounts, or scale. It is about *feel*. Anything that doesn't help us judge feel is out of scope (§9).

---

## 2. Hypothesis & kill criteria

**Hypothesis:** Timed Golden Hours + a decaying Momentum Multiplier convert a calm cooperative spinner into a compulsive loop *without* any negative-player mechanics.

**We greenlight only if** the loop hits the bar in §8. **We kill or pivot if:**
- Players stop spinning the moment momentum is "claimed" (no reason to ride it) → Momentum design is wrong.
- The Golden Hour feels like waiting, not rallying → window/feedback design is wrong.
- Testers can't explain the loop after 60 seconds → it's not hypercasual.

A defined kill condition is a feature: it stops us pouring months into a dead loop.

---

## 3. Scope — the vertical slice

### In scope (the whole gate)
1. **Server-authoritative spin** with the base drop table.
2. **One building** with a real cost curve and a build action.
3. **One Golden Hour** window that opens on build, with **bot helpers** pouring in help on a believable cadence.
4. **Momentum Multiplier** that builds from helping/sparks and **decays in real time**.
5. **A bot "stranger pool"** so the world feels alive solo (no real second player needed).
6. **Telemetry** on every tap, so "fun" becomes measurable.
7. **An end-to-end test flow** — automated (Playwright) *and* a scripted human playtest — that is itself the primary deliverable (§6).

### Explicitly OUT (deferred, §9)
Accounts/login, real multiplayer, teams, cards, passes, IAP, multiple buildings/villages, anti-cheat (beyond "server decides"), Postgres/Redis, art polish beyond "readable and juicy."

---

## 4. Functional requirements (minimal but real)

Each system is the *thinnest version that still tests the feel*.

### 4.1 Spin (server-authoritative)
- **FR-S1:** Client sends `POST /spin {sessionId}`; server returns the outcome. Client never decides rewards. *(Tests the real architecture, cheaply.)*
- **FR-S2:** Drop table (from GDD §5.2), server-side, seeded RNG, logged per spin:

  | Outcome | Prob | Effect |
  |---|---|---|
  | Coins | 46% | `0.46 × (50 + level×12)` × momentum |
  | Help Tokens | 18% | +1 token |
  | Build Boost | 13% | −cost/time on next build |
  | Mystery Gift | 8% | weighted small bundle |
  | Extra Spins | 7% | +N spins |
  | Rare Card | 3% | stub (logged, no UI depth) |
  | Jackpot ×5 | 2% | ×5 coins burst |
  | Momentum Spark | 3% | +0.3× momentum instantly |

- **FR-S3:** Spin result renders in **<400ms** with reel deceleration, SFX, and haptic (mobile vibrate API). *Feel is the product.*
- **FR-S4:** Spin cost = free spins balance (seeded so testers never run dry — we test the loop, not the wallet).

### 4.2 Build (one building)
- **FR-B1:** A single building with cost `200 × 1.45^level × 1.0`. Tap-to-build when affordable.
- **FR-B2:** Completing/placing the build **opens a Golden Hour** (§4.3). This is the social trigger.
- **FR-B3:** Building is permanent; under-helped = less bonus, never a loss (GDD P3).

### 4.3 Golden Hour (compressed for testing)
- **FR-G1:** On build, open a **time-compressed window** (default **3 min**, config 1–60) with a visible countdown + community progress bar.
- **FR-G2:** **Bot helpers** join on a believable, slightly random cadence (e.g. 1 every 8–20s), each adding coins/time/Lucky Boost, each firing a gratitude ping + confetti milestone burst.
- **FR-G3:** Caps enforced (max 10 helpers, 20% benefit, diminishing after 10%) — proves the rule without real players.
- **FR-G4:** Window close → building locks in its discount; bonus rewards granted. *We are testing whether the rally feels good.*

### 4.4 Momentum Multiplier (the urgency engine)
- **FR-M1:** Visible meter **1.0×–3.0×**, multiplies **coin spins only**.
- **FR-M2:** Builds: +0.2× per help action, +0.3× per Momentum Spark, +X on milestone.
- **FR-M3:** **Decays in real time** (default −0.1× per 30s for the compressed test; configurable). The bleed must be *visible and felt*.
- **FR-M4:** All decay/gain constants live in **one config file** so we can tune feel in seconds, not rebuilds.

### 4.5 Bot stranger pool
- **FR-P1:** A server-side pool of bot villages, each with its own Golden Hours opening over time.
- **FR-P2:** A "Help Others" panel surfaces 3–5 live bot Golden Hours the player can help → earning momentum/tokens → feeding their own loop.
- **FR-P3:** Bots send back "Thank-You Boosts" (return spins) on a delay → tests the gratitude dopamine hit solo.

### 4.6 Telemetry (makes "fun" measurable)
- **FR-T1:** Log every event (spin, build, help-given, help-received, momentum gain/decay tick, session start/end) with timestamp + sessionId to a JSONL file / SQLite.
- **FR-T2:** Derive: spins/session, session length, **"hot-spin rate"** (% of spins taken while momentum > 1.5×), helps/session, **re-engagement** (spins after a momentum-decay warning).

---

## 5. The user-facing flow (one screen, one thumb)

```
┌─────────────────────────────┐
│  Momentum:  ▓▓▓▓░░  2.1× 🔥  │  ← decaying, always visible
│  Coins: 1,240   Spins: ∞     │
├─────────────────────────────┤
│                             │
│        [ VILLAGE ]          │  ← the one building + Golden Hour bar
│   🌟 Golden Hour  02:14 ▓▓░  │
│                             │
├─────────────────────────────┤
│   Help Others (live):       │  ← bot stranger pool
│   • Priya's Hall  01:40 [HELP]│
│   • Arjun's Well  00:55 [HELP]│
├─────────────────────────────┤
│        (  SPIN  )           │  ← the big thumb button
└─────────────────────────────┘
```

One screen. No menus. Everything that matters is one thumb-reach away (GDD P4).

---

## 6. ⭐ The end-to-end test flow (the primary deliverable)

The user asked us to **focus on discovering an end-to-end test flow.** This is that section. We build two, and they share the same instrumented loop.

### 6.1 The canonical loop under test
```
open URL on phone
  → SPIN (server decides) → coins land
  → afford + BUILD → Golden Hour opens
  → bots rally in, gratitude pings, milestone bursts
  → MOMENTUM climbs to ~2.5×
  → "spin while hot" → bigger coins
  → stop tapping → momentum visibly DECAYS
  → decay warning → do you spin again?  ← THE moment we measure
  → help a bot's Golden Hour → momentum back up → loop
```
The single most important measured signal is the **decay-warning → spin** re-engagement: that is the hypothesis, instrumented.

### 6.2 Automated E2E (Playwright, headless + mobile-emulated)
- **E2E-1:** Drives the real client against the real server through the full loop above; asserts each state transition fires and telemetry rows are written.
- **E2E-2:** A **"bot player" script** that plays 100 simulated sessions overnight → produces a telemetry CSV → we read the distributions *before* spending a single human playtest. Cheap, repeatable, Claude-runnable.
- **E2E-3:** Runs in CI-style on every change (`npm run e2e`) so the loop never silently breaks.

### 6.3 Human playtest flow (the real judge)
- **PT-1:** Deploy to a free static/Node host (or `vite --host` over LAN / a tunnel) → open on **5–8 real phones**.
- **PT-2:** Scripted 10-minute session per tester, no instructions beyond "play." Observer notes where they look, smile, hesitate, quit.
- **PT-3:** Post-session 4 questions: *(1) explain the game in one sentence (2) when did you most want to keep going (3) when were you bored (4) would you reopen tomorrow.*
- **PT-4:** Cross telemetry against observation. Fun = where the numbers and the smiles agree.

---

## 7. Technical requirements

- **TR-1:** Client = TypeScript + Vite + **PixiJS** (2D, hypercasual-grade perf on low-end phones). Portrait, touch-first, 60fps target on a mid-range Android.
- **TR-2:** Server = Node + **Fastify**, TypeScript. Server-authoritative spin/economy/Golden-Hour/momentum. In-memory state + JSONL/SQLite telemetry — **no Postgres/Redis at the gate** (deferred to production).
- **TR-3:** Single repo, `npm run dev` brings up client+server; `npm run e2e` runs the Playwright flow; `npm run sim` runs the 100-bot-session harness.
- **TR-4:** **One config file** (`balance.config.ts`) holds every tunable (drop weights, momentum gain/decay, Golden Hour length, bot cadence). Tuning feel must not require code changes.
- **TR-5:** Mobile-web essentials: viewport lock, no-zoom, haptics via `navigator.vibrate`, audio unlock on first tap, offline-safe asset load.

---

## 8. Greenlight decision rubric (the gate itself)

We decide GO / PIVOT / KILL against measurable bars. *No vibes-only call.*

| Signal | Source | GO bar |
|---|---|---|
| "Explain it in one sentence" success | PT-3 Q1 | ≥ 6/8 testers correct |
| Median session length | telemetry | ≥ 3 min on first session |
| Spins/session | telemetry | ≥ 25 |
| **Hot-spin rate** (spins at momentum >1.5×) | telemetry | ≥ 40% |
| **Decay-warning → re-spin** rate | telemetry | ≥ 50% |
| Helped a bot at least once unprompted | telemetry | ≥ 6/8 testers |
| "Would reopen tomorrow" | PT-3 Q4 | ≥ 5/8 yes |
| Observed delight moment (smile/"oh nice") | observation | ≥ 1 per tester |

**Decision:** GO if ≥ 6/8 bars met **and** the decay→re-spin bar is met (it's the hypothesis — non-negotiable). PIVOT if the loop is liked but the urgency bars fail (fix Momentum/Golden Hour, re-test). KILL if explainability + reopen both fail.

---

## 9. Out of scope (deferred, on purpose)

Accounts/auth · real-time multiplayer · teams/clans · cards & sets depth · season pass / IAP / monetization · multiple buildings or villages · full anti-cheat & SuspicionScore · Postgres/Redis/ClickHouse · ClickHouse dashboards · push notifications · art polish · localization. *Each is real and in the GDD — none helps answer §1, so none is built now.*

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| We polish art instead of testing feel | Asset budget capped at $30, CC0-first (see plan). Feel-tuning lives in one config. |
| Bots feel fake → kills the rally illusion | Randomized cadence + named bot villages + delayed thank-you gifts; tune in §4.5. |
| Compressed timers mislead vs. real 60-min windows | Test at 2–3 min *and* one session at 30–60 min to sanity-check pacing. |
| "Fun" stays subjective | The rubric (§8) forces measurable bars before any GO. |
| Scope creep into the meta | This PRD's §9 is the fence; the plan's phase exits enforce it. |

---

## 11. After the gate (only if GO)

Production re-platforming decision revisited: **Godot** for native game-feel/perf, OR scale the JS stack. Add Postgres/Redis, real multiplayer presence, teams, cards, pass, full anti-cheat (GDD §16), live-ops calendar. The web prototype becomes the *design source of truth* and the automated E2E flow carries forward as regression protection.

---

*The gate's deliverable is not a game. It is an evidence-backed GO/PIVOT/KILL on the core loop, produced in ~2 weeks for ~$30.*
