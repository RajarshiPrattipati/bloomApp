import { expect, test } from '@playwright/test';

// The canonical loop under test (PRD §6.1):
//   open → SPIN → afford → BUILD → Golden Hour opens → HELP a stranger →
//   momentum rises → telemetry recorded.
test('full loop: spin → build → golden hour → help → momentum', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) apiCalls.push(new URL(r.url()).pathname);
  });

  await page.goto('/');
  await page.waitForFunction(() => (window as any).__bloom?.ready === true, null, { timeout: 25_000 });

  // 1) a REAL canvas tap on the SPIN button proves the actual input path works
  const vp = page.viewportSize()!;
  const btnCY = vp.height - Math.max(24, vp.height * 0.04) - Math.max(66, vp.height * 0.085) / 2;
  await page.mouse.click(vp.width / 2, btnCY);
  await page.waitForTimeout(1200);
  expect(apiCalls.some((p) => p === '/api/spin')).toBeTruthy();

  // 2) spin (via hook) until a build is affordable, then build → Golden Hour opens
  await page.evaluate(async () => {
    const b = (window as any).__bloom;
    for (let i = 0; i < 80; i++) {
      const v = b.view();
      if (v && v.canBuild && v.wallet.coins >= v.nextBuildCost) break;
      await b.spin();
      await new Promise((r) => setTimeout(r, 920));
    }
  });
  const v1 = await page.evaluate(() => (window as any).__bloom.view());
  expect(v1.wallet.coins).toBeGreaterThanOrEqual(v1.nextBuildCost);

  await page.evaluate(async () => { await (window as any).__bloom.build(); });
  await page.waitForFunction(() => (window as any).__bloom.view()?.goldenHour != null, null, { timeout: 5_000 });
  const v2 = await page.evaluate(() => (window as any).__bloom.view());
  expect(v2.goldenHour).not.toBeNull();
  expect(v2.goldenHour.msLeft).toBeGreaterThan(0);
  expect(v2.village.constructing).toBe(true);

  // 3) help a stranger → momentum rises (the positive-sum core)
  const v3 = await page.evaluate(async () => {
    const b = (window as any).__bloom;
    const pool = b.view().strangerPool;
    const m0 = b.view().wallet.momentum;
    let helped = false;
    if (pool.length) {
      await b.help(pool[0].botId);
      await new Promise((r) => setTimeout(r, 450));
      helped = true;
    }
    return { m0, m1: b.view().wallet.momentum, helped };
  });
  if (v3.helped) expect(v3.m1).toBeGreaterThan(v3.m0);

  // 4) the server-authoritative telemetry pipeline was exercised end-to-end
  expect(apiCalls.filter((p) => p === '/api/spin').length).toBeGreaterThan(3);
  expect(apiCalls.some((p) => p === '/api/build')).toBeTruthy();
  expect(apiCalls.some((p) => p === '/api/help')).toBeTruthy();
});

// A second, focused assertion: the meter decays when idle (the urgency engine).
test('momentum decays when idle', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__bloom?.ready === true, null, { timeout: 25_000 });

  // bump momentum by helping, then idle and confirm it cools
  const res = await page.evaluate(async () => {
    const b = (window as any).__bloom;
    const pool = b.view().strangerPool;
    if (pool.length) { await b.help(pool[0].botId); await new Promise((r) => setTimeout(r, 400)); }
    const hot = b.view().wallet.momentum;
    await new Promise((r) => setTimeout(r, 4000)); // idle
    // read the locally-decayed display value
    const cooled = b.momentum();
    return { hot, cooled };
  });
  // only meaningful if we actually got above the floor
  if (res.hot > 1.05) expect(res.cooled).toBeLessThan(res.hot);
});
