// GameScene — the production core-loop screen. Renders server-authoritative
// state from BloomClient; decides nothing. PixiJS v8, portrait, one thumb.

import type { PublicConfig, SpinResult, View } from '@bloom/shared';
import { Application, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';
import type { BloomClient } from '../net/client.js';
import type { Scene } from '../core/scene.js';
import { MenuOverlay } from '../ui/MenuOverlay.js';
import { ConfettiLayer } from '../ui/confetti.js';
import { ToastLayer } from '../ui/toasts.js';
import { sfx, unlockAudio } from '../audio.js';

const C = {
  bg: 0x17110c, panel: 0x2a1f16, panelEdge: 0x3d2e20,
  gold: 0xe8b04b, goldEdge: 0xf6cf86, green: 0x3f7d5a, greenEdge: 0x6fae8a,
  text: 0xf3e9d8, textDim: 0xb29a7e, fire: 0xff7a3d, fireDim: 0x5a3320, disabled: 0x4a3c2e,
};
const ICONS = ['🪙', '🎟️', '🔨', '🎁', '🔁', '🃏', '💎', '🔥'];

function txt(s: string, size: number, fill: number, weight: TextStyle['fontWeight'] = '700') {
  return new Text({ text: s, style: new TextStyle({ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: size, fill, fontWeight: weight, align: 'center' }) });
}

interface Btn {
  root: Container;
  redraw(x: number, y: number, w: number, h: number, o: { color?: number; edge?: number; enabled?: boolean; fontSize?: number; textColor?: number }): void;
  setText(s: string): void;
}

export class GameScene implements Scene {
  root = new Container();
  private app!: Application;
  private cfg!: PublicConfig;
  private view: View | null = null;
  private ui: Record<string, any> = {};
  private anim = { phase: 'idle' as 'idle' | 'spinning', elapsed: 0, flipAcc: 0, dur: 820, pending: null as SpinResult | null, pendingView: null as View | null, coinsShown: 0, momentum: 1, ghEndsAt: 0, pop: 1 };
  private collectionLabel = '🃏 0/18';
  private menu!: MenuOverlay;
  private confetti = new ConfettiLayer();
  private toasts = new ToastLayer(() => ({ cx: this.app.screen.width / 2, y: this.app.screen.height * 0.74 }));
  private floaters: { t: Text; vy: number; life: number }[] = [];
  private ws: WebSocket | null = null;
  private glow = 0;

  constructor(private client: BloomClient, cfg: PublicConfig) {
    this.cfg = cfg;
  }

  async mount(app: Application): Promise<void> {
    this.app = app;
    this.build();
    await this.client.ensureAuth();
    const v = await this.client.session();
    this.applyView(v);
    this.anim.coinsShown = v.wallet.coins;
    this.anim.momentum = v.wallet.momentum;
    this.client.event('session_start_client');
    void this.refreshCollection();
    this.connectRealtime();
    window.setInterval(() => void this.runSync(), 1500);
    // dev hook: ?menu=<tab> auto-opens the meta overlay (headless verification)
    const m = new URLSearchParams(location.search).get('menu');
    if (m) void this.menu.openTo((['quests', 'pass', 'cards', 'teams', 'shop'].includes(m) ? m : 'quests') as 'quests' | 'pass' | 'cards' | 'teams' | 'shop');
    // dev hook: ?demo=N auto-plays the loop (headless juice verification)
    const demo = new URLSearchParams(location.search).get('demo');
    if (demo) void this.runDemo(parseInt(demo, 10) || 12);
  }

  private async runDemo(n: number) {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < n; i++) {
      while (this.anim.phase !== 'idle') await wait(120);
      await this.onSpin();
      await wait(1000);
      if (this.view && this.view.canBuild && this.view.wallet.coins >= this.view.nextBuildCost) { await this.onBuild(); await wait(700); }
      if (this.view && this.view.strangerPool.length && i % 2 === 1) { await this.onHelp(this.view.strangerPool[0]!.botId); await wait(700); }
    }
  }
  unmount(): void {}

  private async refreshCollection() {
    try {
      const c = await this.client.cards();
      const owned = c.sets.reduce((a, s) => a + s.owned, 0);
      const total = c.sets.reduce((a, s) => a + s.total, 0);
      const bonus = c.totalBonusPct > 0 ? ` (+${c.totalBonusPct}%)` : '';
      this.collectionLabel = `🃏 ${owned}/${total}${bonus}`;
    } catch { /* offline */ }
  }

  private syncing = false;
  private async runSync() {
    if (this.syncing || this.anim.phase === 'spinning') return; // single-flight; don't race a spin
    this.syncing = true;
    try { this.applyView(await this.client.sync()); } catch { /* transient */ }
    finally { this.syncing = false; }
  }

  private mkBtn(onTap: () => void): Btn {
    const root = new Container();
    root.eventMode = 'static'; root.cursor = 'pointer';
    const bg = new Graphics();
    const label = txt('', 18, C.bg, '800'); label.anchor.set(0.5);
    root.addChild(bg, label);
    root.on('pointertap', () => { if ((root as any)._on) onTap(); });
    return {
      root,
      setText: (s) => (label.text = s),
      redraw: (x, y, w, h, o) => {
        const en = o.enabled !== false; (root as any)._on = en;
        bg.clear();
        bg.roundRect(x, y, w, h, Math.min(h / 2, 18)).fill({ color: en ? o.color ?? C.gold : C.disabled }).stroke({ width: 2, color: en ? o.edge ?? C.goldEdge : C.panelEdge });
        label.style.fontSize = o.fontSize ?? 18; label.style.fill = en ? o.textColor ?? C.bg : C.textDim;
        label.position.set(x + w / 2, y + h / 2);
        root.hitArea = new Rectangle(x, y, w, h);
      },
    };
  }

  private build() {
    const u = this.ui;
    u.title = txt('BLOOM', 26, C.gold, '800'); u.title.anchor.set(0.5, 0); this.root.addChild(u.title);
    u.badge = txt('', 12, C.greenEdge, '800'); u.badge.anchor.set(0.5, 0); this.root.addChild(u.badge);
    u.menuBtn = this.mkBtn(() => void this.menu.open()); u.menuBtn.setText('☰'); this.root.addChild(u.menuBtn.root);
    u.hudBg = new Graphics(); this.root.addChild(u.hudBg);
    u.mLabel = txt('MOMENTUM', 11, C.textDim); u.mLabel.anchor.set(0, 0.5);
    u.hot = txt('', 12, C.fire, '800'); u.hot.anchor.set(0, 0.5);
    u.mVal = txt('1.0×', 18, C.fire, '800'); u.mVal.anchor.set(1, 0.5);
    u.mTrack = new Graphics(); u.mFill = new Graphics();
    u.coins = txt('🪙 0', 19, C.text); u.coins.anchor.set(0, 0.5);
    u.level = txt('Lv 1', 13, C.textDim); u.level.anchor.set(0.5, 0.5);
    u.tokens = txt('🎟️ 0', 15, C.textDim); u.tokens.anchor.set(1, 0.5);
    this.root.addChild(u.mTrack, u.mFill, u.mLabel, u.hot, u.mVal, u.coins, u.level, u.tokens);

    u.villageBg = new Graphics(); this.root.addChild(u.villageBg);
    u.vTitle = txt('YOUR VILLAGE', 11, C.textDim); u.vTitle.anchor.set(0, 0.5); this.root.addChild(u.vTitle);
    u.slots = new Graphics(); this.root.addChild(u.slots);
    u.buildBtn = this.mkBtn(() => void this.onBuild()); this.root.addChild(u.buildBtn.root);
    u.ghLabel = txt('', 13, C.gold, '800'); u.ghLabel.anchor.set(0.5, 0.5);
    u.ghTrack = new Graphics(); u.ghFill = new Graphics();
    u.ghHelpers = txt('', 12, C.textDim); u.ghHelpers.anchor.set(0.5, 0.5);
    this.root.addChild(u.ghTrack, u.ghFill, u.ghLabel, u.ghHelpers);

    u.helpBg = new Graphics(); this.root.addChild(u.helpBg);
    u.hTitle = txt('HELP OTHERS 🤝', 11, C.textDim); u.hTitle.anchor.set(0, 0.5); this.root.addChild(u.hTitle);
    u.rows = [];
    for (let i = 0; i < 3; i++) {
      const r: any = {};
      r.name = txt('', 14, C.text); r.name.anchor.set(0, 0.5);
      r.sub = txt('', 11, C.textDim, '600'); r.sub.anchor.set(0, 0.5);
      r.btn = this.mkBtn(() => { if (r.botId >= 0) void this.onHelp(r.botId); });
      r.botId = -1;
      this.root.addChild(r.name, r.sub, r.btn.root);
      u.rows.push(r);
    }

    u.ring = new Graphics(); this.root.addChild(u.ring);
    u.icon = txt('🪙', 80, C.text); u.icon.anchor.set(0.5); this.root.addChild(u.icon);
    u.result = txt('tap to spin', 16, C.textDim); u.result.anchor.set(0.5); this.root.addChild(u.result);
    u.spinBtn = this.mkBtn(() => void this.onSpin()); this.root.addChild(u.spinBtn.root); u.spinBtn.setText('SPIN');
    u.status = txt('', 13, C.fire); u.status.anchor.set(0.5, 1); this.root.addChild(u.status);

    // juice layers (above the game UI, below the menu overlay)
    this.root.addChild(this.confetti.layer, this.toasts.layer);

    // meta-screens overlay (on top of everything); refreshing the HUD on changes
    this.menu = new MenuOverlay(this.app, this.client, this.cfg, () => void this.runSync());
    this.root.addChild(this.menu.root);
  }

  resize(W: number, H: number): void {
    const u = this.ui; if (!u.title) return;
    const pad = Math.max(14, W * 0.045); const colW = Math.min(W - pad * 2, 460);
    const cx = W / 2, left = cx - colW / 2, right = cx + colW / 2, iL = left + 16, iR = right - 16;
    const top = Math.max(26, H * 0.04);
    u.title.position.set(cx, top);
    u.badge.position.set(cx, top + 28);
    u.menuBtn.redraw(left, top, 42, 28, { color: C.panel, edge: C.panelEdge, textColor: C.gold, fontSize: 18 });
    this.menu.layout(W, H);
    const hudY = top + 40, hudH = 86;
    u.hudBg.clear(); u.hudBg.roundRect(left, hudY, colW, hudH, 16).fill({ color: C.panel }).stroke({ width: 2, color: C.panelEdge });
    const mY = hudY + 22; u.mLabel.position.set(iL, mY); u.hot.position.set(iL + 76, mY); u.mVal.position.set(iR, mY);
    const trackY = mY + 16, trackW = colW - 32;
    u.mTrack.clear(); u.mTrack.roundRect(iL, trackY, trackW, 11, 6).fill({ color: C.fireDim });
    u._track = { x: iL, y: trackY, w: trackW };
    const wY = hudY + hudH - 18; u.coins.position.set(iL, wY); u.level.position.set(cx, wY); u.tokens.position.set(iR, wY);
    const vY = hudY + hudH + 10, vH = 120;
    u.villageBg.clear(); u.villageBg.roundRect(left, vY, colW, vH, 16).fill({ color: C.panel }).stroke({ width: 2, color: C.panelEdge });
    u.vTitle.position.set(iL, vY + 16);
    u._v = { y: vY, h: vH, iL, iR, cx, groundY: vY + 66, n: this.cfg.building.slotsPerVillage };
    u._buildRow = { x: iL, y: vY + 74, w: colW - 32, cx };
    const hY = vY + vH + 10, rowH = 34, hH = 26 + 3 * (rowH + 4) + 6;
    u.helpBg.clear(); u.helpBg.roundRect(left, hY, colW, hH, 16).fill({ color: C.panel }).stroke({ width: 2, color: C.panelEdge });
    u.hTitle.position.set(iL, hY + 16);
    for (let i = 0; i < u.rows.length; i++) {
      const ry = hY + 28 + i * (rowH + 4);
      u.rows[i]._g = { x: iL, y: ry, w: colW - 32, h: rowH };
      u.rows[i].name.position.set(iL + 2, ry + rowH / 2 - 6);
      u.rows[i].sub.position.set(iL + 2, ry + rowH / 2 + 8);
    }
    const btnH = Math.max(66, H * 0.085), btnY = H - Math.max(24, H * 0.04) - btnH;
    u.spinBtn.redraw(left, btnY, colW, btnH, { color: C.gold, edge: C.goldEdge, fontSize: 28 });
    const reelTop = hY + hH, reelBot = btnY - 48, reelCY = (reelTop + reelBot) / 2;
    const r = Math.max(54, Math.min(colW * 0.28, (reelBot - reelTop) * 0.42, 96));
    u._reel = { cx, cy: reelCY, r }; this.drawRing();
    u.icon.position.set(cx, reelCY); u.icon.style.fontSize = r * 0.95;
    u.result.position.set(cx, reelCY + r + 22);
    u.status.position.set(cx, H - 6);
    this.refresh();
  }

  private drawRing(scale = 1, glow = 0) {
    const { cx, cy, r } = this.ui._reel ?? { cx: 0, cy: 0, r: 1 };
    const g = this.ui.ring as Graphics; g.clear();
    if (glow > 0.01) {
      g.circle(cx, cy, r * scale + 8).stroke({ width: 10, color: C.fire, alpha: 0.12 + 0.22 * glow });
      g.circle(cx, cy, r * scale + 3).stroke({ width: 5, color: C.fire, alpha: 0.2 + 0.3 * glow });
    }
    g.circle(cx, cy, r * scale).fill({ color: C.panel }).stroke({ width: 4, color: glow > 0.01 ? C.fire : C.gold, alpha: 0.85 });
  }

  private applyView(v: View) {
    this.view = v;
    if (this.ui.status?.text) this.ui.status.text = ''; // any successful response clears a stale error
    this.anim.momentum = v.wallet.momentum;
    if (v.goldenHour) this.anim.ghEndsAt = Date.now() + v.goldenHour.msLeft;
    if (v.events.some((e) => e.type === 'card_dropped' || e.type === 'set_completed')) void this.refreshCollection();
    this.processEvents(v.events);
    this.refresh();
  }

  private villageCenter(): { x: number; y: number } {
    const g = this.ui._v;
    return g ? { x: g.cx, y: g.y + g.h / 2 } : { x: this.app.screen.width / 2, y: this.app.screen.height * 0.3 };
  }

  private processEvents(events: View['events']) {
    for (const e of events) {
      const v = this.villageCenter();
      switch (e.type) {
        case 'helper_joined':
          this.toasts.push(`🤝 ${e.name} joined your Golden Hour`, C.text, C.green);
          this.confetti.burst(v.x, v.y, 10, 0.35); sfx.help(); break;
        case 'gh_milestone':
          this.toasts.push(`⭐ Milestone! +${e.spins} spins +${e.coins}🪙`, C.gold, C.gold);
          this.confetti.burst(v.x, v.y, 28, 0.6); sfx.milestone(); break;
        case 'gh_closed':
          this.toasts.push(`🏡 Built! ${e.benefitPct}% helped back (+${e.refund}🪙)`, C.gold, C.gold);
          this.confetti.burst(v.x, v.y, 40, 0.7); sfx.build(); break;
        case 'thank_you':
          this.toasts.push(`💝 ${e.fromBot} thanks you — +${e.spins} spins!`, C.greenEdge, C.green);
          this.confetti.burst(v.x, v.y, 22, 0.5); sfx.gratitude(); break;
        case 'help_given':
          this.toasts.push(`🤝 Helped ${e.name} · +${e.coins}🪙 · momentum ↑`, C.greenEdge, C.green);
          sfx.help(); break;
        case 'card_dropped':
          this.toasts.push(`🃏 New ${e.rarity} card!`, C.gold, C.gold); sfx.win(); break;
        case 'set_completed':
          this.toasts.push(`✨ Set complete! +${e.bonusPct}% coins forever`, C.gold, C.gold);
          this.confetti.burst(this.app.screen.width / 2, this.app.screen.height * 0.45, 50, 0.8); sfx.milestone(); break;
        case 'momentum_warning':
          this.toasts.push(`🔥 Momentum cooling — spin while hot!`, C.fire, C.fire); break;
      }
    }
  }

  private connectRealtime() {
    this.ws = this.client.connectRealtime((msg) => {
      const m = msg as { type?: string; by?: string };
      if (m.type === 'got_helped') {
        this.toasts.push(`🤝 ${m.by ?? 'A friend'} joined your Golden Hour!`, C.greenEdge, C.green);
        const v = this.villageCenter();
        this.confetti.burst(v.x, v.y, 16, 0.5); sfx.help();
        void this.runSync();
      }
    });
  }

  private refresh() {
    const u = this.ui, v = this.view; if (!v || !u._track) return;
    const frac = Math.max(0, Math.min(1, (this.anim.momentum - this.cfg.momentum.min) / (this.cfg.momentum.max - this.cfg.momentum.min)));
    u.mFill.clear(); if (frac > 0.001) u.mFill.roundRect(u._track.x, u._track.y, Math.max(10, u._track.w * frac), 11, 6).fill({ color: C.fire });
    u.mVal.text = `${this.anim.momentum.toFixed(1)}×`;
    const hot = this.anim.momentum >= this.cfg.momentum.hotThreshold;
    u.hot.text = hot ? '🔥 HOT' : this.anim.momentum > this.cfg.momentum.min + 0.05 ? '❄ cooling' : '';
    u.hot.style.fill = hot ? C.fire : C.textDim;
    u.coins.text = `🪙 ${Math.round(this.anim.coinsShown).toLocaleString()}`;
    u.level.text = `Lv ${v.wallet.level}`;
    u.tokens.text = `🎟️ ${v.wallet.helpTokens}`;
    // status badge: collection + active entitlements
    u.badge.text = [this.collectionLabel, v.wallet.boostActive ? '✨ BOOST' : '', v.wallet.passActive ? '⭐ PASS' : '']
      .filter(Boolean)
      .join('   ');
    this.drawVillage();
    // build row vs golden hour
    const br = u._buildRow, inGH = !!v.goldenHour;
    u.buildBtn.root.visible = !inGH; u.ghLabel.visible = inGH; u.ghHelpers.visible = inGH;
    if (!inGH) {
      const ok = v.wallet.coins >= v.nextBuildCost && v.canBuild;
      u.buildBtn.setText(`🔨 Build · 🪙${v.nextBuildCost.toLocaleString()}${v.wallet.buildBoost ? ' (−25%)' : ''}`);
      u.buildBtn.redraw(br.x, br.y, br.w, 40, { color: C.green, edge: C.greenEdge, enabled: ok, fontSize: 16, textColor: C.text });
      u.ghTrack.clear(); u.ghFill.clear();
    } else {
      const gh = v.goldenHour!; const secs = Math.ceil(Math.max(0, this.anim.ghEndsAt - Date.now()) / 1000);
      u.ghLabel.text = `🌟 GOLDEN HOUR  ${secs}s`; u.ghLabel.position.set(br.cx, br.y + 9);
      const hf = gh.helpers / gh.maxHelpers;
      u.ghTrack.clear(); u.ghTrack.roundRect(br.x, br.y + 22, br.w, 10, 5).fill({ color: C.fireDim });
      u.ghFill.clear(); if (hf > 0.001) u.ghFill.roundRect(br.x, br.y + 22, Math.max(8, br.w * hf), 10, 5).fill({ color: C.gold });
      u.ghHelpers.text = `${gh.helpers}/${gh.maxHelpers} helping`; u.ghHelpers.position.set(br.cx, br.y + 38);
    }
    // stranger pool
    for (let i = 0; i < u.rows.length; i++) {
      const row = u.rows[i], g = row._g, d = v.strangerPool[i], show = !!d && !!g;
      row.name.visible = show; row.sub.visible = show; row.btn.root.visible = show;
      if (!show) { row.botId = -1; continue; }
      row.botId = d.botId; row.name.text = d.name; row.sub.text = `${d.building} · ${Math.ceil(d.msLeft / 1000)}s left`;
      const bw = 78, bh = 30; row.btn.setText('HELP');
      row.btn.redraw(g.x + g.w - bw, g.y + (g.h - bh) / 2, bw, bh, { color: C.green, edge: C.greenEdge, fontSize: 14, textColor: C.text });
    }
  }

  private static ROOFS = [0xc0504b, 0x4a7ba6, 0x6b8e4e, 0xb5832f, 0x7d5a9e, 0x4f9d8a];
  private static BODY = 0xcdb491;
  private drawVillage() {
    const u = this.ui, v = this.view; if (!u._v || !v) return;
    const g = u.slots as Graphics; g.clear();
    const { iL, iR, groundY, n } = u._v;
    const built = v.village.buildingsBuilt % n;
    const innerW = iR - iL;
    const plotW = innerW / n;
    // grassy ground strip
    g.roundRect(iL, groundY, innerW, 7, 3).fill({ color: 0x4a6b3f });
    g.roundRect(iL, groundY, innerW, 3, 2).fill({ color: 0x5d8150 });
    const glowPulse = 0.5 + 0.5 * Math.sin(this.glow);
    for (let i = 0; i < n; i++) {
      const cxi = iL + (i + 0.5) * plotW;
      const filled = i < built;
      const cur = i === built && v.village.constructing;
      const bw = Math.min(plotW * 0.66, 46);
      const bodyH = 16 + ((i * 7) % 10); // varied skyline
      const roofH = 9;
      const left = cxi - bw / 2, top = groundY - bodyH;
      if (filled) {
        const roof = GameScene.ROOFS[i % GameScene.ROOFS.length]!;
        g.rect(left, top, bw, bodyH).fill({ color: GameScene.BODY }).stroke({ width: 1, color: 0x6b5638 });
        g.poly([left - 2, top, left + bw + 2, top, cxi, top - roofH]).fill({ color: roof });
        g.rect(cxi - 3, groundY - 8, 6, 8).fill({ color: 0x6b5638 }); // door
        g.rect(left + 4, top + 4, 5, 5).fill({ color: 0xf6e6c8, alpha: 0.85 }); // window
        if (bw > 30) g.rect(left + bw - 9, top + 4, 5, 5).fill({ color: 0xf6e6c8, alpha: 0.85 });
      } else if (cur) {
        // under construction — golden glow + scaffold
        g.rect(left, top, bw, bodyH).fill({ color: C.panelEdge }).stroke({ width: 2, color: C.gold, alpha: 0.4 + 0.5 * glowPulse });
        g.poly([left - 2, top, left + bw + 2, top, cxi, top - roofH]).stroke({ width: 2, color: C.gold, alpha: 0.4 + 0.5 * glowPulse });
        g.moveTo(left, groundY).lineTo(left + bw, top - roofH).stroke({ width: 1, color: C.gold, alpha: 0.3 });
      } else {
        // empty plot — a dashed foundation outline
        g.rect(cxi - 11, groundY - 4, 22, 4).fill({ color: 0x6b5638, alpha: 0.55 }).stroke({ width: 1, color: 0x8a7350, alpha: 0.6 });
      }
    }
  }

  private async onSpin() {
    if (this.anim.phase !== 'idle') return;
    unlockAudio();
    if (navigator.vibrate) navigator.vibrate(8);
    this.anim.phase = 'spinning'; this.anim.elapsed = 0; this.anim.flipAcc = 0; this.anim.pending = null;
    this.ui.result.text = ''; this.ui.spinBtn.setText('…');
    this.client.event('spin_tap', { momentum: this.anim.momentum });
    try { const r = await this.client.spin(); this.anim.pending = r.result; this.anim.pendingView = r.view; this.ui.status.text = ''; }
    catch (e) { console.error(e); this.ui.status.text = 'reconnecting…'; this.anim.phase = 'idle'; this.ui.spinBtn.setText('SPIN'); }
  }
  private async onBuild() {
    unlockAudio();
    try { const r = await this.client.build(); if (r.ok) sfx.build(); this.applyView(r.view); if (navigator.vibrate) navigator.vibrate(12); }
    catch (e) { console.error(e); }
  }
  private async onHelp(botId: number) {
    unlockAudio();
    try { const r = await this.client.help(botId); this.applyView(r.view); if (navigator.vibrate) navigator.vibrate(10); }
    catch (e) { console.error(e); }
  }

  private spawnFloater(text: string, color: number) {
    const t = txt(text, 26, color, '900');
    t.anchor.set(0.5);
    const { cx, cy, r } = this.ui._reel ?? { cx: 0, cy: 0, r: 0 };
    t.position.set(cx, cy - r - 8);
    this.root.addChildAt(t, this.root.getChildIndex(this.toasts.layer));
    this.floaters.push({ t, vy: -0.06, life: 850 });
  }

  private land() {
    const r = this.anim.pending!, v = this.anim.pendingView!;
    this.anim.phase = 'idle'; this.anim.pop = 1.35; this.ui.icon.text = r.icon; this.ui.spinBtn.setText('SPIN');
    let msg = r.label;
    if (r.coinsAwarded > 0) msg = `+${r.coinsAwarded.toLocaleString()} 🪙`;
    if (r.kind === 'jackpot') msg = `JACKPOT +${r.coinsAwarded.toLocaleString()} 🪙`;
    if (r.kind === 'momentum_spark') msg = `🔥 Momentum +${(r.momentumAfter - r.momentumBefore).toFixed(1)}×`;
    if (r.kind === 'extra_spins') msg = `+${r.extraSpins} Spins`;
    if (r.kind === 'help_tokens') msg = `+${r.tokensAwarded} Help Token`;
    if (r.kind === 'build_boost') msg = '🔨 Build Boost ready';
    if (r.kind === 'rare_card') msg = '🃏 Rare Card!';
    this.ui.result.text = msg; this.ui.result.style.fill = r.coinsAwarded > 0 ? C.gold : C.text;

    // land juice by outcome
    const reel = this.ui._reel ?? { cx: 0, cy: 0, r: 0 };
    if (r.kind === 'jackpot') { sfx.jackpot(); this.confetti.burst(reel.cx, reel.cy, 50, 0.85); if (navigator.vibrate) navigator.vibrate([20, 40, 20, 40, 60]); }
    else if (r.kind === 'momentum_spark') { sfx.spark(); if (navigator.vibrate) navigator.vibrate([10, 30, 10]); }
    else if (r.coinsAwarded > 0 || r.kind === 'rare_card') { sfx.win(); if (navigator.vibrate) navigator.vibrate(16); }
    else { sfx.common(); if (navigator.vibrate) navigator.vibrate(10); }
    if (r.coinsAwarded > 0) this.spawnFloater(`+${r.coinsAwarded.toLocaleString()}`, C.gold);

    this.applyView(v);
  }

  update(dt: number): void {
    const a = this.anim, u = this.ui;
    if (a.phase === 'spinning') {
      a.elapsed += dt; a.flipAcc += dt;
      const p = Math.min(1, a.elapsed / a.dur), iv = 40 + p * p * 150;
      if (a.flipAcc >= iv) { a.flipAcc = 0; u.icon.text = ICONS[(Math.random() * ICONS.length) | 0]; sfx.tick(p); }
      if (a.elapsed >= a.dur && a.pending) this.land();
    }
    // reel pop + hot glow pulse
    const hot = a.momentum >= this.cfg.momentum.hotThreshold;
    this.glow = (this.glow + dt / 600) % (Math.PI * 2);
    const glowAmt = hot ? 0.5 + 0.5 * Math.sin(this.glow) : 0;
    if (a.pop !== 1 || hot) {
      if (a.pop !== 1) { a.pop += (1 - a.pop) * Math.min(1, dt / 90); if (Math.abs(a.pop - 1) < 0.01) a.pop = 1; }
      u.icon.scale.set(a.pop);
      this.drawRing(0.92 + 0.08 * a.pop, glowAmt);
    }
    if (this.view && a.phase === 'idle' && a.momentum > this.cfg.momentum.min) {
      a.momentum = Math.max(this.cfg.momentum.min, a.momentum - this.cfg.momentum.decayPerSec * (dt / 1000));
    }
    if (this.view) {
      const target = this.view.wallet.coins, k = Math.min(1, dt / 320);
      a.coinsShown += (target - a.coinsShown) * k; if (Math.abs(target - a.coinsShown) < 0.5) a.coinsShown = target;
    }
    // floaters
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]!;
      f.life -= dt; f.t.y += f.vy * dt; f.t.alpha = Math.max(0, f.life / 850);
      if (f.life <= 0) { this.root.removeChild(f.t); f.t.destroy(); this.floaters.splice(i, 1); }
    }
    this.confetti.update(dt);
    this.toasts.update(dt);
    this.refresh();
  }
}
