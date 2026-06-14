// Zero-friction schema bootstrap: idempotent CREATE TABLE IF NOT EXISTS. Keeps
// `npm run db:migrate` working without a codegen step. For richer migrations,
// switch to drizzle-kit (drizzle.config.ts is provided).

import postgres from 'postgres';

const DDL = [
  `CREATE TABLE IF NOT EXISTS players (
     id text PRIMARY KEY,
     device_id text NOT NULL UNIQUE,
     platform text NOT NULL,
     app_version text,
     created_at bigint NOT NULL,
     lifetime_spend_inr integer NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS game_states (
     player_id text PRIMARY KEY,
     state jsonb NOT NULL,
     updated_at bigint NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS help_edges (
     id serial PRIMARY KEY,
     from_id text NOT NULL,
     to_id text NOT NULL,
     ts bigint NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS help_edges_ts_idx ON help_edges (ts)`,
  `CREATE TABLE IF NOT EXISTS suspicion (
     player_id text PRIMARY KEY,
     score double precision NOT NULL,
     updated_at bigint NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS purchases (
     transaction_id text PRIMARY KEY,
     player_id text NOT NULL,
     product_id text NOT NULL,
     platform text NOT NULL,
     amount_inr integer NOT NULL,
     verified_at bigint NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS teams (
     id text PRIMARY KEY,
     name text NOT NULL,
     owner_id text NOT NULL,
     created_at bigint NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS team_members (
     team_id text NOT NULL,
     player_id text PRIMARY KEY,
     joined_at bigint NOT NULL,
     contributed integer NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS team_members_team_idx ON team_members (team_id)`,
  `CREATE TABLE IF NOT EXISTS team_projects (
     team_id text PRIMARY KEY,
     kind text NOT NULL,
     target integer NOT NULL,
     progress integer NOT NULL DEFAULT 0,
     milestones_hit jsonb NOT NULL,
     started_at bigint NOT NULL
   )`,
];

export async function migrate(url: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    for (const stmt of DDL) await sql.unsafe(stmt);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// CLI entry: `npm run db:migrate`
const isMain = process.argv[1]?.endsWith('migrate.ts');
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  migrate(url)
    .then(() => {
      console.log('migrated ✓');
      process.exit(0);
    })
    .catch((e) => {
      console.error('migration failed', e);
      process.exit(1);
    });
}
