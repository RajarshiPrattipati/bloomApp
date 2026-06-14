# BLOOM — Human Playtest Kit (Greenlight Gate)

The automated flow (`npm run sim`, `npm run e2e`) proves the loop *works*. **Only humans can tell us if it's fun.** This kit turns 5–8 phone sessions into the missing rubric rows.

## Setup (2 min)
1. Start the gate: `npm run dev` (server :3000 + client :5173).
2. On each tester's phone (same Wi-Fi) open `http://<your-mac-ip>:5173/`
   — find the IP in the Vite "Network:" line, or use the iOS Simulator at `http://localhost:5173/`.
3. **Record the start time** (epoch ms): `node -e "console.log(Date.now())"` — you'll pass it to the verdict tool.
4. Each tester gets a **fresh session**: Safari → clear site data, or use a private tab.

## The session (10 min, per tester)
- Hand them the phone. Say only: **"Play this for a few minutes."** No instructions.
- **Observe, don't help.** Note on the sheet below: where they look first, when they smile, when they hesitate, when they'd quit.
- Let them play ~8–10 minutes (or until they clearly stop).

## The 4 questions (ask after, verbatim)
1. **"Explain the game to me in one sentence."**  → correct if they mention *spin* + *help/build*.
2. **"When did you most want to keep going?"**  → look for "when momentum was high" / "rallying help".
3. **"When were you bored or confused?"**  → the friction list.
4. **"Would you open this again tomorrow?"**  → yes / no.

## Observer sheet (one row per tester)
| Tester | Explained in 1 sentence? (Y/N) | Helped a stranger unprompted? (Y/N) | Smiled/"oh nice" moment? (note) | Bored/confused at… | Reopen tomorrow? (Y/N) |
|--------|-------------------------------|------------------------------------|--------------------------------|--------------------|------------------------|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
| 4 |  |  |  |  |  |
| 5 |  |  |  |  |  |
| 6 |  |  |  |  |  |
| 7 |  |  |  |  |  |
| 8 |  |  |  |  |  |

## Produce the verdict
1. Telemetry for the behavioural rows (spins, hot-spin rate, decay→re-spin, helps, session length) is captured automatically in `telemetry/events.jsonl`.
2. Tally the human-only answers into `telemetry/playtest-human.json`:
   ```json
   { "testers": 8, "explainedCorrectly": 6, "wouldReopen": 5 }
   ```
3. Run:
   ```bash
   node scripts/verdict.mjs --since <start-time-epoch-ms>
   ```
   It prints the full §8 rubric and a **GO / PIVOT / KILL** recommendation. GO requires the
   **decay-warning → re-spin** bar — the hypothesis — to pass.
4. Paste the output into `GREENLIGHT_VERDICT.md` and add your top-3 felt strengths / problems.

## What "GO" means
≥6/8 rubric bars met **and** the decay→re-spin bar passes → greenlight the meta (Teams, Cards, Season Pass) and the Godot production port. Otherwise PIVOT (tune Momentum/Golden Hour, re-test ≤2 iterations) or KILL.
