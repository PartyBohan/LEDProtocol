// Optional isolated Chromium walkthrough. Install Playwright in your test runtime,
// or set PLAYWRIGHT_MODULE to an existing module. No user browser storage is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SITE_URL || 'http://127.0.0.1:8769';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const matrix = [[393,852], [852,393], [820,1180], [1440,900], [320,568]];
try {
  for (const [width, height] of matrix) {
    const context = await browser.newContext({ viewport: { width, height }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Also verify documentation remains usable when optional fonts/highlighter fail.
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('https://fonts.gstatic.com/**', route => route.abort());
    await page.route('https://cdnjs.cloudflare.com/**', route => route.abort());
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.selectOption('#lang-select', 'zh');
    await page.locator('.sidebar-link[href="#verified-lighting"]').click();
    await page.locator('#verified-lighting h2').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#verified-lighting h2').innerText(), '已验证亮灯规则');
    const layout = await page.evaluate(() => ({ width: innerWidth, pageWidth: document.documentElement.scrollWidth, cards: [...document.querySelectorAll('.profile-card')].map(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })) }));
    assert.ok(layout.pageWidth <= layout.width + 1, JSON.stringify({ width, height, layout }));
    assert.ok(layout.cards.every(card => card.left >= 0 && card.right <= width + 1));
    await page.locator('[data-copy-target="verified-skill-prompt"]').click();
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes('$partykeys-protocol'));
    await page.locator('[data-copy-target="claude-md"]').click();
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes('Maximum THREE pairs'));
    // Returning learner: chosen language survives reload; do not clear storage.
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#lang-select').inputValue(), 'zh');
    await page.selectOption('#lang-select', 'fr');
    assert.equal(await page.locator('#verified-lighting h2').innerText(), 'Verified lighting rules');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('a[download]').click()]);
    assert.equal(download.suggestedFilename(), 'partykeys-protocol.zip');
    assert.equal(await download.failure(), null);
    assert.deepEqual(errors, []);
    if (process.env.SCREENSHOT_DIR) {
      await page.selectOption('#lang-select', 'zh');
      await page.locator('#verified-lighting h2').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/protocol-${width}x${height}.png` });
    }
    console.log(JSON.stringify({ viewport: `${width}x${height}`, language: 'zh → reload → fr/en fallback', copy: 'skill + full template', download: 'OK', overflow: false, errors }));
    await context.close();
  }
} finally { await browser.close(); }
