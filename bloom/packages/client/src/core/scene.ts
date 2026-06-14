// Minimal scene framework over PixiJS. A Scene owns a Container; the manager
// forwards resize/update and handles transitions.

import type { Application, Container } from 'pixi.js';

export interface Scene {
  readonly root: Container;
  mount(app: Application): void | Promise<void>;
  unmount(): void;
  resize(width: number, height: number): void;
  update(dtMs: number): void;
}

export class SceneManager {
  private current: Scene | null = null;
  constructor(private app: Application) {
    app.ticker.add((t) => this.current?.update(t.deltaMS));
    app.renderer.on('resize', () => this.current?.resize(app.screen.width, app.screen.height));
  }

  async go(scene: Scene): Promise<void> {
    if (this.current) {
      this.current.unmount();
      this.app.stage.removeChild(this.current.root);
    }
    this.current = scene;
    this.app.stage.addChild(scene.root);
    await scene.mount(this.app);
    scene.resize(this.app.screen.width, this.app.screen.height);
  }
}
