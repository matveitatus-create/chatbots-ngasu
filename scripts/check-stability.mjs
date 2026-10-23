// Стабильность длинной сессии: три круга по всем главам + модалки.
// DOM-узлы и JS-куча не должны расти от переключений (утечки).
// Использование: node scripts/check-stability.mjs [url]
import { chromium } from 'playwright-core';

const TARGET = process.argv[2] ?? 'http://localhost:4174/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const measure = () =>
  page.evaluate(() => ({
    nodes: document.getElementsByTagName('*').length,
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
  }));

const ids = await page.evaluate(() =>
  [...document.querySelectorAll('.chapter-nav a')].map((a) => a.getAttribute('href').slice(1))
);

const before = await measure();
for (let round = 0; round < 3; round += 1) {
  for (const id of ids) {
    await page.evaluate((hash) => { location.hash = hash; }, id);
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => { location.hash = 'tasks'; });
  await page.waitForTimeout(500);
  await page.click('[data-doc="object"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}
const after = await measure();

console.log('NODES before/after:', before.nodes, '/', after.nodes, '| delta:', after.nodes - before.nodes);
console.log('HEAP MB before/after:', before.heap, '/', after.heap, '| delta:', after.heap - before.heap);
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
