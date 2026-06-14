// Tabbed meta-screen overlay: Quests · Pass · Cards · Teams. Fetches live data
// from the server and exposes claim/create/join/contribute actions. Rendered on
// top of GameScene; tap the backdrop (or ✕) to close.

import { Application, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';
import type { PassStatus, PublicConfig, TeamSummary, TeamView } from '@bloom/shared';
import type { BloomClient, Collection, QuestView } from '../net/client.js';

const C = {
  scrim: 0x000000, panel: 0x231a12, panelEdge: 0x3d2e20,
  gold: 0xe8b04b, goldEdge: 0xf6cf86, green: 0x3f7d5a, greenEdge: 0x6fae8a,
  text: 0xf3e9d8, textDim: 0xb29a7e, fire: 0xff7a3d, fireDim: 0x4a2f1c, bg: 0x17110c, tabOff: 0x2f2418,
};
type Tab = 'quests' | 'pass' | 'cards' | 'teams' | 'shop';
const TABS: Tab[] = ['quests', 'pass', 'cards', 'teams', 'shop'];
const TAB_LABELS: Record<Tab, string> = { quests: 'Quests', pass: 'Pass', cards: 'Cards', teams: 'Teams', shop: 'Shop' };
const TITLES: Record<Tab, string> = { quests: 'Daily Quests', pass: 'Season Pass', cards: 'Card Collection', teams: 'Teams', shop: 'Shop' };

function text(s: string, size: number, fill: number, weight: TextStyle['fontWeight'] = '700') {
  return new Text({ text: s, style: new TextStyle({ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: size, fill, fontWeight: weight }) });
}

export class MenuOverlay {
  root = new Container();
  private backdrop = new Graphics();
  private panel = new Graphics();
  private titleT = text('', 18, C.gold, '800');
  private statusT = text('', 12, C.greenEdge, '700');
  private tabsRow = new Container();
  private content = new Container();
  private geom = { x: 0, y: 0, w: 0, h: 0, contentTop: 0, pad: 14 };
  private tab: Tab = 'quests';
  private busy = false;

  private quests: QuestView[] = [];
  private pass?: PassStatus;
  private collection?: Collection;
  private team?: TeamView | null;
  private teams: TeamSummary[] = [];

  constructor(private app: Application, private client: BloomClient, private cfg: PublicConfig, private onWalletChange: () => void) {
    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', () => this.close());
    this.panel.eventMode = 'static'; // swallow taps over the panel
    this.titleT.anchor.set(0, 0.5);
    this.statusT.anchor.set(1, 0.5);
    this.root.addChild(this.backdrop, this.panel, this.titleT, this.statusT, this.tabsRow, this.content);
    this.root.visible = false;
    this.root.eventMode = 'static';
  }

  layout(W: number, H: number): void {
    this.backdrop.clear();
    this.backdrop.rect(0, 0, W, H).fill({ color: C.scrim, alpha: 0.62 });
    this.backdrop.hitArea = new Rectangle(0, 0, W, H);

    const w = Math.min(W - 24, 460);
    const h = Math.min(H - 80, 660);
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    this.geom = { x, y, w, h, contentTop: y + 96, pad: 14 };

    this.panel.clear();
    this.panel.roundRect(x, y, w, h, 18).fill({ color: C.panel }).stroke({ width: 2, color: C.panelEdge });
    this.panel.hitArea = new Rectangle(x, y, w, h);

    this.titleT.position.set(x + 16, y + 24);
    this.statusT.position.set(x + w - 44, y + 24);

    this.buildTabs();
    this.render();
  }

  private buildTabs(): void {
    this.tabsRow.removeChildren().forEach((c) => c.destroy({ children: true }));
    // ✕ close
    const close = this.button('✕', this.geom.x + this.geom.w - 38, this.geom.y + 12, 26, 26, () => this.close(), { color: C.tabOff, textColor: C.text, fontSize: 16 });
    this.tabsRow.addChild(close);
    const pad = this.geom.pad;
    const gap = 5;
    const tw = (this.geom.w - pad * 2 - (TABS.length - 1) * gap) / TABS.length;
    TABS.forEach((t, i) => {
      const b = this.button(TAB_LABELS[t], this.geom.x + pad + i * (tw + gap), this.geom.y + 56, tw, 32, () => { this.tab = t; void this.refresh(); }, {
        color: t === this.tab ? C.gold : C.tabOff, textColor: t === this.tab ? C.bg : C.text, fontSize: 12,
      });
      this.tabsRow.addChild(b);
    });
  }

  async open(): Promise<void> {
    this.root.visible = true;
    await this.refresh();
  }
  async openTo(tab: Tab): Promise<void> {
    this.tab = tab;
    await this.open();
  }
  close(): void {
    this.root.visible = false;
  }

  private async refresh(): Promise<void> {
    this.statusT.text = '…';
    try {
      if (this.tab === 'quests') this.quests = await this.client.quests();
      else if (this.tab === 'pass') this.pass = await this.client.passStatus();
      else if (this.tab === 'cards') this.collection = await this.client.cards();
      else if (this.tab === 'teams') { this.team = await this.client.teamMine(); if (!this.team) this.teams = await this.client.teamList(); }
      this.statusT.text = '';
    } catch {
      this.statusT.text = 'offline';
    }
    this.buildTabs();
    this.render();
  }

  // ── rendering ──
  private render(): void {
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.titleT.text = TITLES[this.tab];
    if (!this.root.visible) return;
    if (this.tab === 'quests') this.renderQuests();
    else if (this.tab === 'pass') this.renderPass();
    else if (this.tab === 'cards') this.renderCards();
    else if (this.tab === 'teams') this.renderTeams();
    else this.renderShop();
  }

  private renderShop(): void {
    const { x, w, contentTop, pad } = this.geom;
    let y = contentTop;
    const buyBtn = (sku: string) => this.button('Buy', x + w - pad - 74, y + 7, 62, 30, () => void this.act(() => this.client.purchase(sku)), { color: C.green, edge: C.greenEdge, textColor: C.text, fontSize: 13 });
    this.label(x + pad, y, 'Spins', 12, C.textDim); y += 22;
    for (const p of this.cfg.iap.spinPacks) {
      this.row(x + pad, y, w - pad * 2, 44);
      this.label(x + pad + 12, y + 22, `🪙 ${p.spins.toLocaleString()} spins`, 14, C.text);
      this.label(x + w - pad - 88, y + 22, `₹${p.inr}`, 13, C.gold, 1);
      this.content.addChild(buyBtn(p.sku));
      y += 50;
    }
    y += 6;
    this.label(x + pad, y, 'Subscriptions & Pass', 12, C.textDim); y += 22;
    this.row(x + pad, y, w - pad * 2, 44);
    this.label(x + pad + 12, y + 16, `✨ Boost Sub`, 14, C.text);
    this.label(x + pad + 12, y + 32, `+${this.cfg.iap.boostSub.coinBonusPct}% coins · daily spins`, 11, C.textDim);
    this.label(x + w - pad - 88, y + 22, `₹${this.cfg.iap.boostSub.inr}`, 13, C.gold, 1);
    this.content.addChild(buyBtn(this.cfg.iap.boostSub.sku));
    y += 50;
    this.row(x + pad, y, w - pad * 2, 44);
    this.label(x + pad + 12, y + 16, `⭐ Season Pass`, 14, C.text);
    this.label(x + pad + 12, y + 32, `premium reward track · ${this.cfg.iap.seasonPass.durationDays} days`, 11, C.textDim);
    this.label(x + w - pad - 88, y + 22, `₹${this.cfg.iap.seasonPass.inr}`, 13, C.gold, 1);
    this.content.addChild(buyBtn(this.cfg.iap.seasonPass.sku));
    y += 56;
    this.label(x + pad, y, 'Sandbox — purchases are simulated', 11, C.textDim);
  }

  private renderQuests(): void {
    const { x, w, contentTop, pad } = this.geom;
    let y = contentTop;
    for (const q of this.quests) {
      this.row(x + pad, y, w - pad * 2, 46);
      this.label(x + pad + 12, y + 14, q.label, 14, C.text);
      this.label(x + pad + 12, y + 32, `${q.progress}/${q.target}` + (q.claimed ? '  ✓ claimed' : q.complete ? '  ✓ ready' : ''), 11, q.complete ? C.greenEdge : C.textDim);
      this.bar(x + w - pad - 120, y + 28, 108, Math.min(1, q.progress / q.target), q.complete ? C.green : C.fire);
      y += 52;
    }
    const anyClaimable = this.quests.some((q) => q.complete && !q.claimed);
    this.content.addChild(this.button('Claim rewards', x + pad, y + 6, w - pad * 2, 42, () => void this.act(() => this.client.questsClaim()), { color: anyClaimable ? C.green : C.tabOff, edge: C.greenEdge, textColor: C.text, enabled: anyClaimable, fontSize: 16 }));
  }

  private renderPass(): void {
    const { x, w, contentTop, pad } = this.geom;
    const p = this.pass;
    if (!p) return;
    let y = contentTop;
    this.label(x + pad, y, `Tier ${p.tier} / ${p.maxTier}`, 20, C.gold); y += 30;
    this.label(x + pad, y, `XP ${p.xpIntoTier}/${p.xpPerTier} into next tier`, 12, C.textDim); y += 18;
    this.bar(x + pad, y, w - pad * 2, p.xpIntoTier / p.xpPerTier, C.fire); y += 24;
    this.label(x + pad, y, `Free rewards ready: ${p.claimableFree}`, 13, C.text); y += 22;
    this.label(x + pad, y, p.active ? `Premium ready: ${p.claimablePremium}  ⭐` : 'Premium track locked — buy the Season Pass', 13, p.active ? C.greenEdge : C.textDim); y += 30;
    const claimable = p.claimableFree + p.claimablePremium > 0;
    this.content.addChild(this.button('Claim pass rewards', x + pad, y, w - pad * 2, 42, () => void this.act(() => this.client.passClaim()), { color: claimable ? C.green : C.tabOff, edge: C.greenEdge, textColor: C.text, enabled: claimable, fontSize: 16 }));
  }

  private renderCards(): void {
    const { x, w, contentTop, pad } = this.geom;
    const c = this.collection;
    if (!c) return;
    let y = contentTop;
    this.label(x + pad, y, `${c.ownedCards} cards · +${c.totalBonusPct}% coin bonus`, 14, C.gold); y += 30;
    for (const s of c.sets) {
      this.row(x + pad, y, w - pad * 2, 44);
      this.label(x + pad + 12, y + 15, s.name, 14, C.text);
      this.label(x + pad + 12, y + 31, `${s.owned}/${s.total}` + (s.complete ? '  ✓ complete' : ''), 11, s.complete ? C.greenEdge : C.textDim);
      this.label(x + w - pad - 16, y + 22, `+${s.bonusPct}%`, 13, s.complete ? C.greenEdge : C.textDim, 1);
      y += 50;
    }
  }

  private renderTeams(): void {
    const { x, w, contentTop, pad } = this.geom;
    let y = contentTop;
    if (this.team) {
      const t = this.team;
      this.label(x + pad, y, t.name, 20, C.gold); y += 28;
      this.label(x + pad, y, `${t.memberCount} members`, 12, C.textDim); y += 20;
      if (t.project) {
        this.label(x + pad, y, `${t.project.kind} — ${t.project.pct}%`, 13, C.text); y += 18;
        this.bar(x + pad, y, w - pad * 2, t.project.pct / 100, C.gold); y += 24;
      }
      for (const m of t.members.slice(0, 4)) { this.label(x + pad, y, `${m.playerId.startsWith('Friend') ? m.playerId : 'Friend ' + m.playerId.slice(0, 4)} · ${m.contributed}🪙`, 12, C.textDim); y += 18; }
      y += 6;
      this.content.addChild(this.button('Contribute 1000 🪙', x + pad, y, (w - pad * 2 - 8) / 2, 42, () => void this.act(() => this.client.teamContribute(1000)), { color: C.green, edge: C.greenEdge, textColor: C.text, fontSize: 14 }));
      this.content.addChild(this.button('Leave', x + pad + (w - pad * 2 - 8) / 2 + 8, y, (w - pad * 2 - 8) / 2, 42, () => void this.act(() => this.client.teamLeave()), { color: C.tabOff, textColor: C.text, fontSize: 14 }));
    } else {
      this.label(x + pad, y, 'You are not in a team', 14, C.text); y += 26;
      this.content.addChild(this.button('Create a team', x + pad, y, w - pad * 2, 42, () => void this.act(() => this.client.teamCreate('Bloomers ' + Math.floor(Math.random() * 900 + 100))), { color: C.green, edge: C.greenEdge, textColor: C.text, fontSize: 16 }));
      y += 52;
      this.label(x + pad, y, 'Or join one:', 12, C.textDim); y += 22;
      for (const t of this.teams.slice(0, 5)) {
        this.row(x + pad, y, w - pad * 2, 40);
        this.label(x + pad + 12, y + 21, `${t.name}  (${t.memberCount})`, 13, C.text);
        this.content.addChild(this.button('Join', x + w - pad - 76, y + 6, 64, 28, () => void this.act(() => this.client.teamJoin(t.id)), { color: C.green, edge: C.greenEdge, textColor: C.text, fontSize: 12 }));
        y += 46;
      }
    }
  }

  // run an action, then refresh data + nudge the HUD
  private async act(fn: () => Promise<unknown>, _quiet = false): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try { await fn(); this.onWalletChange(); } catch { /* ignore */ }
    this.busy = false;
    await this.refresh();
  }

  // ── primitives ──
  private row(x: number, y: number, w: number, h: number): void {
    const g = new Graphics();
    g.roundRect(x, y, w, h, 10).fill({ color: C.bg }).stroke({ width: 1, color: C.panelEdge });
    this.content.addChild(g);
  }
  private label(x: number, y: number, s: string, size: number, color: number, anchorX = 0): Text {
    const t = text(s, size, color);
    t.anchor.set(anchorX, 0.5);
    t.position.set(x, y);
    this.content.addChild(t);
    return t;
  }
  private bar(x: number, y: number, w: number, frac: number, color: number): void {
    const g = new Graphics();
    g.roundRect(x, y, w, 8, 4).fill({ color: C.fireDim });
    if (frac > 0.001) g.roundRect(x, y, Math.max(6, w * Math.min(1, frac)), 8, 4).fill({ color });
    this.content.addChild(g);
  }
  private button(label: string, x: number, y: number, w: number, h: number, onTap: () => void, opts: { color?: number; edge?: number; textColor?: number; enabled?: boolean; fontSize?: number }): Container {
    const root = new Container();
    const en = opts.enabled !== false;
    root.eventMode = 'static'; root.cursor = 'pointer';
    const bg = new Graphics();
    bg.roundRect(x, y, w, h, Math.min(h / 2, 12)).fill({ color: en ? opts.color ?? C.gold : C.tabOff }).stroke({ width: 2, color: en ? opts.edge ?? opts.color ?? C.goldEdge : C.panelEdge });
    const t = text(label, opts.fontSize ?? 14, en ? opts.textColor ?? C.bg : C.textDim, '800');
    t.anchor.set(0.5); t.position.set(x + w / 2, y + h / 2);
    root.addChild(bg, t);
    root.hitArea = new Rectangle(x, y, w, h);
    if (en) root.on('pointertap', onTap);
    return root;
  }
}
