// PaymentService: verify a store receipt → dedupe (replay) → grant entitlement →
// record. Server-authoritative; the client's claim is never trusted on its own.

import { ERROR, type View } from '@bloom/shared';
import { advance, buildView, createGameState, grantBoost, grantPass } from '../domain/index.js';
import type { AppContext } from '../app/context.js';
import { findProduct, selectVerifier } from '../payments/verifiers.js';

export interface PurchaseResult {
  ok: boolean;
  reason?: string;
  granted?: { sku: string; spins?: number };
  view?: View;
}

export class PaymentService {
  constructor(private ctx: AppContext) {}

  async verify(
    playerId: string,
    platform: 'ios' | 'android',
    productId: string,
    receipt: string,
    transactionId: string,
  ): Promise<PurchaseResult> {
    const product = findProduct(productId);
    if (!product) return { ok: false, reason: ERROR.validation };

    // replay protection: a transaction id may be redeemed at most once
    if (await this.ctx.repos.purchases.exists(transactionId)) {
      return { ok: false, reason: ERROR.purchaseReplay };
    }

    const verifier = selectVerifier(platform, this.ctx.env);
    const result = await verifier.verify({ platform, productId, receipt, transactionId });
    if (!result.valid) return { ok: false, reason: ERROR.purchaseInvalid };

    const now = this.ctx.clock.now();
    const amountInr = result.amountInr ?? product.inr;

    // grant entitlement
    let state = await this.ctx.repos.gameStates.load(playerId);
    if (!state) {
      state = createGameState(playerId, now, 0, 0, 1);
    }
    if (product.kind === 'spins' && product.spins) {
      state.spins += product.spins;
    } else if (product.kind === 'boost_sub') {
      grantBoost(state, now); // +coins while active, richer daily spins
    } else if (product.kind === 'season_pass') {
      grantPass(state, now);
    }
    advance(state, now);
    await this.ctx.repos.gameStates.save(state);

    await this.ctx.repos.purchases.record({ transactionId, playerId, productId, platform, amountInr, verifiedAt: now });
    await this.ctx.repos.players.addSpend(playerId, amountInr);

    this.ctx.log.info({ playerId, productId, amountInr, transactionId }, 'purchase granted');
    return {
      ok: true,
      granted: { sku: product.sku, ...(product.spins !== undefined ? { spins: product.spins } : {}) },
      view: buildView(state, now),
    };
  }
}
