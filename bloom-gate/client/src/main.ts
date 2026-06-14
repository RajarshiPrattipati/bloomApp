// ─────────────────────────────────────────────────────────────────────────────
// BLOOM — gate client. The full loop: Spin → Build → Golden Hour → Momentum.
// Server-authoritative; the client animates, displays, and polls /api/sync.
// PixiJS v8, portrait, mobile-web.
// ─────────────────────────────────────────────────────────────────────────────

import { Application, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';
import {
  build,
  event,
  getConfig,
  help,
  makeSessionId,
  spin,
  startSession,
  sync,
  type PublicConfig,
  type SpinResult,
  type View,
} from './api';
import {
  landCommon,
  landJackpot,
  landSpark,
  landWin,
  sfxBuild,
  sfxGratitude,
  sfxHelp,
  sfxMilestone,
  tick,
  unlockAudio,
} from './audio';
import { ConfettiLayer } from './confetti';
import { ToastLayer } from './toasts';

const C = {
  bg: 0x17110c,
  panel: 0x2a1f16,
  panelEdge: 0x3d2e20,
  gold: 0xe8b04b,
  goldEdge: 0xf6cf86,
  green: 0x3f7d5a,
  greenEdge: 0x6fae8a,
  text: 0xf3e9d8,
  textDim: 0xb29a7e,
  fire: 0xff7a3d,
  fireDim: 0x5a3320,
  slotEmpty: 0x3d2e20,
  slotFull: 0xe8b04b,
  disabled: 0x4a3c2e,
};
const ALL_ICONS = ['🪙', '🎟️', '🔨', '🎁', '🔁', '🃏', '💎', '🔥'];

let app: Application;
let cfg: PublicConfig;
let sessionId: string;
let view: View | null = null;
const ui: Record<string, any> = {};
let toasts: ToastLayer;
let confetti: ConfettiLayer;

type Phase = 'idle' | 'spinning';
const anim = {
  phase: 'idle' as Phase,
  elapsed: 0,
  duration: 820,
  flipAcc: 0,
  pending: null as SpinResult | null,
  pendingView: null as View | null,
  coinsShown: 0,
  momentumShown: 1,
  ghEndsAt: 0,
  reelPop: 1,
  lastSpinAt: 0,
  warnedThisCool: false,
};
const floaters: { t: Text; vy: number; life: number }[] = [];

// ── boot ───────────────────────────────────────────────────────────────────────
async function boot() {
  app = new Application();
  await app.init({
    background: C.bg,
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 3),
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', () => unlockAudio());

  confetti = new ConfettiLayer();
  toasts = new ToastLayer(() => ({ cx: app.screen.width / 2, y: app.screen.height * 0.56 }));

  buildScene();
  app.stage.addChild(confetti.layer);
  app.stage.addChild(toasts.layer);

  try {
    setStatus('connecting…');
    cfg = await getConfig();
    sessionId = makeSessionId();
    const s = await startSession(sessionId);
    applyView(s);
    anim.coinsShown = s.wallet.coins;
    anim.momentumShown = s.wallet.momentum;
    setStatus('');
    event(sessionId, 'session_start_client');
    // test hook for Playwright / headless drivers (harmless at the gate)
    (window as any).__bloom = {
      ready: true,
      spin: () => onSpin(),
      build: () => onBuild(),
      help: (id: number) => onHelp(id),
      view: () => view,
      momentum: () => anim.momentumShown,
      phase: () => anim.phase,
      cfg: () => cfg,
    };
  } catch (err) {
    setStatus('offline — start the server');
    console.error(err);
  }

  app.renderer.on('resize', layout);
  layout();
  app.ticker.add((t) => update(t.deltaMS));

  // world poll — drives toasts, GH progress, gratitude, pool refresh
  setInterval(runSync, 1400);

  const demo = new URLSearchParams(location.search).get('demo');
  if (demo && sessionId) void runDemo(parseInt(demo, 10) || 10);
}

async function runSync() {
  if (!sessionId) return;
  try {
    const v = await sync(sessionId);
    applyView(v);
  } catch {
    /* transient */
  }
}

// ── text helper ──────────────────────────────────────────────────────────────
function txt(text: string, size: number, fill: number, weight: TextStyle['fontWeight'] = '700') {
  return new Text({
    text,
    style: new TextStyle({
      fontFamily: 'system-ui, -apple-system, Helvetica, Arial, sans-serif',
      fontSize: size,
      fill,
      fontWeight: weight,
      align: 'center',
    }),
  });
}

// ── generic button ──────────────────────────────────────────────────────────
function makeButton(onTap: () => void) {
  const root = new Container();
  root.eventMode = 'static';
  root.cursor = 'pointer';
  const bg = new Graphics();
  const label = txt('', 18, C.bg, '800');
  label.anchor.set(0.5);
  root.addChild(bg, label);
  let geom = { x: 0, y: 0, w: 0, h: 0 };
  root.on('pointertap', () => {
    if ((root as any)._enabled) onTap();
  });
  function redraw(
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { color?: number; edge?: number; enabled?: boolean; fontSize?: number; textColor?: number },
  ) {
    geom = { x, y, w, h };
    const enabled = opts.enabled !== false;
    (root as any)._enabled = enabled;
    bg.clear();
    bg.roundRect(x, y, w, h, Math.min(h / 2, 18))
      .fill({ color: enabled ? opts.color ?? C.gold : C.disabled })
      .stroke({ width: 2, color: enabled ? opts.edge ?? C.goldEdge : C.panelEdge });
    label.style.fontSize = opts.fontSize ?? 18;
    label.style.fill = enabled ? opts.textColor ?? C.bg : C.textDim;
    label.position.set(x + w / 2, y + h / 2);
    root.hitArea = new Rectangle(x, y, w, h);
  }
  return { root, label, redraw, setText: (t: string) => (label.text = t) };
}

// ── scene ──────────────────────────────────────────────────────────────────────
function buildScene() {
  ui.title = txt('BLOOM', 26, C.gold, '800');
  ui.title.anchor.set(0.5, 0);
  app.stage.addChild(ui.title);

  // HUD
  ui.hudBg = new Graphics();
  app.stage.addChild(ui.hudBg);
  ui.momentumLabel = txt('MOMENTUM', 11, C.textDim, '700');
  ui.momentumLabel.anchor.set(0, 0.5);
  ui.hotBadge = txt('', 12, C.fire, '800');
  ui.hotBadge.anchor.set(0, 0.5);
  ui.momentumValue = txt('1.0×', 18, C.fire, '800');
  ui.momentumValue.anchor.set(1, 0.5);
  ui.momentumTrack = new Graphics();
  ui.momentumFill = new Graphics();
  ui.coins = txt('🪙 0', 19, C.text, '700');
  ui.coins.anchor.set(0, 0.5);
  ui.level = txt('Lv 1', 13, C.textDim, '700');
  ui.level.anchor.set(0.5, 0.5);
  ui.tokens = txt('🎟️ 0', 15, C.textDim, '700');
  ui.tokens.anchor.set(1, 0.5);
  app.stage.addChild(
    ui.momentumTrack, ui.momentumFill, ui.momentumLabel, ui.hotBadge, ui.momentumValue,
    ui.coins, ui.level, ui.tokens,
  );

  // Village panel
  ui.villageBg = new Graphics();
  app.stage.addChild(ui.villageBg);
  ui.villageTitle = txt('YOUR VILLAGE', 11, C.textDim, '700');
  ui.villageTitle.anchor.set(0, 0.5);
  app.stage.addChild(ui.villageTitle);
  ui.slots = new Graphics();
  app.stage.addChild(ui.slots);
  // build button OR golden-hour panel occupy the same row
  ui.buildBtn = makeButton(onBuild);
  app.stage.addChild(ui.buildBtn.root);
  ui.ghLabel = txt('', 13, C.gold, '800');
  ui.ghLabel.anchor.set(0.5, 0.5);
  ui.ghTrack = new Graphics();
  ui.ghFill = new Graphics();
  ui.ghHelpers = txt('', 12, C.textDim, '700');
  ui.ghHelpers.anchor.set(0.5, 0.5);
  app.stage.addChild(ui.ghTrack, ui.ghFill, ui.ghLabel, ui.ghHelpers);

  // Help Others panel (stranger pool)
  ui.helpBg = new Graphics();
  app.stage.addChild(ui.helpBg);
  ui.helpTitle = txt('HELP OTHERS 🤝', 11, C.textDim, '700');
  ui.helpTitle.anchor.set(0, 0.5);
  app.stage.addChild(ui.helpTitle);
  ui.poolRows = [];
  for (let i = 0; i < 3; i++) {
    const row: any = {};
    row.name = txt('', 14, C.text, '700');
    row.name.anchor.set(0, 0.5);
    row.sub = txt('', 11, C.textDim, '600');
    row.sub.anchor.set(0, 0.5);
    row.track = new Graphics();
    row.fill = new Graphics();
    row.btn = makeButton(() => onHelp(row.botId));
    row.botId = -1;
    app.stage.addChild(row.track, row.fill, row.name, row.sub, row.btn.root);
    ui.poolRows.push(row);
  }

  // Reel
  ui.reelRing = new Graphics();
  app.stage.addChild(ui.reelRing);
  ui.reelIcon = txt('🪙', 86, C.text);
  ui.reelIcon.anchor.set(0.5);
  app.stage.addChild(ui.reelIcon);
  ui.result = txt('tap to spin', 16, C.textDim, '700');
  ui.result.anchor.set(0.5);
  app.stage.addChild(ui.result);

  // Spin button
  ui.spinBtn = makeButton(onSpin);
  app.stage.addChild(ui.spinBtn.root);
  ui.spinBtn.setText('SPIN');

  ui.status = txt('', 13, C.fire, '700');
  ui.status.anchor.set(0.5, 1);
  app.stage.addChild(ui.status);
}

function setStatus(s: string) {
  if (ui.status) ui.status.text = s;
}

// ── layout ─────────────────────────────────────────────────────────────────────
function layout() {
  if (!app) return;
  const W = app.screen.width;
  const H = app.screen.height;
  app.stage.hitArea = new Rectangle(0, 0, W, H);
  const pad = Math.max(14, W * 0.045);
  const colW = Math.min(W - pad * 2, 460);
  const cx = W / 2;
  const left = cx - colW / 2;
  const right = cx + colW / 2;
  const innerL = left + 16;
  const innerR = right - 16;
  const topSafe = Math.max(26, H * 0.04);

  ui.title.position.set(cx, topSafe);

  // HUD
  const hudY = topSafe + 40;
  const hudH = 86;
  ui.hudBg.clear();
  ui.hudBg.roundRect(left, hudY, colW, hudH, 16).fill({ color: C.panel }).stroke({ width: 2, color: C.panelEdge });
  const mY = hudY + 22;
  ui.momentumLabel.position.set(innerL, mY);
  ui.hotBadge.position.set(innerL + 76, mY);
  ui.momentumValue.position.set(innerR, mY);
  const trackY = mY + 16;
  const trackW = colW - 32;
  ui.momentumTrack.clear();
  ui.momentumTrack.roundRect(innerL, trackY, trackW, 11, 6).fill({ color: C.fireDim });
  ui._trackGeom = { x: innerL, y: trackY, w: trackW, h: 11 };
  const wY = hudY + hudH - 18;
  ui.coins.position.set(innerL, wY);
  ui.level.position.set(cx, wY);
  ui.tokens.position.set(innerR, wY);

  // Village panel
  const vY = hudY + hudH + 10;
  const vH = 96;
  ui.villageBg.clear();
  ui.villageBg.roundRect(left, vY, colW, vH, 16).fill({ color: C.panel }).stroke({ width: 2, color: C.panelEdge });
  ui.villageTitle.position.set(innerL, vY + 16);
  ui._villageGeom = { x: left, y: vY, w: colW, h: vH, innerL, innerR, cx };
  drawSlots();
  // build/GH row geometry
  const rowY = vY + 44;
  const rowH = 40;
  ui._buildRow = { x: innerL, y: rowY, w: colW - 32, h: rowH, cx };

  // Help Others panel
  const hY = vY + vH + 10;
  const rows = 3;
  const rowGap = 4;
  const hRowH = 34;
  const hH = 26 + rows * (hRowH + rowGap) + 6;
  ui.helpBg.clear();
  ui.helpBg.roundRect(left, hY, colW, hH, 16).fill({ color: C.panel }).stroke({ width: 2, color: C.panelEdge });
  ui.helpTitle.position.set(innerL, hY + 16);
  for (let i = 0; i < ui.poolRows.length; i++) {
    const r = ui.poolRows[i];
    const ry = hY + 28 + i * (hRowH + rowGap);
    r._geom = { x: innerL, y: ry, w: colW - 32, h: hRowH };
    r.name.position.set(innerL + 2, ry + hRowH / 2 - 6);
    r.sub.position.set(innerL + 2, ry + hRowH / 2 + 8);
  }
  ui._helpPanel = { x: left, y: hY, w: colW, h: hH };

  // Spin button
  const buttonH = Math.max(66, H * 0.085);
  const buttonY = H - Math.max(24, H * 0.04) - buttonH;
  ui.spinBtn.redraw(left, buttonY, colW, buttonH, { color: C.gold, edge: C.goldEdge, fontSize: 28 });
  ui._spinGeom = { x: left, y: buttonY, w: colW, h: buttonH };

  // Reel — fill between help panel and spin button
  const reelTop = hY + hH;
  const reelBottom = buttonY - 50;
  const reelCY = (reelTop + reelBottom) / 2;
  const reelR = Math.max(54, Math.min(colW * 0.28, (reelBottom - reelTop) * 0.42, 100));
  ui._reelGeom = { cx, cy: reelCY, r: reelR };
  drawReelRing();
  ui.reelIcon.position.set(cx, reelCY);
  ui.reelIcon.style.fontSize = reelR * 0.95;
  ui.result.position.set(cx, reelCY + reelR + 22);

  ui.status.position.set(cx, H - 6);

  refreshAll();
}

function drawSlots() {
  const g = ui.slots as Graphics;
  const geom = ui._villageGeom;
  if (!geom) return;
  g.clear();
  const n = cfg?.building.slotsPerVillage ?? 6;
  const built = view ? view.village.buildingsBuilt % n : 0;
  const constructing = view?.village.constructing;
  const r = 7;
  const gap = 18;
  const totalW = (n - 1) * gap;
  const startX = geom.innerR - totalW;
  const y = geom.y + 16;
  for (let i = 0; i < n; i++) {
    const filled = i < built;
    const isCurrent = i === built && constructing;
    g.circle(startX + i * gap, y, r)
      .fill({ color: filled ? C.slotFull : isCurrent ? C.fire : C.slotEmpty })
      .stroke({ width: 1.5, color: C.panelEdge });
  }
}

function drawReelRing(scale = 1) {
  const g = ui.reelRing as Graphics;
  const { cx, cy, r } = ui._reelGeom ?? { cx: 0, cy: 0, r: 1 };
  g.clear();
  g.circle(cx, cy, r * scale).fill({ color: C.panel }).stroke({ width: 4, color: C.gold, alpha: 0.85 });
  g.circle(cx, cy, r * 0.72 * scale).stroke({ width: 2, color: C.panelEdge });
}

// ── apply server view ─────────────────────────────────────────────────────────
function applyView(v: View) {
  view = v;
  // momentum: snap local display to authoritative value
  anim.momentumShown = v.wallet.momentum;
  if (anim.ghEndsAt === 0 || !v.goldenHour) {
    // (re)anchor countdown
  }
  if (v.goldenHour) anim.ghEndsAt = Date.now() + v.goldenHour.msLeft;
  processEvents(v.events);
  refreshAll();
}

function processEvents(events: View['events']) {
  for (const e of events) {
    switch (e.type) {
      case 'helper_joined': {
        toasts.push(`🤝 ${e.name} joined your Golden Hour`, C.text, C.green);
        burstAtVillage(10, 0.35);
        sfxHelp();
        break;
      }
      case 'gh_milestone': {
        toasts.push(`⭐ Milestone! +${e.spins} spins +${e.coins}🪙`, C.gold, C.gold);
        burstAtVillage(30, 0.6);
        sfxMilestone();
        break;
      }
      case 'gh_closed': {
        toasts.push(`🏡 Built! ${e.benefitPct}% helped back (+${e.refund}🪙)`, C.gold, C.gold);
        burstAtVillage(40, 0.7);
        sfxBuild();
        break;
      }
      case 'thank_you': {
        toasts.push(`💝 ${e.fromBot} thanks you — +${e.spins} spins!`, C.greenEdge, C.green);
        burstAtVillage(22, 0.5);
        sfxGratitude();
        break;
      }
      case 'help_given': {
        toasts.push(`🤝 Helped ${e.name} · +${e.coins}🪙 · momentum ↑`, C.greenEdge, C.green);
        sfxHelp();
        break;
      }
      case 'momentum_warning': {
        toasts.push(`🔥 Momentum cooling — spin while hot!`, C.fire, C.fire);
        event(sessionId, 'momentum_decay_warning', { momentum: e.momentum });
        break;
      }
    }
  }
}

function burstAtVillage(count: number, power: number) {
  const g = ui._villageGeom;
  if (g) confetti.burst(g.cx, g.y + g.h / 2, count, power);
}

// ── refresh all panels from `view` ─────────────────────────────────────────────
function refreshAll() {
  if (!view || !cfg) return;
  const w = view.wallet;

  // momentum bar + badge
  const mMin = cfg.momentum.min, mMax = cfg.momentum.max;
  const frac = Math.max(0, Math.min(1, (anim.momentumShown - mMin) / (mMax - mMin)));
  const tg = ui._trackGeom;
  if (tg) {
    const g = ui.momentumFill as Graphics;
    g.clear();
    if (frac > 0.001) g.roundRect(tg.x, tg.y, Math.max(10, tg.w * frac), tg.h, 6).fill({ color: C.fire });
  }
  ui.momentumValue.text = `${anim.momentumShown.toFixed(1)}×`;
  const hot = anim.momentumShown >= cfg.momentum.hotThreshold;
  ui.hotBadge.text = hot ? '🔥 HOT' : anim.momentumShown > mMin + 0.05 ? '❄ cooling' : '';
  ui.hotBadge.style.fill = hot ? C.fire : C.textDim;

  ui.coins.text = `🪙 ${Math.round(anim.coinsShown).toLocaleString()}`;
  ui.level.text = `Lv ${w.level}`;
  ui.tokens.text = `🎟️ ${w.helpTokens}`;

  drawSlots();

  // build row: BUILD button OR Golden Hour
  const br = ui._buildRow;
  const inGH = !!view.goldenHour;
  ui.buildBtn.root.visible = !inGH;
  ui.ghLabel.visible = inGH;
  ui.ghHelpers.visible = inGH;
  if (br) {
    if (!inGH) {
      const affordable = w.coins >= view.nextBuildCost && view.canBuild;
      const boost = w.buildBoost ? ' (−25%)' : '';
      ui.buildBtn.setText(`🔨 Build · 🪙${view.nextBuildCost.toLocaleString()}${boost}`);
      ui.buildBtn.redraw(br.x, br.y, br.w, br.h, {
        color: C.green, edge: C.greenEdge, enabled: affordable, fontSize: 16, textColor: C.text,
      });
      ui.ghTrack.clear();
      ui.ghFill.clear();
    } else {
      const gh = view.goldenHour!;
      const msLeft = Math.max(0, anim.ghEndsAt - Date.now());
      const secs = Math.ceil(msLeft / 1000);
      ui.ghLabel.text = `🌟 GOLDEN HOUR  ${secs}s`;
      ui.ghLabel.position.set(br.cx, br.y + 9);
      const hfrac = gh.helpers / gh.maxHelpers;
      ui.ghTrack.clear();
      ui.ghTrack.roundRect(br.x, br.y + 22, br.w, 10, 5).fill({ color: C.fireDim });
      ui.ghFill.clear();
      if (hfrac > 0.001) ui.ghFill.roundRect(br.x, br.y + 22, Math.max(8, br.w * hfrac), 10, 5).fill({ color: C.gold });
      ui.ghHelpers.text = `${gh.helpers}/${gh.maxHelpers} helping`;
      ui.ghHelpers.position.set(br.cx, br.y + 38);
    }
  }

  // stranger pool rows
  const pool = view.strangerPool;
  for (let i = 0; i < ui.poolRows.length; i++) {
    const row = ui.poolRows[i];
    const g = row._geom;
    const data = pool[i];
    const show = !!data && !!g;
    row.name.visible = show; row.sub.visible = show; row.btn.root.visible = show;
    row.track.clear(); row.fill.clear();
    if (!show) { row.botId = -1; continue; }
    row.botId = data.botId;
    row.name.text = `${data.name}`;
    row.sub.text = `${data.building} · ${Math.ceil(data.msLeft / 1000)}s left`;
    // mini progress under the name
    const barY = g.y + g.h - 7;
    const barW = g.w * 0.46;
    row.track.roundRect(g.x + 2, barY, barW, 4, 2).fill({ color: C.fireDim });
    if (data.progress > 0.001) row.fill.roundRect(g.x + 2, barY, Math.max(3, barW * data.progress), 4, 2).fill({ color: C.green });
    // HELP button on the right
    const bw = 78, bh = 30;
    row.btn.setText('HELP');
    row.btn.redraw(g.x + g.w - bw, g.y + (g.h - bh) / 2, bw, bh, {
      color: C.green, edge: C.greenEdge, fontSize: 14, textColor: C.text,
    });
  }
}

// ── actions ────────────────────────────────────────────────────────────────────
async function onSpin() {
  if (anim.phase !== 'idle' || !sessionId) {
    if (!sessionId) setStatus('offline — start the server');
    return;
  }
  unlockAudio();
  if (navigator.vibrate) navigator.vibrate(8);
  anim.phase = 'spinning';
  anim.elapsed = 0;
  anim.flipAcc = 0;
  anim.pending = null;
  anim.pendingView = null;
  anim.lastSpinAt = Date.now();
  ui.result.text = '';
  ui.spinBtn.setText('…');
  event(sessionId, 'spin_tap', { momentum: anim.momentumShown, hot: anim.momentumShown >= (cfg?.momentum.hotThreshold ?? 1.5) });
  try {
    const res = await spin(sessionId);
    anim.pending = res.result;
    anim.pendingView = res;
  } catch (err) {
    console.error(err);
    setStatus('spin failed — server?');
    anim.phase = 'idle';
    ui.spinBtn.setText('SPIN');
  }
}

async function onBuild() {
  if (!sessionId || !view) return;
  unlockAudio();
  if (navigator.vibrate) navigator.vibrate(12);
  try {
    const res = await build(sessionId);
    if (!res.build.ok) {
      toasts.push(`can't build: ${res.build.reason}`, C.fire, C.fire);
    } else {
      toasts.push(`🔨 Building started — Golden Hour open!`, C.gold, C.gold);
      burstAtVillage(20, 0.6);
      sfxBuild();
    }
    applyView(res);
  } catch (err) {
    console.error(err);
  }
}

async function onHelp(botId: number) {
  if (!sessionId || botId < 0) return;
  unlockAudio();
  if (navigator.vibrate) navigator.vibrate(10);
  try {
    const res = await help(sessionId, botId);
    if (!res.help.ok && res.help.reason) toasts.push(`${res.help.reason}`, C.textDim, C.panelEdge);
    applyView(res);
  } catch (err) {
    console.error(err);
  }
}

function land() {
  const r = anim.pending!;
  const v = anim.pendingView!;
  anim.phase = 'idle';
  anim.reelPop = 1.35;
  ui.reelIcon.text = r.icon;
  ui.spinBtn.setText('SPIN');

  let msg = r.label;
  if (r.coinsAwarded > 0) msg = `+${r.coinsAwarded.toLocaleString()} 🪙`;
  if (r.kind === 'jackpot') msg = `JACKPOT  +${r.coinsAwarded.toLocaleString()} 🪙`;
  if (r.kind === 'momentum_spark') msg = `🔥 Momentum +${(r.momentumAfter - r.momentumBefore).toFixed(1)}×`;
  if (r.kind === 'help_tokens') msg = `+${r.tokensAwarded} Help Token`;
  if (r.kind === 'extra_spins') msg = `+${r.extraSpins} Spins`;
  if (r.kind === 'build_boost') msg = `🔨 Build Boost ready`;
  if (r.kind === 'rare_card') msg = `🃏 Rare Card!`;
  ui.result.text = msg;
  ui.result.style.fill = r.coinsAwarded > 0 || r.kind === 'jackpot' ? C.gold : C.text;

  if (r.kind === 'jackpot') {
    landJackpot();
    confetti.burst(ui._reelGeom.cx, ui._reelGeom.cy, 50, 0.8);
    if (navigator.vibrate) navigator.vibrate([20, 40, 20, 40, 60]);
  } else if (r.kind === 'momentum_spark') {
    landSpark();
    if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
  } else if (r.coinsAwarded > 0 || r.kind === 'rare_card') {
    landWin();
    if (navigator.vibrate) navigator.vibrate(18);
  } else {
    landCommon();
    if (navigator.vibrate) navigator.vibrate(10);
  }
  if (r.coinsAwarded > 0) spawnFloater(`+${r.coinsAwarded}`, C.gold);

  // commit authoritative view (coins tween toward wallet)
  applyView(v);
}

function spawnFloater(text: string, color: number) {
  const t = txt(text, 24, color, '900');
  t.anchor.set(0.5);
  const { cx, cy, r } = ui._reelGeom;
  t.position.set(cx, cy - r - 8);
  app.stage.addChild(t);
  floaters.push({ t, vy: -0.06, life: 850 });
}

// ── frame update ────────────────────────────────────────────────────────────────
function update(dt: number) {
  if (anim.phase === 'spinning') {
    anim.elapsed += dt;
    anim.flipAcc += dt;
    const p = Math.min(1, anim.elapsed / anim.duration);
    const interval = 40 + p * p * 150;
    if (anim.flipAcc >= interval) {
      anim.flipAcc = 0;
      ui.reelIcon.text = ALL_ICONS[(Math.random() * ALL_ICONS.length) | 0];
      tick(p);
    }
    if (anim.elapsed >= anim.duration && anim.pending) land();
  }

  if (anim.reelPop !== 1) {
    anim.reelPop += (1 - anim.reelPop) * Math.min(1, dt / 90);
    if (Math.abs(anim.reelPop - 1) < 0.01) anim.reelPop = 1;
    ui.reelIcon.scale.set(anim.reelPop);
    drawReelRing(0.92 + 0.08 * anim.reelPop);
  }

  // local momentum decay between syncs (visible bleed → urgency)
  if (view && cfg && anim.phase === 'idle') {
    const min = cfg.momentum.min;
    if (anim.momentumShown > min) {
      anim.momentumShown = Math.max(min, anim.momentumShown - cfg.momentum.decayPerSec * (dt / 1000));
    }
  }

  // coins tween toward authoritative wallet
  if (view) {
    const target = view.wallet.coins;
    const k = Math.min(1, dt / 320);
    anim.coinsShown += (target - anim.coinsShown) * k;
    if (Math.abs(target - anim.coinsShown) < 0.5) anim.coinsShown = target;
  }

  refreshAll();
  confetti.update(dt);
  toasts.update(dt);

  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    f.t.y += f.vy * dt;
    f.t.alpha = Math.max(0, f.life / 850);
    if (f.life <= 0) {
      app.stage.removeChild(f.t);
      f.t.destroy();
      floaters.splice(i, 1);
    }
  }
}

// dev-only: ?demo=N drives the real loop (spin to afford → build → help) for
// headless verification (iOS Simulator).
async function runDemo(n: number) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < n; i++) {
    while (anim.phase !== 'idle') await wait(120);
    await onSpin();
    await wait(950);
    if (view && view.canBuild && view.wallet.coins >= view.nextBuildCost) {
      await onBuild();
      await wait(600);
    }
    if (view && view.strangerPool.length && i % 2 === 1) {
      await onHelp(view.strangerPool[0].botId);
      await wait(600);
    }
  }
}

boot().catch((e) => {
  console.error('boot failed', e);
  const el = document.getElementById('app');
  if (el) el.innerHTML = `<pre style="color:#f3e9d8;padding:20px">boot failed: ${e}</pre>`;
});
