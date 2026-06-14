# BLOOM — Production

Cooperative spin-builder. Server-authoritative economy, anti-cheat, real-time social.
TypeScript monorepo: `@bloom/shared` (contracts), `@bloom/server` (Fastify + Postgres + Redis),
`@bloom/client` (PixiJS, mobile-web / Capacitor).

This is the production build that follows the validated greenlight gate (`../bloom-gate`).
See **`handoff.md`** for the living status + architecture log.

## Quick start (zero infra)
```bash
npm install
cp .env.example .env          # STORAGE=memory CACHE=memory → runs with no Docker
npm test                      # domain + contract unit tests
npm run dev:server            # API on :4000 (in-memory storage)
npm run dev:client            # client on :5173
```

## With real infra (Postgres + Redis)
```bash
npm run infra:up              # docker compose: postgres + redis
# set STORAGE=postgres CACHE=redis in .env
npm run db:migrate
npm run dev:server
```

## Layout
```
packages/
  shared/   zod contracts, balance config, shared types  (the single source of truth)
  server/   domain (pure) → ports/adapters → services → http/realtime
  client/   PixiJS app shell, networking, scenes
docker-compose.yml  postgres + redis
```

## Design docs
`../REVISED_GDD.md` · `../GREENLIGHT_PRD.md` · `../PRE_DEV_PLAN.md` · gate slice in `../bloom-gate`.
