// Runtime-validated contracts (zod). Server validates every inbound payload with
// these; client infers its types from the same source. One shape, two consumers.

import { z } from 'zod';

export const OutcomeKindSchema = z.enum([
  'coins',
  'help_tokens',
  'build_boost',
  'mystery_gift',
  'extra_spins',
  'rare_card',
  'jackpot',
  'momentum_spark',
]);
export type OutcomeKind = z.infer<typeof OutcomeKindSchema>;

export const CardRaritySchema = z.enum(['common', 'rare', 'epic', 'legendary']);

// ── entities ──────────────────────────────────────────────────────────────────
export const WalletSchema = z.object({
  coins: z.number().int().nonnegative(),
  spins: z.number().int().nonnegative(),
  helpTokens: z.number().int().nonnegative(),
  rareCards: z.number().int().nonnegative(),
  buildBoost: z.boolean(),
  level: z.number().int().positive(),
  helpXp: z.number().int().nonnegative(),
  momentum: z.number().min(1).max(3),
  boostActive: z.boolean(),
  passActive: z.boolean(),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const VillageSchema = z.object({
  buildingsBuilt: z.number().int().nonnegative(),
  slotsPerVillage: z.number().int().positive(),
  currentIndex: z.number().int().nonnegative(),
  constructing: z.boolean(),
});
export type Village = z.infer<typeof VillageSchema>;

export const GoldenHourViewSchema = z
  .object({
    buildingIndex: z.number().int().nonnegative(),
    msLeft: z.number().int().nonnegative(),
    durationMs: z.number().int().positive(),
    helpers: z.number().int().nonnegative(),
    maxHelpers: z.number().int().positive(),
  })
  .nullable();
export type GoldenHourView = z.infer<typeof GoldenHourViewSchema>;

export const StrangerWindowSchema = z.object({
  botId: z.number().int().nonnegative(),
  windowIndex: z.number().int().nonnegative(),
  name: z.string(),
  building: z.string(),
  progress: z.number().min(0).max(1),
  msLeft: z.number().int().nonnegative(),
});
export type StrangerWindow = z.infer<typeof StrangerWindowSchema>;

// ── world events (discriminated union) ────────────────────────────────────────
export const WorldEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('helper_joined'), name: z.string(), helpers: z.number().int() }),
  z.object({ type: z.literal('gh_milestone'), helpers: z.number().int(), spins: z.number().int(), coins: z.number().int() }),
  z.object({ type: z.literal('gh_closed'), helpers: z.number().int(), benefitPct: z.number().int(), refund: z.number().int(), buildingsBuilt: z.number().int() }),
  z.object({ type: z.literal('help_given'), name: z.string(), coins: z.number().int(), momentum: z.number() }),
  z.object({ type: z.literal('thank_you'), fromBot: z.string(), spins: z.number().int() }),
  z.object({ type: z.literal('momentum_warning'), momentum: z.number() }),
  z.object({ type: z.literal('card_dropped'), rarity: CardRaritySchema, cardId: z.string() }),
  z.object({ type: z.literal('set_completed'), setId: z.string(), bonusPct: z.number(), spins: z.number().int() }),
]);
export type WorldEvent = z.infer<typeof WorldEventSchema>;

export const SpinResultSchema = z.object({
  spinId: z.number().int().positive(),
  kind: OutcomeKindSchema,
  icon: z.string(),
  label: z.string(),
  coinsAwarded: z.number().int().nonnegative(),
  tokensAwarded: z.number().int().nonnegative(),
  extraSpins: z.number().int().nonnegative(),
  cardsAwarded: z.number().int().nonnegative(),
  momentumBefore: z.number(),
  momentumAfter: z.number(),
  hot: z.boolean(),
});
export type SpinResult = z.infer<typeof SpinResultSchema>;

// ── the canonical world view returned by every action ─────────────────────────
export const ViewSchema = z.object({
  wallet: WalletSchema,
  village: VillageSchema,
  goldenHour: GoldenHourViewSchema,
  strangerPool: z.array(StrangerWindowSchema),
  nextBuildCost: z.number().int().nonnegative(),
  canBuild: z.boolean(),
  events: z.array(WorldEventSchema),
});
export type View = z.infer<typeof ViewSchema>;

// ── auth ──────────────────────────────────────────────────────────────────────
export const DeviceRegisterRequestSchema = z.object({
  deviceId: z.string().min(8).max(128),
  platform: z.enum(['ios', 'android', 'web']),
  appVersion: z.string().max(32).optional(),
});
export type DeviceRegisterRequest = z.infer<typeof DeviceRegisterRequestSchema>;

export const AuthTokenResponseSchema = z.object({
  token: z.string(),
  playerId: z.string().uuid(),
  expiresInSec: z.number().int().positive(),
});
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;

// ── action requests (body shapes; auth is via header, not body) ───────────────
export const EmptyActionSchema = z.object({}).strict();
export const HelpRequestSchema = z.object({ botId: z.number().int().nonnegative() }).strict();
export type HelpRequest = z.infer<typeof HelpRequestSchema>;

export const HelpPlayerRequestSchema = z.object({ targetPlayerId: z.string().uuid() }).strict();
export type HelpPlayerRequest = z.infer<typeof HelpPlayerRequestSchema>;

export const LiveGoldenHourSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  buildingIndex: z.number().int().nonnegative(),
  msLeft: z.number().int().nonnegative(),
  helpers: z.number().int().nonnegative(),
  maxHelpers: z.number().int().positive(),
});
export type LiveGoldenHour = z.infer<typeof LiveGoldenHourSchema>;

export const PurchaseVerifyRequestSchema = z.object({
  platform: z.enum(['ios', 'android']),
  productId: z.string().min(1).max(128),
  receipt: z.string().min(1),
  transactionId: z.string().min(1).max(256),
}).strict();
export type PurchaseVerifyRequest = z.infer<typeof PurchaseVerifyRequestSchema>;

// ── teams (GDD §10) ───────────────────────────────────────────────────────────
export const TeamCreateRequestSchema = z.object({ name: z.string().min(3).max(24) }).strict();
export type TeamCreateRequest = z.infer<typeof TeamCreateRequestSchema>;

export const TeamJoinRequestSchema = z.object({ teamId: z.string().uuid() }).strict();
export type TeamJoinRequest = z.infer<typeof TeamJoinRequestSchema>;

export const TeamContributeRequestSchema = z.object({ amount: z.number().int().positive() }).strict();
export type TeamContributeRequest = z.infer<typeof TeamContributeRequestSchema>;

export const TeamProjectViewSchema = z.object({
  kind: z.string(),
  target: z.number().int().positive(),
  progress: z.number().int().nonnegative(),
  pct: z.number().int().min(0).max(100),
  milestonesHit: z.array(z.number().int()),
});
export type TeamProjectView = z.infer<typeof TeamProjectViewSchema>;

export const TeamMemberViewSchema = z.object({
  playerId: z.string(),
  contributed: z.number().int().nonnegative(),
  joinedAt: z.number().int(),
});

export const TeamViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string(),
  memberCount: z.number().int().nonnegative(),
  members: z.array(TeamMemberViewSchema),
  project: TeamProjectViewSchema.nullable(),
});
export type TeamView = z.infer<typeof TeamViewSchema>;

export const TeamSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  memberCount: z.number().int().nonnegative(),
});
export type TeamSummary = z.infer<typeof TeamSummarySchema>;

// ── season pass ───────────────────────────────────────────────────────────────
export const PassStatusSchema = z.object({
  tier: z.number().int().nonnegative(),
  maxTier: z.number().int().positive(),
  xp: z.number().int().nonnegative(),
  xpPerTier: z.number().int().positive(),
  xpIntoTier: z.number().int().nonnegative(),
  active: z.boolean(),
  claimableFree: z.number().int().nonnegative(),
  claimablePremium: z.number().int().nonnegative(),
});
export type PassStatus = z.infer<typeof PassStatusSchema>;

export const ClientTelemetrySchema = z.object({
  type: z.string().min(1).max(64),
  data: z.record(z.unknown()).optional(),
}).strict();
export type ClientTelemetry = z.infer<typeof ClientTelemetrySchema>;

// ── error envelope ────────────────────────────────────────────────────────────
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
