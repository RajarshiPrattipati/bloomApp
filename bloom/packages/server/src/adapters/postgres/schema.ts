// Drizzle schema. Fast-moving aggregate gameplay state lives in a JSONB column
// (game_states.state); queryable concerns (players, purchases, help edges,
// suspicion) are normalised. Timestamps are epoch-ms bigints (match the domain).

import { bigint, doublePrecision, integer, jsonb, pgTable, serial, text } from 'drizzle-orm/pg-core';

export const players = pgTable('players', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().unique(),
  platform: text('platform').notNull(),
  appVersion: text('app_version'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  lifetimeSpendInr: integer('lifetime_spend_inr').notNull().default(0),
});

export const gameStates = pgTable('game_states', {
  playerId: text('player_id').primaryKey(),
  state: jsonb('state').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const helpEdges = pgTable('help_edges', {
  id: serial('id').primaryKey(),
  fromId: text('from_id').notNull(),
  toId: text('to_id').notNull(),
  ts: bigint('ts', { mode: 'number' }).notNull(),
});

export const suspicion = pgTable('suspicion', {
  playerId: text('player_id').primaryKey(),
  score: doublePrecision('score').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const purchases = pgTable('purchases', {
  transactionId: text('transaction_id').primaryKey(),
  playerId: text('player_id').notNull(),
  productId: text('product_id').notNull(),
  platform: text('platform').notNull(),
  amountInr: integer('amount_inr').notNull(),
  verifiedAt: bigint('verified_at', { mode: 'number' }).notNull(),
});

export const teams = pgTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const teamMembers = pgTable('team_members', {
  teamId: text('team_id').notNull(),
  playerId: text('player_id').primaryKey(), // a player is in at most one team
  joinedAt: bigint('joined_at', { mode: 'number' }).notNull(),
  contributed: integer('contributed').notNull().default(0),
});

export const teamProjects = pgTable('team_projects', {
  teamId: text('team_id').primaryKey(),
  kind: text('kind').notNull(),
  target: integer('target').notNull(),
  progress: integer('progress').notNull().default(0),
  milestonesHit: jsonb('milestones_hit').notNull(),
  startedAt: bigint('started_at', { mode: 'number' }).notNull(),
});
