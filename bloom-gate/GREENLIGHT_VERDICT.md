# BLOOM — Greenlight Verdict

> Fill this after the playtest. Paste the `node scripts/verdict.mjs` output, then add
> the felt notes. This one page is the entire deliverable of the gate (PRD §21).

**Date:** ___________  **Testers:** ___ phones  **Build:** bloom-gate vertical slice

## Rubric (paste `npm run verdict -- --since <epoch>` output)
```
<paste here>
```

## Decision:  ☐ GO   ☐ PIVOT   ☐ KILL

> GO = ≥6/8 bars met **and** the decay-warning → re-spin (hypothesis) bar passes.

## The decisive number
Decay-warning → re-spin rate: **___%**  (the hypothesis: timed urgency brings players back)

## Top 3 felt strengths
1.
2.
3.

## Top 3 felt problems
1.
2.
3.

## If GO — next
Greenlight the meta: Teams/Clans, Cards & Sets, Season Pass, festival live-ops; re-platform
to Godot for production game-feel. The web slice becomes the design source of truth; the
automated E2E + sim carry forward as regression protection.

## If PIVOT — the ≤2 tuning iterations
Knobs (all in `server/src/balance.ts`, no rebuild): `momentum.decayPerSec`, `momentum.helpGain`,
`goldenHour.durationMs`, `goldenHour.helperCadence*`. Re-run `npm run sim` between tries, then re-playtest.

## If KILL — what we learned cheaply
The loop didn't earn a habit. Document why (clarity? urgency? reward cadence?) and bank it.
Cost of finding out: ~2 weeks, ~$0.
