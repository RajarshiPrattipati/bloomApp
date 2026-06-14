// Registry of players with an open Golden Hour, so real helpers can discover
// targets. In-process (consistent with PresenceHub); for multi-instance use a
// Redis sorted set keyed by expiry (TODO, GDD §18).

export class LiveGoldenHours {
  private map = new Map<string, number>(); // playerId → expiresAt (epoch ms)

  register(playerId: string, expiresAt: number): void {
    this.map.set(playerId, expiresAt);
  }

  unregister(playerId: string): void {
    this.map.delete(playerId);
  }

  /** Up to `limit` players (excluding self) with a still-open Golden Hour. */
  list(excludePlayerId: string, now: number, limit: number): string[] {
    const out: string[] = [];
    for (const [pid, exp] of this.map) {
      if (exp <= now) {
        this.map.delete(pid);
        continue;
      }
      if (pid === excludePlayerId) continue;
      out.push(pid);
      if (out.length >= limit) break;
    }
    return out;
  }
}
