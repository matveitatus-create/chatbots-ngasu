// Консоль браузера: ошибки и предупреждения при обходе всех глав.
// Использование: node scripts/check-console.mjs [url]
import { chromium } from 'playwright-core';

const TARGET = process.argv[2] ?? 'http://localhost:4174/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const lines = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') lines.push(`${m.type()}: ${m.text().slice(0, 160)}`);
});
page.on('pageerror', (e) => lines.push(`pageerror: ${String(e).slice(0, 160)}`));
await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const ids = await page.evaluate(() =>
  [...document.querySelectorAll('.chapter-nav a')].map((a) => a.getAttribute('href').slice(1))
);
for (const id of ids) {
  await page.evaluate((hash) => { location.hash = hash; }, id);
  await page.waitForTimeout(600);
}
// модалка и чат тоже
await page.click('[data-doc="object"]').catch(() => {});
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
console.log('CONSOLE ISSUES:', lines.length ? lines : 'none');
await browser.close();
