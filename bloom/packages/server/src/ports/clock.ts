// Clock port — injected so the domain never reads wall-clock directly and tests
// stay deterministic.
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export class FixedClock implements Clock {
  constructor(private t: number) {}
  now(): number {
    return this.t;
  }
  set(t: number): void {
    this.t = t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}
