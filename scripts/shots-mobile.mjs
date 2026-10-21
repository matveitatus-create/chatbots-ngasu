// Мобильная проверка: все главы + модалка + чат на 390×844.
import { chromium } from 'playwright-core';

const OUT = 'C:/Users/user/AppData/Local/Temp/opencode';
const IDS = ['intro', 'actuality', 'tasks', 'generations', 'stack', 'bim', 'proptech', 'practice', 'conclusion', 'thanks', 'demo'];

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

for (const id of IDS) {
  await page.goto(`http://localhost:4174/#${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/mob-${id}.png` });
}

// модалка на мобильном (карточка в главе 01)
await page.goto('http://localhost:4174/#actuality', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
await page.tap('[data-doc]').catch(() => {});
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/mob-modal.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// чат на мобильном
await page.goto('http://localhost:4174/#demo', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}/mob-chat.png` });

console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
