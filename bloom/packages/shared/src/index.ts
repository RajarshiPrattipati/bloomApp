// @bloom/shared — the contract package. Imported by server (authoritative) and
// client (display) so the two can never drift.
export const BLOOM_SHARED_VERSION = '0.1.0';

export * from './balance.js';
export * from './schemas.js';
export * from './contracts.js';
