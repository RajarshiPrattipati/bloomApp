// WebCrypto HMAC-SHA256 (hex) — matches the server's signing scheme.

let keyPromise: Promise<CryptoKey> | null = null;

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }
  return keyPromise;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newNonce(): string {
  return crypto.randomUUID();
}

export function newDeviceId(): string {
  return 'web-' + crypto.randomUUID();
}
