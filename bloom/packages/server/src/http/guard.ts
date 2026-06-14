// Request guard: timestamp-skew → HMAC signature → one-time nonce → JWT auth.
// Applied as a preHandler to protected routes. Order matters: we verify the
// signature before consuming the nonce so a forged request can't burn a nonce.

import { ERROR, HEADERS, SIGNATURE_SKEW_MS } from '@bloom/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { NonceStore } from '../ports/cache.js';
import type { AuthService } from '../services/authService.js';
import { sendError } from './errors.js';
import { verifySignature } from './signing.js';

export interface GuardDeps {
  auth: AuthService;
  nonces: NonceStore;
  hmacSecret: string;
  now: () => number;
}

function header(req: FastifyRequest, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export function makeGuard(deps: GuardDeps, opts: { requireAuth: boolean }) {
  return async function guard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const nonce = header(req, HEADERS.nonce);
    const ts = header(req, HEADERS.timestamp);
    const sig = header(req, HEADERS.signature);
    if (!nonce || !ts || !sig) return sendError(reply, 401, ERROR.badSignature, 'missing signature headers');

    // 1) timestamp skew
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(deps.now() - tsNum) > SIGNATURE_SKEW_MS) {
      return sendError(reply, 401, ERROR.staleRequest, 'request timestamp outside allowed window');
    }

    // 2) signature over (nonce . ts . rawBody)
    const rawBody = req.rawBody ?? '';
    if (!verifySignature(deps.hmacSecret, nonce, ts, rawBody, sig)) {
      return sendError(reply, 401, ERROR.badSignature, 'signature mismatch');
    }

    // 3) one-time nonce (replay protection)
    if (!(await deps.nonces.useOnce(nonce))) {
      return sendError(reply, 401, ERROR.replay, 'nonce already used');
    }

    // 4) auth (JWT) for protected routes
    if (opts.requireAuth) {
      const authz = header(req, HEADERS.auth);
      const token = authz?.startsWith('Bearer ') ? authz.slice(7) : undefined;
      const playerId = token ? await deps.auth.verify(token) : null;
      if (!playerId) return sendError(reply, 401, ERROR.unauthorized, 'invalid or missing token');
      req.playerId = playerId;
    }
  };
}
