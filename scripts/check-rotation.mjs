// Разовая проверка: слайдер «Поворот» (глава 04) реально крутит бота.
// Снимаем кадр сцены при 0° / 180° / 360° и сравниваем пиксели.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = 'C:/Users/user/AppData/Local/Temp/opencode';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
// reduced-motion: выключаем idle-анимацию, чтобы кадры различались ТОЛЬКО поворотом
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4174/#stack', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const shots = [];
for (const deg of [0, 180, 360]) {
  await page.evaluate((value) => {
    const input = document.querySelector('#rotation');
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, deg);
  await page.waitForTimeout(900);
  const file = `${OUT}/rot-${deg}.png`;
  await page.locator('#scene').screenshot({ path: file });
  shots.push(readFileSync(file));
}

const differs = (a, b) => !a.equals(b);
console.log('LABEL:', await page.textContent('#rotation-value'));
console.log('0 vs 180 DIFFER:', differs(shots[0], shots[1]));
console.log('180 vs 360 DIFFER:', differs(shots[1], shots[2]));
console.log('0 vs 360 DIFFER:', differs(shots[0], shots[2]));
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
