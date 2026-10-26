// Полный автоматизированный аудит доступности движком axe-core (WCAG):
// все главы на десктопе 1440 и мобайле 390 + модалка в обоих форматах.
// Контраст зависит от палитры главы (data-ch), поэтому сканируем каждую.
// Использование: node scripts/check-axe.mjs [url]
import { chromium } from 'playwright-core';
import path from 'node:path';

const TARGET = process.argv[2] ?? 'http://localhost:4174/';
const AXE = path.resolve('node_modules/axe-core/axe.min.js');

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const errors = [];

const scan = (page) =>
  page.evaluate(async () => {
    const res = await axe.run(document, { resultTypes: ['violations'] });
    return res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      target: v.nodes[0]?.target?.join(' ') ?? '',
    }));
  });

let total = 0;
for (const vp of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  const page = await browser.newPage({ viewport: vp });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.addScriptTag({ path: AXE });

  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('.chapter-nav a')].map((a) => a.getAttribute('href').slice(1))
  );
  for (const id of ids) {
    await page.evaluate((hash) => { location.hash = hash; }, id);
    await page.waitForTimeout(700);
    const v = await scan(page);
    total += v.length;
    console.log(`${vp.width} #${id}:`, v.length ? JSON.stringify(v) : 'clean');
  }

  // Модалка (глава 02 — карточки data-doc)
  await page.evaluate(() => { location.hash = 'tasks'; });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('[data-doc]')?.click());
  await page.waitForTimeout(500);
  const mv = await scan(page);
  total += mv.length;
  console.log(`${vp.width} modal:`, mv.length ? JSON.stringify(mv) : 'clean');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Интерактивные состояния чата: пузыри сообщений и включённые тумблеры
  if (vp.width === 1440) {
    await page.evaluate(() => { location.hash = 'demo'; });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelector('#chat-chips button')?.click());
    await page.waitForFunction(() => {
      const msgs = [...document.querySelectorAll('#chat-log .msg')];
      const last = msgs[msgs.length - 1];
      return msgs.length >= 2 && last && !last.classList.contains('typing') && last.textContent.trim();
    }, null, { timeout: 20000 });
    const cv = await scan(page);
    total += cv.length;
    console.log(`${vp.width} chat+messages:`, cv.length ? JSON.stringify(cv) : 'clean');

    await page.click('#sound-toggle');
    if (await page.locator('#voice-toggle').isVisible()) await page.click('#voice-toggle');
    await page.waitForTimeout(400);
    const tv = await scan(page);
    total += tv.length;
    console.log(`${vp.width} toggles-on:`, tv.length ? JSON.stringify(tv) : 'clean');
  }
  await page.close();
}

console.log('TOTAL VIOLATIONS:', total);
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
