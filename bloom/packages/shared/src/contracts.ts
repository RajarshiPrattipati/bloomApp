// API surface: canonical route paths, header names, and error codes shared by
// server and client. Keeping these here prevents drift between the two.

export const API = {
  health: 'GET /api/health',
  config: 'GET /api/config',
  // auth
  deviceRegister: 'POST /api/auth/device',
  // core loop (all require auth + signature)
  session: 'POST /api/session',
  sync: 'POST /api/sync',
  spin: 'POST /api/spin',
  build: 'POST /api/build',
  help: 'POST /api/help',
  helpLive: 'POST /api/help/live',
  helpPlayer: 'POST /api/help/player',
  // teams
  teamCreate: 'POST /api/team/create',
  teamJoin: 'POST /api/team/join',
  teamLeave: 'POST /api/team/leave',
  teamGet: 'POST /api/team',
  teamContribute: 'POST /api/team/contribute',
  teamList: 'POST /api/team/list',
  // cards
  cards: 'POST /api/cards',
  // season pass
  pass: 'POST /api/pass',
  passClaim: 'POST /api/pass/claim',
  // daily quests
  quests: 'POST /api/quests',
  questsClaim: 'POST /api/quests/claim',
  // commerce
  purchaseVerify: 'POST /api/purchase/verify',
  // telemetry
  event: 'POST /api/event',
} as const;

export const HEADERS = {
  auth: 'authorization', // Bearer <jwt>
  signature: 'x-bloom-signature', // HMAC of (nonce + body)
  nonce: 'x-bloom-nonce', // unique per request (replay protection)
  timestamp: 'x-bloom-ts', // client ms epoch (clock-skew window)
  appVersion: 'x-bloom-app',
} as const;

// Signature window: requests older than this (by client ts) are rejected.
export const SIGNATURE_SKEW_MS = 5 * 60 * 1000;

export const ERROR = {
  unauthorized: 'unauthorized',
  badSignature: 'bad_signature',
  replay: 'replay_detected',
  staleRequest: 'stale_request',
  validation: 'validation_error',
  notEnoughCoins: 'not_enough_coins',
  alreadyBuilding: 'already_building',
  helpWindowClosed: 'help_window_closed',
  alreadyHelped: 'already_helped',
  alreadyInTeam: 'already_in_team',
  notInTeam: 'not_in_team',
  teamFull: 'team_full',
  teamNotFound: 'team_not_found',
  rateLimited: 'rate_limited',
  purchaseInvalid: 'purchase_invalid',
  purchaseReplay: 'purchase_replay',
  internal: 'internal_error',
} as const;
export type ErrorCode = (typeof ERROR)[keyof typeof ERROR];
