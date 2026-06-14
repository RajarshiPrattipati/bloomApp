// PresenceHub — in-process channel pub/sub for live Golden Hours & team rooms.
// Socket-agnostic (testable). For multi-instance fan-out, back this with Redis
// pub/sub (GDD §18); the interface stays the same.

export interface Connection {
  readonly playerId: string;
  send(data: string): void;
}

export class PresenceHub {
  private channels = new Map<string, Set<Connection>>();

  subscribe(channel: string, conn: Connection): void {
    let set = this.channels.get(channel);
    if (!set) {
      set = new Set();
      this.channels.set(channel, set);
    }
    set.add(conn);
  }

  unsubscribe(channel: string, conn: Connection): void {
    const set = this.channels.get(channel);
    if (set) {
      set.delete(conn);
      if (set.size === 0) this.channels.delete(channel);
    }
  }

  unsubscribeAll(conn: Connection): void {
    for (const [channel, set] of this.channels) {
      set.delete(conn);
      if (set.size === 0) this.channels.delete(channel);
    }
  }

  count(channel: string): number {
    return this.channels.get(channel)?.size ?? 0;
  }

  broadcast(channel: string, message: object, except?: Connection): void {
    const set = this.channels.get(channel);
    if (!set) return;
    const data = JSON.stringify(message);
    for (const conn of set) {
      if (conn === except) continue;
      try {
        conn.send(data);
      } catch {
        this.unsubscribeAll(conn);
      }
    }
  }
}
