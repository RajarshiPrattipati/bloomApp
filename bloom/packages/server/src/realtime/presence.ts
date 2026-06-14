// WebSocket presence wiring (@fastify/websocket). Auth via ?token=<jwt> (browsers
// can't set WS headers). Clients subscribe to channels (their Golden Hour, their
// team) and receive live pings. Hub is decorated onto the app for services to use.

import websocket from '@fastify/websocket';
import type { AppContext } from '../app/context.js';
import type { AppServer } from '../http/server.js';
import { AuthService } from '../services/authService.js';
import { PresenceHub, type Connection } from './hub.js';

declare module 'fastify' {
  interface FastifyInstance {
    presence: PresenceHub;
  }
}

// The hub is created in the composition root and decorated onto the app in
// buildServer; here we just attach the WebSocket transport to it.

interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  channel?: string;
}

export async function registerRealtime(app: AppServer, ctx: AppContext): Promise<PresenceHub> {
  const hub = app.presence; // shared hub, decorated in buildServer
  const auth = new AuthService(ctx);

  await app.register(websocket);

  app.get('/ws', { websocket: true }, async (socket, req) => {
    const token = (req.query as { token?: string }).token;
    const playerId = token ? await auth.verify(token) : null;
    if (!playerId) {
      socket.send(JSON.stringify({ type: 'error', code: 'unauthorized' }));
      socket.close();
      return;
    }

    const conn: Connection = { playerId, send: (d) => socket.send(d) };
    // each player has a personal channel for gratitude / Golden Hour rally pings
    hub.subscribe(`player:${playerId}`, conn);
    socket.send(JSON.stringify({ type: 'connected', playerId }));

    socket.on('message', (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', ts: ctx.clock.now() }));
      } else if (msg.type === 'subscribe' && msg.channel) {
        hub.subscribe(msg.channel, conn);
        hub.broadcast(msg.channel, { type: 'presence', channel: msg.channel, count: hub.count(msg.channel) });
      } else if (msg.type === 'unsubscribe' && msg.channel) {
        hub.unsubscribe(msg.channel, conn);
      }
    });

    socket.on('close', () => hub.unsubscribeAll(conn));
  });

  ctx.log.info('realtime presence registered at /ws');
  return hub;
}
