// Полный автоматизированный аудит доступности движком axe-core (WCAG):
// контраст, aria, заголовки, альт-текст, лендмарки, тач-таргеты и т.д.
// Сканирует главную и открытую модалку. Использование: node scripts/check-axe.mjs [url]
import { chromium } from 'playwright-core';
import path from 'node:path';

const TARGET = process.argv[2] ?? 'http://localhost:4174/';
const AXE = path.resolve('node_modules/axe-core/axe.min.js');

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.addScriptTag({ path: AXE });

const scan = () =>
  page.evaluate(async () => {
    const res = await axe.run(document, { resultTypes: ['violations'] });
    return res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      target: v.nodes[0]?.target?.join(' ') ?? '',
    }));
  });

const main = await scan();
console.log('MAIN VIOLATIONS:', main.length ? JSON.stringify(main, null, 2) : 'none');

// Модалка: открыть карточку и отсканировать документ ещё раз
await page.evaluate(() => document.querySelector('[data-doc]')?.click());
await page.waitForTimeout(500);
const modal = await scan();
console.log('MODAL VIOLATIONS:', modal.length ? JSON.stringify(modal, null, 2) : 'none');
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
