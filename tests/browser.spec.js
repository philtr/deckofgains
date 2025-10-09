const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.map': 'application/json'
};

let server;
let baseUrl;

async function serveFile(req, res) {
  try {
    const requestUrl = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname.endsWith('/')) {
      pathname = `${pathname}index.html`;
    }
    if (pathname === '/') {
      pathname = '/index.html';
    }
    const filePath = path.resolve(rootDir, `.${path.normalize(pathname)}`);
    if (!filePath.startsWith(rootDir)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
    res.end(data);
  } catch (error) {
    res.statusCode = 404;
    res.end('Not Found');
  }
}

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    serveFile(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}/index.html`;
});

test.afterAll(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
    server = undefined;
  }
});

async function startWorkoutWithOptions(
  page,
  { theme = 'casino', multipliers, endless = false, autoDraw } = {}
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
    await page.check('#endless-mode');
  }

  if (autoDraw?.enabled) {
    await page.check('#auto-draw-enabled');
  }

  if (autoDraw?.intervalSeconds !== undefined) {
    const minutes = Math.floor(autoDraw.intervalSeconds / 60);
    const seconds = Math.max(0, Math.round(autoDraw.intervalSeconds - minutes * 60));
    await page.fill('#auto-draw-minutes', String(minutes));
    await page.fill('#auto-draw-seconds', String(seconds));
  }

  await page.click('#start-workout');
}

async function setDeck(page, cards) {
  await page.evaluate(cards => {
    deck = cards.map(card => ({ ...card }));
  }, cards);
}

async function withPatchedRandom(page, value, callback) {
  await page.evaluate(val => {
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

test.describe('Deck of Gains app', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(baseUrl);
  });

  test('shows the configuration screen on load', async ({ page }) => {
    await expect(page.locator('#configuration-screen')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  });

  test('preloads default multipliers with clubs set to 2×', async ({ page }) => {
    await expect(page.locator('#multiplier-hearts')).toHaveValue('1');
    await expect(page.locator('#multiplier-spades')).toHaveValue('1');
    await expect(page.locator('#multiplier-diamonds')).toHaveValue('1');
    await expect(page.locator('#multiplier-clubs')).toHaveValue('2');
  });

  test('auto draw controls default to disabled with a 2 minute 30 second interval', async ({ page }) => {
    const intervalContainer = page.locator('.auto-draw-interval-option');
    await expect(page.locator('#auto-draw-enabled')).not.toBeChecked();
    await expect(intervalContainer).toBeHidden();

    await page.check('#auto-draw-enabled');
    await expect(intervalContainer).toBeVisible();
    await expect(page.locator('#auto-draw-minutes')).toHaveValue('2');
    await expect(page.locator('#auto-draw-seconds')).toHaveValue('30');
  });

  test('builds a unique 52 card deck when initializeDeck runs', async ({ page }) => {
    const result = await page.evaluate(() => {
      initializeDeck();
      return {
        deckSize: deck.length,
        uniqueCount: new Set(deck.map(card => `${card.suit}-${card.number}`)).size
      };
    });

    expect(result.deckSize).toBe(52);
    expect(result.uniqueCount).toBe(52);
  });

  test('formats cards for display correctly', async ({ page }) => {
    const values = await page.evaluate(() => ({
      ace: getCardDisplayValue(1),
      jack: getCardDisplayValue(11),
      queen: getCardDisplayValue(12),
      king: getCardDisplayValue(13),
      seven: getCardDisplayValue(7)
    }));

    expect(values.ace).toBe('A');
    expect(values.jack).toBe('J');
    expect(values.queen).toBe('Q');
    expect(values.king).toBe('K');
    expect(values.seven).toBe(7);
  });

  test('applies scoring rules for face cards and aces', async ({ page }) => {
    const values = await page.evaluate(() => ({
      face: getCardValue(12),
      ace: getCardValue(1),
      number: getCardValue(7)
    }));

    expect(values.face).toBe(10);
    expect(values.ace).toBe(11);
    expect(values.number).toBe(7);
  });

  test('starts a workout, hides the configuration screen, and applies the selected theme', async ({ page }) => {
    await startWorkoutWithOptions(page, {
      theme: 'rugged',
      multipliers: { hearts: 2, spades: 2, diamonds: 2, clubs: 2 }
    });

    await expect(page.locator('#configuration-screen')).toBeHidden();
    await expect(page.locator('#app')).toBeVisible();

    await expect(page.locator('body')).toHaveAttribute('data-theme', 'rugged');
  });

  test('switching theme radios updates the body data-theme immediately', async ({ page }) => {
    await page.check('input[name="theme"][value="rugged"]');
    await page.waitForFunction(() => document.body.dataset.theme === 'rugged');

    let activeTheme = await page.evaluate(() => document.body.dataset.theme);
    expect(activeTheme).toBe('rugged');

    await page.check('input[name="theme"][value="casino"]');
    await page.waitForFunction(() => document.body.dataset.theme === 'casino');

    activeTheme = await page.evaluate(() => document.body.dataset.theme);
    expect(activeTheme).toBe('casino');
  });

  test('reserves padding for mobile safe areas', async ({ page }) => {
    const padding = await page.evaluate(() => {
      const styles = window.getComputedStyle(document.body);
      const parse = value => parseFloat(value);
      return {
        top: parse(styles.paddingTop),
        bottom: parse(styles.paddingBottom)
      };
    });

    expect(padding.top).toBeGreaterThanOrEqual(16);
    expect(padding.bottom).toBeGreaterThanOrEqual(16);
  });

  test('draws four cards while more than eight remain', async ({ page }) => {
    await setDeck(page, [
      { suit: 'hearts', number: 1 },
      { suit: 'spades', number: 12 },
      { suit: 'diamonds', number: 5 },
      { suit: 'clubs', number: 3 },
      { suit: 'diamonds', number: 13 },
      { suit: 'clubs', number: 4 },
      { suit: 'spades', number: 2 },
      { suit: 'hearts', number: 7 },
      { suit: 'clubs', number: 11 }
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
    });

    const result = await withPatchedRandom(page, 0, async () => {
      return page.evaluate(() => {
        const drawn = doDrawCards();
        return {
          drawn: drawn.map(card => `${card.suit}-${card.number}`),
          remaining: deck.length
        };
      });
    });

    expect(result.drawn).toEqual([
      'hearts-1',
      'spades-12',
      'diamonds-5',
      'clubs-3'
    ]);
    expect(result.remaining).toBe(5);
  });

  test('draws the remaining cards when eight or fewer remain', async ({ page }) => {
    await setDeck(page, [
      { suit: 'hearts', number: 2 },
      { suit: 'spades', number: 3 },
      { suit: 'diamonds', number: 4 },
      { suit: 'clubs', number: 5 },
      { suit: 'hearts', number: 6 },
      { suit: 'spades', number: 7 },
      { suit: 'diamonds', number: 8 },
      { suit: 'clubs', number: 9 }
    ]);

    await page.evaluate(() => {
      roundCompleted = true;
    });

    const result = await withPatchedRandom(page, 0, async () => {
      return page.evaluate(() => {
        const drawn = doDrawCards();
        return {
          drawnCount: drawn.length,
          remaining: deck.length
        };
      });
    });

    expect(result.drawnCount).toBe(8);
    expect(result.remaining).toBe(0);
  });

  test('endless mode keeps drawing four cards when eight remain', async ({ page }) => {
    await startWorkoutWithOptions(page, {
      theme: 'casino',
      endless: true,
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 }
    });

    await setDeck(page, [
      { suit: 'hearts', number: 2 },
      { suit: 'spades', number: 3 },
      { suit: 'diamonds', number: 4 },
      { suit: 'clubs', number: 5 },
      { suit: 'hearts', number: 6 },
      { suit: 'spades', number: 7 },
      { suit: 'diamonds', number: 8 },
      { suit: 'clubs', number: 9 }
    ]);

    await page.evaluate(() => {
      roundCompleted = true;
    });

    const result = await withPatchedRandom(page, 0, async () => {
      return page.evaluate(() => {
        const drawn = doDrawCards();
        return {
          drawn: drawn.map(card => `${card.suit}-${card.number}`),
          remaining: deck.length
        };
      });
    });

    expect(result.drawn).toEqual([
      'hearts-2',
      'spades-3',
      'diamonds-4',
      'clubs-5'
    ]);
    expect(result.remaining).toBe(4);
  });

  test('auto draw automatically draws the next hand after the configured interval', async ({ page }) => {
    await startWorkoutWithOptions(page, {
      theme: 'casino',
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
      autoDraw: { enabled: true, intervalSeconds: 1 }
    });

    await setDeck(page, [
      { suit: 'hearts', number: 1 },
      { suit: 'spades', number: 2 },
      { suit: 'diamonds', number: 3 },
      { suit: 'clubs', number: 4 },
      { suit: 'hearts', number: 5 },
      { suit: 'spades', number: 6 },
      { suit: 'diamonds', number: 7 },
      { suit: 'clubs', number: 8 },
      { suit: 'hearts', number: 9 }
    ]);

    await page.waitForFunction(() => {
      return document.querySelectorAll('#drawn-cards .card').length === 4;
    });

    const state = await page.evaluate(() => ({
      roundNumber,
      roundCompleted,
      autoDrawEnabled: configuration.autoDraw?.enabled ?? false
    }));

    expect(state.roundNumber).toBe(2);
    expect(state.roundCompleted).toBe(true);
    expect(state.autoDrawEnabled).toBe(true);
  });

  test('auto draw countdown is displayed on the draw button while waiting', async ({ page }) => {
    await startWorkoutWithOptions(page, {
      theme: 'casino',
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 },
      autoDraw: { enabled: true, intervalSeconds: 3 }
    });

    await page.waitForFunction(() => {
      const button = document.getElementById('draw-button');
      return button && /Draw Cards \(\d+:\d{2}\)/.test(button.textContent);
    });

    const buttonText = await page.locator('#draw-button').textContent();
    expect(buttonText).toMatch(/Draw Cards \(\d+:\d{2}\)/);
  });

  test('drawCards updates the UI, totals, and round state', async ({ page }) => {
    await startWorkoutWithOptions(page, {
      theme: 'casino',
      multipliers: { hearts: 2, spades: 2, diamonds: 2, clubs: 2 }
    });

    await setDeck(page, [
      { suit: 'hearts', number: 1 },
      { suit: 'spades', number: 12 },
      { suit: 'diamonds', number: 5 },
      { suit: 'clubs', number: 3 },
      { suit: 'diamonds', number: 13 },
      { suit: 'clubs', number: 4 },
      { suit: 'spades', number: 2 },
      { suit: 'hearts', number: 7 },
      { suit: 'clubs', number: 11 }
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await expect(page.locator('#round-title')).toHaveText('Round 1 of 12');
    await expect(page.locator('#drawn-cards .card')).toHaveCount(4);
    await expect(page.locator('#instructions p').nth(0)).toHaveText('Jumping Jacks: 22 reps | Squats: 20 reps | Pushups: 10 reps | Abs: 6 reps');
    await expect(page.locator('#instructions p').nth(1)).toHaveText('Complete a 50 yard sprint.');

    const state = await page.evaluate(() => ({
      deckSize: deck.length,
      roundCompleted,
      roundNumber,
      drawButtonDisplay: document.getElementById('draw-button').style.display || ''
    }));

    expect(state.deckSize).toBe(5);
    expect(state.roundCompleted).toBe(true);
    expect(state.roundNumber).toBe(2);
    expect(state.drawButtonDisplay).not.toBe('none');
  });

  test('drawing four cards plays the whoosh sound four times', async ({ page }) => {
    await startWorkoutWithOptions(page, {
      theme: 'rugged',
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 }
    });

    await setDeck(page, [
      { suit: 'hearts', number: 1 },
      { suit: 'spades', number: 2 },
      { suit: 'diamonds', number: 3 },
      { suit: 'clubs', number: 4 },
      { suit: 'hearts', number: 5 },
      { suit: 'spades', number: 6 },
      { suit: 'diamonds', number: 7 },
      { suit: 'clubs', number: 8 },
      { suit: 'hearts', number: 9 }
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
      schedule: window.__deckOfGainsLastSoundSchedule ?? []
    }));

    expect(soundState.effect).toBe('whoosh');
    expect(soundState.count).toBe(4);
    expect(soundState.schedule).toHaveLength(4);
    for (let i = 1; i < soundState.schedule.length; i += 1) {
      expect(soundState.schedule[i] - soundState.schedule[i - 1]).toBeGreaterThanOrEqual(0.14);
    }
  });

  test('drawing eight cards plays the whoosh sound eight times', async ({ page }) => {
    await startWorkoutWithOptions(page, {
      theme: 'casino',
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 }
    });

    await setDeck(page, [
      { suit: 'hearts', number: 1 },
      { suit: 'spades', number: 2 },
      { suit: 'diamonds', number: 3 },
      { suit: 'clubs', number: 4 },
      { suit: 'hearts', number: 5 },
      { suit: 'spades', number: 6 },
      { suit: 'diamonds', number: 7 },
      { suit: 'clubs', number: 8 }
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
      schedule: window.__deckOfGainsLastSoundSchedule ?? []
    }));

    expect(soundState.effect).toBe('whoosh');
    expect(soundState.count).toBe(8);
    expect(soundState.schedule).toHaveLength(8);
    for (let i = 1; i < soundState.schedule.length; i += 1) {
      expect(soundState.schedule[i] - soundState.schedule[i - 1]).toBeGreaterThanOrEqual(0.14);
    }
  });

  test('respects configured multipliers when calculating totals', async ({ page }) => {
    await startWorkoutWithOptions(page, {
      theme: 'casino',
      multipliers: { hearts: 2, spades: 3, diamonds: 4, clubs: 4 }
    });

    await setDeck(page, [
      { suit: 'hearts', number: 6 },
      { suit: 'spades', number: 7 },
      { suit: 'diamonds', number: 8 },
      { suit: 'clubs', number: 9 }
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await expect(page.locator('#instructions p').nth(0)).toHaveText('Jumping Jacks: 12 reps | Squats: 21 reps | Pushups: 32 reps | Abs: 36 reps');
  });

  test('handles the final draw and sprint instructions when the deck is depleted', async ({ page }) => {
    await startWorkoutWithOptions(page, {
      theme: 'casino',
      multipliers: { hearts: 2, spades: 2, diamonds: 2, clubs: 2 }
    });

    await setDeck(page, [
      { suit: 'hearts', number: 2 },
      { suit: 'spades', number: 3 },
      { suit: 'diamonds', number: 4 },
      { suit: 'clubs', number: 5 }
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

    const instructions = await page.locator('#instructions p').allTextContents();
    expect(instructions[0]).toBe('Jumping Jacks: 4 reps | Squats: 6 reps | Pushups: 8 reps | Abs: 10 reps');
    expect(instructions[1]).toBe('Complete 2 sprints of 50 yards each.');

    const state = await page.evaluate(() => ({
      deckSize: deck.length,
      drawButtonDisplay: document.getElementById('draw-button').style.display,
      newSetLabel: document.querySelector('#instructions button')?.textContent ?? null
    }));

    expect(state.deckSize).toBe(0);
    expect(state.drawButtonDisplay).toBe('none');
    expect(state.newSetLabel).toBe('New Set');
  });

  test('endless mode removes the round limit and reshuffles after the deck is depleted', async ({ page }) => {
    await startWorkoutWithOptions(page, {
      theme: 'casino',
      endless: true,
      multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 }
    });

    await setDeck(page, [
      { suit: 'hearts', number: 2 },
      { suit: 'spades', number: 3 },
      { suit: 'diamonds', number: 4 },
      { suit: 'clubs', number: 5 }
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

    await expect(page.locator('#round-title')).toHaveText('Round 1');

    const firstDrawState = await page.evaluate(() => ({
      deckSize: deck.length,
      roundNumber,
      drawButtonDisplay: document.getElementById('draw-button').style.display || ''
    }));

    const instructionsAfterFirstDraw = await page.locator('#instructions p').allTextContents();
    expect(instructionsAfterFirstDraw[1]).toBe('Complete a 50 yard sprint.');
    await expect(page.locator('#instructions button')).toHaveCount(0);

    expect(firstDrawState.deckSize).toBe(0);
    expect(firstDrawState.roundNumber).toBe(2);
    expect(firstDrawState.drawButtonDisplay).not.toBe('none');

    await withPatchedRandom(page, 0, async () => {
      await page.evaluate(() => {
        drawCards();
      });
    });

    await expect(page.locator('#round-title')).toHaveText('Round 2');

    const secondDrawState = await page.evaluate(() => ({
      deckSize: deck.length,
      hasNewSetButton: Boolean(document.querySelector('#instructions button'))
    }));

    expect(secondDrawState.deckSize).toBe(48);
    expect(secondDrawState.hasNewSetButton).toBe(false);
  });

  test('persists workout progress in the URL and restores it on reload', async ({ page }) => {
    await startWorkoutWithOptions(page, {
      theme: 'rugged',
      endless: false,
      multipliers: { hearts: 2, spades: 3, diamonds: 4, clubs: 5 }
    });

    await setDeck(page, [
      { suit: 'hearts', number: 1 },
      { suit: 'spades', number: 12 },
      { suit: 'diamonds', number: 5 },
      { suit: 'clubs', number: 3 },
      { suit: 'diamonds', number: 13 },
      { suit: 'clubs', number: 4 },
      { suit: 'spades', number: 2 },
      { suit: 'hearts', number: 7 },
      { suit: 'clubs', number: 11 }
    ]);

    await page.evaluate(() => {
      roundCompleted = false;
    });

    await withPatchedRandom(page, 0, async () => {
      await page.click('#draw-button');
    });

    await expect(page.locator('#instructions p').nth(0)).toHaveText('Jumping Jacks: 22 reps | Squats: 30 reps | Pushups: 20 reps | Abs: 15 reps');
    await expect(page.locator('#instructions p').nth(1)).toHaveText('Complete a 50 yard sprint.');

    const url = page.url();
    const params = new URL(url).searchParams;

    expect(params.get('started')).toBe('1');
    expect(params.get('round')).toBe('2');
    expect(params.get('theme')).toBe('rugged');
    expect(params.get('endless')).toBe(null);
    expect(params.get('completed')).toBe('1');
    expect(params.get('multipliers')).toBe('h-2.s-3.d-4.c-5');
    expect(params.get('deck')).toBe('d-13.c-4.s-2.h-7.c-11');
    expect(params.get('draw')).toBe('h-1.s-12.d-5.c-3');

    await page.reload();

    await expect(page.locator('#configuration-screen')).toBeHidden();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'rugged');
    await expect(page.locator('#round-title')).toHaveText('Round 1 of 12');
    await expect(page.locator('#drawn-cards .card')).toHaveCount(4);
    await expect(page.locator('#instructions p').nth(0)).toHaveText('Jumping Jacks: 22 reps | Squats: 30 reps | Pushups: 20 reps | Abs: 15 reps');
    await expect(page.locator('#instructions p').nth(1)).toHaveText('Complete a 50 yard sprint.');

    const restoredState = await page.evaluate(() => ({
      deckSize: deck.length,
      roundNumber,
      roundCompleted,
      configuration: {
        theme: configuration.theme,
        endless: configuration.endless,
        multipliers: { ...configuration.multipliers }
      }
    }));

    expect(restoredState.deckSize).toBe(5);
    expect(restoredState.roundNumber).toBe(2);
    expect(restoredState.roundCompleted).toBe(true);
    expect(restoredState.configuration.theme).toBe('rugged');
    expect(restoredState.configuration.endless).toBe(false);
    expect(restoredState.configuration.multipliers).toEqual({ hearts: 2, spades: 3, diamonds: 4, clubs: 5 });
  });

  test('drawCards always plays the whoosh sound regardless of theme', async ({ page }) => {
    const themes = ['casino', 'rugged'];

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
              }
            };
          }

          createBufferSource() {
            return {
              connect() {},
              start() {},
              stop() {},
              playbackRate: { setValueAtTime() {} }
            };
          }

          createGain() {
            return {
              connect() {},
              gain: {
                setValueAtTime() {},
                linearRampToValueAtTime() {},
                exponentialRampToValueAtTime() {}
              }
            };
          }

          createBiquadFilter() {
            return {
              connect() {},
              type: '',
              frequency: { setValueAtTime() {} }
            };
          }
        }

        window.AudioContext = StubAudioContext;
        window.webkitAudioContext = StubAudioContext;
      });

      await startWorkoutWithOptions(page, {
        theme,
        multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 1 }
      });

      await setDeck(page, [
        { suit: 'hearts', number: 1 },
        { suit: 'spades', number: 2 },
        { suit: 'diamonds', number: 3 },
        { suit: 'clubs', number: 4 },
        { suit: 'hearts', number: 5 },
        { suit: 'spades', number: 6 },
        { suit: 'diamonds', number: 7 },
        { suit: 'clubs', number: 8 }
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
        count: window.__deckOfGainsLastSoundPlayCount
      }));

      expect(soundState.sound).toBe('whoosh');
      expect(soundState.count).toBeGreaterThan(0);
    }
  });
});
