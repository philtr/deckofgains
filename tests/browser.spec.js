const { test, expect } = require("@playwright/test");
const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".map": "application/json",
};

let server;
let baseUrl;

async function serveFile(req, res) {
  try {
    const requestUrl = new URL(req.url, "http://localhost");
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname.endsWith("/")) {
      pathname = `${pathname}index.html`;
    }
    if (pathname === "/") {
      pathname = "/index.html";
    }
    const filePath = path.resolve(rootDir, `.${path.normalize(pathname)}`);
    if (!filePath.startsWith(rootDir)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeTypes[ext] ?? "application/octet-stream");
    res.end(data);
  } catch (error) {
    res.statusCode = 404;
    res.end("Not Found");
  }
}

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    serveFile(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}/index.html`;
});

test.afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = undefined;
  }
});

async function startWorkoutWithOptions(
  page,
  { theme = "casino", multipliers, endless = false, autoDraw } = {},
) {
  if (multipliers) {
    for (const [suit, value] of Object.entries(multipliers)) {
      await page.selectOption(`#multiplier-${suit}`, String(value));
    }
  }

  if (theme) {
    await page.check(`input[name="theme"][value="${theme}"]`);
  }

  if (endless) {
    await page.check("#endless-mode");
  }

  if (autoDraw?.enabled) {
    await page.check("#auto-draw-enabled");
  }

  if (autoDraw?.intervalSeconds !== undefined) {
    const minutes = Math.floor(autoDraw.intervalSeconds / 60);
    const seconds = Math.max(
      0,
      Math.round(autoDraw.intervalSeconds - minutes * 60),
    );
    await page.fill("#auto-draw-minutes", String(minutes));
    await page.fill("#auto-draw-seconds", String(seconds));
  }

  await page.click("#start-workout");
}

async function setDeck(page, cards) {
  await page.evaluate((cards) => {
    deck = cards.map((card) => ({ ...card }));
  }, cards);
}

async function withPatchedRandom(page, value, callback) {
  await page.evaluate((val) => {
    window.__originalRandom = Math.random;
    Math.random = () => val;
  }, value);

  try {
    return await callback();
  } finally {
    await page.evaluate(() => {
      if (window.__originalRandom) {
        Math.random = window.__originalRandom;
        delete window.__originalRandom;
      }
    });
  }
}

async function expectRepSummary(page, expectedItems) {
  const summaryItems = page.locator("#rep-summary .rep-summary-item");
  await expect(summaryItems).toHaveCount(expectedItems.length);

  for (const [index, expected] of expectedItems.entries()) {
    const item = summaryItems.nth(index);
    await expect(item.locator(".rep-summary-count")).toHaveText(
      String(expected.reps),
    );
    await expect(item.locator(".rep-summary-exercise")).toHaveText(
      expected.exercise,
    );
  }
}

async function installAnalyticsMock(
  page,
  { doNotTrack = false, available = true } = {},
) {
  await page.addInitScript(({ dntEnabled, analyticsAvailable }) => {
    const analyticsWarnings = [];
    const analyticsLogs = [];
    const originalWarn = window.console.warn.bind(window.console);
    const originalLog = window.console.log.bind(window.console);
    window.console.warn = (...args) => {
      analyticsWarnings.push(args.map(String).join(" "));
      originalWarn(...args);
    };
    window.console.log = (...args) => {
      if (args[0] === "[Deck of Gains analytics]") {
        analyticsLogs.push(args[1]);
      }
      originalLog(...args);
    };
    window.__getAnalyticsWarnings = () => [...analyticsWarnings];
    window.__getAnalyticsLogs = () => [...analyticsLogs];

    if (dntEnabled) {
      Object.defineProperty(window.navigator, "doNotTrack", {
        configurable: true,
        value: "1",
      });
    }

    const callsKey = "__deckOfGains:umamiCalls";
    const readCalls = () => {
      try {
        return JSON.parse(window.localStorage.getItem(callsKey) ?? "[]");
      } catch (error) {
        return [];
      }
    };
    const record = (call) => {
      try {
        const calls = readCalls();
        calls.push(call);
        window.localStorage.setItem(callsKey, JSON.stringify(calls));
      } catch (error) {
        // Tests that disable storage can still exercise the no-op path.
      }
      return Promise.resolve(call);
    };

    window.__getUmamiCalls = readCalls;
    if (!analyticsAvailable) {
      return;
    }
    window.umami = {
      identify(id, data) {
        return record({ type: "identify", id, data });
      },
      track(eventOrPayload, data) {
        if (typeof eventOrPayload === "function") {
          const payload = eventOrPayload({
            hostname: window.location.hostname,
            language: window.navigator.language,
            referrer: document.referrer,
            screen: `${window.screen.width}x${window.screen.height}`,
            title: document.title,
            url: window.location.href,
          });
          return record({ type: "pageview", payload });
        }
        return record({ type: "event", name: eventOrPayload, data });
      },
    };
  }, { dntEnabled: doNotTrack, analyticsAvailable: available });
}

async function getAnalyticsCalls(page) {
  return page.evaluate(() => window.__getUmamiCalls?.() ?? []);
}

async function installRoomSocketMock(page, { onUpdate } = {}) {
  if (onUpdate) {
    await page.exposeFunction("__reportRoomUpdate", (payload) => {
      onUpdate(payload);
    });
  }

  await page.addInitScript(() => {
    class FakeChannel {
      constructor(topic) {
        this.topic = topic;
        this.handlers = new Map();
      }

      on(event, callback) {
        this.handlers.set(event, callback);
      }

      join() {
        window.__roomChannelJoined = true;
        const push = {
          receive: (status, callback) => {
            if (status === "ok") {
              setTimeout(() => callback({}), 0);
            }
            return push;
          },
        };
        return push;
      }

      push(event, payload) {
        if (
          event === "state:update" &&
          typeof window.__reportRoomUpdate === "function"
        ) {
          window.__reportRoomUpdate(payload);
        }
        const push = {
          receive: () => push,
        };
        return push;
      }

      leave() {}
    }

    class FakeSocket {
      constructor() {
        this.channels = new Map();
      }

      connect() {
        window.__roomSocketConnected = true;
      }

      disconnect() {}

      channel(topic) {
        if (!this.channels.has(topic)) {
          this.channels.set(topic, new FakeChannel(topic));
        }
        return this.channels.get(topic);
      }
    }

    window.__deckOfGainsSocket = FakeSocket;
  });
}

test.describe("Deck of Gains app", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await installAnalyticsMock(page, {
      doNotTrack: testInfo.title.includes("Do Not Track"),
      available: !testInfo.title.includes("analytics is unavailable"),
    });
    await page.route("**/analytics/script.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: "" }),
    );
    await page.route("**/analytics/recorder.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: "" }),
    );
    await page.route("http://localhost:4000/healthz", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.route("https://sync.deck.fitness/healthz", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto(baseUrl);
  });

  test("configures Umami for sanitized manual pageviews and performance", async ({
    page,
  }) => {
    const tracker = page.locator(
      'script[src="/analytics/script.js"]',
    );

    await expect(tracker).toHaveAttribute("data-auto-pageview", "false");
    await expect(tracker).toHaveAttribute("data-exclude-search", "true");
    await expect(tracker).toHaveAttribute("data-performance", "true");
    await expect(tracker).toHaveAttribute("data-do-not-track", "true");

    const recorder = page.locator(
      'script[src="/analytics/recorder.js"]',
    );
    await expect(recorder).toHaveCount(1);
    await expect(recorder).toHaveAttribute(
      "data-website-id",
      "7c8cf4cd-5d6b-4bd3-968a-b5699e36b980",
    );
  });

  test("identifies the browser persistently and sends sanitized virtual pageviews", async ({
    page,
  }) => {
    const firstId = await page.evaluate(() =>
      window.localStorage.getItem("deckOfGains:analyticsId"),
    );
    expect(firstId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const url = new URL(baseUrl);
    url.searchParams.set("utm_source", "newsletter");
    url.searchParams.set("utm_medium", "email");
    url.searchParams.set("room", "private-room");
    url.searchParams.set("sync", "https://private.example");
    url.searchParams.set("started", "1");
    url.searchParams.set("round", "3");
    url.searchParams.set("deck", "h-2.s-3");
    url.searchParams.set("multipliers", "h-1.s-1.d-1.c-2");
    await page.goto(url.toString());
    await page.waitForFunction(() =>
      (window.__getUmamiCalls?.() ?? []).some(
        (call) =>
          call.type === "pageview" &&
          call.payload?.url?.includes("view=workout"),
      ),
    );

    const calls = await getAnalyticsCalls(page);
    const identifyCalls = calls.filter((call) => call.type === "identify");
    expect(identifyCalls).toHaveLength(2);
    expect(identifyCalls.every((call) => call.id === firstId)).toBe(true);

    const pageviews = calls.filter((call) => call.type === "pageview");
    expect(pageviews.at(-1).payload.url).toBe(
      "/index.html?view=workout&utm_source=newsletter&utm_medium=email",
    );
    expect(JSON.stringify(pageviews)).not.toContain("private-room");
    expect(JSON.stringify(pageviews)).not.toContain("private.example");
    expect(JSON.stringify(pageviews)).not.toContain("deck=");
  });

  test("Do Not Track disables identification and app-managed analytics", async ({
    page,
  }) => {
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem("deckOfGains:analyticsId"),
      ),
    ).toBeNull();
    expect(await getAnalyticsCalls(page)).toEqual([]);
    await expect(
      page.locator('script[src="/analytics/recorder.js"]'),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__getAnalyticsWarnings?.() ?? []),
    ).toEqual([]);
  });

  test("uses the dev console adapter when analytics is unavailable", async ({
    page,
  }) => {
    expect(
      await page.evaluate(() => window.__getAnalyticsWarnings?.() ?? []),
    ).toEqual([]);
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem("deckOfGains:analyticsId"),
      ),
    ).toBeNull();
    await expect(page.locator('script[src="/analytics/recorder.js"]')).toHaveCount(
      0,
    );

    await startWorkoutWithOptions(page, { theme: "plain" });

    expect(await page.evaluate(() => window.__getAnalyticsLogs?.() ?? [])).toEqual([
      { type: "pageview", url: "/index.html?view=setup" },
      { type: "pageview", url: "/index.html?view=workout" },
      {
        type: "event",
        name: "workout_started",
        data: {
          mode: "finite",
          theme: "plain",
          auto_draw: false,
          auto_interval_seconds: 150,
          has_room: false,
          hearts_multiplier: 1,
          spades_multiplier: 1,
          diamonds_multiplier: 1,
          clubs_multiplier: 2,
        },
      },
    ]);
  });

  test("tracks workout lifecycle events with low-cardinality properties", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "rugged",
      multipliers: { hearts: 2, spades: 3, diamonds: 4, clubs: 5 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 2 },
      { suit: "spades", number: 2 },
      { suit: "diamonds", number: 2 },
      { suit: "clubs", number: 2 },
    ]);
    await page.evaluate(() => {
      roundNumber = 12;
      roundCompleted = false;
      drawCards();
      drawCards();
    });

    const calls = await getAnalyticsCalls(page);
    const events = calls.filter((call) => call.type === "event");
    expect(events.find((call) => call.name === "workout_started")).toEqual({
      type: "event",
      name: "workout_started",
      data: {
        theme: "rugged",
        mode: "finite",
        auto_draw: false,
        auto_interval_seconds: 150,
        has_room: false,
        hearts_multiplier: 2,
        spades_multiplier: 3,
        diamonds_multiplier: 4,
        clubs_multiplier: 5,
      },
    });
    expect(events.find((call) => call.name === "round_drawn")).toEqual({
      type: "event",
      name: "round_drawn",
      data: {
        round: 12,
        trigger: "manual",
        card_count: 4,
        rep_total: 28,
        remaining_cards: 0,
        final_draw: true,
      },
    });
    expect(
      events.filter((call) => call.name === "workout_completed"),
    ).toEqual([
      {
        type: "event",
        name: "workout_completed",
        data: {
          round_count: 12,
          trigger: "manual",
          theme: "rugged",
          auto_draw: false,
          has_room: false,
        },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('"cards"');
    expect(JSON.stringify(events)).not.toContain('"room"');
  });

  test("tracks auto draws and never completes an endless workout", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      endless: true,
      autoDraw: { enabled: true, intervalSeconds: 1 },
    });
    await setDeck(page, [{ suit: "hearts", number: 2 }]);

    await page.waitForFunction(() =>
      (window.__getUmamiCalls?.() ?? []).some(
        (call) => call.name === "round_drawn" && call.data?.trigger === "auto",
      ),
    );

    const events = (await getAnalyticsCalls(page)).filter(
      (call) => call.type === "event",
    );
    expect(events.some((call) => call.name === "workout_completed")).toBe(
      false,
    );
  });

  test("tracks resumed workouts, room intent, and the canonical theme event", async ({
    page,
  }) => {
    const resumedUrl = new URL(baseUrl);
    resumedUrl.searchParams.set("started", "1");
    resumedUrl.searchParams.set("round", "4");
    resumedUrl.searchParams.set("deck", "h-2.s-3");
    resumedUrl.searchParams.set("theme", "plain");
    resumedUrl.searchParams.set("multipliers", "h-1.s-1.d-1.c-2");
    await page.goto(resumedUrl.toString());

    const resumeEvent = (await getAnalyticsCalls(page)).find(
      (call) => call.name === "workout_resumed",
    );
    expect(resumeEvent).toEqual({
      type: "event",
      name: "workout_resumed",
      data: {
        source: "url",
        round: 4,
        theme: "plain",
        mode: "finite",
        has_room: false,
      },
    });

    await page.goto(baseUrl);
    await page.fill("#room-code", "secret-room");
    await page.click("#join-room");
    const roomEvent = (await getAnalyticsCalls(page)).find(
      (call) => call.name === "room_join_requested",
    );
    expect(roomEvent).toEqual({
      type: "event",
      name: "room_join_requested",
    });
    expect(JSON.stringify(roomEvent)).not.toContain("secret-room");

    const themeInputs = page.locator('input[name="theme"]');
    await expect(themeInputs.first()).toHaveAttribute(
      "data-umami-event",
      "theme_selected",
    );
  });

  test("shows the configuration screen on load", async ({ page }) => {
    await expect(page.locator("#configuration-screen")).toBeVisible();
    await expect(page.locator("#app")).toBeHidden();
  });

  test("applies the default casino theme before app initialization finishes", async ({
    page,
  }) => {
    let releaseHealthCheck;
    const healthCheckBlocked = new Promise((resolve) => {
      releaseHealthCheck = resolve;
    });

    await page.unroute("http://localhost:4000/healthz");
    await page.route("http://localhost:4000/healthz", async (route) => {
      await healthCheckBlocked;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    try {
      expect(await page.locator("body").getAttribute("data-theme")).toBe(
        "casino",
      );
    } finally {
      releaseHealthCheck();
    }
  });

  test("shows the group join box on the setup screen", async ({ page }) => {
    await expect(page.locator("#group-join")).toBeVisible();
    await expect(page.locator("#room-code")).toBeVisible();
    await expect(page.locator("#join-room")).toBeVisible();
  });

  test("shows the active room display when a room is selected", async ({
    page,
  }) => {
    const url = new URL(baseUrl);
    url.searchParams.set("room", "crew");

    await page.goto(url.toString());

    await expect(page.locator("#room-active")).toBeVisible();
    await expect(page.locator("#room-active-name")).toHaveText("crew");
    await expect(page.locator("#room-code")).toBeHidden();
  });

  test("change room restores the room input", async ({ page }) => {
    const url = new URL(baseUrl);
    url.searchParams.set("room", "crew");

    await page.goto(url.toString());
    await page.waitForFunction(() => window.__configListenersReady === true);

    await page.click("#change-room");

    await expect(page.locator("#room-code")).toBeVisible();
    await expect(page.locator("#room-code")).toHaveValue("crew");
    await expect(page).not.toHaveURL(/room=crew/);

    const selection = await page.evaluate(() => {
      const input = document.getElementById("room-code");
      return {
        start: input?.selectionStart,
        end: input?.selectionEnd,
        value: input?.value,
      };
    });

    expect(selection.start).toBe(0);
    expect(selection.end).toBe(selection.value.length);
  });

  test("disables sync controls when the sync server is unhealthy", async ({
    page,
  }) => {
    await page.unroute("http://localhost:4000/healthz");
    await page.route("http://localhost:4000/healthz", (route) => {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ ok: false }),
      });
    });

    await page.goto(baseUrl);

    await expect(page.locator("#group-join")).toBeHidden();
  });

  test("start workout uses the room name from the setup screen", async ({
    page,
  }) => {
    await page.route("http://localhost:4000/api/rooms/crew", (route) => {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "room_not_found" }),
      });
    });

    await page.goto(baseUrl);

    await page.fill("#room-code", "crew");
    await page.click("#start-workout");

    await expect(page).toHaveURL(/room=crew/);
  });

  test("join group keeps the setup screen visible and updates the url", async ({
    page,
  }) => {
    await page.route("http://localhost:4000/api/rooms/crew", (route) => {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "room_not_found" }),
      });
    });

    await page.goto(baseUrl);

    await page.fill("#room-code", "crew");
    await page.click("#join-room");

    await expect(page).toHaveURL(/room=crew/);
    await expect(page.locator("#configuration-screen")).toBeVisible();
    await expect(page.locator("#app")).toBeHidden();
  });

  test("pressing Enter in the room input joins the group", async ({ page }) => {
    await page.route("http://localhost:4000/api/rooms/crew", (route) => {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "room_not_found" }),
      });
    });

    await page.fill("#room-code", "crew");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/room=crew/);
    await expect(page.locator("#room-code")).toBeHidden();
    await expect(page.locator("#room-active-name")).toHaveText("crew");
  });

  test("preloads default multipliers with clubs set to 2×", async ({
    page,
  }) => {
    await expect(page.locator("#multiplier-hearts")).toHaveValue("1");
    await expect(page.locator("#multiplier-spades")).toHaveValue("1");
    await expect(page.locator("#multiplier-diamonds")).toHaveValue("1");
    await expect(page.locator("#multiplier-clubs")).toHaveValue("2");
  });

  test("auto draw controls default to disabled with a 2 minute 30 second interval", async ({
    page,
  }) => {
    const intervalContainer = page.locator(".auto-draw-interval-option");
    await expect(page.locator("#auto-draw-enabled")).not.toBeChecked();
    await expect(intervalContainer).toBeHidden();

    await page.check("#auto-draw-enabled");
    await expect(intervalContainer).toBeVisible();
    await expect(page.locator("#auto-draw-minutes")).toHaveValue("2");
    await expect(page.locator("#auto-draw-seconds")).toHaveValue("30");
  });

  test("restores configuration from localStorage when URL has no configuration params", async ({
    page,
  }) => {
    await page.addInitScript(
      (storedConfig) => {
        window.localStorage.setItem(
          "deckOfGains:configuration",
          JSON.stringify(storedConfig),
        );
      },
      {
        multipliers: { hearts: 3, spades: 2, diamonds: 4, clubs: 5 },
        theme: "plain",
        endless: true,
        autoDraw: { enabled: true, intervalSeconds: 95 },
      },
    );

    await page.goto(baseUrl);

    await expect(page.locator("body")).toHaveAttribute("data-theme", "plain");
    await expect(
      page.locator('input[name="theme"][value="plain"]'),
    ).toBeChecked();
    await expect(page.locator("#multiplier-hearts")).toHaveValue("3");
    await expect(page.locator("#multiplier-spades")).toHaveValue("2");
    await expect(page.locator("#multiplier-diamonds")).toHaveValue("4");
    await expect(page.locator("#multiplier-clubs")).toHaveValue("5");
    await expect(page.locator("#endless-mode")).toBeChecked();
    await expect(page.locator("#auto-draw-enabled")).toBeChecked();
    await expect(page.locator("#auto-draw-interval-container")).toBeVisible();
    await expect(page.locator("#auto-draw-minutes")).toHaveValue("1");
    await expect(page.locator("#auto-draw-seconds")).toHaveValue("35");
  });

  test("URL configuration overrides localStorage and replaces it", async ({
    page,
  }) => {
    await page.addInitScript(
      (storedConfig) => {
        window.localStorage.setItem(
          "deckOfGains:configuration",
          JSON.stringify(storedConfig),
        );
      },
      {
        multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
        theme: "rugged",
        endless: false,
        autoDraw: { enabled: false, intervalSeconds: 150 },
      },
    );

    const url = new URL(baseUrl);
    url.searchParams.set("theme", "casino");
    url.searchParams.set("endless", "1");
    url.searchParams.set("multipliers", "h-2.s-3.d-4.c-5");
    url.searchParams.set("auto", "1");
    url.searchParams.set("autoIntervalSeconds", "90");

    await page.goto(url.toString());

    await expect(page.locator("body")).toHaveAttribute("data-theme", "casino");
    await expect(page.locator("#endless-mode")).toBeChecked();
    await expect(page.locator("#auto-draw-enabled")).toBeChecked();
    await expect(page.locator("#auto-draw-minutes")).toHaveValue("1");
    await expect(page.locator("#auto-draw-seconds")).toHaveValue("30");

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem("deckOfGains:configuration");
      return raw ? JSON.parse(raw) : null;
    });

    expect(stored).toEqual({
      multipliers: { hearts: 2, spades: 3, diamonds: 4, clubs: 5 },
      theme: "casino",
      endless: true,
      autoDraw: { enabled: true, intervalSeconds: 90 },
    });
  });

  test("room param loads server state and uses it over URL params", async ({
    page,
  }) => {
    const roomState = {
      configuration: {
        multipliers: { hearts: 1, spades: 2, diamonds: 3, clubs: 4 },
        theme: "rugged",
        endless: false,
        autoDraw: { enabled: false, intervalSeconds: 150 },
      },
      deck: [
        { suit: "hearts", number: 2 },
        { suit: "spades", number: 3 },
      ],
      roundNumber: 3,
      roundCompleted: true,
      started: true,
      lastDrawn: [
        { suit: "diamonds", number: 4 },
        { suit: "clubs", number: 5 },
        { suit: "hearts", number: 6 },
        { suit: "spades", number: 7 },
      ],
    };

    await page.route("http://localhost:4000/api/rooms/abc", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          room_id: "abc",
          version: 1,
          updated_at: "2026-01-21T20:00:00Z",
          state: roomState,
        }),
      });
    });

    await installRoomSocketMock(page);

    const url = new URL(baseUrl);
    url.searchParams.set("room", "abc");
    url.searchParams.set("theme", "plain");
    url.searchParams.set("started", "0");

    await page.goto(url.toString());

    await expect(page.locator("body")).toHaveAttribute("data-theme", "rugged");
    await expect(page.locator("#configuration-screen")).toBeHidden();
    await expect(page.locator("#app")).toBeVisible();

    const restored = await page.evaluate(() => ({
      roundNumber,
      deckSize: deck.length,
      roundCompleted,
    }));

    expect(restored.roundNumber).toBe(3);
    expect(restored.roundCompleted).toBe(true);
    expect(restored.deckSize).toBe(2);

    const params = new URL(page.url()).searchParams;
    expect(params.get("room")).toBe("abc");

    const resumeEvent = (await getAnalyticsCalls(page)).find(
      (call) =>
        call.name === "workout_resumed" && call.data?.source === "room",
    );
    expect(resumeEvent?.data).toEqual({
      source: "room",
      round: 3,
      theme: "rugged",
      mode: "finite",
      has_room: true,
    });
  });

  test("sync param overrides the sync server base url", async ({ page }) => {
    const roomState = {
      configuration: {
        multipliers: { hearts: 1, spades: 2, diamonds: 3, clubs: 4 },
        theme: "plain",
        endless: false,
        autoDraw: { enabled: false, intervalSeconds: 150 },
      },
      deck: [
        { suit: "hearts", number: 2 },
        { suit: "spades", number: 3 },
      ],
      roundNumber: 5,
      roundCompleted: false,
      started: true,
      lastDrawn: [],
    };

    await page.route("https://sync.deck.fitness/api/rooms/abc", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          room_id: "abc",
          version: 1,
          updated_at: "2026-01-21T20:00:00Z",
          state: roomState,
        }),
      });
    });

    await installRoomSocketMock(page);

    const url = new URL(baseUrl);
    url.searchParams.set("room", "abc");
    url.searchParams.set("sync", "https://sync.deck.fitness");

    await page.goto(url.toString());

    await expect(page.locator("#round-title")).toHaveText("Round 5 of 12");

    const restored = await page.evaluate(() => roundNumber);

    expect(restored).toBe(5);
  });

  test("room param sends state updates to the sync server", async ({
    page,
  }) => {
    const initialState = {
      configuration: {
        multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 2 },
        theme: "casino",
        endless: false,
        autoDraw: { enabled: false, intervalSeconds: 150 },
      },
      deck: [],
      roundNumber: 1,
      roundCompleted: false,
      started: false,
      lastDrawn: [],
    };

    await page.route("http://localhost:4000/api/rooms/abc", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            room_id: "abc",
            version: 1,
            updated_at: "2026-01-21T20:00:00Z",
            state: initialState,
          }),
        });
      }
      return route.fulfill({
        status: 405,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "method_not_allowed" }),
      });
    });

    let resolveUpdatePayload;
    const updatePayloadPromise = new Promise((resolve) => {
      resolveUpdatePayload = resolve;
    });

    await installRoomSocketMock(page, {
      onUpdate: (payload) => {
        resolveUpdatePayload(payload);
      },
    });

    const url = new URL(baseUrl);
    url.searchParams.set("room", "abc");

    await page.goto(url.toString());
    await page.waitForFunction(() => window.__roomChannelJoined === true);

    await page.evaluate(() => {
      roundNumber = 4;
    });

    const expectedState = await page.evaluate(() => ({
      configuration,
      deck,
      roundNumber,
      roundCompleted,
      lastDrawn,
    }));
    expectedState.started = false;

    const payload = await updatePayloadPromise;
    expect(payload).toEqual({ state: expectedState });
  });

  test("builds a unique 52 card deck when initializeDeck runs", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      initializeDeck();
      return {
        deckSize: deck.length,
        uniqueCount: new Set(deck.map((card) => `${card.suit}-${card.number}`))
          .size,
      };
    });

    expect(result.deckSize).toBe(52);
    expect(result.uniqueCount).toBe(52);
  });

  test("formats cards for display correctly", async ({ page }) => {
    const values = await page.evaluate(() => ({
      ace: getCardDisplayValue(1),
      jack: getCardDisplayValue(11),
      queen: getCardDisplayValue(12),
      king: getCardDisplayValue(13),
      seven: getCardDisplayValue(7),
    }));

    expect(values.ace).toBe("A");
    expect(values.jack).toBe("J");
    expect(values.queen).toBe("Q");
    expect(values.king).toBe("K");
    expect(values.seven).toBe(7);

    await startWorkoutWithOptions(page, { theme: "plain" });
    await setDeck(page, [{ suit: "hearts", number: 1 }]);
    await page.evaluate(() => {
      roundCompleted = false;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    const renderedCard = await page.locator("#drawn-cards .card span").first();
    await expect(renderedCard).toHaveText("A\u00a0♥️");

    const renderedHtml = await renderedCard.evaluate((node) => node.innerHTML);
    expect(renderedHtml).toContain("&nbsp;");
  });

  test("applies scoring rules for face cards and aces", async ({ page }) => {
    const values = await page.evaluate(() => ({
      face: getCardValue(12),
      ace: getCardValue(1),
      number: getCardValue(7),
    }));

    expect(values.face).toBe(10);
    expect(values.ace).toBe(11);
    expect(values.number).toBe(7);
  });

  test("starts a workout, hides the configuration screen, and applies the selected theme", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "rugged",
      multipliers: { hearts: 2, spades: 2, diamonds: 2, clubs: 2 },
    });

    await expect(page.locator("#configuration-screen")).toBeHidden();
    await expect(page.locator("#app")).toBeVisible();

    await expect(page.locator("body")).toHaveAttribute("data-theme", "rugged");
  });

  test("switching theme radios updates the body data-theme immediately", async ({
    page,
  }) => {
    await page.check('input[name="theme"][value="rugged"]');
    await page.waitForFunction(() => document.body.dataset.theme === "rugged");

    let activeTheme = await page.evaluate(() => document.body.dataset.theme);
    expect(activeTheme).toBe("rugged");

    await page.check('input[name="theme"][value="plain"]');
    await page.waitForFunction(() => document.body.dataset.theme === "plain");

    activeTheme = await page.evaluate(() => document.body.dataset.theme);
    expect(activeTheme).toBe("plain");

    await page.check('input[name="theme"][value="casino"]');
    await page.waitForFunction(() => document.body.dataset.theme === "casino");

    activeTheme = await page.evaluate(() => document.body.dataset.theme);
    expect(activeTheme).toBe("casino");
  });

  test("rugged theme applies Tektur to display elements and Google Sans Code to copy", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "rugged",
      multipliers: { hearts: 2, spades: 2, diamonds: 2, clubs: 2 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 8 },
      { suit: "spades", number: 7 },
      { suit: "diamonds", number: 6 },
      { suit: "clubs", number: 5 },
    ]);

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    const typography = await page.evaluate(() => {
      const read = (selector) => {
        const element = document.querySelector(selector);
        const styles = element ? getComputedStyle(element) : null;
        return styles
          ? {
              fontFamily: styles.fontFamily,
              fontWeight: styles.fontWeight,
              fontStretch: styles.fontStretch,
            }
          : null;
      };

      return {
        heading: read("#round-title"),
        button: read("#draw-button"),
        count: read(".rep-summary-count"),
        exercise: read(".rep-summary-exercise"),
        footer: read(".site-footer"),
        paragraph: read("#instructions p"),
        select: read("#multiplier-hearts"),
      };
    });

    expect(typography.heading?.fontFamily).toContain("Tektur");
    expect(typography.heading?.fontWeight).toBe("700");
    expect(typography.heading?.fontStretch).toBe("100%");
    expect(typography.button?.fontFamily).toContain("Tektur");
    expect(typography.button?.fontWeight).toBe("700");
    expect(typography.button?.fontStretch).toBe("100%");
    expect(typography.count?.fontFamily).toContain("Tektur");
    expect(typography.count?.fontWeight).toBe("700");
    expect(typography.count?.fontStretch).toBe("100%");
    expect(typography.exercise?.fontFamily).toContain("Google Sans Code");
    expect(typography.footer?.fontFamily).toContain("Google Sans Code");
    expect(typography.paragraph?.fontFamily).toContain("Google Sans Code");
    expect(typography.select?.fontFamily).toContain("Google Sans Code");
  });

  test("reserves padding for mobile safe areas", async ({ page }) => {
    const padding = await page.evaluate(() => {
      const styles = window.getComputedStyle(document.body);
      const parse = (value) => parseFloat(value);
      return {
        top: parse(styles.paddingTop),
        bottom: parse(styles.paddingBottom),
      };
    });

    expect(padding.top).toBeGreaterThanOrEqual(16);
    expect(padding.bottom).toBeGreaterThanOrEqual(16);
  });

  test("draws four cards while more than eight remain", async ({ page }) => {
    await setDeck(page, [
      { suit: "hearts", number: 1 },
      { suit: "spades", number: 12 },
      { suit: "diamonds", number: 5 },
      { suit: "clubs", number: 3 },
      { suit: "diamonds", number: 13 },
      { suit: "clubs", number: 4 },
      { suit: "spades", number: 2 },
      { suit: "hearts", number: 7 },
      { suit: "clubs", number: 11 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
    });

    const result = await withPatchedRandom(page, 0, async () => {
      return page.evaluate(() => {
        const drawn = doDrawCards();
        return {
          drawn: drawn.map((card) => `${card.suit}-${card.number}`),
          remaining: deck.length,
        };
      });
    });

    expect(result.drawn).toEqual([
      "hearts-1",
      "spades-12",
      "diamonds-5",
      "clubs-3",
    ]);
    expect(result.remaining).toBe(5);
  });

  test("draws the remaining cards when eight or fewer remain", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "casino",
      endless: false,
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 2 },
      { suit: "spades", number: 3 },
      { suit: "diamonds", number: 4 },
      { suit: "clubs", number: 5 },
      { suit: "hearts", number: 6 },
      { suit: "spades", number: 7 },
      { suit: "diamonds", number: 8 },
      { suit: "clubs", number: 9 },
    ]);

    await page.evaluate(() => {
      roundCompleted = true;
    });

    const result = await withPatchedRandom(page, 0, async () => {
      return page.evaluate(() => {
        const drawn = doDrawCards();
        return {
          drawnCount: drawn.length,
          remaining: deck.length,
        };
      });
    });

    expect(result.drawnCount).toBe(8);
    expect(result.remaining).toBe(0);
  });

  test("endless mode keeps drawing four cards when eight remain", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "casino",
      endless: true,
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 2 },
      { suit: "spades", number: 3 },
      { suit: "diamonds", number: 4 },
      { suit: "clubs", number: 5 },
      { suit: "hearts", number: 6 },
      { suit: "spades", number: 7 },
      { suit: "diamonds", number: 8 },
      { suit: "clubs", number: 9 },
    ]);

    await page.evaluate(() => {
      roundCompleted = true;
    });

    const result = await withPatchedRandom(page, 0, async () => {
      return page.evaluate(() => {
        const drawn = doDrawCards();
        return {
          drawn: drawn.map((card) => `${card.suit}-${card.number}`),
          remaining: deck.length,
        };
      });
    });

    expect(result.drawn).toEqual([
      "hearts-2",
      "spades-3",
      "diamonds-4",
      "clubs-5",
    ]);
    expect(result.remaining).toBe(4);
  });

  test("auto draw automatically draws the next hand after the configured interval", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "casino",
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
      autoDraw: { enabled: true, intervalSeconds: 1 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 1 },
      { suit: "spades", number: 2 },
      { suit: "diamonds", number: 3 },
      { suit: "clubs", number: 4 },
      { suit: "hearts", number: 5 },
      { suit: "spades", number: 6 },
      { suit: "diamonds", number: 7 },
      { suit: "clubs", number: 8 },
      { suit: "hearts", number: 9 },
    ]);

    await page.waitForFunction(() => {
      return document.querySelectorAll("#drawn-cards .card").length === 4;
    });

    const state = await page.evaluate(() => ({
      roundNumber,
      roundCompleted,
      autoDrawEnabled: configuration.autoDraw?.enabled ?? false,
    }));

    expect(state.roundNumber).toBe(2);
    expect(state.roundCompleted).toBe(true);
    expect(state.autoDrawEnabled).toBe(true);
  });

  test("auto draw countdown is displayed on the draw button while waiting", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "casino",
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
      autoDraw: { enabled: true, intervalSeconds: 3 },
    });

    await page.waitForFunction(() => {
      const button = document.getElementById("draw-button");
      return button && /Draw Cards \(\d+:\d{2}\)/.test(button.textContent);
    });

    const buttonText = await page.locator("#draw-button").textContent();
    expect(buttonText).toMatch(/Draw Cards \(\d+:\d{2}\)/);
  });

  test("auto draw resumes using the remaining seconds from the URL", async ({
    page,
  }) => {
    const url = new URL(baseUrl);
    url.searchParams.set("started", "1");
    url.searchParams.set("round", "1");
    url.searchParams.set("completed", "0");
    url.searchParams.set("theme", "casino");
    url.searchParams.set("auto", "1");
    url.searchParams.set("autoIntervalSeconds", "10");
    url.searchParams.set("autoRemainingSeconds", "1");
    url.searchParams.set("multipliers", "h-1.s-1.d-1.c-1");
    url.searchParams.set("deck", "h-1.s-2.d-3.c-4.h-5.s-6.d-7.c-8.h-9");

    await page.goto(url.toString());

    await page.waitForFunction(() => {
      return document.querySelectorAll("#drawn-cards .card").length === 4;
    });

    const state = await page.evaluate(() => ({
      roundNumber,
      roundCompleted,
    }));

    expect(state.roundNumber).toBe(2);
    expect(state.roundCompleted).toBe(true);
  });

  test("auto draw updates the remaining seconds in the URL over time", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "casino",
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
      autoDraw: { enabled: true, intervalSeconds: 12 },
    });

    const initialRemaining = await page.evaluate(() => {
      return new URLSearchParams(window.location.search).get(
        "autoRemainingSeconds",
      );
    });
    expect(initialRemaining).not.toBeNull();

    await page.waitForTimeout(6000);

    const laterRemaining = await page.evaluate(() => {
      return new URLSearchParams(window.location.search).get(
        "autoRemainingSeconds",
      );
    });

    expect(Number.parseInt(laterRemaining, 10)).toBeLessThan(
      Number.parseInt(initialRemaining, 10),
    );
  });

  test("drawCards updates the UI, totals, and round state", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "casino",
      multipliers: { hearts: 2, spades: 2, diamonds: 2, clubs: 2 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 1 },
      { suit: "spades", number: 12 },
      { suit: "diamonds", number: 5 },
      { suit: "clubs", number: 3 },
      { suit: "diamonds", number: 13 },
      { suit: "clubs", number: 4 },
      { suit: "spades", number: 2 },
      { suit: "hearts", number: 7 },
      { suit: "clubs", number: 11 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await expect(page.locator("#round-title")).toHaveText("Round 1 of 12");
    await expect(page.locator("#drawn-cards .card")).toHaveCount(4);
    await expectRepSummary(page, [
      { exercise: "Jumping Jacks", reps: 22 },
      { exercise: "Squats", reps: 20 },
      { exercise: "Pushups", reps: 10 },
      { exercise: "Abs", reps: 6 },
    ]);
    await expect(page.locator("#instructions p")).toHaveCount(0);

    const state = await page.evaluate(() => ({
      deckSize: deck.length,
      roundCompleted,
      roundNumber,
      drawButtonDisplay:
        document.getElementById("draw-button").style.display || "",
    }));

    expect(state.deckSize).toBe(5);
    expect(state.roundCompleted).toBe(true);
    expect(state.roundNumber).toBe(2);
    expect(state.drawButtonDisplay).not.toBe("none");
  });

  test("drawing four cards plays the whoosh sound four times", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "rugged",
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 1 },
      { suit: "spades", number: 2 },
      { suit: "diamonds", number: 3 },
      { suit: "clubs", number: 4 },
      { suit: "hearts", number: 5 },
      { suit: "spades", number: 6 },
      { suit: "diamonds", number: 7 },
      { suit: "clubs", number: 8 },
      { suit: "hearts", number: 9 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
      window.__deckOfGainsLastSound = undefined;
      window.__deckOfGainsLastSoundPlayCount = 0;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    const soundState = await page.evaluate(() => ({
      effect: window.__deckOfGainsLastSound,
      count: window.__deckOfGainsLastSoundPlayCount,
      schedule: window.__deckOfGainsLastSoundSchedule ?? [],
      envelope: window.__deckOfGainsLastSoundEnvelope ?? [],
    }));

    expect(soundState.effect).toBe("whoosh");
    expect(soundState.count).toBe(4);
    expect(soundState.schedule).toHaveLength(4);
    expect(soundState.envelope).toHaveLength(4);
    for (let i = 1; i < soundState.schedule.length; i += 1) {
      expect(
        soundState.schedule[i] - soundState.schedule[i - 1],
      ).toBeGreaterThanOrEqual(0.13);
    }
    for (let i = 0; i < soundState.envelope.length; i += 1) {
      const entry = soundState.envelope[i];
      expect(entry.start).toBeCloseTo(soundState.schedule[i], 3);
      expect(entry.attack - entry.start).toBeGreaterThanOrEqual(0.045);
      expect(entry.attack - entry.start).toBeLessThanOrEqual(0.055);
      expect(entry.release).toBeGreaterThan(entry.attack);
      expect(entry.release - entry.start).toBeLessThanOrEqual(0.23);
    }
  });

  test("drawing eight cards plays the whoosh sound eight times", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "casino",
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 1 },
      { suit: "spades", number: 2 },
      { suit: "diamonds", number: 3 },
      { suit: "clubs", number: 4 },
      { suit: "hearts", number: 5 },
      { suit: "spades", number: 6 },
      { suit: "diamonds", number: 7 },
      { suit: "clubs", number: 8 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
      window.__deckOfGainsLastSound = undefined;
      window.__deckOfGainsLastSoundPlayCount = 0;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    const soundState = await page.evaluate(() => ({
      effect: window.__deckOfGainsLastSound,
      count: window.__deckOfGainsLastSoundPlayCount,
      schedule: window.__deckOfGainsLastSoundSchedule ?? [],
      envelope: window.__deckOfGainsLastSoundEnvelope ?? [],
    }));

    expect(soundState.effect).toBe("whoosh");
    expect(soundState.count).toBe(8);
    expect(soundState.schedule).toHaveLength(8);
    expect(soundState.envelope).toHaveLength(8);
    for (let i = 1; i < soundState.schedule.length; i += 1) {
      expect(
        soundState.schedule[i] - soundState.schedule[i - 1],
      ).toBeGreaterThanOrEqual(0.13);
    }
    for (let i = 0; i < soundState.envelope.length; i += 1) {
      const entry = soundState.envelope[i];
      expect(entry.start).toBeCloseTo(soundState.schedule[i], 3);
      expect(entry.attack - entry.start).toBeGreaterThanOrEqual(0.045);
      expect(entry.attack - entry.start).toBeLessThanOrEqual(0.055);
      expect(entry.release).toBeGreaterThan(entry.attack);
      expect(entry.release - entry.start).toBeLessThanOrEqual(0.23);
    }
  });

  test("respects configured multipliers when calculating totals", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "casino",
      multipliers: { hearts: 2, spades: 3, diamonds: 4, clubs: 4 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 6 },
      { suit: "spades", number: 7 },
      { suit: "diamonds", number: 8 },
      { suit: "clubs", number: 9 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await expectRepSummary(page, [
      { exercise: "Jumping Jacks", reps: 12 },
      { exercise: "Squats", reps: 21 },
      { exercise: "Pushups", reps: 32 },
      { exercise: "Abs", reps: 36 },
    ]);
  });

  test("handles the final draw and sprint instructions when the deck is depleted", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "casino",
      multipliers: { hearts: 2, spades: 2, diamonds: 2, clubs: 2 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 2 },
      { suit: "spades", number: 3 },
      { suit: "diamonds", number: 4 },
      { suit: "clubs", number: 5 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
      roundNumber = 11;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await expectRepSummary(page, [
      { exercise: "Jumping Jacks", reps: 4 },
      { exercise: "Squats", reps: 6 },
      { exercise: "Pushups", reps: 8 },
      { exercise: "Abs", reps: 10 },
    ]);
    await expect(page.locator("#instructions p").last()).toHaveText(
      "Complete 2 sprints of 50 yards each.",
    );

    const state = await page.evaluate(() => ({
      deckSize: deck.length,
      drawButtonDisplay: document.getElementById("draw-button").style.display,
      newSetLabel:
        document.querySelector("#instructions button")?.textContent ?? null,
    }));

    expect(state.deckSize).toBe(0);
    expect(state.drawButtonDisplay).toBe("none");
    expect(state.newSetLabel).toBe("👍 Thumbs up");
    await expect(page.getByRole("button", { name: "New Set" })).toHaveCount(0);
  });

  test("collects feedback once after the final draw and suppresses it for three months", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page);
    await setDeck(page, [
      { suit: "hearts", number: 2 },
      { suit: "spades", number: 3 },
      { suit: "diamonds", number: 4 },
      { suit: "clubs", number: 5 },
    ]);

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => drawCards());
    });

    const feedback = page.locator("#workout-feedback");
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText("What do you think of Deck of Gains?");
    await expect(feedback.locator("#feedback-text")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New Set" })).toHaveCount(0);
    expect(
      await page.locator("#feedback-skip").evaluate((element) => ({
        backgroundColor: getComputedStyle(element).backgroundColor,
        backgroundImage: getComputedStyle(element).backgroundImage,
      })),
    ).toEqual({
      backgroundColor: "rgba(0, 0, 0, 0)",
      backgroundImage: "none",
    });

    await page.click("#feedback-thumbs-up");
    await expect(feedback.locator("#feedback-text")).toBeVisible();
    await page.fill("#feedback-text", "The final sprint is a great touch.");
    await page.click("#feedback-submit");
    await expect(feedback).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New Set" })).toBeVisible();

    const events = await getAnalyticsCalls(page);
    expect(events.filter((call) => call.name === "app_feedback_rated")).toEqual([
      {
        type: "event",
        name: "app_feedback_rated",
        data: { rating: "up" },
      },
    ]);
    expect(events.filter((call) => call.name === "app_feedback_submitted")).toEqual([
      {
        type: "event",
        name: "app_feedback_submitted",
        data: {
          rating: "up",
          feedback: "The final sprint is a great touch.",
        },
      },
    ]);
    expect(
      await page.evaluate(() => document.cookie.includes("deckOfGainsFeedback=")),
    ).toBe(true);

    await page.goto(baseUrl);
    await startWorkoutWithOptions(page);
    await setDeck(page, [{ suit: "hearts", number: 2 }]);
    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => drawCards());
    });
    await expect(page.locator("#workout-feedback")).toHaveCount(0);
  });

  test("allows canceling written feedback without covering mobile workout content", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startWorkoutWithOptions(page);
    await setDeck(page, [{ suit: "hearts", number: 2 }]);

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => drawCards());
    });

    const feedback = page.locator("#workout-feedback");
    await expect(feedback).toBeVisible();
    expect(await feedback.evaluate((element) => getComputedStyle(element).position)).toBe(
      "static",
    );

    await page.click("#feedback-thumbs-down");
    await expect(page.locator("#feedback-cancel")).toBeVisible();
    await page.click("#feedback-cancel");

    await expect(feedback).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New Set" })).toBeVisible();
  });

  test("the New Set button preserves the current configuration for reuse", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "rugged",
      multipliers: { hearts: 3, spades: 4, diamonds: 5, clubs: 5 },
      autoDraw: { enabled: true, intervalSeconds: 125 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 2 },
      { suit: "spades", number: 3 },
      { suit: "diamonds", number: 4 },
      { suit: "clubs", number: 5 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
      roundNumber = 11;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await page.click("#feedback-skip");

    await Promise.all([
      page.waitForNavigation(),
      page.click('#instructions button:has-text("New Set")'),
    ]);

    await expect(page.locator("#configuration-screen")).toBeVisible();
    await expect(page.locator("#app")).toBeHidden();
    await expect(page.locator("body")).toHaveAttribute("data-theme", "rugged");
    await expect(
      page.locator('input[name="theme"][value="rugged"]'),
    ).toBeChecked();
    await expect(page.locator("#multiplier-hearts")).toHaveValue("3");
    await expect(page.locator("#multiplier-spades")).toHaveValue("4");
    await expect(page.locator("#multiplier-diamonds")).toHaveValue("5");
    await expect(page.locator("#multiplier-clubs")).toHaveValue("5");
    await expect(page.locator("#endless-mode")).not.toBeChecked();
    await expect(page.locator("#auto-draw-enabled")).toBeChecked();
    await expect(page.locator("#auto-draw-interval-container")).toBeVisible();
    await expect(page.locator("#auto-draw-minutes")).toHaveValue("2");
    await expect(page.locator("#auto-draw-seconds")).toHaveValue("5");

    const params = new URL(page.url()).searchParams;
    expect(params.get("theme")).toBe("rugged");
    expect(params.get("multipliers")).toBe("h-3.s-4.d-5.c-5");
    expect(params.get("auto")).toBe("1");
    expect(params.get("autoIntervalSeconds")).toBe("125");
    expect(params.get("endless")).toBe(null);

    const newSetEvent = (await getAnalyticsCalls(page)).find(
      (call) => call.name === "new_set_started",
    );
    expect(newSetEvent).toEqual({
      type: "event",
      name: "new_set_started",
      data: {
        has_room: false,
        theme: "rugged",
        auto_draw: true,
      },
    });
  });

  test("the New Set button resets the synced room state", async ({ page }) => {
    const roomState = {
      configuration: {
        multipliers: { hearts: 1, spades: 2, diamonds: 3, clubs: 4 },
        theme: "plain",
        endless: false,
        autoDraw: { enabled: false, intervalSeconds: 150 },
      },
      deck: [
        { suit: "hearts", number: 2 },
        { suit: "spades", number: 3 },
      ],
      roundNumber: 12,
      roundCompleted: false,
      started: true,
      lastDrawn: [],
    };

    await page.route("http://localhost:4000/api/rooms/abc", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            room_id: "abc",
            version: 1,
            updated_at: "2026-01-21T20:00:00Z",
            state: roomState,
          }),
        });
      }
      return route.fulfill({
        status: 405,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "method_not_allowed" }),
      });
    });

    let resolveNewSetPayload;
    const newSetPayloadPromise = new Promise((resolve) => {
      resolveNewSetPayload = resolve;
    });

    await installRoomSocketMock(page, {
      onUpdate: (payload) => {
        const state = payload?.state ?? {};
        if (
          state.started === false &&
          state.roundNumber === 1 &&
          state.roundCompleted === false &&
          Array.isArray(state.deck) &&
          state.deck.length === 52 &&
          Array.isArray(state.lastDrawn) &&
          state.lastDrawn.length === 0
        ) {
          resolveNewSetPayload(payload);
        }
      },
    });

    const url = new URL(baseUrl);
    url.searchParams.set("room", "abc");

    await page.goto(url.toString());

    await setDeck(page, [
      { suit: "hearts", number: 2 },
      { suit: "spades", number: 3 },
      { suit: "diamonds", number: 4 },
      { suit: "clubs", number: 5 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
      roundNumber = 11;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await page.click("#feedback-skip");

    await expect(
      page.locator('#instructions button:has-text("New Set")'),
    ).toBeVisible();

    await Promise.all([
      page.waitForNavigation(),
      page.click('#instructions button:has-text("New Set")'),
    ]);

    const payload = await newSetPayloadPromise;

    expect(payload).toEqual({
      state: {
        configuration: roomState.configuration,
        deck: expect.any(Array),
        roundNumber: 1,
        roundCompleted: false,
        started: false,
        lastDrawn: [],
      },
    });
  });

  test("endless mode removes the round limit and reshuffles after the deck is depleted", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "casino",
      endless: true,
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 2 },
      { suit: "spades", number: 3 },
      { suit: "diamonds", number: 4 },
      { suit: "clubs", number: 5 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
      roundNumber = 1;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await expect(page.locator("#round-title")).toHaveText("Round 1");

    const firstDrawState = await page.evaluate(() => ({
      deckSize: deck.length,
      roundNumber,
      drawButtonDisplay:
        document.getElementById("draw-button").style.display || "",
    }));

    await expect(page.locator("#instructions p")).toHaveCount(0);
    await expect(page.locator("#instructions button")).toHaveCount(0);

    expect(firstDrawState.deckSize).toBe(0);
    expect(firstDrawState.roundNumber).toBe(2);
    expect(firstDrawState.drawButtonDisplay).not.toBe("none");

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await expect(page.locator("#round-title")).toHaveText("Round 2");

    const secondDrawState = await page.evaluate(() => ({
      deckSize: deck.length,
      hasNewSetButton: Boolean(document.querySelector("#instructions button")),
    }));

    expect(secondDrawState.deckSize).toBe(48);
    expect(secondDrawState.hasNewSetButton).toBe(false);
  });

  test("ignores invalid card values when restoring from the URL", async ({
    page,
  }) => {
    const url = new URL(baseUrl);
    url.searchParams.set("started", "1");
    url.searchParams.set("round", "2");
    url.searchParams.set("completed", "1");
    url.searchParams.set("theme", "plain");
    url.searchParams.set("multipliers", "h-1.s-1.d-1.c-1");
    url.searchParams.set("deck", "h-1.h-0.h-14.s--2.d-13");
    url.searchParams.set("draw", "c-7.c-99");

    await page.goto(url.toString());
    await expect(page.locator("body")).toHaveAttribute("data-theme", "plain");

    const restored = await page.evaluate(() => ({
      deck: deck.map((card) => `${card.suit}-${card.number}`),
      lastDrawn: lastDrawn.map((card) => `${card.suit}-${card.number}`),
    }));

    expect(restored.deck).toEqual(["hearts-1", "diamonds-13"]);
    expect(restored.lastDrawn).toEqual(["clubs-7"]);
  });

  test("persists workout progress in the URL and restores it on reload", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "rugged",
      endless: false,
      multipliers: { hearts: 2, spades: 3, diamonds: 4, clubs: 5 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 1 },
      { suit: "spades", number: 12 },
      { suit: "diamonds", number: 5 },
      { suit: "clubs", number: 3 },
      { suit: "diamonds", number: 13 },
      { suit: "clubs", number: 4 },
      { suit: "spades", number: 2 },
      { suit: "hearts", number: 7 },
      { suit: "clubs", number: 11 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.click("#draw-button");
    });

    await expectRepSummary(page, [
      { exercise: "Jumping Jacks", reps: 22 },
      { exercise: "Squats", reps: 30 },
      { exercise: "Pushups", reps: 20 },
      { exercise: "Abs", reps: 15 },
    ]);
    await expect(page.locator("#instructions p")).toHaveCount(0);

    const url = page.url();
    const params = new URL(url).searchParams;

    expect(params.get("started")).toBe("1");
    expect(params.get("round")).toBe("2");
    expect(params.get("theme")).toBe("rugged");
    expect(params.get("endless")).toBe(null);
    expect(params.get("completed")).toBe("1");
    expect(params.get("multipliers")).toBe("h-2.s-3.d-4.c-5");
    expect(params.get("deck")).toBe("d-13.c-4.s-2.h-7.c-11");
    expect(params.get("draw")).toBe("h-1.s-12.d-5.c-3");

    await page.reload();

    await expect(page.locator("#configuration-screen")).toBeHidden();
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("body")).toHaveAttribute("data-theme", "rugged");
    await expect(page.locator("#round-title")).toHaveText("Round 1 of 12");
    await expect(page.locator("#drawn-cards .card")).toHaveCount(4);
    await expectRepSummary(page, [
      { exercise: "Jumping Jacks", reps: 22 },
      { exercise: "Squats", reps: 30 },
      { exercise: "Pushups", reps: 20 },
      { exercise: "Abs", reps: 15 },
    ]);
    await expect(page.locator("#instructions p")).toHaveCount(0);

    const restoredState = await page.evaluate(() => ({
      deckSize: deck.length,
      roundNumber,
      roundCompleted,
      configuration: {
        theme: configuration.theme,
        endless: configuration.endless,
        multipliers: { ...configuration.multipliers },
      },
    }));

    expect(restoredState.deckSize).toBe(5);
    expect(restoredState.roundNumber).toBe(2);
    expect(restoredState.roundCompleted).toBe(true);
    expect(restoredState.configuration.theme).toBe("rugged");
    expect(restoredState.configuration.endless).toBe(false);
    expect(restoredState.configuration.multipliers).toEqual({
      hearts: 2,
      spades: 3,
      diamonds: 4,
      clubs: 5,
    });
  });

  test("uses a split cards-and-summary layout on landscape tablet screens", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1180, height: 820 });

    await startWorkoutWithOptions(page, {
      theme: "rugged",
      multipliers: { hearts: 2, spades: 2, diamonds: 2, clubs: 2 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 1 },
      { suit: "spades", number: 12 },
      { suit: "diamonds", number: 5 },
      { suit: "clubs", number: 3 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await expectRepSummary(page, [
      { exercise: "Jumping Jacks", reps: 22 },
      { exercise: "Squats", reps: 20 },
      { exercise: "Pushups", reps: 10 },
      { exercise: "Abs", reps: 6 },
    ]);

    const layout = await page.evaluate(() => {
      const workoutGridRect = document
        .getElementById("workout-grid")
        ?.getBoundingClientRect();
      const cardRects = Array.from(
        document.querySelectorAll("#drawn-cards .card"),
      )
        .slice(0, 4)
        .map((card) => card.getBoundingClientRect());
      const summaryRects = Array.from(
        document.querySelectorAll(".rep-summary-item"),
      )
        .slice(0, 4)
        .map((item) => item.getBoundingClientRect());
      const countRect = document
        .querySelector(".rep-summary-count")
        ?.getBoundingClientRect();
      const exerciseRect = document
        .querySelector(".rep-summary-exercise")
        ?.getBoundingClientRect();

      return {
        workoutGridLeft: workoutGridRect?.left ?? 0,
        workoutGridRight: workoutGridRect?.right ?? 0,
        firstCardTop: cardRects[0]?.top ?? 0,
        thirdCardTop: cardRects[2]?.top ?? 0,
        firstCardLeft: cardRects[0]?.left ?? 0,
        secondCardLeft: cardRects[1]?.left ?? 0,
        secondCardRight: cardRects[1]?.right ?? 0,
        firstCardWidth: cardRects[0]?.width ?? 0,
        firstCardHeight: cardRects[0]?.height ?? 0,
        firstSummaryTop: summaryRects[0]?.top ?? 0,
        thirdSummaryTop: summaryRects[2]?.top ?? 0,
        firstSummaryLeft: summaryRects[0]?.left ?? 0,
        secondSummaryLeft: summaryRects[1]?.left ?? 0,
        firstSummaryWidth: summaryRects[0]?.width ?? 0,
        firstSummaryHeight: summaryRects[0]?.height ?? 0,
        cardFontSize: Number.parseFloat(
          getComputedStyle(document.querySelector("#drawn-cards .card"))
            .fontSize,
        ),
        countFontSize: Number.parseFloat(
          getComputedStyle(document.querySelector(".rep-summary-count"))
            .fontSize,
        ),
        countHeight: countRect?.height ?? 0,
        countBottom: countRect?.bottom ?? 0,
        exerciseTop: exerciseRect?.top ?? 0,
      };
    });

    expect(layout.workoutGridLeft).toBeLessThanOrEqual(layout.firstCardLeft);
    expect(layout.workoutGridRight).toBeGreaterThanOrEqual(
      layout.secondSummaryLeft,
    );
    expect(layout.firstSummaryLeft - layout.secondCardRight).toBeGreaterThan(
      20,
    );
    expect(layout.thirdCardTop).toBeGreaterThan(layout.firstCardTop);
    expect(layout.secondCardLeft).toBeGreaterThan(layout.firstCardLeft);
    expect(Math.abs(layout.firstSummaryTop - layout.firstCardTop)).toBeLessThan(
      8,
    );
    expect(layout.thirdSummaryTop).toBeGreaterThan(layout.firstSummaryTop);
    expect(layout.secondSummaryLeft).toBeGreaterThan(layout.firstSummaryLeft);
    expect(layout.countHeight).toBeGreaterThan(40);
    expect(layout.exerciseTop).toBeGreaterThan(layout.countBottom);
    expect(layout.firstCardWidth / layout.firstCardHeight).toBeGreaterThan(
      0.75,
    );
    expect(layout.firstCardWidth / layout.firstCardHeight).toBeLessThan(1.25);
    expect(
      layout.firstSummaryWidth / layout.firstSummaryHeight,
    ).toBeGreaterThan(0.75);
    expect(layout.firstSummaryWidth / layout.firstSummaryHeight).toBeLessThan(
      1.25,
    );
    expect(
      Math.abs(layout.firstCardWidth - layout.firstSummaryWidth),
    ).toBeLessThan(16);
    expect(
      Math.abs(layout.firstCardHeight - layout.firstSummaryHeight),
    ).toBeLessThan(16);
    expect(layout.cardFontSize).toBeGreaterThan(40);
    expect(layout.countFontSize).toBeGreaterThan(80);
  });

  test("rep summary keeps all exercises visible with zero counts", async ({
    page,
  }) => {
    await startWorkoutWithOptions(page, {
      theme: "casino",
      multipliers: { hearts: 2, spades: 2, diamonds: 2, clubs: 2 },
    });

    await setDeck(page, [{ suit: "hearts", number: 4 }]);

    await page.evaluate(() => {
      roundCompleted = false;
      roundNumber = 11;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await expectRepSummary(page, [
      { exercise: "Jumping Jacks", reps: 8 },
      { exercise: "Squats", reps: 0 },
      { exercise: "Pushups", reps: 0 },
      { exercise: "Abs", reps: 0 },
    ]);
  });

  test("mobile workout layout stays within the viewport after a draw", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.cookie = "deckOfGainsFeedback=1; Path=/; SameSite=Lax";
    });

    await startWorkoutWithOptions(page, {
      theme: "plain",
      multipliers: { hearts: 2, spades: 2, diamonds: 2, clubs: 2 },
    });

    await setDeck(page, [
      { suit: "hearts", number: 1 },
      { suit: "spades", number: 12 },
      { suit: "diamonds", number: 5 },
      { suit: "clubs", number: 3 },
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    const layout = await page.evaluate(() => {
      const appRect = document.getElementById("app")?.getBoundingClientRect();
      return {
        appBottom: appRect?.bottom ?? 0,
        viewportHeight: window.innerHeight,
      };
    });

    expect(layout.appBottom).toBeLessThanOrEqual(layout.viewportHeight);
  });

  test("drawCards always plays the whoosh sound regardless of theme", async ({
    page,
  }) => {
    const themes = ["casino", "plain", "rugged"];

    for (const theme of themes) {
      await page.goto(baseUrl);

      await page.evaluate(() => {
        class StubAudioContext {
          constructor() {
            this.sampleRate = 44100;
            this.currentTime = 0;
            this.destination = {};
          }

          resume() {
            return Promise.resolve();
          }

          createBuffer(channels, frameCount) {
            return {
              getChannelData() {
                return new Float32Array(frameCount * channels);
              },
            };
          }

          createBufferSource() {
            return {
              connect() {},
              start() {},
              stop() {},
              playbackRate: { setValueAtTime() {} },
            };
          }

          createGain() {
            return {
              connect() {},
              gain: {
                setValueAtTime() {},
                linearRampToValueAtTime() {},
                exponentialRampToValueAtTime() {},
              },
            };
          }

          createBiquadFilter() {
            return {
              connect() {},
              type: "",
              frequency: { setValueAtTime() {} },
            };
          }
        }

        window.AudioContext = StubAudioContext;
        window.webkitAudioContext = StubAudioContext;
      });

      await startWorkoutWithOptions(page, {
        theme,
        multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
      });

      await setDeck(page, [
        { suit: "hearts", number: 1 },
        { suit: "spades", number: 2 },
        { suit: "diamonds", number: 3 },
        { suit: "clubs", number: 4 },
        { suit: "hearts", number: 5 },
        { suit: "spades", number: 6 },
        { suit: "diamonds", number: 7 },
        { suit: "clubs", number: 8 },
      ]);

      await page.evaluate(() => {
        roundCompleted = false;
        window.__deckOfGainsLastSound = undefined;
        window.__deckOfGainsLastSoundPlayCount = 0;
      });

      await withPatchedRandom(page, 0, async () => {
        await page.evaluate(() => {
          drawCards();
        });
      });

      const soundState = await page.evaluate(() => ({
        sound: window.__deckOfGainsLastSound,
        count: window.__deckOfGainsLastSoundPlayCount,
      }));

      expect(soundState.sound).toBe("whoosh");
      expect(soundState.count).toBeGreaterThan(0);
    }
  });
});
