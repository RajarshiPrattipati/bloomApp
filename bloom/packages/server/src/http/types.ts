// Fastify request augmentation: rawBody (for signature) + playerId (post-auth).
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
    playerId?: string;
  }
}
