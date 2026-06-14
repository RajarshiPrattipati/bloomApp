// IAP receipt verification. Real Apple/Google verifiers are structured with the
// production call sites stubbed; a Sandbox verifier keeps dev/tests runnable
// without store credentials. NEVER trust a client purchase claim (GDD §18).

import { BALANCE } from '@bloom/shared';

export type ProductKind = 'spins' | 'season_pass' | 'boost_sub';

export interface ProductDef {
  sku: string;
  kind: ProductKind;
  inr: number;
  spins?: number;
}

export function findProduct(productId: string): ProductDef | null {
  const pack = BALANCE.iap.spinPacks.find((p) => p.sku === productId);
  if (pack) return { sku: pack.sku, kind: 'spins', inr: pack.inr, spins: pack.spins };
  if (productId === BALANCE.iap.seasonPass.sku) return { sku: productId, kind: 'season_pass', inr: BALANCE.iap.seasonPass.inr };
  if (productId === BALANCE.iap.boostSub.sku) return { sku: productId, kind: 'boost_sub', inr: BALANCE.iap.boostSub.inr };
  return null;
}

export interface VerifyInput {
  platform: 'ios' | 'android';
  productId: string;
  receipt: string;
  transactionId: string;
}

export interface VerifyResult {
  valid: boolean;
  amountInr?: number;
}

export interface ReceiptVerifier {
  verify(input: VerifyInput): Promise<VerifyResult>;
}

/** Dev/test verifier: accepts a receipt of the form `sandbox-ok:<productId>`. */
export class SandboxVerifier implements ReceiptVerifier {
  async verify(input: VerifyInput): Promise<VerifyResult> {
    const product = findProduct(input.productId);
    if (!product) return { valid: false };
    const valid = input.receipt === `sandbox-ok:${input.productId}`;
    return { valid, amountInr: product.inr };
  }
}

/** Apple App Store Server API verifier (production stub). */
export class AppleVerifier implements ReceiptVerifier {
  constructor(private sharedSecret: string) {}
  async verify(input: VerifyInput): Promise<VerifyResult> {
    // TODO(prod): POST the signed JWS receipt to Apple's verifyReceipt / App Store
    // Server API, validate the bundle id + product id + transaction id, and read
    // the price. Until configured, reject so we never grant on an unverified claim.
    if (!this.sharedSecret) return { valid: false };
    void input;
    throw new Error('AppleVerifier not implemented — configure APPLE_SHARED_SECRET and the App Store Server API client');
  }
}

/** Google Play Developer API verifier (production stub). */
export class GoogleVerifier implements ReceiptVerifier {
  constructor(private serviceAccountJson: string) {}
  async verify(input: VerifyInput): Promise<VerifyResult> {
    // TODO(prod): call purchases.products.get / purchases.subscriptions.get with a
    // service-account token; validate purchaseState + productId + orderId.
    if (!this.serviceAccountJson) return { valid: false };
    void input;
    throw new Error('GoogleVerifier not implemented — configure GOOGLE_SERVICE_ACCOUNT_JSON');
  }
}

/** Choose a verifier: real if credentials are present, else sandbox (non-prod). */
export function selectVerifier(
  platform: 'ios' | 'android',
  env: { NODE_ENV: string; APPLE_SHARED_SECRET?: string | undefined; GOOGLE_SERVICE_ACCOUNT_JSON?: string | undefined },
): ReceiptVerifier {
  if (platform === 'ios' && env.APPLE_SHARED_SECRET) return new AppleVerifier(env.APPLE_SHARED_SECRET);
  if (platform === 'android' && env.GOOGLE_SERVICE_ACCOUNT_JSON) return new GoogleVerifier(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (env.NODE_ENV === 'production') {
    throw new Error(`no production verifier configured for ${platform}`);
  }
  return new SandboxVerifier();
}
