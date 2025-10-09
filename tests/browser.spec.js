const { test, expect } = require('@playwright/test');
const path = require('path');

const fileUrl = `file://${path.resolve(__dirname, '../test.html')}`;

test('Deck of Gains browser suite passes', async ({ page }) => {
  await page.goto(fileUrl);
  await page.waitForFunction(() => {
    const summary = document.getElementById('summary');
    return summary && summary.textContent.includes('Tests Failed:');
  });

  const summaryText = await page.locator('#summary').textContent();
  expect(summaryText).toContain('Tests Failed: 0');
});
