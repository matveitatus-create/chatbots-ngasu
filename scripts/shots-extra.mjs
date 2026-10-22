// Доп. кадры: модалка реферата (десктоп/мобайл) и планшет 768.
// Использование: node scripts/shots-extra.mjs [url]
import { chromium } from 'playwright-core';

const TARGET = process.argv[2] ?? 'http://localhost:4174/';
const OUT = 'C:/Users/user/AppData/Local/Temp/opencode';

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const errors = [];

// Модалка на десктопе
let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(TARGET + '#tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('[data-doc="object"]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/modal-desktop.png` });
await page.close();

// Модалка на мобильном
page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(TARGET + '#tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('[data-doc="object"]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/modal-mobile.png` });
await page.close();

// Планшет 768x1024: интро и демо
page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/tablet-intro.png` });
await page.evaluate(() => { location.hash = 'demo'; });
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}/tablet-demo.png` });
await page.close();

console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
