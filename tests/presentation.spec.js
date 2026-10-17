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
  await page.goto("/#theme=rugged");
  await page.click("#start-workout");
  await expect(page.locator("#tabletop canvas")).toBeVisible();
  expect(
    await page
      .locator("#tabletop")
      .evaluate((el) => getComputedStyle(el, "::before").animationName),
  ).toBe("none");
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

test("rugged fire flickers on card faces and stops for reduced motion, hidden pages, and Classic", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(() => {
    window.__renderFrames = 0;
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) =>
      original((time) => {
        window.__renderFrames++;
        callback(time);
      });
  });
  await page.goto("/#theme=rugged");
  await page.click("#start-workout");
  await expect(page.locator("#tabletop canvas")).toBeVisible();
  await page.click("#draw-button");
  await expect(page.locator("#tabletop")).toHaveAttribute(
    "data-animating",
    "false",
  );
  await expect(page.locator("#tabletop")).toHaveAttribute(
    "data-fire-active",
    "true",
  );
  const state = await page.evaluate(() => ({
    deck,
    lastDrawn,
    roundNumber,
    hash: location.hash,
  }));
  const bounds = await page.locator("#tabletop canvas").boundingBox();
  // A blank portion of the lower-left card face: only scene lighting changes here.
  const clip = {
    x: bounds.x + bounds.width * 0.43,
    y: bounds.y + bounds.height * 0.57,
    width: 8,
    height: 8,
  };
  const before = await page.screenshot({ clip });
  await page.waitForTimeout(240);
  const after = await page.screenshot({ clip });
  expect(before.equals(after)).toBe(false);
  expect(
    await page.evaluate(() => ({
      deck,
      lastDrawn,
      roundNumber,
      hash: location.hash,
    })),
  ).toEqual(state);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#tabletop")).toHaveAttribute(
    "data-fire-active",
    "false",
  );
  const staticFrame = await page.screenshot({ clip });
  await page.waitForTimeout(150);
  expect((await page.screenshot({ clip })).equals(staticFrame)).toBe(true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("#tabletop")).toHaveAttribute(
    "data-fire-active",
    "true",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#tabletop")).toHaveAttribute(
    "data-fire-active",
    "false",
  );
  const hiddenFrames = await page.evaluate(() => window.__renderFrames);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__renderFrames)).toBe(hiddenFrames);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#tabletop")).toHaveAttribute(
    "data-fire-active",
    "true",
  );
  await page.locator("#app [data-presentation-select]").selectOption("classic");
  const classicFrames = await page.evaluate(() => window.__renderFrames);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__renderFrames)).toBe(classicFrames);
});

for (const theme of ["casino", "plain", "rugged"]) {
  test(`fullscreen phone layout keeps reps below the table and deck taps draw in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () =>
        Promise.reject(new Error("Fullscreen unavailable"));
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/#theme=${theme}`);
    await page.click("#start-workout");
    await expect(page.locator("#tabletop canvas")).toBeVisible();
    const before = await page.evaluate(() => ({
      deck,
      roundNumber,
      hash: location.hash,
    }));
    await page
      .getByRole("button", { name: "Full screen", exact: true })
      .click();
    await expect(page.locator("#app")).toHaveClass(/is-fullscreen/);
    expect(
      await page.evaluate(() => ({ deck, roundNumber, hash: location.hash })),
    ).toEqual(before);
    await expect(page.locator("#rep-summary .rep-summary-count")).toHaveCount(
      4,
    );
    await page
      .getByRole("button", { name: "Draw from deck", exact: true })
      .click();
    expect(await page.evaluate(() => deck.length)).toBe(48);
    const boxes = await page.locator(".rep-summary-item").evaluateAll((items) =>
      items.map((item) => {
        const r = item.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      }),
    );
    expect(
      Math.max(...boxes.map((b) => b.top)) -
        Math.min(...boxes.map((b) => b.top)),
    ).toBeLessThan(2);
    expect(boxes[3].right).toBeLessThanOrEqual(390);
    expect(boxes[0].bottom).toBeGreaterThan(800);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const table = await page.locator("#tabletop").boundingBox();
    expect(table.y + table.height).toBeLessThanOrEqual(boxes[0].top);
    const drawn = await page.evaluate(() => ({
      deck,
      lastDrawn,
      roundNumber,
      hash: location.hash,
    }));
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator("#tabletop canvas")).toBeVisible();
    await page
      .getByRole("button", { name: "Exit full screen", exact: true })
      .click();
    await expect(page.locator("#app")).not.toHaveClass(/is-fullscreen/);
    expect(
      await page.evaluate(() => ({
        deck,
        lastDrawn,
        roundNumber,
        hash: location.hash,
      })),
    ).toEqual(drawn);
  });
}

test("native fullscreen, Escape, final hand and feedback exit preserve the workout", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#theme=plain");
  await page.click("#start-workout");
  await expect(page.locator("#tabletop canvas")).toBeVisible();
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id))
    .toBe("app");
  await page.keyboard.press("Escape");
  await expect(page.locator("#app")).not.toHaveClass(/is-fullscreen/);
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await page.evaluate(() => {
    deck = deck.slice(0, 8);
    drawCards();
  });
  await expect(page.locator("#tabletop")).toHaveAttribute(
    "data-card-count",
    "8",
  );
  await expect(
    page.getByRole("button", { name: "Draw from deck", exact: true }),
  ).toBeHidden();
  await expect(page.locator("#workout-feedback")).toBeHidden();
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page.locator("#workout-feedback")).toBeVisible();
  expect(await page.evaluate(() => lastDrawn.length)).toBe(8);
});

test("Classic fullscreen retains keyboard drawing and bottom rep counts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("deckOfGains:presentation", "classic");
    Element.prototype.requestFullscreen = undefined;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#theme=plain");
  await page.click("#start-workout");
  await page.click("#fullscreen-toggle");
  await page.click("#draw-button");
  await expect(page.locator("#drawn-cards .card")).toHaveCount(4);
  const counts = await page
    .locator(".rep-summary-item")
    .evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().top),
    );
  expect(Math.max(...counts) - Math.min(...counts)).toBeLessThan(2);
  await page.keyboard.press("Escape");
  await expect(page.locator("#app")).not.toHaveClass(/is-fullscreen/);
});
