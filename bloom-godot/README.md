# BLOOM — Godot client (3D village builder)

A complete UI rethink of BLOOM in **Godot 4.6**, built on the
[Kenney Starter-Kit-City-Builder](https://github.com/KenneyNL/Starter-Kit-City-Builder).
The 2D spinner is now a **3D isometric village** that grows as you build, driven by the
same **`../bloom/` server** (server-authoritative spin/economy/anti-cheat/teams/cards/
quests/pass/shop) over signed HTTP from GDScript.

## What's in it
- **Thoughtful base**: central pavement plaza + fountain, an east–west main street with
  lampposts, north/south roads, and decorative trees in the corners.
- **Meaningful placement**: tap **Build** → placement mode highlights valid plots → tap a
  plot → **✓ Place here** / **✕ Cancel**. Buildings must connect to the plaza / roads /
  existing buildings (connected growth); trees block cells — so *where* you build matters.
- **Mobile controls**: one-finger **drag to orbit** the camera, **two-finger pinch to zoom**
  (mouse drag + wheel on desktop), plus on-screen **＋ / －** zoom buttons. **No auto-rotation.**
- **Juiced gacha** (`scripts/gacha.gd`): a capsule "machine" with a pulsing glow ring, a
  reel that cycles through outcome icons and **decelerates** with rising/falling tick pitch,
  a **landing punch + screen flash + particle burst + screen shake** scaled by rarity, and
  distinct win stingers (jackpot fanfare, spark whoosh, card reveal).
- **HUD**: momentum bar (hot/cooling), coins (animated), level, tokens, Golden Hour banner,
  toasts, SPIN / Build / Help.

## Run it
Start the backend: `cd ../bloom && npm -w @bloom/server run start` (`:4000`).
**Editor:** open `/Applications/Godot.app`, import this folder, press Play.
**CLI:**
```bash
GODOT=/Applications/Godot.app/Contents/MacOS/Godot
$GODOT --headless --import --path .                  # first-time import cache
$GODOT --path . -- --shot=/tmp/x.png --shot-delay=4  # run + headless screenshot (dev)
$GODOT --headless --path . res://tools/net_test.tscn # networking smoke test
```
Dev hooks (cmdline user args): `--autospin`, `--autobuild` headlessly drive the loop.
Server test knobs: `BLOOM_GH_MS` (short Golden Hour) and `BLOOM_START_COINS` (seed coins).

## Files
```
scripts/net.gd        autoload "Net" — signed client (HMAC-SHA256 nonce.ts.body + JWT),
                      device register + retry-on-401; typed calls for every server route.
scripts/bloom_main.gd  the game: world/base, orbit camera + touch input, grid constraints +
                      placement, HUD, server loop (poll /api/sync @1.5s).
scripts/gacha.gd       the juiced spin overlay (reel, particles, flash, shake, sounds).
scripts/audio.gd       Kenney audio pool + play_pitched() for precise gacha pitch.
scenes/bloom_main.tscn main scene.   tools/  screenshot + smoke-test + seed helpers.
models/ structures/ sounds/ fonts/   Kenney kit assets (CC0).
```

## UI architecture (per the godot-ui / godot-best-practices skills)
- **`scripts/ui_theme.gd`** — one shared `Theme` (built via `UiTheme.build()`): the Kenney
  **Lilita One** font with a **system-emoji fallback**, Button **type-variations**
  (`Primary`/`Ghost`/`Chip`), `PanelContainer`/`Card2`, a styled `ProgressBar`, and TabBar/
  TabContainer styles. No more per-button StyleBox duplication.
- **Responsive HUD** — `MarginContainer` + `VBox`/`HBox` with anchor presets (top-wide / bottom-
  wide / center-right) and `ProgressBar` momentum, instead of absolute pixel positions.
- **`scripts/menu.gd`** — themed tabbed overlay (Quests / Pass / Cards / Teams / Shop) wired to
  `Net`, opened by `☰`, with claim / create / join / contribute / buy actions.

## Sound design (`scripts/sfx.gd`)
A **procedural synth sound bank** — no external audio assets. At startup it renders 19
`AudioStreamWAV`s from a tiny in-engine synth (sine/triangle/saw/noise oscillators with
attack/release envelopes, pitch sweeps, and arpeggios), played from an 18-voice pool:
- **Gacha**: rising/falling `reel_tick`s during the spin, then a rarity stinger — a triumphant
  **jackpot** arpeggio, a **spark** zap-sweep, a **card** shimmer, **coin**/**mystery** chimes.
- **UI**: `ui_tap` on every button, `tab`, `ui_open`/`ui_close`, `purchase`.
- **World**: `build` thunk + a warm `golden_hour` chord, `help`, `gratitude`, `milestone`,
  `level_up` — driven by the server's `events` (helper joined, milestone, thank-you, card, set
  complete) which the client now processes into sounds + toasts.
- A quiet looping **ambience** pad under everything.

Verified: 19 sounds generated with correct durations and peak amplitude ~30145/32767 (non-silent).

## Music (`scripts/music.gd`)
A **generative score** — also pure synthesis. A real-time sequencer plays a cozy
**Am7 → Fmaj7 → Cmaj7 → G7** progression (vi–IV–I–V) at 78 BPM using three synthesised
instruments: a soft sustained **pad** (the chord), a rounded **bass** (root + fifth), and a
sparse bright **pluck** melody. The sparkle density and brightness **rise with momentum**
(`Music.set_intensity` from the HUD), and the whole bed **ducks** while the gacha plays. Verified:
pad/bass/pluck samples render non-silent (peak ~29490); sequencer runs clean.

## Verified (portrait, live server)
Themed HUD (font + ProgressBar + emoji), all 5 menu tabs, the build/placement flow, the gacha
overlay, **camera pan** (one-finger pan; two-finger rotate + pinch zoom; right-drag rotate on
desktop), and **layout persistence** round-trip (built at cell (2,1) → restored there on restart).

## Buildings
- **Style palette** in placement mode — pick one of 5 building types (🏠🏡🏢🏬🏭) to place; valid
  plots are highlighted, ghost preview follows your tap, then ✓ Place / ✕ Cancel.
- **Tap-to-upgrade** — tap a placed building to grow it through tiers (scale + pop), persisted.
- Building type + tier are saved per-cell in the local layout (`user://layout_<playerId>.json`).

## Mobile
Ships to phones (Mobile renderer, portrait lock, ETC2/ASTC, touch controls, Android `INTERNET`
permission, `export_presets.cfg` for Android + iOS, bundled debug keystore). **Android is verified
end-to-end**: `--export-debug "Android"` produces a signed **27 MB APK** (`com.bloom.village`,
arm64-v8a, INTERNET permission, debug-signed `CN=Android Debug`). iOS exports an Xcode project once
you set your Apple **Team ID** (iOS 14+ for Metal). See **`MOBILE.md`** for the full setup. ⚠️ Change
`BASE` in `scripts/net.gd` from `localhost` to your machine's LAN IP or a deployed server before
running on a device.

## Next
- Road auto-tiling, day/night, real art themes, IAP via native billing.

## Notes
- No Godot **MCP** is needed — plain-text project validated via the Godot CLI. (An MCP could
  drive the editor but attaches only at Claude Code session start.)
- `BASE` / `HMAC_SECRET` in `scripts/net.gd` match the server dev defaults; change for deploy.
