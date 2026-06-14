// Client build config. The HMAC secret is baked into the build and rotated per
// release (it raises the bar for trivial request forgery; the server remains the
// sole authority). Defaults match the server's dev secret so local runs work.

export const CONFIG = {
  apiBase: (import.meta.env.VITE_API_BASE as string) || '', // '' = same-origin (Vite proxy)
  hmacSecret: (import.meta.env.VITE_HMAC_SECRET as string) || 'dev-only-insecure-secret-please-change-32++',
  appVersion: (import.meta.env.VITE_APP_VERSION as string) || '0.1.0',
  platform: 'web' as const,
  // WebSocket presence is opt-in. Off by default so the pure-serverless (Vercel)
  // build relies solely on /api/sync polling; flip to '1' with a persistent server.
  realtime: import.meta.env.VITE_REALTIME === '1',
};
