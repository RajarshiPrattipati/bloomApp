import { defineConfig } from 'vite';

// Proxy /api and /ws to the production server (:4000) so the client runs with no
// CORS friction (and works in the iOS Simulator, where localhost == host).
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
