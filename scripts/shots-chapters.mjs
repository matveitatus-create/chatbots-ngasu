// Десктоп-скриншоты указанных глав: node scripts/shots-chapters.mjs [url] [id...]
import { chromium } from 'playwright-core';

const TARGET = process.argv[2] ?? 'http://localhost:4174/';
const IDS = process.argv.slice(3);
const LIST = IDS.length ? IDS : ['generations', 'proptech', 'thanks'];
const OUT = 'C:/Users/user/AppData/Local/Temp/opencode';
const W = Number(process.env.VW ?? 1280);
const H = Number(process.env.VH ?? 800);

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
for (const id of LIST) {
  await page.evaluate((hash) => { location.hash = hash; }, id);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/ch-${id}.png` });
}
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
