const { test, expect } = require("@playwright/test");
test.beforeEach(async ({ page }) => {
  await page.route("**/analytics/script.js", (route) =>
    route.fulfill({ body: "", contentType: "application/javascript" }),
  );
  await page.route("**/healthz", (route) =>
    route.fulfill({
      json: { ok: true },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
});
for (const theme of ["casino", "plain", "rugged"]) {
  test(`3D and Classic preserve the same workout in ${theme}`, async ({
    page,
  }) => {
    await page.goto(`/index.html#theme=${theme}`);
    await expect(
      page.locator("[data-presentation-select]").first(),
    ).toHaveValue("three");
    await page.click("#start-workout");
    await expect(page.locator("#tabletop canvas")).toBeVisible();
    if (theme === "casino" || theme === "rugged") {
      const canvas = page.locator("#tabletop canvas");
      const bounds = await canvas.boundingBox();
      await canvas.click({
        position: { x: bounds.width * 0.24, y: bounds.height * 0.28 },
      });
      await expect.poll(() => page.evaluate(() => deck.length)).toBe(48);
    } else {
      await page.click("#draw-button");
    }
    const state = await page.evaluate(() => ({
      deck: deck,
      draw: lastDrawn,
      round: roundNumber,
      url: location.hash,
    }));
    await page
      .locator("#app [data-presentation-select]")
      .selectOption("classic");
    await expect(page.locator("#drawn-cards .card")).toHaveCount(4);
    expect(
      await page.evaluate(() => ({
        deck,
        draw: lastDrawn,
        round: roundNumber,
        url: location.hash,
      })),
    ).toEqual(state);
    await page.locator("#app [data-presentation-select]").selectOption("three");
    await expect(page.locator("#tabletop canvas")).toBeVisible();
    expect(
      await page.evaluate(() => ({
        deck,
        draw: lastDrawn,
        round: roundNumber,
        url: location.hash,
      })),
    ).toEqual(state);
    await page.reload();
    await expect(page.locator("#tabletop canvas")).toBeVisible();
    expect(await page.evaluate(() => lastDrawn)).toEqual(state.draw);
  });
}
test("graphics failure falls back without changing preference", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith("webgl")
        ? null
        : original.call(this, type, ...args);
    };
  });
  await page.goto("/");
  await page.click("#start-workout");
  await expect(page.locator("#presentation-notice")).toContainText("Classic");
  await page.click("#draw-button");
  await expect(page.locator("#drawn-cards .card")).toHaveCount(4);
  expect(
    await page.evaluate(() => localStorage.getItem("deckOfGains:presentation")),
  ).not.toBe("classic");
});
test("reduced motion, eight card hand, context loss and responsive layout", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.click("#start-workout");
  await expect(page.locator("#tabletop canvas")).toBeVisible();
  await page.evaluate(() => {
    deck = deck.slice(0, 8);
    drawCards();
  });
  await expect(page.locator("#tabletop")).toHaveAttribute(
    "data-card-count",
    "8",
  );
  await expect(page.locator("#tabletop")).toHaveAttribute(
    "data-animating",
    "false",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator("#tabletop canvas")
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(page.locator("#drawn-cards .card")).toHaveCount(8);
  await expect(page.locator("#presentation-notice")).toContainText("Classic");
});
test("slow health check does not block solo controls", async ({ page }) => {
  await page.route(
    "**/healthz",
    (route) =>
      new Promise((resolve) =>
        setTimeout(async () => {
          await route.abort().catch(() => {});
          resolve();
        }, 6000),
      ),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.click("#start-workout", { timeout: 2000 });
  await page.click("#draw-button", { timeout: 2000 });
  expect(await page.evaluate(() => deck.length)).toBe(48);
});

test("view switching preserves auto countdown and emits no extra draw events", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__events = [];
    window.umami = {
      track: (name, data) => window.__events.push({ name, data }),
      identify: () => {},
    };
  });
  await page.goto("/#auto=1&autoIntervalSeconds=20");
  await page.click("#start-workout");
  await expect(page.locator("#tabletop canvas")).toBeVisible();
  await page.click("#draw-button");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__events.filter((e) => e.name === "round_drawn").length,
      ),
    )
    .toBe(1);
  const remaining = Number(
    new URLSearchParams(new URL(page.url()).hash.slice(1)).get(
      "autoRemainingSeconds",
    ),
  );
  await page.locator("#app [data-presentation-select]").selectOption("classic");
  await page.locator("#app [data-presentation-select]").selectOption("three");
  await expect(page.locator("#tabletop canvas")).toBeVisible();
  const after = Number(
    new URLSearchParams(new URL(page.url()).hash.slice(1)).get(
      "autoRemainingSeconds",
    ),
  );
  expect(after).toBeLessThanOrEqual(remaining);
  expect(after).toBeGreaterThan(remaining - 8);
  expect(
    await page.evaluate(
      () => window.__events.filter((e) => e.name === "round_drawn").length,
    ),
  ).toBe(1);
  expect(await page.evaluate(() => deck.length)).toBe(48);
});

test("rapid draws settle on latest hand and keyboard switches views", async ({
  page,
}) => {
  await page.goto("/");
  await page.click("#start-workout");
  await expect(page.locator("#tabletop canvas")).toBeVisible();
  await page.evaluate(() => {
    drawCards();
    drawCards();
    drawCards();
  });
  await expect(page.locator("#tabletop")).toHaveAttribute(
    "data-animating",
    "false",
  );
  const cards = await page.evaluate(() => lastDrawn);
  expect(await page.evaluate(() => deck.length)).toBe(40);
  for (const card of cards)
    await expect(page.locator("#tabletop")).toHaveAttribute(
      "aria-label",
      new RegExp(`${card.number} of ${card.suit}`),
    );
  const selector = page.locator("#app [data-presentation-select]");
  await selector.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(selector).toHaveValue("classic");
  await expect(page.locator("#drawn-cards .card")).toHaveCount(4);
});

test("blocked browser storage still allows changing views", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage unavailable");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage unavailable");
    };
  });
  await page.goto("/");
  await page.click("#start-workout");
  await expect(page.locator("#tabletop canvas")).toBeVisible();
  await page.locator("#app [data-presentation-select]").selectOption("classic");
  await page.click("#draw-button");
  await expect(page.locator("#drawn-cards .card")).toHaveCount(4);
});

test("Classic and 3D participants share game state without sharing view preference", async ({
  page,
  browser,
}) => {
  const classic = await browser.newPage();
  let roomState = null;
  const updates = [];
  try {
    await classic.addInitScript(() =>
      localStorage.setItem("deckOfGains:presentation", "classic"),
    );
    for (const participant of [page, classic]) {
      await participant.route("**/healthz", (route) =>
        route.fulfill({
          json: { ok: true },
          headers: { "Access-Control-Allow-Origin": "*" },
        }),
      );
      await participant.route("**/analytics/script.js", (route) =>
        route.fulfill({ body: "" }),
      );
      await participant.route("**/api/rooms/shared", (route) =>
        route.fulfill({
          json: { state: roomState },
          headers: { "Access-Control-Allow-Origin": "*" },
        }),
      );
      await participant.exposeFunction("__broadcast", async ({ state }) => {
        roomState = state;
        updates.push(state);
        const other = participant === page ? classic : page;
        await other.evaluate((state) => window.__receive?.({ state }), state);
      });
      await participant.addInitScript(() => {
        window.__deckOfGainsSocket = class {
          connect() {}
          disconnect() {}
          channel() {
            return {
              on: (event, handler) => {
                window.__receive = handler;
              },
              join: () => {
                const response = { receive: () => response };
                return response;
              },
              push: (event, payload) => {
                void window.__broadcast(payload);
              },
              leave() {},
            };
          }
        };
      });
      await participant.goto("http://127.0.0.1:8001/#room=shared");
      await expect(participant.locator("#start-workout")).toBeEnabled();
    }
    await page.click("#start-workout");
    await expect(classic.locator("#app")).toBeVisible();
    await expect(page.locator("#tabletop canvas")).toBeVisible();
    await page.click("#draw-button");
    await expect(classic.locator("#drawn-cards .card")).toHaveCount(4);
    expect(
      await classic.evaluate(() => ({ deck, lastDrawn, roundNumber })),
    ).toEqual(await page.evaluate(() => ({ deck, lastDrawn, roundNumber })));
    const count = updates.length;
    await page
      .locator("#app [data-presentation-select]")
      .selectOption("classic");
    expect(updates.length).toBe(count);
    await expect(
      classic.locator("#app [data-presentation-select]"),
    ).toHaveValue("classic");
    await classic.click("#draw-button");
    await expect.poll(() => page.evaluate(() => deck.length)).toBe(44);
    expect(await classic.evaluate(() => lastDrawn)).toEqual(
      await page.evaluate(() => lastDrawn),
    );
  } finally {
    await classic.close();
  }
});

test("legacy theme aliases and minute intervals survive migration", async ({
  page,
}) => {
  for (const suffix of [
    "?rugged=true",
    "#rugged=true",
    "?theme=rugged",
    "#theme=rugged",
  ]) {
    await page.goto(`/index.html${suffix}`);
    await expect(page.locator("body")).toHaveAttribute("data-theme", "rugged");
  }
  await page.goto("/index.html?auto=1&autoInterval=1.5");
  await expect(page.locator("#auto-draw-minutes")).toHaveValue("1");
  await expect(page.locator("#auto-draw-seconds")).toHaveValue("30");
});
