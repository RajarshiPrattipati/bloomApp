import { defineConfig } from 'vite';

// The client talks to the Fastify server via /api, proxied here so there are no
// CORS or port headaches inside the iOS Simulator (localhost == host).
export default defineConfig({
  server: {
    host: true, // listen on 0.0.0.0 so the Simulator / LAN devices can reach it
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
