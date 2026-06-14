# BLOOM — Game Design Document (v2.0)
### *A cooperative spin-builder where helping is the fastest way to win.*

> **Codename:** BLOOM (working title; formerly "Kind Kingdom / Build Together")
> **Genre:** Cooperative social spinner / village builder (hypercasual-meta hybrid)
> **Platform:** iOS + Android (Unity), portrait, one-thumb
> **Audience:** 13+, mass-market, family-safe, India-first → global
> **Author:** Senior Design — written to a Supercell quality bar
> **Status:** Pre-production GDD for greenlight + vertical slice

---

## 0. How to read this document

This is a *revision*, not a clean sheet. The original concept (cheap spins, positive-sum helping, no raids, joy-not-frustration) is **strong and we keep its soul**. What we change is everything that would make it *flat* in the first 20 minutes. A cooperative game without tension is a screensaver. The job of this revision is to add **urgency, social pressure, and skill expression** *without* importing toxicity.

The single most important change is in §4 and §7: **helping is no longer always-on and passive. It happens inside timed "Golden Hour" windows, and it feeds a decaying "Momentum Multiplier."** That one change is what turns a nice idea into a retention machine.

---

## 1. The one-liner & the pitch

**One line:** *A cozy village spinner where the more you help, the faster you bloom — and the clock is always ticking.*

**The 10-second pitch (for a player):**
"Spin to build your village. When a building goes up, a **Golden Hour** opens — friends and strangers pour in help, build it for cheap, and you ride a **Momentum streak** that fades fast, so you keep spinning while you're hot."

**Why it's a Supercell-shaped game:**
- **Easy to understand, hard to put down.** One mechanic (spin), one verb (help), one feeling (momentum).
- **Real-time social, not async-toxic.** No raids, no revenge spending — but *real* live tension via timed windows and team play.
- **Insanely focused.** If a feature doesn't feed Spin → Build → Help → Momentum, it gets cut.

---

## 2. Design pillars (the constitution)

Every decision is checked against these five. If a feature violates a pillar, it dies — no matter how clever.

| # | Pillar | What it means in practice | What it kills |
|---|--------|---------------------------|---------------|
| **P1** | **Helping is the meta, not charity** | The optimal selfish strategy *is* to help others. Help is always net-positive to the helper. | Any "donate and lose" mechanic. |
| **P2** | **Momentum over hoarding** | Coins are made to be spent *now*; sitting on resources feels worse than spending them. | Bank-it-up strategies, idle optimums. |
| **P3** | **Tension without cruelty** | Urgency comes from *clocks and streaks*, never from other players hurting you. | Raids, theft, leaderboards that shame. |
| **P4** | **One thumb, ten seconds, infinite depth** | Any session works in 10 seconds standing in a queue; mastery rewards minutes. | Menu mazes, mandatory long sessions. |
| **P5** | **Fair-first monetization** | Money buys *speed and joy*, never *dominance*. A free player can top every social board. | Pay-to-win, gated cores, anger spending. |

**Supercell test:** Could we run this in a single room and have everyone *feel* the same loop? Yes — that's the bar.

---

## 3. Audience, market & positioning

**Primary:** 18–34 casual mobile spenders in India, SEA, MENA, LATAM; secondary global mass-market.
**Why this wins where Coin Master is dominant:** Coin Master's retention engine is *anger* (raids/attacks) and *revenge spending*. That ceiling is real but it churns the conflict-averse, the young, and families. BLOOM takes the same dopamine architecture (spin variable-reward + collect sets + social) and swaps the **negative externality (attacks)** for a **positive externality (Golden Hours)** — widening the funnel to kids, families, and women who bounce off raid mechanics, while keeping the compulsion loop intact.

**Positioning statement:**
> *"The compulsion of Coin Master, the warmth of Animal Crossing, the live tension of Clash."*

| Competitor | Their hook | Their weakness we exploit |
|---|---|---|
| Coin Master | Raids + revenge | Toxic, brand-unsafe, narrow age |
| Monopoly GO | Boards + dice + events | Heavy, slow sessions, fatigue |
| Animal Crossing PC | Cozy social | No tension, weak monetization |
| **BLOOM** | **Help-to-win + Momentum** | *(our job: keep it focused)* |

---

## 4. The Core Loop (revised)

This replaces the original passive loop. **Timed stages (★) create urgency.**

```
        ┌─────────────────────────────────────────────┐
        │                                              │
        ▼                                              │
   ┌─────────┐                                         │
   │  SPIN   │  cheap, server-decided, juicy           │
   └────┬────┘                                         │
        ▼                                              │
   ┌──────────────────┐                                │
 ★ │ BUILD → opens a  │  placing a building opens a     │
   │  GOLDEN HOUR     │  60-min help window (the clock) │
   └────────┬─────────┘                                │
        ▼                                              │
   ┌──────────────────┐                                │
   │ HELP open windows│  help friends + a STRANGER POOL │
   │ (yours & theirs) │  during their Golden Hours      │
   └────────┬─────────┘                                │
        ▼                                              │
   ┌──────────────────┐                                │
   │  GET BOOSTED BACK │  gratitude pings, return gifts  │
   └────────┬─────────┘                                │
        ▼                                              │
   ┌──────────────────┐                                │
 ★ │ MOMENTUM MULT.   │  builds as you help; DECAYS fast │
   │ "spin while hot" │  → the urgency engine            │
   └────────┬─────────┘                                │
        ▼                                              │
   ┌──────────────────┐                                │
   │   LEVEL UP        │  richer windows, projects ──────┘
   └──────────────────┘
```

**Why the clocks matter (the core insight):**
A cooperative game with no timer has no *reason to act now*. By making (a) the help window finite and (b) the reward multiplier decaying, we manufacture **benign urgency**: "build it, rally help, ride the streak before it fades." Nobody is hurt; everybody is *hurrying*. This is the difference between a cozy toy and a retention product.

---

## 5. The Spin System

Spins are the heartbeat. One tap, one outcome, always something.

### 5.1 Feel & juice (non-negotiable for a spinner)
- **<400ms to result**, satisfying reel deceleration, near-miss tease on jackpots (honest, not rigged — see §17 ethics).
- **Auto-spin** unlocked at level 8 (retention + accessibility), capped per session, *never* during another player's Golden Hour (keep help intentional).
- **Haptics + escalating SFX** on streaks. The 5th, 10th, 25th spin in a sitting gets a flourish.

### 5.2 Base drop table (sums to 100%)
Every spin advances *something* — there is no dead spin.

| Outcome | Prob. | Notes |
|---|---|---|
| Coins | **46%** | Scales with village level |
| Help Tokens | **18%** | Spend to help during Golden Hours |
| Build Boosts | **13%** | Cheaper/faster builds |
| Mystery Gift | **8%** | Weighted bundle; surprise lever |
| Extra Spins | **7%** | Self-feeding session length |
| Rare Card | **3%** | Set collection (§12) |
| Jackpot (×5 coins) | **2%** | Celebration moment |
| **Energy / Momentum Spark** | **3%** | *New:* instantly +0.3× momentum |

> **Change from v1:** removed the "0% Nothing" line (it implied a dead slot) and added a **Momentum Spark** so spins can *directly* feed the new core engine. This couples Spin → Momentum even when you're not actively helping.

### 5.3 Coin reward curve (controlled growth)
`BaseCoin(level) = 50 + (level × 12)` ; `E[coins/spin] = 0.46 × BaseCoin(level)`

| Village Lvl | Avg coins / coin-spin |
|---|---|
| 1 | 62 |
| 10 | 170 |
| 25 | 350 |
| 50 | 650 |
| 100 | 1,250 |

Linear reward growth vs. exponential cost growth (§11) = **inflation stays bottled**.

---

## 6. Villages & Buildings

- Each village = **6 buildings**; buildings are **permanent** (never destroyed — P3).
- Placing/finishing a building is the act that **opens a Golden Hour** (§7). This makes *building* the social trigger, not a passive sink.
- Costs scale gently per building, hard per village (anchor against inflation):

`BuildingCost(level, index) = 200 × (1.45^level) × (1 + index × 0.15)`, index 0–5.
> Example (Lvl 10 village): ~38k coins total; ~280–320 spins solo, **~150–180 with a full Golden Hour** — help literally halves the grind. That gap *is* the marketing.

- **Village themes** unlock at milestones (cosmetic + small set bonuses) → completion fantasy & screenshot-ability.

---

## 7. ★ The Golden Hour (the headline feature)

**This is the single biggest upgrade over v1.** In v1, "helping" was an always-available, low-stakes action. We make it an **event**.

### 7.1 How it works
1. You place a new building → a **60-minute Golden Hour** opens on it.
2. During the window, helpers (friends + stranger pool, §8) can pour in coins, speed time, and drop Lucky Boosts.
3. Each help nudges a visible **community progress bar** with milestone bursts (confetti, free spins).
4. When the window closes, the building **locks in** its discounted cost and any unlocked bonus rewards. Permanent — no loss if under-helped, just less bonus (P1: never punish).

### 7.2 Why it's powerful
- **Manufactures a "rally" moment.** Players ping their team: "Golden Hour's open, come help!" — that's organic virality with a deadline.
- **Creates push-notification gold** that's *welcome*, not spammy: "🌟 Priya's Festival Hall is in its Golden Hour — 12 min left!"
- **Synchronizes the social graph.** Async games feel lonely; timed windows make the world feel *alive and present*.

### 7.3 Help caps (anti-abuse, from v1, kept & tuned)
- Max help benefit per building: **20%** cost / time.
- Max helpers per building: **10**.
- **Diminishing returns** after 10% (curve in §8.4).
- These caps mean a Golden Hour is a *party with a guest list*, not an exploit.

---

## 8. Helping & the Social Layer

### 8.1 Two help pools (revised — the stranger pool is new & critical)
| Pool | Who | Why it exists |
|---|---|---|
| **Friends** | Your added/contacts/team | Reciprocity, retention, virality |
| **Stranger Pool** | Curated queue of live Golden Hours from safe strangers | **Solves the cold-start / no-friends problem** that kills most social games. A brand-new player can *always* help and *always* be helped, day one. |

> Without the stranger pool, a player with no friends has a dead social loop. With it, *everyone* has someone to help within seconds of opening the app. This is the difference between a viral game and a ghost town.

### 8.2 What a help does
- Add coins to a building, speed its timer, or drop a **Lucky Boost**.
- Costs **Help Tokens** (from spins) or spare coins.

### 8.3 Why players *want* to help (it's selfish, by design — P1)
When **A** helps **B**, **A instantly** gets:
- **+1 Help XP** (unlocks permanent perks, §11)
- **+0.2× Momentum Multiplier** (§9) — *the real prize*
- **5–15 scaled bonus coins**
- A chance at a **Thank-You Gift** when B reciprocates.

**B** gets: cheaper/faster build, a gratitude ping, and a one-tap "Send Thank-You Boost" that *returns spins to A*. The loop closes itself.

### 8.4 Diminishing-return curve (anti-farm)
First 3 helps → 100% effect · next 3 → 60% · next → 30% · beyond → 0%.
Bots gain nothing past the knee; humans never notice the ceiling.

### 8.5 The gratitude loop (emotional retention)
```
You help A → A notified → A claims → A sends Thank-You Boost → you get spins/momentum → you spin while hot
```
Three psychological hooks fire: **reciprocity, surprise reward, social belonging.** No shame, no loss.

---

## 9. ★ The Momentum Multiplier (the urgency engine)

**New, central system.** Replaces v1's static "Spin Multiplier" with a *living, decaying* meter that is the heart of "spin while hot."

### 9.1 Mechanics
- A visible meter, **1.0× → 3.0×**, multiplying **coin rewards only** (never cards/jackpots — protects the economy & RNG integrity).
- **Builds** by: helping (+0.2× each, §8.3), Momentum Sparks from spins (§5.2), completing daily quests, team play.
- **Decays** continuously: **−0.1× per ~6 minutes idle.** Stop playing and it bleeds away.

### 9.2 Why decay is the whole point (P2)
The decay is what makes you **spin now instead of later**. It converts "I'll play tonight" into "I'm hot *right now*, one more spin." It rewards *engagement*, not *hoarding*. It is the single strongest retention lever in the design — and it's entirely benign (you're never punished, you just cool off).

### 9.3 Guardrails
- Momentum **never** affects fairness vs. other players (it's a personal coin booster).
- Capped at 3.0× so it accelerates, never dominates (P5).
- Paid sources of momentum exist but are capped identically → no pay-to-win.

---

## 10. Teams (the Supercell signature — new)

v1 had "community projects" but no persistent group. **A persistent team (Guild/Clan) is the highest-retention structure Supercell has ever shipped, and it slots perfectly into a help game.**

- **Villages of 10–30 players.** Optional, joinable day one, low-friction.
- **Team Golden Hours:** members get priority + bonus when helping each other → reciprocity has a home.
- **Team Projects** (the evolution of v1's community projects): build the *Festival Tower*, restore the *Golden Bridge*. Everyone contributes; milestones unlock free spins, rare skins, team-wide multipliers.
- **Team chat with safe quick-emotes** (no free-text for kids' safety; sticker/emote vocabulary only).
- **Friendly team boards:** ranked by *help given* and *project progress* — competition that rewards generosity (P3). Never a shame board.

> Teams turn a 7-day game into a 7-month game. Belonging is the deepest retention driver we have.

---

## 11. Progression & Meta

### 11.1 Player level (Help XP-driven)
Leveling comes substantially from **helping**, so the social act *is* the progression. Each level unlocks: richer Golden Hour rewards, higher momentum cap thresholds, new village themes, auto-helper slots.

### 11.2 Cards & Sets (long-term retention — from v1, positive framing kept)
| Rarity | Drop |
|---|---|
| Common | 65% |
| Rare | 25% |
| Epic | 8% |
| Legendary | 2% |

- Sets unlock **permanent +1–3% bonuses, themes, auto-helpers** (a helper character that auto-contributes small amounts during your Golden Hours — adorable + functional).
- **No direct coin printing** from cards → inflation-safe.
- Card sources: spins, helping, events, cheap packs (₹20–₹50), team rewards.
- **Card trading inside teams** (rate-limited) → social glue + collection chase, the Coin Master retention secret, made cooperative.

---

## 12. Economy Model (revised)

### 12.1 The golden rule (unchanged, it's correct)
> **Coins must be easier to earn than to keep. Progress must feel faster than hoarding.**

### 12.2 Sources vs. sinks
**Sources:** coin spins, jackpots, Golden Hour bonuses, event payouts, momentum-boosted coins.
**Sinks (must absorb ~90%):**

| Sink | % coins burned |
|---|---|
| Building costs | 60% |
| Event/team contributions | 18% |
| Card crafting | 10% |
| Cosmetic upgrades | 7% |
| Expired boosts | 5% |

### 12.3 Inflation control
- Exponential cost curve vs. linear rewards (§5.3, §6).
- **Invisible anti-hoard:** if `coinsHeld > 2.5 × avgVillageCost`, coin-spin rewards scale down logarithmically (UI still reads "normal"). Player feels "slower," never "taxed." Reinforces P2.

### 12.4 Balance target (per 1,000 spins, mid-game ~lvl 25)
- Coins generated ≈ 168k · spent ≈ 155k · net **+8–10%**.
- Casual village completion: **2–3 days**. Payer accel: **1.5–2×** (never 10× — P5).
- Non-payers stay happy; payers are *advantaged, not dominant*.

---

## 13. Monetization (revised — Supercell value model)

v1 leaned almost entirely on cheap spins. We keep that as the impulse layer but **build a value ladder** so LTV doesn't cap out and revenue is stable, not anger-driven.

### 13.1 Spins (impulse layer — main volume)
| Price | Spins | ₹/spin |
|---|---|---|
| ₹10 | 120 | 0.083 |
| ₹49 | 700 | 0.070 |
| ₹99 | 1,800 | 0.055 |
| ₹299 | 6,000 | 0.050 |
Low friction, "just ₹10 more," high repeat. **No anger spending** — purchases are joyful, which means *higher long-term tolerance and lower refund/chargeback rates* than raid games.

### 13.2 Season Pass / Bloom Pass (the stability spine — new emphasis)
- ~₹399/season (6 weeks), free + premium tracks.
- Rewards earned by **playing the core loop** (spins, helps, projects) → pass *deepens* the loop instead of bypassing it.
- This is the Supercell/Brawl/Monopoly GO revenue backbone: predictable, retention-positive, fair.

### 13.3 Boost subscription (recurring base)
₹99/mo: +20% coin bonus · daily free spins · golden helper badge · faster momentum decay-resistance (capped, not pay-to-win).

### 13.4 Event passes (seasonal spikes)
Festival / Builder / Friendship passes, ₹149–₹299 — timed to real festivals (Diwali, Eid, Holi) for the India-first market.

### 13.5 Cosmetics (zero-guilt whale layer)
Village skins, building animations, helper characters, firework/festival themes. **Pure cosmetic → whales and casuals coexist (P5).** Cosmetics are also the highest-margin, brand-safest revenue.

> **Revenue philosophy:** Volume from cheap spins, *stability* from passes/subs, *ceiling* from cosmetics. No single dependency, no pay-to-win, no anger.

---

## 14. Live Ops & Seasons (the real product)

A spinner is only as alive as its calendar. Live ops *is* the game post-launch.

- **Weekly rhythm:** rotating Team Project + a weekend "Double Golden Hour" event.
- **Seasonal monuments:** 6-week arc with a global build target → free spins on milestones, exclusive village theme on completion.
- **Festival tie-ins:** Diwali fireworks, Eid lanterns, Holi colors — cosmetic events that print revenue and joy.
- **Comeback events** for lapsed players: "Your village missed you — here's a Golden Hour and 50 spins."
- **Always-on stranger pool tuning** so new players land in a *busy* world.

---

## 15. Retention & Notification Design

Notifications are usually spam. Here they're **invites to a live moment** — which is why they'll have high opt-in and CTR.

| Trigger | Example | Why welcome |
|---|---|---|
| Friend's Golden Hour | "🌟 Priya's Hall — 12 min left, go help!" | Time-bound, social, generous |
| Your Golden Hour rally | "Your Festival Tower needs 3 more helpers!" | Agency, FOMO-lite |
| Momentum about to expire | "🔥 You're at 2.4× — spin before it cools!" | Personal, urgent, benign |
| Gratitude | "Arjun sent you a Thank-You Boost 🎁" | Pure dopamine, no ask |
| Team project milestone | "Golden Bridge 80% — final push tonight!" | Belonging + deadline |

**Session design:** 10-second viable session (P4) → spin, claim a gratitude gift, drop one help. Long session → ride a momentum streak through a team project.

---

## 16. Anti-Cheat & Integrity (condensed; full spec in Appendix A)

Philosophy unchanged and correct: **Detect silently → slow → isolate → exhaust → then ban.** Make cheating *possible but pointless*.

- **Server-authoritative everything** (RNG, coins, drops). Client sends `SPIN_REQUEST`, nothing else trusted. Nonce + replay protection.
- **SuspicionScore (0–100)**, decaying, multi-signal: spin pacing, timing entropy, coin velocity, help-graph abuse, RNG anomaly, device risk — minus trust offsets (payment, age, social diversity). Full formula in Appendix A.
- **Help-ring defense** is *first-class* here because helping is the meta: help-graph cycle detection, per-pair/per-day caps, diminishing returns (§8.4), max-2-hop chains. A↔B↔C↔A is blocked.
- **Shadow pools, not bans:** flagged clusters interact only with each other; bots churn themselves. Hard ban reserved for payment fraud / exploits / resale.
- **Payment-trust boost** lowers false positives on real spenders.

---

## 17. Ethics, Brand Safety & Compliance

This is a *competitive moat*, not a checkbox. A family-safe spinner can run ads and partnerships a raid game never could.

- **Honest RNG & near-miss:** teases are visual flourish on *genuinely random* outcomes. Published, server-side, auditable odds. No predatory "lose-on-purpose."
- **Disclosed loot odds** (legally required in many markets; we lead on it).
- **Spend safeguards:** soft daily-spend nudges, parental controls, no manipulative countdown-to-buy on minors.
- **Family-safe social:** emote-only chat for under-18, curated stranger pool, report/mute everywhere.
- **GDPR / DPDP-clean by design** (data minimization, pseudonymous IDs, 90-day anti-cheat retention, no GPS/contacts/biometrics). Full policy in Appendix B.
- **GDPR Art. 22:** automated anti-cheat only affects *virtual* progression, never real-world/legal effects; human review on request.

> **Why this matters commercially:** brand safety = wider age appeal, lower churn, ad/IP partnerships, fewer regulatory shocks, and **higher lifetime value of trust**.

---

## 18. Technical Architecture (condensed; full in Appendix C)

```
Unity Client → API Gateway → Game Backend (Economy + Anti-Cheat)
                                   ├── Redis  (real-time counters, momentum TTL, help graph)
                                   ├── Postgres (source of truth: accounts, villages, payments)
                                   └── ClickHouse (analytics, economy health, bot clusters)
```

- **Client (Unity/C#):** animation, UI, juice, short offline buffer. **Decides nothing.**
- **Backend (Node + TypeScript, NestJS/Fastify):** server RNG, economy math, SuspicionScore, help-graph rules, event orchestration, IAP verification.
- **Redis** is non-negotiable: sub-ms atomic counters + **TTL-based decay is a perfect fit for the Momentum Multiplier and SuspicionScore** (decay = native TTL behavior).
- **Postgres** = ACID truth for a money-like economy. **ClickHouse** = live ops & inflation dashboards.
- **Payments:** native Google/Apple billing; backend verifies receipt + signature + replay. Never trust client purchase claims.
- **Real-time presence layer** (WebSocket/pub-sub) for live Golden Hours and team rooms — the new architectural requirement vs. v1's async design.

---

## 19. KPIs & Success Criteria

| Metric | Target (post-soft-launch) |
|---|---|
| D1 / D7 / D30 retention | 45% / 22% / 10% |
| Sessions/day | 6–10 (momentum-driven) |
| Avg session | 3–5 min |
| % players who help in first session | **>70%** (core loop health) |
| % players in a team by D7 | >50% |
| Golden Hours opened/DAU | >1.5 |
| ARPDAU | ₹ benchmarked to genre; **payer/non-payer power gap < 2×** |
| K-factor (invite virality) | >0.4 via gratitude + rally loops |
| **Toxicity reports / DAU** | ~0 (the whole point) |

**Greenlight gate (vertical slice):** the Spin → Build → Golden Hour → Momentum loop must be *fun with one building and a stranger pool of bots*, before any meta is built.

---

## 20. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Loop feels low-tension vs. Coin Master | High | **Golden Hour clocks + Momentum decay** = benign urgency (§4,7,9) |
| Cold start / empty world | High | **Stranger pool + bot-seeded Golden Hours** day one (§8.1) |
| Help-ring botting | Med | First-class help-graph defense (§16) |
| Inflation creep | Med | Exponential sinks + invisible anti-hoard (§12.3) |
| Notification fatigue | Med | Notifications are *invites to live moments*, opt-in, capped (§15) |
| Monetization ceiling (spins only) | Med | Value ladder: pass + sub + cosmetics (§13) |
| Regulatory (loot/odds) | Low | Disclosed odds, family-safe by design (§17) |

---

## 21. MVP Scope & Roadmap

**MVP (vertical slice — prove the loop, nothing else):**
- Spin + base drop table + juice.
- 1 village, 6 buildings, cost curve.
- **Golden Hour** on a single building.
- **Stranger pool** seeded with bots.
- **Momentum Multiplier** with decay.
- Server-authoritative RNG + economy + basic SuspicionScore.
- *No teams, no cards, no passes yet.* If this isn't fun, nothing downstream saves it.

**v1.0 (soft launch):** + friends, gratitude loop, cards/sets, daily quests, store/IAP, full SuspicionScore, one seasonal event.
**v1.x (global):** + Teams + Team Projects, Season Pass, festival live-ops calendar, cosmetics store, auto-helpers.

---

## 22. What changed from your v1 (changelog)

| Area | v1 | v2 (this doc) | Why |
|---|---|---|---|
| Helping | Always-on, passive | **Golden Hour timed windows** | Manufactures urgency & rally moments |
| Multiplier | Static, 1hr | **Decaying Momentum meter** | "Spin while hot" — the retention engine |
| Cold start | Friends only | **+ Stranger pool** | No empty-world death; day-one social |
| Groups | Loose community projects | **Persistent Teams** | Supercell's #1 retention structure |
| Monetization | Mostly cheap spins | **Spins + Pass + Sub + Cosmetics ladder** | Stable revenue, higher LTV ceiling |
| Spin table | Had "0% Nothing" + static mult | **Momentum Spark slot** | Couples spin → momentum directly |
| Architecture | Async | **+ Real-time presence layer** | Live Golden Hours / team rooms |
| Ethics | Implicit | **Explicit moat (§17)** | Brand safety = commercial advantage |

---

## Appendix A — SuspicionScore (full spec)

`SuspicionScore = SpinRate + TimingEntropy + CoinVelocity + HelpAbuse + RNGAnomaly + DeviceRisk − TrustOffsets`, clamped 0–100, **×0.96/hour decay** (≈50% in 17h).

- **SpinRate (≤20):** +12 if avg interval <350ms; +6 if <250ms; +4 if stdev <80ms. (Humans 600–1500ms.)
- **TimingEntropy (≤15):** Shannon entropy of inter-spin intervals; +10 if <2.2, +5 if <1.6. (Humans 2.8–4.2.)
- **CoinVelocity (≤15):** Z = (velocity − μ_level)/σ_level; +8 if Z>3, +7 if Z>4.
- **HelpAbuse (≤20):** +6 same helper >3/day; +6 mutual >10/wk; +8 + instant **+20** on help-graph cycle.
- **RNGAnomaly (≤10):** χ² of 200-spin distribution; +6 if p<0.01, +4 if p<0.001.
- **DeviceRisk (≤10):** emulator +6, reused device hash +4, missing sensor noise +3.
- **TrustOffsets (−):** spend >₹99 −15 / >₹499 −25; age >7d −5 / >30d −10; helped >10 unique players −5. Offsets decay slowly.

**Actions:** 0–30 normal · 31–50 soft nerf (lower jackpots) · 51–70 shadow pool + reward dampening · 71–85 severe throttle · 86–100 manual review/ban. *Never told to the player.* Layered server-authority, rate/pattern detection, coin-velocity & invisible hoard tax, RNG entropy checks, device/emulator nerf, cluster/multi-account shadow pools, payment-trust boost — full layer breakdown carried from source design.

## Appendix B — Privacy (GDPR/DPDP, condensed)

Data minimization. Collect: pseudonymous Player ID, game progress, spin history, help interactions, pseudonymous device/anti-cheat signals (hashed, bucketed), platform-handled payments. **Never collect:** real names, contacts, SMS/calls, GPS, camera/mic, keystrokes, social content, raw device identifiers. Anti-cheat signals: algorithmic, non-biometric, non-identifying, ≤90-day rolling retention, never sold. Art. 22: automated decisions affect only virtual progression. Full player rights (access/correct/delete/restrict/object) via privacy@[domain]. Family-safe; no knowing collection from children.

## Appendix C — Tech Stack (condensed)

Unity (C#) client · Node+TypeScript (NestJS/Fastify) backend · Redis (real-time counters, momentum/suspicion TTL decay, help-graph edges, rate limits) · PostgreSQL (ACID source of truth) · ClickHouse (analytics/economy/bot clusters) · Next.js internal admin (economy sliders, suspicion viewer) · Native store IAP with server receipt verification · WebSocket presence layer for live Golden Hours & teams · HTTPS + HMAC request signing + per-spin nonce + replay protection + server-only RNG.

---

*End of GDD v2.0. Build the vertical slice in §21 first. If the Golden Hour + Momentum loop isn't fun with one building and a pool of bots, no amount of meta will save it — and if it is, we have a Supercell-shaped game.*
