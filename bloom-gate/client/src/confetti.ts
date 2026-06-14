// Zero-asset confetti + spark burst (Phase 5 juice). Procedural, cheap.
import { Container, Graphics } from 'pixi.js';

interface P {
  g: Graphics;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
}

const COLORS = [0xe8b04b, 0xff7a3d, 0x3f7d5a, 0xf3e9d8, 0xf6cf86, 0x6fae8a];

export class ConfettiLayer {
  layer = new Container();
  private parts: P[] = [];

  burst(x: number, y: number, count = 26, power = 0.5) {
    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      const col = COLORS[(Math.random() * COLORS.length) | 0];
      const s = 4 + Math.random() * 5;
      g.rect(-s / 2, -s / 2, s, s * (0.5 + Math.random())).fill({ color: col });
      g.position.set(x, y);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const sp = power * (0.4 + Math.random());
      this.layer.addChild(g);
      this.parts.push({
        g,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 0.2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        life: 0,
        max: 900 + Math.random() * 600,
      });
    }
  }

  update(dt: number) {
    const g = 0.0016 * dt;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      p.vy += g;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.rotation += p.vr * (dt / 16);
      p.g.alpha = Math.max(0, 1 - p.life / p.max);
      if (p.life >= p.max) {
        this.layer.removeChild(p.g);
        p.g.destroy();
        this.parts.splice(i, 1);
      }
    }
  }
}
