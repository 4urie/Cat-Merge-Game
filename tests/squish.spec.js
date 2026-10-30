import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".board")).toHaveAttribute("data-status", "playing");
});

test("floor pressure persists, artwork recovers on release, and collider never scales", async ({ page }) => {
  const result = await page.evaluate(() => {
    const scene = document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge");
    scene.matter.world.autoUpdate = false;
    const cat = scene.spawn(2, scene.width / 2, scene.floor - scene.radius(2));
    cat.sprite.setFixedRotation();
    const body = cat.sprite.body;
    const before = { radius: body.circleRadius, mass: body.mass, id: body.id };
    const step = (n) => { for (let i = 0; i < n; i++) scene.matter.world.step(1000 / 60); };
    step(180);
    const resting = { x: cat.squish.xx, y: cat.squish.yy, speed: body.speed };
    step(120);
    const settled = cat.squish.yy;
    cat.sprite.setIgnoreGravity(true).setPosition(scene.width / 2, scene.height / 2).setVelocity(0, 0);
    let rebound = false;
    for (let i = 0; i < 180; i++) {
      step(1);
      if (cat.squish.yy > 0.001) rebound = true;
    }
    return {
      before, after: { radius: body.circleRadius, mass: body.mass, id: body.id },
      resting, settled, rebound,
      released: [cat.visual.scaleX, cat.visual.scaleY],
      centered: Math.hypot(cat.visual.x - cat.sprite.x, cat.visual.y - cat.sprite.y),
      artworkWidth: cat.artwork.displayWidth,
      expectedWidth: scene.radius(2) * 2.15,
    };
  });
  expect(result.resting.y).toBeLessThan(-0.025);
  expect(result.resting.x).toBeGreaterThan(0.015);
  expect(result.resting.speed).toBeLessThan(0.05);
  expect(Math.abs(result.settled - result.resting.y)).toBeLessThan(0.002);
  expect(result.rebound).toBe(true);
  expect(result.released).toEqual([1, 1]);
  expect(result.centered).toBeLessThan(0.001);
  expect(result.after).toEqual(result.before);
  expect(result.artworkWidth).toBeCloseTo(result.expectedWidth, 5);
});

test("strong normal impacts squash more than light impacts and sideways hits compress sideways", async ({ page }) => {
  const result = await page.evaluate(() => {
    const scene = document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge");
    scene.matter.world.autoUpdate = false;
    function impact(speed, wall = false) {
      scene.restart();
      const cat = scene.spawn(1,
        wall ? scene.left + scene.radius(1) + 2 : scene.width / 2,
        wall ? scene.height / 2 : scene.floor - scene.radius(1) - 2);
      cat.sprite.setFixedRotation();
      cat.sprite.setVelocity(wall ? -speed : 0, wall ? 0 : speed);
      if (wall) cat.sprite.setIgnoreGravity(true);
      let peak = 0, bulge = 0;
      for (let i = 0; i < 90; i++) {
        scene.matter.world.step(1000 / 60);
        peak = Math.max(peak, -(wall ? cat.squish.xx : cat.squish.yy));
        bulge = Math.max(bulge, wall ? cat.squish.yy : cat.squish.xx);
      }
      return { peak, bulge, radius: cat.sprite.body.circleRadius, expectedRadius: scene.radius(1) };
    }
    return { light: impact(2), heavy: impact(14), wall: impact(14, true) };
  });
  expect(result.heavy.peak).toBeGreaterThan(result.light.peak * 1.6);
  expect(result.heavy.peak).toBeGreaterThan(0.10);
  expect(result.wall.peak).toBeGreaterThan(0.10);
  expect(result.wall.bulge).toBeGreaterThan(0.05);
  for (const state of Object.values(result)) {
    expect(state.peak).toBeLessThan(0.25);
    expect(state.radius).toBe(state.expectedRadius);
  }
});

test("opposing contacts combine pressure in a tight gap without growing the collider", async ({ page }) => {
  const result = await page.evaluate(() => {
    const scene = document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge");
    scene.matter.world.autoUpdate = false;
    const x = scene.width / 2, y = scene.height * 0.6, r = scene.radius(1);
    const cat = scene.spawn(1, x, y);
    cat.sprite.setIgnoreGravity(true).setFixedRotation();
    const left = scene.spawn(3, x - r - scene.radius(3) + 2 * scene.unit, y);
    left.sprite.setStatic(true);
    const right = scene.spawn(4, x + r + scene.radius(4) - 2 * scene.unit, y);
    right.sprite.setStatic(true);
    const step = (n) => { for (let i = 0; i < n; i++) scene.matter.world.step(1000 / 60); };
    step(180);
    const light = { x: cat.squish.xx, y: cat.squish.yy };
    left.sprite.setPosition(left.sprite.x + 4 * scene.unit, y);
    right.sprite.setPosition(right.sprite.x - 4 * scene.unit, y);
    step(180);
    const heavy = { x: cat.squish.xx, y: cat.squish.yy };
    const radius = cat.sprite.body.circleRadius;
    left.sprite.setPosition(scene.left + scene.radius(3), scene.height * 0.35);
    right.sprite.setPosition(scene.right - scene.radius(4), scene.height * 0.35);
    step(180);
    return { light, heavy, radius, expectedRadius: r, released: [cat.visual.scaleX, cat.visual.scaleY] };
  });
  expect(result.light.x).toBeLessThan(-0.025);
  expect(result.light.y).toBeGreaterThan(0.015);
  expect(result.heavy.x).toBeLessThan(result.light.x - 0.015);
  expect(result.heavy.y).toBeGreaterThan(result.light.y);
  expect(result.radius).toBe(result.expectedRadius);
  expect(result.released).toEqual([1, 1]);
});

test("pause freezes deformation, resize preserves its relative size, and restart clears visuals", async ({ page }) => {
  await page.evaluate(() => {
    const scene = document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge");
    const cat = scene.spawn(3, scene.width / 2, scene.floor - scene.radius(3));
    cat.squish.impact(0, 1, 12);
  });
  await page.getByRole("button", { name: "How to play" }).click();
  const before = await page.evaluate(() => {
    const cat = [...document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge").cats.values()][0];
    return [cat.visual.scaleX, cat.visual.scaleY, cat.sprite.x, cat.sprite.y];
  });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => {
    const cat = [...document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge").cats.values()][0];
    return [cat.visual.scaleX, cat.visual.scaleY, cat.sprite.x, cat.sprite.y];
  })).toEqual(before);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => {
    const scene = document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge");
    const cat = [...scene.cats.values()][0];
    return Math.abs(cat.artwork.displayWidth / cat.sprite.body.circleRadius - 2.15);
  })).toBeLessThan(0.001);
  expect(await page.evaluate(() => {
    const cat = [...document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge").cats.values()][0];
    return [cat.visual.scaleX, cat.visual.scaleY];
  })).toEqual(before.slice(0, 2));
  await page.keyboard.press("Escape");
  const cleared = await page.evaluate(() => {
    const scene = document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge");
    const visuals = [...scene.cats.values()].map(cat => cat.visual);
    scene.restart();
    return scene.cats.size === 0 && visuals.every(visual => !visual.scene);
  });
  expect(cleared).toBe(true);
});

test("a crowded pile settles with bounded deformation and no added physics bodies", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const result = await page.evaluate(() => {
    const scene = document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge");
    scene.matter.world.autoUpdate = false;
    const step = n => {
      for (let i = 0; i < n; i++) {
        scene.matter.world.step(1000 / 60);
        scene.update();
      }
    };
    for (let i = 0; i < 24; i++) {
      const fraction = ((i * 7) % 11 + 1) / 12;
      scene.spawn(1 + i % 4, scene.left + (scene.right - scene.left) * fraction, scene.height * 0.35);
      step(25);
    }
    step(600);
    scene.state.drops = 24;
    scene.publish();
    const cats = [...scene.cats.values()];
    let maxOverlap = 0;
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        const a = cats[i], b = cats[j];
        const totalRadius = scene.radius(a.tier) + scene.radius(b.tier);
        maxOverlap = Math.max(maxOverlap, (totalRadius - Math.hypot(a.sprite.x - b.sprite.x, a.sprite.y - b.sprite.y)) / totalRadius);
      }
    }
    return {
      count: cats.length,
      bodyCount: scene.matter.world.localWorld.bodies.length,
      score: scene.state.score,
      maxOverlap,
      maxSpeed: Math.max(...cats.map(cat => cat.sprite.body.speed)),
      maxCompression: Math.max(...cats.map(cat => 1 - Math.min(cat.visual.scaleX, cat.visual.scaleY))),
      valid: cats.every(cat =>
        Number.isFinite(cat.visual.x + cat.visual.y + cat.visual.rotation) &&
        cat.visual.scaleX >= 0.8 && cat.visual.scaleY >= 0.8 &&
        cat.visual.scaleX <= 1.14 && cat.visual.scaleY <= 1.14 &&
        cat.sprite.body.circleRadius === scene.radius(cat.tier) &&
        cat.sprite.body.bounds.min.x > scene.left - 3 &&
        cat.sprite.body.bounds.max.x < scene.right + 3 &&
        cat.sprite.body.bounds.max.y < scene.floor + 3),
    };
  });
  expect(result.count).toBeGreaterThan(8);
  expect(result.bodyCount).toBe(result.count + 3); // Two walls and a floor.
  expect(result.score).toBeGreaterThan(0);
  expect(result.maxCompression).toBeGreaterThan(0.06);
  expect(result.maxOverlap).toBeLessThan(0.04);
  expect(result.maxSpeed).toBeLessThan(0.2);
  expect(result.valid).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/squishy-crowded-pile.png", fullPage: true });
});
