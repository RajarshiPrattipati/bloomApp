// Fastify composition: content-type parsing (raw body for signing), security
// guards, rate limiting, routes, and a uniform error handler.

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import {
  ClientTelemetrySchema,
  DeviceRegisterRequestSchema,
  ERROR,
  HelpPlayerRequestSchema,
  HelpRequestSchema,
  PurchaseVerifyRequestSchema,
  TeamContributeRequestSchema,
  TeamCreateRequestSchema,
  TeamJoinRequestSchema,
  publicConfig,
  type ErrorCode,
} from '@bloom/shared';
import Fastify from 'fastify';
import { ZodError, type ZodSchema } from 'zod';
import type { AppContext } from '../app/context.js';
import { NonceStore } from '../ports/cache.js';
import { PresenceHub } from '../realtime/hub.js';
import { AntiCheatService } from '../services/antiCheatService.js';
import { AuthService } from '../services/authService.js';
import { GameService } from '../services/gameService.js';
import { LiveGoldenHours } from '../services/liveGoldenHours.js';
import { PaymentService } from '../services/paymentService.js';
import { TeamService } from '../services/teamService.js';
import { ApiError, sendError } from './errors.js';
import { makeGuard } from './guard.js';
import './types.js';

export interface Services {
  auth: AuthService;
  antiCheat: AntiCheatService;
  game: GameService;
  payments: PaymentService;
  teams: TeamService;
  presence: PresenceHub;
  nonces: NonceStore;
}

export function buildServices(ctx: AppContext): Services {
  const auth = new AuthService(ctx);
  const antiCheat = new AntiCheatService(ctx);
  const presence = new PresenceHub();
  const game = new GameService(ctx, antiCheat, new LiveGoldenHours(), presence);
  const payments = new PaymentService(ctx);
  const teams = new TeamService(ctx);
  const nonces = new NonceStore(ctx.cache, 600);
  return { auth, antiCheat, game, payments, teams, presence, nonces };
}

function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new ApiError(400, ERROR.validation, r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}

export async function buildServer(ctx: AppContext, services = buildServices(ctx)) {
  const app = Fastify({
    loggerInstance: ctx.log,
    genReqId: () => cryptoRandomId(),
    trustProxy: true,
  });

  // capture the raw body so the signature can be verified byte-for-byte
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as { rawBody?: string }).rawBody = body as string;
    try {
      done(null, body && (body as string).length ? JSON.parse(body as string) : {});
    } catch (err) {
      done(err as Error);
    }
  });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute', cache: 10000 });

  // shared presence hub (also used by the WS layer in registerRealtime)
  app.decorate('presence', services.presence);

  const guardDeps = { auth: services.auth, nonces: services.nonces, hmacSecret: ctx.env.HMAC_SECRET, now: () => ctx.clock.now() };
  const signedOnly = makeGuard(guardDeps, { requireAuth: false });
  const full = makeGuard(guardDeps, { requireAuth: true });

  // ── open routes ──
  app.get('/api/health', async () => ({ ok: true, ts: ctx.clock.now() }));
  app.get('/api/config', async () => publicConfig());

  // ── auth: device register (signed, no JWT yet) ──
  app.post('/api/auth/device', { preHandler: signedOnly }, async (req) => {
    const body = parseBody(DeviceRegisterRequestSchema, req.body);
    return services.auth.registerDevice(body.deviceId, body.platform, body.appVersion);
  });

  // ── core loop (signed + authed) ──
  const authed = { preHandler: full };
  app.post('/api/session', authed, async (req) => services.game.session(req.playerId!));
  app.post('/api/sync', authed, async (req) => services.game.sync(req.playerId!));
  app.post('/api/spin', { preHandler: full, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) =>
    services.game.spin(req.playerId!),
  );
  app.post('/api/build', authed, async (req) => services.game.build(req.playerId!));
  app.post('/api/cards', authed, async (req) => services.game.collection(req.playerId!));
  app.post('/api/pass', authed, async (req) => services.game.passStatus(req.playerId!));
  app.post('/api/pass/claim', authed, async (req) => services.game.passClaim(req.playerId!));
  app.post('/api/quests', authed, async (req) => services.game.quests(req.playerId!));
  app.post('/api/quests/claim', authed, async (req) => services.game.questsClaim(req.playerId!));
  app.post('/api/help', authed, async (req) => {
    const body = parseBody(HelpRequestSchema, req.body);
    return services.game.help(req.playerId!, body.botId);
  });
  app.post('/api/help/live', authed, async (req) => services.game.listLive(req.playerId!));
  app.post('/api/help/player', authed, async (req) => {
    const body = parseBody(HelpPlayerRequestSchema, req.body);
    return services.game.helpPlayer(req.playerId!, body.targetPlayerId);
  });

  // ── teams ──
  app.post('/api/team/create', authed, async (req) => {
    const body = parseBody(TeamCreateRequestSchema, req.body);
    return services.teams.create(req.playerId!, body.name);
  });
  app.post('/api/team/join', authed, async (req) => {
    const body = parseBody(TeamJoinRequestSchema, req.body);
    return services.teams.join(req.playerId!, body.teamId);
  });
  app.post('/api/team/leave', authed, async (req) => services.teams.leave(req.playerId!));
  app.post('/api/team', authed, async (req) => services.teams.getMine(req.playerId!));
  app.post('/api/team/list', authed, async () => services.teams.list());
  app.post('/api/team/contribute', authed, async (req) => {
    const body = parseBody(TeamContributeRequestSchema, req.body);
    const res = await services.teams.contribute(req.playerId!, body.amount);
    // live rally ping to the rest of the team
    if (res.ok && res.team) {
      services.presence.broadcast(`team:${res.team.id}`, {
        type: 'team_contribution',
        by: req.playerId,
        pct: res.team.project?.pct ?? 0,
        crossedMilestones: res.crossedMilestones ?? [],
      });
    }
    return res;
  });

  // ── commerce ──
  app.post('/api/purchase/verify', authed, async (req) => {
    const body = parseBody(PurchaseVerifyRequestSchema, req.body);
    return services.payments.verify(req.playerId!, body.platform, body.productId, body.receipt, body.transactionId);
  });

  // ── telemetry ──
  app.post('/api/event', authed, async (req) => {
    const body = parseBody(ClientTelemetrySchema, req.body);
    ctx.log.debug({ evt: body.type, playerId: req.playerId, ...body.data }, 'client telemetry');
    return { ok: true };
  });

  // ── uniform errors ──
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) return sendError(reply, err.status, err.code, err.message);
    if (err instanceof ZodError) return sendError(reply, 400, ERROR.validation, err.issues.map((i) => i.message).join('; '));
    if ((err as { statusCode?: number }).statusCode === 429) return sendError(reply, 429, ERROR.rateLimited, 'too many requests');
    ctx.log.error({ err }, 'unhandled error');
    return sendError(reply, 500, ERROR.internal as ErrorCode, 'internal error');
  });

  return app;
}

/** The concrete Fastify instance type (with the pino logger bound in). */
export type AppServer = Awaited<ReturnType<typeof buildServer>>;

function cryptoRandomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
