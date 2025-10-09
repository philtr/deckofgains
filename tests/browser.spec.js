const { test, expect } = require('@playwright/test');
const path = require('path');

const fileUrl = `file://${path.resolve(__dirname, '../index.html')}`;

async function startWorkoutWithOptions(page, { theme = 'casino', multipliers, endless = false } = {}) {
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
    await page.goto(fileUrl);
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

    const bodyClasses = await page.evaluate(() => Array.from(document.body.classList));
    expect(bodyClasses).toContain('rugged');
  });

  test('switching theme radios toggles the rugged class immediately', async ({ page }) => {
    await page.check('input[name="theme"][value="rugged"]');
    await page.waitForFunction(() => document.body.classList.contains('rugged'));

    let hasRugged = await page.evaluate(() => document.body.classList.contains('rugged'));
    expect(hasRugged).toBe(true);

    await page.check('input[name="theme"][value="casino"]');
    await page.waitForFunction(() => !document.body.classList.contains('rugged'));

    hasRugged = await page.evaluate(() => document.body.classList.contains('rugged'));
    expect(hasRugged).toBe(false);
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
});
