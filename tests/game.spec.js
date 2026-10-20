import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.startsWith("mobile portrait")) return;
  await page.goto("/");
  await expect(page.locator(".board")).toHaveAttribute(
    "data-status",
    "playing",
  );
  await expect(page.locator(".progress-section")).toBeVisible();
  await expect(page.locator(".collection li")).toHaveCount(10);
});

test("all ten cat textures decode with transparency and one canvas mounts", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(
    await page.evaluate(() => {
      const scene = document
        .querySelector(".phaser-host>div")
        .__phaserGame.scene.getScene("CatMerge");
      return Array.from({ length: 10 }, (_, index) => {
        const source = scene.textures.get(`cat-${index + 1}`).getSourceImage();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1024;
        const context = canvas.getContext("2d");
        context.drawImage(source, 0, 0);
        return (
          source.naturalWidth === 1024 &&
          context.getImageData(0, 0, 1, 1).data[3] === 0
        );
      });
    }),
  ).toEqual(Array(10).fill(true));
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("pointer drops match next preview, settle on floor and remain within walls", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const next = Number(
    (await page.getByAltText(/Next cat/).getAttribute("alt")).match(/\d+/)[0],
  );
  const canvas = page.locator("canvas");
  await canvas.click({ position: { x: 90, y: 150 } });
  expect(
    await page.evaluate(() => {
      const scene = document
        .querySelector(".phaser-host>div")
        .__phaserGame.scene.getScene("CatMerge");
      return {
        current: scene.current,
        preview: scene.preview.texture.key,
        drops: scene.state.drops,
      };
    }),
  ).toEqual({ current: next, preview: `cat-${next}`, drops: 1 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = document
          .querySelector(".phaser-host>div")
          .__phaserGame.scene.getScene("CatMerge");
        const cat = [...scene.cats.values()][0];
        return Math.abs(cat.sprite.y + cat.sprite.body.circleRadius - scene.floor) < 3;
      }),
    )
    .toBe(true);
  await canvas.click({ position: { x: 2, y: 150 } });
  await page.waitForTimeout(1600);
  expect(
    await page.evaluate(() => {
      const scene = document
        .querySelector(".phaser-host>div")
        .__phaserGame.scene.getScene("CatMerge");
      return [...scene.cats.values()].every(
        (c) =>
          c.sprite.body.bounds.min.x > scene.left - 2 &&
          c.sprite.body.bounds.max.x < scene.right + 2 &&
          c.sprite.body.bounds.max.y < scene.floor + 3,
      );
    }),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("real collisions merge once, update best immediately, persist and restart", async ({
  page,
}) => {
  await page.evaluate(() => {
    const scene = document
      .querySelector(".phaser-host>div")
      .__phaserGame.scene.getScene("CatMerge");
    scene.spawn(1, 240, 540);
    scene.spawn(1, 240, 470);
  });
  await expect(page.getByTestId("score")).toHaveText("4");
  await expect(page.getByTestId("best")).toHaveText("4");
  expect(
    await page.evaluate(() => {
      const scene = document
        .querySelector(".phaser-host>div")
        .__phaserGame.scene.getScene("CatMerge");
      return [...scene.cats.values()].map((c) => c.tier);
    }),
  ).toEqual([2]);
  await page.getByRole("button", { name: "Mute sound" }).click();
  await page.reload();
  await expect(page.locator(".board")).toHaveAttribute(
    "data-status",
    "playing",
  );
  await expect(page.locator(".progress-section")).toBeVisible();
  await expect(page.locator(".collection li")).toHaveCount(10);
  await expect(page.getByTestId("score")).toHaveText("0");
  await expect(page.getByTestId("best")).toHaveText("4");
  await expect(
    page.getByRole("button", { name: "Enable sound" }),
  ).toBeVisible();
  await page.locator(".phaser-host").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Start fresh" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start fresh" })
    .click();
  await expect(page.getByTestId("best")).toHaveText("4");
  expect(
    await page.evaluate(
      () =>
        document
          .querySelector(".phaser-host>div")
          .__phaserGame.scene.getScene("CatMerge").cats.size,
    ),
  ).toBe(0);
});

test("danger grace period, game over, disabled drops and restart", async ({
  page,
}) => {
  await page.evaluate(() => {
    const scene = document
      .querySelector(".phaser-host>div")
      .__phaserGame.scene.getScene("CatMerge");
    // A stable body above the line isolates the overflow timer from random stacking.
    scene.spawn(4, 240, 150).sprite.setStatic(true);
  });
  await page.waitForTimeout(1200);
  await expect(page.locator(".board")).toHaveAttribute(
    "data-status",
    "playing",
  );
  await expect(
    page.getByRole("heading", { name: "Full of fluff!" }),
  ).toBeVisible({ timeout: 6000 });
  expect(
    await page.evaluate(() => {
      const scene = document
        .querySelector(".phaser-host>div")
        .__phaserGame.scene.getScene("CatMerge");
      scene.drop();
      return scene.cats.size;
    }),
  ).toBe(1);
  await page.getByRole("button", { name: "One more round" }).click();
  await expect(page.locator(".board")).toHaveAttribute(
    "data-status",
    "playing",
  );
  await expect(page.getByTestId("score")).toHaveText("0");
  await page.locator("canvas").click({ position: { x: 150, y: 150 } });
  expect(
    await page.evaluate(
      () =>
        document
          .querySelector(".phaser-host>div")
          .__phaserGame.scene.getScene("CatMerge").cats.size,
    ),
  ).toBe(1);
});

test("highest-tier pairs do not merge beyond tier ten and simultaneous pairs score once each", async ({
  page,
}) => {
  await page.evaluate(() => {
    const scene = document
      .querySelector(".phaser-host>div")
      .__phaserGame.scene.getScene("CatMerge");
    scene.spawn(1, 100, 540);
    scene.spawn(1, 100, 490);
    scene.spawn(1, 360, 540);
    scene.spawn(1, 360, 490);
  });
  await expect(page.getByTestId("score")).toHaveText("8");
  await page.evaluate(() => {
    const scene = document
      .querySelector(".phaser-host>div")
      .__phaserGame.scene.getScene("CatMerge");
    scene.restart();
    scene.spawn(10, 150, 450);
    scene.spawn(10, 330, 450);
  });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("score")).toHaveText("0");
  expect(
    await page.evaluate(
      () =>
        document
          .querySelector(".phaser-host>div")
          .__phaserGame.scene.getScene("CatMerge").cats.size,
    ),
  ).toBe(2);
});

test("help pauses physics and traps focus", async ({ page }) => {
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.getByRole("button", { name: "Let's play" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Let's play" })).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        document
          .querySelector(".phaser-host>div")
          .__phaserGame.scene.getScene("CatMerge").matter.world.enabled,
    ),
  ).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("mobile portrait touch, no overflow, visible controls and rotation", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".board")).toHaveAttribute(
    "data-status",
    "playing",
    { timeout: 15000 },
  );
  await expect(page.locator(".progress-section")).toBeVisible();
  await expect(page.locator(".collection li")).toHaveCount(10);
  expect(
    await page
      .locator(".collection")
      .evaluate((list) => list.scrollWidth > list.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
  ).toBe(true);
  const footer = await page.locator("footer").boundingBox();
  expect(footer.y + footer.height).toBeLessThanOrEqual(844);
  const canvas = await page.locator("canvas").boundingBox();
  await page.touchscreen.tap(canvas.x + canvas.width * 0.65, canvas.y + 160);
  expect(
    await page.evaluate(
      () =>
        document
          .querySelector(".phaser-host>div")
          .__phaserGame.scene.getScene("CatMerge").state.drops,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      () => getComputedStyle(document.querySelector("canvas")).touchAction,
    ),
  ).toBe("none");
  await page.setViewportSize({ width: 320, height: 667 });
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.screenshot({ path: "artifacts/mobile-small.png", fullPage: true });
  await context.close();
});

test("repaired cats decode with their original colors and transparency", async ({
  page,
}) => {
  const pixels = await page.evaluate(async () => {
    return Promise.all(
      [7, 9].map(async (tier) => {
        const response = await fetch(`/assets/cats/${tier}-3d-ball.png`);
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1024;
        const context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0);
        const center = [...context.getImageData(512, 500, 1, 1).data];
        const corner = [...context.getImageData(0, 0, 1, 1).data];
        bitmap.close();
        return { tier, center, corner };
      }),
    );
  });
  for (const { center, corner } of pixels) {
    expect(center[0]).toBeGreaterThan(100);
    expect(center[3]).toBeGreaterThan(240);
    expect(corner[3]).toBe(0);
  }
});

test("larger desktop board stays accessible at common screen heights", async ({
  page,
}) => {
  for (const [width, height, minimumBoardWidth] of [
    [768, 900, 490],
    [980, 768, 540],
    [1366, 768, 540],
    [1440, 900, 675],
    [1440, 1000, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const host = document.querySelector(".phaser-host");
          const canvas = host.querySelector("canvas");
          const game = host.firstElementChild.__phaserGame;
          return (
            Math.abs(canvas.width - game.scale.width) < 1 &&
            Math.abs(canvas.height - game.scale.height) < 1 &&
            Math.abs(canvas.width - host.getBoundingClientRect().width) < 1 &&
            Math.abs(canvas.height - host.getBoundingClientRect().height) < 1
          );
        }),
      )
      .toBe(true);
    const layout = await page.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      collectionVisible: getComputedStyle(
        document.querySelector(".progress-section"),
      ).display !== "none",
      collectionCount: document.querySelectorAll(".collection li").length,
      boardWidth: document.querySelector(".board").getBoundingClientRect()
        .width,
      boardBottom: document.querySelector(".board").getBoundingClientRect()
        .bottom,
      footerTop: document.querySelector("footer").getBoundingClientRect().top,
      footerBottom: document.querySelector("footer").getBoundingClientRect()
        .bottom,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(width);
    expect(layout.collectionVisible).toBe(true);
    expect(layout.collectionCount).toBe(10);
    expect(layout.boardWidth).toBeGreaterThanOrEqual(minimumBoardWidth);
    expect(layout.scrollHeight).toBeLessThanOrEqual(height);
    expect(layout.footerTop).toBeGreaterThanOrEqual(layout.boardBottom);
    expect(layout.footerBottom).toBeLessThanOrEqual(height);
  }

  await page.evaluate(() => {
    const scene = document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge");
    scene.spawn(1, scene.width / 2, scene.floor - scene.radius(1));
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge");
        const cat = [...scene.cats.values()][0];
        return (
          scene.cats.size === 1 &&
          scene.cats.has(cat.sprite.body.id) &&
          Math.abs(cat.sprite.body.circleRadius - (scene.width / 480) * 25) < 1
        );
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const scene = document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge");
    const cat = [...scene.cats.values()][0];
    scene.spawn(1, cat.sprite.x, cat.sprite.y);
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.querySelector(".phaser-host>div").__phaserGame.scene.getScene("CatMerge").state.score,
      ),
    )
    .toBeGreaterThan(0);
});
