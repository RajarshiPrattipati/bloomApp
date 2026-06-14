# BLOOM Production — Handoff & Status Log

> Living document. Updated at every major step. Read top-to-bottom for the current
> state; the changelog at the bottom records how we got here.

---

## 1. What this is
The production build of **BLOOM**, a cooperative spin-builder validated by the greenlight
gate (`../bloom-gate`). Core loop: **Spin → Build → Golden Hour → Momentum**, where helping
others is the fastest way to grow. No raids, no theft — positive-sum.

## 2. Architecture (decided)
TypeScript monorepo, three packages:

- **`@bloom/shared`** — zod schemas + balance config + API contract types. The single
  source of truth shared by server and client. No I/O.
- **`@bloom/server`** — Fastify. Layered, dependency-inverted:
  - `domain/` — pure functions: RNG, economy, spin, momentum, golden hour, social/help-graph,
    anti-cheat (SuspicionScore). No I/O, fully unit-tested.
  - `ports/` — interfaces: repositories, cache, clock, rng.
  - `adapters/` — in-memory (tests/local) + Postgres (Drizzle) + Redis (ioredis).
  - `services/` — application orchestration (SpinService, BuildService, HelpService, …).
  - `http/` — routes, auth (device JWT), HMAC request signing, nonce/replay, rate limiting.
  - `realtime/` — WebSocket presence for Golden Hours / teams.
  - `payments/` — Apple/Google IAP verification.
- **`@bloom/client`** — PixiJS app (mobile-web, Capacitor-ready). Decides nothing; renders
  server-authoritative state.

### Key decisions & rationale
| Decision | Why |
|---|---|
| Client = PixiJS/TS, not Godot | Godot not installed/verifiable in this env; web client is verifiable (typecheck/build/iOS sim) and ships to stores via Capacitor. Godot remains a valid alt — see §6. |
| Postgres + Redis via Docker | Docker present; psql/redis not. In-memory adapters keep domain tests infra-free. |
| `STORAGE`/`CACHE` env switches (memory/postgres/redis) | Run + test with zero infra; flip to real backends for integration. |
| Server-authoritative everything | GDD §16: client sends intent only; server owns RNG, economy, anti-cheat. |
| Domain layer pure | Deterministic, fast unit tests; infra swappable. |

## 3. How to run (current)
```bash
npm install
cp .env.example .env     # defaults: STORAGE=memory CACHE=memory
npm test                 # unit tests
npm run typecheck
```
(Server/client run targets come online as those steps land — see §5.)

## 4. File map (grows each step)
```
bloom/
  package.json            workspaces + scripts
  tsconfig.base.json      shared compiler options
  docker-compose.yml      postgres + redis
  .env.example            config template
  README.md  handoff.md
  packages/
    shared/src/
      balance.ts     production economy + helpers (baseCoin, buildingCost, goldenHourBenefit, helpEffectFactor)
      schemas.ts     zod contracts (Wallet, Village, GoldenHour, View, WorldEvent union, auth, purchase)
      contracts.ts   route paths, header names, SIGNATURE_SKEW_MS, ERROR codes
      index.ts       barrel
    shared/src/
      balance.ts schemas.ts contracts.ts index.ts   (config, zod contracts, routes/headers/errors)
    server/src/
      domain/                 PURE, deterministic, no I/O
        types.ts              GameState (+ serde), GoldenHour, HelpEdge
        rng.ts                HMAC-SHA256 seeded mulberry32 (server-only salt)
        spin.ts               resolveSpin (+ set-bonus × boost coin multiplier)
        momentum.ts           decay + gain + cooling warning
        goldenHour.ts         buildAction, advanceGoldenHour, real+bot helpers, milestones
        social.ts             stranger pool, helpBot, gratitude, helpPlayer, help-graph (cycles+caps)
        cards.ts              catalog, weighted drops, set-completion bonus, collection view
        entitlements.ts       boost/pass active + coin mult, daily free spins
        pass.ts               season-pass XP, tiers, free/premium rewards, claim
        quests.ts             daily quests (progress, reset, claim)
        teams.ts              team-project contributions + milestones
        stats.ts              Welford running stats (coin-velocity cohorts)
        anticheat.ts          SuspicionScore engine (entropy, χ², bands, decay)
        world.ts              advance() lazy tick + buildView() (schema-valid)
        index.ts              barrel
      ports/                  clock, cache (+NonceStore), repositories
      adapters/               memory · postgres (Drizzle: schema/client/repos/migrate) · redis
      services/               auth · antiCheat · game · payments · teams · liveGoldenHours · presence-using
      http/                   server (routes + composition) · guard · signing · errors · types
      realtime/               hub (PresenceHub) · presence (WS transport)
      payments/               verifiers (sandbox + Apple/Google stubs)
      config/                 env (zod-validated)  app/  context (composition root)
    client/src/
      main.ts config.ts        boot + build config
      net/                     client (signed requests) · crypto (WebCrypto HMAC)
      core/                    scene manager
      scenes/                  GameScene (core loop + badges)
```

## 5. Progress
- [x] **Step 0 — Scaffold**: monorepo, tsconfig base, docker-compose, env, README, this handoff.
- [x] **Step 1 — shared**: balance config, zod schemas, contracts + tests (9 passing).
- [x] **Step 2 — domain**: rng, spin, momentum, golden hour, social/help-graph, anti-cheat + tests (21 passing).
- [x] **Step 3 — ports/adapters**: clock/cache/repo interfaces, in-memory (tested), Drizzle/Postgres, Redis. 27 tests.
- [x] **Step 4 — services + HTTP API**: auth(JWT), HMAC signing, nonce/replay, rate-limit, routes, anti-cheat
  integration. 35 tests; server boots + smoke-tested.
- [x] **Step 5 — realtime + payments**: IAP verify (sandbox + Apple/Google stubs) with replay guard;
  WebSocket presence hub + /ws. 40 tests; server boots with /ws registered.
- [x] **Step 6 — client scaffold**: PixiJS app, signed-request net layer (WebCrypto HMAC + nonce +
  JWT), scene manager, full GameScene. Typechecks + builds (~104KB gz). **Verified end-to-end in the
  iOS Simulator**: device register → JWT → signed session → renders server-authoritative state.

- [x] **Step 7 — Postgres + Redis runtime verification**: `docker compose up`, migrate, server boots
  `storage=postgres cache=redis`, signed end-to-end smoke passes; rows persisted in PG (JSONB game
  state), `nonce:*` keys live in Redis.
- [x] **Step 8 — deployability**: Dockerfile, .dockerignore, CI workflow, smoke:prod script, §7 gaps.
- [x] **Step 9 — Teams/Clans**: team model + Team Project contributions/milestones (domain), TeamRepo
  (memory + Postgres), TeamService, 6 routes, realtime `team:` broadcast. Verified vs real PG/Redis.
- [x] **Step 10 — Cards & Sets**: card catalog (3 sets×6), weighted rare-card drops, set completion →
  permanent coin bonus (applied in `resolveSpin`) + free spins, collection route.
- [x] **Step 11 — Entitlements**: Boost Sub (+20% coins, richer daily, duration), Season Pass
  (duration), daily-free-spins on session; payment grants wired; wallet `boostActive`/`passActive`.
- [x] **Step 12 — Real player↔player help**: Golden Hour accepts real helpers (`realHelperIds`)
  alongside bots; `helpPlayer` graph-gated (caps + cycle detection) with gratitude reciprocity;
  live-Golden-Hour registry + `/api/help/live` discovery + `/api/help/player`.
- [x] **Step 13 — Coin-velocity cohort z-score**: Welford running stats per level cohort
  (cache-backed); AntiCheatService accumulates earned coins + active window → real `coinVelocityZ`.
  **SuspicionScore now fully data-driven (no placeholders). 73 tests.**
- [x] **Step 14 — Client integration**: client API methods for all new routes (cards/teams/help-live/
  help-player); HUD status badge (collection count + ✨BOOST/⭐PASS). Builds; **verified in iOS
  Simulator** — signed `/api/cards` lands, collection badge shows real data.
- [x] **Step 15 — Season Pass reward track**: pass XP from play (spin/help/build), 30-tier free+premium
  reward tracks, claim endpoint (premium gated on active pass). `/api/pass`, `/api/pass/claim`.
- [x] **Step 16 — Realtime help notifications**: PresenceHub shared via the composition root; real help
  broadcasts a live `got_helped` ping to the target's `player:` channel; team contribution + WS reuse
  the same hub.
- [x] **Step 17 — Daily Quests**: 4 daily quests (spin/help/build/team-contribute), progress from core
  actions, daily reset, claim rewards. `/api/quests`, `/api/quests/claim`. **85 tests.**
- [x] **Step 18 — Client meta screens**: tabbed `MenuOverlay` (Quests/Pass/Cards/Teams) with live data
  + claim/create/join/contribute actions; `☰` button in GameScene. Client API for quests/pass/leave.
  **Verified all 4 tabs in the iOS Simulator** (signed fetches, real data).
- [x] **Step 19 — Client juice & polish**: confetti, stacked toasts, WebAudio SFX, floating rewards,
  world-event processing (milestones/gratitude/cards/sets), realtime `got_helped`, hot-state glow.
  **Hardened networking** (single-flight register + sync, bounded 401-retry) — fixed a request storm.
  **Verified in iOS Simulator**: gratitude loop visible, 0 server-side 401s.
- [x] **Step 20 — Shop tab**: 5th `MenuOverlay` tab listing spin packs / Boost Sub / Season Pass with
  Buy buttons → sandbox `/api/purchase/verify`. **Verified**: shop renders from config; the exact Buy
  payload grants entitlements (1800 spins added, boostActive→true).
- [x] **Step 21 — Procedural village art**: drawn vector houses (varied roofs/windows/doors on grass)
  that fill the village as you build; constructing plot shows a pulsing golden Golden-Hour glow; empty
  plots show foundations. Added server-side `BLOOM_GH_MS`/`BLOOM_START_COINS` dev/live-ops overrides.
  **Verified in iOS Simulator**: a 5-house village skyline at Lv 6.

**Status: all planned steps complete + real-infra verified. 49 tests green; full typecheck clean;
server+client verified on iOS Simulator AND against Postgres/Redis. See §7 for what's intentionally
left for the next milestone.**

## Run the server now
```bash
cp .env.example .env          # defaults: STORAGE=memory CACHE=memory (no Docker)
npm -w @bloom/server run start  # → :4000 ; GET /api/health, /api/config are public
```
All gameplay routes require `Authorization: Bearer <jwt>` + `x-bloom-nonce` + `x-bloom-ts`
+ `x-bloom-signature` = HMAC_SHA256(HMAC_SECRET, `nonce.ts.rawBody`). See `test/http.test.ts`
for a working signed-request example.

## 6. Notes for whoever picks this up
- **Godot path**: if you prefer a native client, the server/contracts are engine-agnostic
  (plain HTTP+JSON+WS). A Godot client would consume the same `@bloom/shared` contract shapes.
- **Secrets**: `.env.example` has dev placeholders. Generate real 32-byte secrets before any
  non-local deploy. `RNG_SALT` must never ship to clients.
- **Balance**: all tunables live in `@bloom/shared` balance config — never hardcode economy
  values in server or client.
- **Deploy**: `Dockerfile` builds the server image (runs migrate → start; needs DATABASE_URL,
  REDIS_URL, real secrets). `.github/workflows/ci.yml` runs typecheck + tests + client build.
  Run infra locally with `npm run infra:up`; signed end-to-end check: `node scripts/smoke-prod.mjs`.

## 7. What's intentionally NOT built yet (next milestone)
The core loop, economy, anti-cheat, auth/integrity, payments, persistence, realtime, and client are
done and verified. Deliberately deferred (each has a clear hook in the codebase):
- ~~Teams/Clans + Team Projects~~ — **DONE (Step 9)**. Routes: create/join/leave/get/list/contribute;
  milestone rewards; realtime `team:<id>` broadcast. Next: team chat (emote vocab) + team Golden Hours.
- ~~Cards & Sets~~ — **DONE (Step 10)**. Catalog + drops + set-bonus + collection route. Next:
  client collection UI + card trading inside teams (rate-limited).
- ~~Real player↔player help~~ — **DONE (Step 12)**. `/api/help/live` + `/api/help/player`,
  graph-gated, gratitude reciprocity. ~~Realtime push~~ also **DONE (Step 16)** — live `got_helped`
  ping to the target. Remaining: persist the live-GH registry in Redis (multi-instance).
- ~~Coin-velocity cohort z-score~~ — **DONE (Step 13)**. Welford per-level cohort in cache. For
  production scale, periodically snapshot cohorts to ClickHouse (GDD §18); the hot path stays in Redis.
- ~~Season Pass / Boost Sub entitlements~~ — **DONE (Step 11)**. Boost = +20% coins + ×1.5 daily.
- ~~Season Pass reward track~~ — **DONE (Step 15)**. XP from play → 30 tiers, free + premium tracks,
  claim endpoint. Next: cosmetic reward types + client pass screen.
- **Live-ops, push notifications, ClickHouse analytics**: telemetry currently logs structured lines.
- ~~Client meta screens~~ — **DONE (Step 18)**. Tabbed `MenuOverlay`: Quests/Pass/Cards/Teams.
- ~~Client juice~~ — **DONE (Step 19)**. Confetti/SFX/toasts/gratitude/floaters/hot-glow + WS `got_helped`.
- ~~Store/IAP UI~~ — **DONE (Step 20)**. Shop tab (sandbox purchases).
- ~~Village art~~ — **DONE (Step 21)**. Procedural vector houses fill the village as you build.
  Remaining art: replace the spin/reel **emoji** with sprites (CC0/AI), village backdrop/themes, and
  native IAP wiring (Capacitor billing) for store builds.
- **Live-ops/test knobs**: `BLOOM_GH_MS` (Golden Hour ms) and `BLOOM_START_COINS` (seed coins) are
  server env overrides (default = balance) — handy for testing build/village flows fast.

---

## Changelog
### Step 21 — Procedural village art (done)
- **GameScene.drawVillage** (replaces `drawSlots`): a grassy ground strip + up to 6 plots. Built
  plots render a vector house (cream body, varied bright roof via `ROOFS[i]`, skyline height
  variation, door + windows); the constructing plot shows a pulsing golden outline + scaffold line
  (uses the hot-glow phase); empty plots show a foundation outline. Village panel grew to 120px and
  the build/Golden-Hour row moved down to fit.
- **Server overrides**: `buildAction` gained an optional `durationMs` (default = balance);
  `GameService.build` passes `BLOOM_GH_MS` when set. `GameService.load` seeds `BLOOM_START_COINS` for
  new players. Both are server-only, default-off — domain tests (which call `buildAction(s,now,salt)`)
  are unaffected.
- Verified in the iOS Simulator: a 5-house village skyline at Lv 6. 85 tests green; typecheck clean;
  client builds (~110 KB gz).

### Step 20 — Shop tab (done)
- **client net**: `purchase(productId)` posts the sandbox payload (`platform:'android'`,
  `receipt:'sandbox-ok:<sku>'`, fresh `transactionId`) to `/api/purchase/verify`.
- **MenuOverlay**: tabs now data-driven (`TABS`/`TAB_LABELS`/`TITLES`), dynamic tab widths for 5 tabs;
  new `renderShop` lists spin packs + Boost Sub + Season Pass (from `publicConfig.iap`) with Buy
  buttons that purchase then refresh the HUD. Fixed the `?menu=` deep-link to accept `shop`.
- **GameScene**: passes `cfg` into the overlay.
- Verified: shop renders all products in the iOS Simulator; a node check of the exact Buy payload
  granted entitlements (70→1870 spins; boostActive→true). Client builds (~110 KB gz); typecheck clean.

### Step 19 — Client juice & polish (done)
- **ui/confetti.ts**, **ui/toasts.ts**, **audio.ts**: ported + improved from the gate (procedural
  confetti, stacked toasts with anchor fn, WebAudio SFX bank).
- **GameScene**: layers added above game UI / below the menu; `processEvents` turns world events
  (helper_joined, gh_milestone, gh_closed, thank_you, help_given, card_dropped, set_completed,
  momentum_warning) into toasts + confetti + SFX; floating `+coins` on wins; reel-tick sound;
  **hot-state glow** pulse on the reel ring; SFX on jackpot/spark/win/build/help; `connectRealtime`
  shows a `got_helped` toast. Audio unlocked on first action (iOS).
- **Networking hardening (BloomClient)**: single-flight `register()` (shared in-flight promise),
  bounded 401-retry (once), token captured after await; **single-flight `runSync`** in GameScene.
  Diagnosed a request storm to **stale Safari tabs** (test artifact) — a clean single tab shows
  **0 401s**. A successful response now clears any stale error banner (self-healing).
- Dev hooks: `?demo=N` auto-plays for headless juice checks (gated, harmless). Verified in the iOS
  Simulator: the **gratitude loop is visible** ("Helped X" → "X thanks you — +N spins"), confetti +
  hot glow render, no errors. Client builds (~109 KB gz); 85 tests unchanged.

### Step 18 — Client meta screens (done)
- **client net**: added `passStatus`/`passClaim`/`quests`/`questsClaim`/`teamLeave` (client now covers
  every server route); exported `Collection`/`QuestView` types.
- **ui/MenuOverlay.ts**: a tabbed overlay (backdrop + panel, tap-out to close) with four tabs:
  - *Quests* — quest rows with progress bars + "Claim rewards".
  - *Pass* — tier, XP bar, free/premium claimable counts + "Claim".
  - *Cards* — collection summary + per-set owned/total/bonus.
  - *Teams* — in-team: project bar, members, Contribute/Leave; else Create + joinable list.
  Each action calls the server, refreshes data, and nudges the HUD (`onWalletChange`).
- **GameScene**: `☰` button (top-left) opens the overlay; `?menu=<tab>` dev hook for headless checks.
- Client typechecks + builds (~107 KB gz). **Verified all 4 tabs in the iOS Simulator** with live,
  signed data. 85 tests unchanged (overlay is presentation; server logic already covered).

### Step 17 — Daily Quests (done)
- **domain/quests.ts**: `QUESTS` (spin25/help3/build1/team1), `ensureQuestDay` (daily reset),
  `recordQuestEvent` (per-type progress, capped), `questStatus`, `claimQuests` (grants once).
- **GameState**: `questDay`/`questProgress`/`questClaimed` (serde defaults).
- **Wiring**: spin→spin, build→build, help (bot + real)→help, team contribute→team_contribute.
  `GameService.quests()` + `questsClaim()`; routes `/api/quests`, `/api/quests/claim`.
- Tests: 5 (progress cap, claim once + reward, incomplete not claimed, day rollover reset, stable
  set). 85 total; typecheck clean; routes protected.

### Step 16 — Realtime help notifications (done)
- Refactored the `PresenceHub` to be created in the composition root (`buildServices`) and decorated
  onto the app in `buildServer`; `registerRealtime` now attaches the WebSocket transport to that
  shared hub instead of creating its own. Team-contribution broadcast uses `services.presence`.
- **GameService** takes an optional `PresenceHub`; on a successful real help it broadcasts a
  `got_helped` ping to `player:<targetId>` (the target sees a live "a friend joined your Golden Hour"
  even before their next sync).
- Tests: 2 (broadcast received by a subscribed target; no-hub path doesn't throw). 80 total;
  typecheck clean; server boots with the shared hub + `/ws`.

### Step 15 — Season Pass reward track (done)
- **domain/pass.ts**: `addPassXp` (caps at maxTier), `passTier`, `rewardForTier(free|premium, tier)`
  (deterministic; premium richer + milestone bumps every 5th), `claimPass` (claims all unlocked
  free tiers; premium only when the pass is active), `passStatus`.
- **GameState**: `passXp`/`passClaimedFree`/`passClaimedPremium` (serde defaults).
- **GameService**: spins/builds/helps (bot + real) grant pass XP; `passStatus()` + `passClaim()`.
- **Routes**: `/api/pass`, `/api/pass/claim`; shared `PassStatus` schema + route constants;
  `BALANCE.pass` (30 tiers, xp per spin/help/build).
- Tests: 5 (xp→tier + cap, free claim once, premium gated on active pass, status counts, premium >
  free). 78 total; typecheck clean; routes registered + protected.

### Step 14 — Client integration (done)
- **net/client.ts**: typed methods for `cards`, `helpLive`/`helpPlayer`, and `teamCreate/Mine/List/
  Join/Contribute` — the client now covers every server route.
- **GameScene**: status badge under the title showing the card collection count (`🃏 owned/total
  (+bonus%)`) fetched from `/api/cards` on mount + refreshed on `card_dropped`/`set_completed`, plus
  `✨ BOOST` / `⭐ PASS` when those entitlements are active (from the wallet view).
- Client typechecks + `vite build`; verified in the iOS Simulator (signed `/api/cards` round-trip,
  badge renders real data). Full client UIs for Teams/Collection screens remain the next polish item.

### Step 13 — Coin-velocity cohort z-score (done)
- **domain/stats.ts**: Welford `RunningStats` (`updateStats`/`stddev`/`zScore` with a min-sample cold
  start guard). Pure + tested (mean/stddev correctness, cold-start z=0, outlier high-z, zero-variance).
- **AntiCheatService**: `observeSpin` now also accumulates earned coins (`ac:earned:<id>`); new
  `coinVelocityZ()` computes coins/min over the observed window and z-scores it against a per-level
  cohort (`cohort:level:<n>` in cache, updated online). Wired into `computeSuspicion` — the last
  `coinVelocityZ: 0` placeholder is gone. `observeSpin` signature gains `level` + `coinsAwarded`
  (GameService updated).
- 73 tests, typecheck clean.

### Step 12 — Real player↔player help (done)
- **Golden Hour refactor**: added `realHelperIds`; `ghEffectiveHelpers` = min(max, bots+real);
  `fireMilestones` (shared by bot arrivals and real helps); bots fill only slots not taken by real
  helpers; close benefit + view use the effective count.
- **domain/social.ts `helpPlayer`**: self-help/closed/full/already-helped guards → graph gate
  (`canHelpPlayer`: daily/mutual caps + cycle detection) → adds helper to target's GH + fires
  milestones; rewards helper (token spend, +0.2 momentum, helpXp, coins); schedules a real
  Thank-You boost back to the helper; returns the `HelpEdge` to persist.
- **services/liveGoldenHours.ts**: in-process registry of open Golden Hours (TTL-pruned); Redis
  sorted-set noted for multi-instance.
- **GameService**: `build` registers the live GH; `listLive` (discover real targets); `helpPlayer`
  (loads both states, gates on recent edges, persists both + the edge, unregisters when full).
- **Routes**: `/api/help/live`, `/api/help/player`; shared `HelpPlayerRequest` + `LiveGoldenHour`
  schemas + route constants.
- Tests: 3 (discover+help+edge+gratitude, idempotent/self-help, cycle-blocked). 69 total, typecheck
  clean, server boots with protected routes.

### Step 11 — Entitlements (done)
- **domain/entitlements.ts**: `boostActive`/`passActive`, `coinBoostMult` (+20% while subscribed),
  `grantBoost`/`grantPass` (stack/extend), `claimDailyFreeSpins` (once/day, ×1.5 for subscribers).
- **GameState**: `boostUntil`/`passUntil`/`lastDailyAt` (serde defaults).
- **spin.ts**: coin multiplier now = card-set bonus × boost.
- **gameService.session**: claims daily free spins. **paymentService**: boost_sub→grantBoost,
  season_pass→grantPass. **wallet view**: `boostActive`/`passActive` (WalletSchema updated).
- Tests: 6 (boost activate/multiply/expire, pass, daily once-per-day + boosted, payment grants).
  66 total; client typechecks against the new wallet shape.

### Step 10 — Cards & Sets vertical (done)
- **domain/cards.ts**: `CATALOG` (18 cards / 3 sets, every rarity represented), `pickCard`
  (rarity-weighted, deterministic per rng), `dropCard` (mutates inventory, emits `card_dropped`,
  grants set-completion rewards), `checkNewlyCompletedSets`, `totalSetBonusPct`, `collectionView`.
- **GameState**: `cards: Record<id,count>` + `completedSets: string[]` (serde defaults keep old rows
  forward-compatible).
- **spin.ts**: `rare_card` now drops a real card; **completed sets apply a permanent coin multiplier**
  to coins/jackpot/mystery (inflation-safe — no coin printing, only a multiplier).
- **shared**: `set_completed` WorldEvent, `setCompletionSpins` balance, `/api/cards` route.
- **services/gameService.ts**: `collection()` → `/api/cards` route.
- Tests: 6 (rarity coverage, deterministic pick, drop+event, set completion once + bonus, coin
  multiplier via `resolveSpin`, collection view). 60 total, typecheck clean.

### Step 9 — Teams/Clans vertical (done)
- **domain/teams.ts**: `TeamProject`, `applyContribution` (crosses 25/50/75/100% milestones exactly
  once), `projectPct`. Pure + tested.
- **ports + adapters**: `TeamRepo` added to `Repositories`; `MemoryTeamRepo` + `PgTeamRepo`
  (teams/team_members/team_projects tables, member uniqueness = one team per player, contribution
  via SQL increment, list with member counts); migrate DDL.
- **services/teamService.ts**: create/join/leave/getMine/list/contribute; contribute spends coins →
  advances project → grants `milestoneSpins` per crossed milestone; returns crossed milestones.
- **http**: 6 routes (`/api/team/create|join|leave|contribute|list`, `/api/team`); contribute
  broadcasts a `team_contribution` rally ping to `team:<id>` via the PresenceHub.
- **shared**: team request/view zod schemas, route + error-code constants, balance team-project
  params (target 50k coins, milestone 10 spins, per-call cap 5k anti-whale).
- Tests: 5 (milestone-once domain, create/double-join/list, contribution+milestone+spend, guards,
  leave). **54 tests total**, typecheck clean. Verified end-to-end vs real Postgres/Redis.

### Step 8 — deployability + honest gaps (done)
`Dockerfile` (server image: npm ci → migrate → start), `.dockerignore`, `.github/workflows/ci.yml`
(typecheck + test + client build), root `smoke:prod`/`build:client` scripts. Handoff §7 now lists
what's intentionally deferred (teams, cards, real P2P help routing, coin-velocity cohort, pass/sub
entitlements, ClickHouse, client polish) — each with its existing hook.

### Step 7 — Postgres + Redis runtime verification (done)
Brought up `docker compose` (postgres:16 + redis:7, healthy), ran `db:migrate` (idempotent DDL),
booted the server with `STORAGE=postgres CACHE=redis`. New `scripts/smoke-prod.mjs` performs a fully
**signed** end-to-end flow (register → session → spin×N → help → build → Golden Hour → sandbox
purchase). Result: purchase granted 120 spins (50−6+120=164 ✓). Verified persistence directly:
`players/game_states/purchases` = 1/1/1 rows, game-state JSONB readable, Redis holds live `nonce:*`
keys (replay protection running against real Redis). The Postgres/Redis adapters are no longer
"typecheck-only" — they run.

### Step 6 — production client (done)
- **net/crypto.ts** WebCrypto HMAC-SHA256 (hex) matching the server scheme; nonce/deviceId helpers.
- **net/client.ts** `BloomClient`: device register (persists deviceId+token), signed POST (nonce + ts
  + HMAC over `nonce.ts.body` + Bearer), auto re-register on 401, typed session/spin/build/help/sync/
  purchase/event, `connectRealtime` WS.
- **config.ts** build config (apiBase, hmacSecret, appVersion) via Vite env with dev defaults.
- **core/scene.ts** `Scene` + `SceneManager` (ticker/resize forwarding, transitions).
- **scenes/GameScene.ts** full core-loop screen (HUD + momentum + village/Build/Golden-Hour +
  stranger HELP rows + reel + SPIN), server-authoritative, sync loop, local momentum-decay feel.
- **main.ts / index.html / vite.config.ts** boot + portrait mobile shell + /api,/ws proxy to :4000.
- Added `PublicConfig` type export to @bloom/shared. Client typechecks + `vite build` OK.
- **Verified in iOS Simulator**: signed device-register → JWT → session; renders Build·🪙290
  (=200·1.45¹) and the live stranger pool.

### Step 5 — realtime + payments (done)
- **payments/verifiers.ts**: `findProduct` (maps SKUs → entitlement), `SandboxVerifier` (dev/test),
  `AppleVerifier`/`GoogleVerifier` production stubs, `selectVerifier` (real if creds else sandbox;
  throws in prod if unconfigured).
- **services/paymentService.ts**: verify → transaction-id replay guard → grant (spins added to game
  state) → record purchase + addSpend. Server-authoritative; client claim never trusted.
- Route `POST /api/purchase/verify` (signed + authed).
- **realtime/hub.ts**: `PresenceHub` channel pub/sub (broadcast-except-sender, dead-socket eviction).
- **realtime/presence.ts**: `@fastify/websocket` `/ws?token=<jwt>` (browsers can't set WS headers);
  subscribe/unsubscribe/ping; personal `player:<id>` channel; hub decorated on app for service fan-out.
  Redis pub/sub noted for multi-instance.
- Tests: payments (grant/replay/invalid/unknown), hub (broadcast/cleanup/throwing-socket). 40 total.

### Step 4 — services + HTTP API (done)
- **config/env.ts** zod-validated env + tiny .env loader; dev-safe defaults; production refuses
  placeholder secrets.
- **app/context.ts** composition root (memory vs Postgres, memory vs Redis) by env.
- **services**: `AuthService` (device→player→JWT via jose), `AntiCheatService` (cache-backed spin
  timing + RNG outcome windows → SuspicionScore with decay → in-memory band cache → SILENT reward
  multiplier), `GameService` (session/spin/build/help/sync; applies anti-cheat dampening; telemetry).
- **http**: raw-body capture for signing; `makeGuard` (ts-skew → HMAC verify → one-time nonce →
  JWT); routes (health, config, auth/device, session, sync, spin[tighter rate-limit], build, help,
  event); uniform error envelope; @fastify/cors + @fastify/rate-limit.
- **main.ts** entry + graceful shutdown. Server boots in-memory and was smoke-tested
  (health 200, config 200, unsigned protected route → 401).
- Tests: HTTP integration (signed inject) covering device register, unsigned/unauth/replay/tamper/
  stale rejections, and a real session→spin→help→build loop. **35 tests total, typecheck clean.**

### Step 3 — ports & adapters (done)
Dependency inversion so the domain never touches I/O.
- **ports/**: `Clock` (system + FixedClock), `Cache` (Redis-shaped) + `NonceStore` (replay),
  repository interfaces (`PlayerRepo`, `GameStateRepo`, `HelpEdgeRepo`, `SuspicionRepo`,
  `PurchaseRepo`, bundled `Repositories`).
- **adapters/memory/**: full in-memory impls — used by tests and `STORAGE=memory` local runs.
- **adapters/postgres/**: Drizzle `schema.ts` (JSONB game-state + normalised players/edges/
  suspicion/purchases), `client.ts`, `repos.ts`, idempotent `migrate.ts` bootstrap; `drizzle.config.ts`.
- **adapters/redis/**: ioredis `Cache` with `SET NX EX` for atomic nonce reservation.
- GameState ⇄ JSON serde (Set⇄array; transient outbox dropped). 6 adapter tests (serde round-trip,
  snapshot isolation, cache TTL/incr, nonce replay, purchase dedup). Postgres/Redis adapters
  typecheck; runtime-verified once `npm run infra:up` is run.

### Step 2 — domain layer (done)
Pure, deterministic gameplay + anti-cheat in `server/src/domain/` (no I/O, 21 tests):
- **rng** HMAC-SHA256(serverSalt, player|spinCount) → mulberry32; client can't predict/seed.
- **spin** server-authoritative; deterministic; distribution verified ~drop table over 4k spins.
- **momentum** real-time decay (-0.1×/6min) + cooling warning on hot→cold crossing.
- **goldenHour** buildAction (cost curve + boost discount), seeded helper schedule, milestones,
  diminishing benefit refund on close.
- **social** deterministic stranger pool, idempotent helpBot + gratitude; **help-graph** anti-abuse:
  daily/mutual caps + BFS cycle detection (A→B→A and A→B→C→A blocked).
- **anticheat** full SuspicionScore: spin-rate, timing-entropy (Shannon), coin-velocity-z,
  help-abuse (cycle = instant max), RNG χ² goodness-of-fit, device-risk, minus payment/age/social
  trust offsets; clamp 0–100; band mapping; ×0.96/hr decay. Human→normal, bot→shadow/severe.
- **world** advance() lazy tick + buildView() producing a `ViewSchema`-valid payload.

### Step 1 — shared package (done)
`@bloom/shared`: production `balance.ts` (60-min Golden Hour, momentum decay -0.1×/6min,
help diminishing tiers + graph caps, cards/teams, **SuspicionScore anti-cheat weights/thresholds**,
IAP products). `schemas.ts` zod contracts with a discriminated `WorldEvent` union and auth/purchase
payloads. `contracts.ts` route/header/error constants + `SIGNATURE_SKEW_MS`. `OutcomeKind` is defined
once (schemas) and imported by balance to prevent drift. Tests: 9 passing (drop table = 100, inflation
control, benefit cap, help tiers, publicConfig leak-check, schema round-trips). Typecheck clean.

### Step 0 — Scaffold (done)
Created `bloom/` monorepo: root `package.json` (npm workspaces, scripts), `tsconfig.base.json`
(strict, `noUncheckedIndexedAccess`), `docker-compose.yml` (postgres 16 + redis 7 with
healthchecks), `.env.example` (STORAGE/CACHE switches, JWT/HMAC/RNG secrets), `.gitignore`,
`README.md`, and this `handoff.md`. Toolchain confirmed: Node 22, Docker 27, git; Godot/psql/
redis-server absent (hence the decisions in §2).
