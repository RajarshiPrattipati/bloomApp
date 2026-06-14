import { Application } from 'pixi.js';
import { SceneManager } from './core/scene.js';
import { BloomClient } from './net/client.js';
import { GameScene } from './scenes/GameScene.js';

async function boot() {
  const app = new Application();
  await app.init({
    background: 0x17110c,
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 3),
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  const client = new BloomClient();
  const cfg = await client.getConfig();
  const scenes = new SceneManager(app);
  await scenes.go(new GameScene(client, cfg));
}

boot().catch((e) => {
  console.error('boot failed', e);
  const el = document.getElementById('app');
  if (el) el.innerHTML = `<pre style="color:#f3e9d8;padding:20px">boot failed: ${e}</pre>`;
});
