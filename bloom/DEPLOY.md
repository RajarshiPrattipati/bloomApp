# Deploying BLOOM — pure serverless on Vercel (single GitHub repo)

The whole thing ships from one GitHub repo. Vercel builds the **web client** as a
static SPA and runs the **Fastify API** as a Node serverless function — no
long-running server, **no WebSockets** (the game stays live via `/api/sync`
polling every 1.5s). Realtime presence is opt-in and stays off here.

```
repo root (git) ── Vercel "Root Directory" = bloom
  bloom/
    vercel.json              build the SPA + expose /api as a function
    api/[...path].ts         serverless entry → forwards every /api/* into Fastify
    packages/client          Vite + Pixi SPA  → built to packages/client/dist (static)
    packages/server          Fastify app (imported by the function; no /ws here)
    packages/shared          types/schemas (consumed as source)
```

## 1. Managed data (one-time)
Serverless functions are isolated per invocation, so in-memory state can't hold the
nonce/replay window or rate-limit counters. Provision shared stores:

- **Postgres** — [Neon](https://neon.tech) (or Supabase / Vercel Postgres). Copy the
  **pooled** connection string → `DATABASE_URL`.
- **Redis** — [Upstash](https://upstash.com). Copy the `rediss://` URL → `REDIS_URL`.

## 2. Push to GitHub
The repo root is already initialized. Add a remote and push:
```bash
git remote add origin git@github.com:<you>/bloom.git
git push -u origin main
```

## 3. Import into Vercel
- **New Project → Import** the GitHub repo.
- **Root Directory: `bloom`**  ← important (the app lives in a subfolder).
- Framework Preset: **Other** (a `vercel.json` already defines build + output).
- Vercel auto-detects `bloom/api/[...path].ts` as a Node serverless function and
  builds `packages/client/dist` as the static site.

## 4. Environment variables (Vercel → Settings → Environment Variables)
See `.env.production.example` for the full annotated list. Minimum for Production:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `STORAGE` | `postgres` |
| `CACHE` | `redis` |
| `DATABASE_URL` | Neon **pooled** URL |
| `REDIS_URL` | Upstash `rediss://` URL |
| `AUTO_MIGRATE` | `false` |
| `JWT_SECRET` / `HMAC_SECRET` / `RNG_SALT` | 32-byte secrets — `openssl rand -hex 32` |
| `VITE_HMAC_SECRET` | **must equal** `HMAC_SECRET` (baked into the client build) |
| `VITE_API_BASE` | empty (client + API are same-origin) |

Production refuses to boot if the secrets are still the dev placeholder.

## 5. Run migrations once (not on cold starts)
The function pins `AUTO_MIGRATE=false`, so create the schema as a one-off:
```bash
cd bloom
DATABASE_URL='<neon-pooled-url>' npm run db:migrate
```
(Re-run after any schema change — the DDL is idempotent `CREATE TABLE IF NOT EXISTS`.)

## 6. Deploy & verify
Vercel deploys on push. Then:
```bash
curl https://<your-app>.vercel.app/api/health     # {"ok":true,...}
curl https://<your-app>.vercel.app/api/config     # public config JSON
```
Open the site — the Pixi client loads and drives the spin/build loop over `/api/*`.

## Native clients (Godot)
The Godot client (`../bloom-godot`) isn't deployed by Vercel — point its `Net.BASE`
at `https://<your-app>.vercel.app` and it talks to the same serverless API.

## What changed for serverless (vs. the long-running server)
- `api/[...path].ts` boots Fastify **once per warm instance** and forwards requests
  via `server.emit('request', …)` — the raw body reaches the HMAC verifier intact.
- `registerRealtime()` / `/ws` is **not** mounted here. The client gates WebSockets
  behind `VITE_REALTIME` (default off) and relies on polling.
- `AUTO_MIGRATE` env (default `true` for `npm start`) is forced **off** in the
  function so cold starts don't migrate every invocation.

## When you'd want the persistent server instead
If you later need true realtime (live Golden Hour rally pings, presence counts),
run `packages/server` (`npm start`) on a persistent host (Railway / Fly / Render),
set `VITE_REALTIME=1` + `VITE_API_BASE=<that host>`, and keep Vercel for the static
client. The code supports both with no changes — only env differs.
