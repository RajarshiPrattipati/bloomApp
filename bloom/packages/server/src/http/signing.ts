// HMAC request signing. The client signs (nonce . timestamp . rawBody) with a
// per-release secret; the server recomputes and constant-time compares. Combined
// with a one-time nonce + timestamp skew window, this defeats replay & tampering.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function signPayload(secret: string, nonce: string, ts: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${nonce}.${ts}.${rawBody}`).digest('hex');
}

export function verifySignature(
  secret: string,
  nonce: string,
  ts: string,
  rawBody: string,
  provided: string,
): boolean {
  const expected = signPayload(secret, nonce, ts, rawBody);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
