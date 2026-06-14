// Stacked toast manager — gratitude pings, milestones, set completions, etc.
import { Container, Graphics, Text, TextStyle } from 'pixi.js';

interface Toast {
  c: Container;
  life: number;
  max: number;
}

export class ToastLayer {
  layer = new Container();
  private toasts: Toast[] = [];

  constructor(private anchor: () => { cx: number; y: number }) {}

  push(text: string, color = 0xf3e9d8, accent = 0x3f7d5a): void {
    const c = new Container();
    const label = new Text({
      text,
      style: new TextStyle({ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 15, fill: color, fontWeight: '700' }),
    });
    label.anchor.set(0.5);
    const w = label.width + 32;
    const h = 34;
    const bg = new Graphics();
    bg.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: 0x241a12, alpha: 0.97 }).stroke({ width: 2, color: accent });
    c.addChild(bg, label);
    c.alpha = 0;
    this.layer.addChild(c);
    this.toasts.push({ c, life: 0, max: 2600 });
    if (this.toasts.length > 4) {
      const old = this.toasts.shift()!;
      this.layer.removeChild(old.c);
      old.c.destroy({ children: true });
    }
    this.relayout();
  }

  private relayout(): void {
    const { cx, y } = this.anchor();
    let yy = y;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i]!.c.position.set(cx, yy);
      yy += 42;
    }
  }

  update(dt: number): void {
    let changed = false;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i]!;
      t.life += dt;
      const p = t.life / t.max;
      t.c.alpha = p < 0.12 ? p / 0.12 : p > 0.82 ? Math.max(0, (1 - p) / 0.18) : 1;
      t.c.scale.set(p < 0.12 ? 0.8 + 0.2 * (p / 0.12) : 1);
      if (t.life >= t.max) {
        this.layer.removeChild(t.c);
        t.c.destroy({ children: true });
        this.toasts.splice(i, 1);
        changed = true;
      }
    }
    if (changed) this.relayout();
  }
}
