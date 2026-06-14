// Zero-asset juice: WebAudio blips synthesised on the fly. iOS requires the
// context to be resumed on a user gesture.

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.01);
}

function blip(freq: number, durMs: number, type: OscillatorType = 'square', vol = 0.06): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + durMs / 1000);
}

export const sfx = {
  tick: (p: number) => blip(220 + p * 660, 32, 'square', 0.035),
  common: () => blip(440, 90, 'triangle', 0.06),
  win: () => { blip(660, 110, 'triangle', 0.07); setTimeout(() => blip(880, 140, 'triangle', 0.07), 90); },
  jackpot: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 160, 'sawtooth', 0.08), i * 80)),
  spark: () => { blip(900, 80, 'sawtooth', 0.07); setTimeout(() => blip(1300, 120, 'sawtooth', 0.07), 70); },
  build: () => { blip(330, 90, 'square', 0.07); setTimeout(() => blip(494, 150, 'triangle', 0.08), 80); },
  gratitude: () => [659, 880].forEach((f, i) => setTimeout(() => blip(f, 130, 'sine', 0.07), i * 90)),
  milestone: () => [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 130, 'triangle', 0.08), i * 70)),
  help: () => { blip(587, 70, 'sine', 0.06); setTimeout(() => blip(784, 100, 'sine', 0.06), 60); },
  tap: () => blip(300, 40, 'sine', 0.04),
};
