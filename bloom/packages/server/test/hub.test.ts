import { describe, expect, it } from 'vitest';
import { PresenceHub, type Connection } from '../src/realtime/hub.js';

function fakeConn(playerId: string, sink: string[]): Connection {
  return { playerId, send: (d) => sink.push(d) };
}

describe('PresenceHub', () => {
  it('broadcasts to channel subscribers, excluding the sender', () => {
    const hub = new PresenceHub();
    const aOut: string[] = [];
    const bOut: string[] = [];
    const a = fakeConn('A', aOut);
    const b = fakeConn('B', bOut);
    hub.subscribe('team:1', a);
    hub.subscribe('team:1', b);
    expect(hub.count('team:1')).toBe(2);

    hub.broadcast('team:1', { hello: 'world' }, a);
    expect(aOut).toHaveLength(0);
    expect(bOut).toHaveLength(1);
    expect(JSON.parse(bOut[0]!)).toEqual({ hello: 'world' });
  });

  it('cleans up channels on unsubscribeAll', () => {
    const hub = new PresenceHub();
    const a = fakeConn('A', []);
    hub.subscribe('c1', a);
    hub.subscribe('c2', a);
    hub.unsubscribeAll(a);
    expect(hub.count('c1')).toBe(0);
    expect(hub.count('c2')).toBe(0);
  });

  it('survives a throwing socket by evicting it', () => {
    const hub = new PresenceHub();
    const good: string[] = [];
    const bad: Connection = { playerId: 'X', send: () => { throw new Error('dead socket'); } };
    hub.subscribe('c', bad);
    hub.subscribe('c', fakeConn('G', good));
    hub.broadcast('c', { ping: 1 });
    expect(good).toHaveLength(1);
    expect(hub.count('c')).toBe(1); // dead one evicted
  });
});
