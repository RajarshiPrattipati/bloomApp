# Production server image. Runs via tsx (a compiled dist build is a later
# optimisation). Build context = repo root.
FROM node:22-alpine AS base
WORKDIR /app

# workspace manifests first (cached install layer)
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci

# source (server + its shared dep; client source not needed at runtime)
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/server packages/server

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# migrate then start. Requires DATABASE_URL / REDIS_URL + real secrets in env.
CMD ["sh", "-c", "npm -w @bloom/server run db:migrate && npm -w @bloom/server run start"]
