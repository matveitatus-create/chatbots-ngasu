// Разовая проверка: слайдер «Свет» (глава 06) реально двигает ключевой свет.
// Кадры сцены при -90 / 0 / +90 сравниваются побайтово.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = 'C:/Users/user/AppData/Local/Temp/opencode';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4174/#proptech', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const shots = [];
for (const deg of [-90, 0, 90]) {
  await page.evaluate((value) => {
    const input = document.querySelector('#light');
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, deg);
  await page.waitForTimeout(900);
  const file = `${OUT}/light-${deg}.png`;
  await page.locator('#scene').screenshot({ path: file });
  shots.push(readFileSync(file));
}

const differs = (a, b) => !a.equals(b);
console.log('LABEL:', await page.textContent('#light-value'));
console.log('-90 vs 0 DIFFER:', differs(shots[0], shots[1]));
console.log('0 vs 90 DIFFER:', differs(shots[1], shots[2]));
console.log('-90 vs 90 DIFFER:', differs(shots[0], shots[2]));
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
