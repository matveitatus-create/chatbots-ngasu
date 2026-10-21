// Рендер обложки для og:image (1200x630) из живой сцены: глава 00.
// Использование: node scripts/shot-og.mjs [url]
import { chromium } from 'playwright-core';

const TARGET = process.argv[2] ?? 'http://localhost:4174/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'public/og-cover.png' });
await browser.close();
console.log('OK public/og-cover.png');
