// Auth: device → player → signed JWT. Stateless verification on every request.

import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { AppContext } from '../app/context.js';

const TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

export class AuthService {
  private secret: Uint8Array;
  constructor(private ctx: AppContext) {
    this.secret = new TextEncoder().encode(ctx.env.JWT_SECRET);
  }

  async registerDevice(
    deviceId: string,
    platform: 'ios' | 'android' | 'web',
    appVersion?: string,
  ): Promise<{ token: string; playerId: string; expiresInSec: number }> {
    let player = await this.ctx.repos.players.getByDeviceId(deviceId);
    if (!player) {
      player = await this.ctx.repos.players.create({
        id: randomUUID(),
        deviceId,
        platform,
        appVersion,
        createdAt: this.ctx.clock.now(),
        lifetimeSpendInr: 0,
      });
      this.ctx.log.info({ playerId: player.id, platform }, 'player created');
    }
    const token = await this.issue(player.id);
    return { token, playerId: player.id, expiresInSec: TOKEN_TTL_SEC };
  }

  async issue(playerId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(playerId)
      .setIssuedAt()
      .setExpirationTime(`${TOKEN_TTL_SEC}s`)
      .sign(this.secret);
  }

  async verify(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
