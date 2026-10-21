// Диагностика и тест интерактива через установленный Chrome (playwright-core).
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:4174';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader'],
});

const errors = [];

async function newPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  return page;
}

// --- 1. Замер заголовка на мобильном ---
{
  const page = await newPage(390, 844);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const h1 = document.querySelector('.hero-title');
    const r = h1.getBoundingClientRect();
    const sc = document.querySelector('#intro .scene-content').getBoundingClientRect();
    return {
      title: { left: r.left, right: r.right, width: r.width },
      content: { left: sc.left, right: sc.right, width: sc.width },
      docWidth: document.documentElement.scrollWidth,
      winWidth: innerWidth,
      fontSize: getComputedStyle(h1).fontSize,
      textAlign: getComputedStyle(h1).textAlign,
    };
  });
  console.log('MOBILE TITLE:', JSON.stringify(info, null, 1));
  await page.close();
}

// --- 2. Интерактив: пейджер колесом, пинг, чат ---
{
  const page = await newPage(1440, 900);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  const webgl = await page.evaluate(() => document.body.classList.contains('webgl-ready'));
  console.log('WEBGL READY:', webgl);

  // колесо вниз → глава 01
  await page.mouse.move(720, 450);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); }
  await page.waitForTimeout(1000);
  console.log('AFTER WHEEL hash:', await page.evaluate(() => location.hash));

  // слайд «Задачи»: клик по карточке открывает модалку с полным текстом реферата
  await page.goto(BASE + '/#tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('[data-doc="object"]');
  await page.waitForTimeout(400);
  console.log('MODAL VISIBLE:', await page.isVisible('.doc-modal-window'));
  console.log('MODAL TITLE:', await page.textContent('#doc-modal-title'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('MODAL CLOSED:', !(await page.isVisible('.doc-modal-window')));

  // демо-чат: клик по чипу, ждём ответ
  await page.goto(BASE + '/#demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200); // приветствие
  await page.click('[data-q="rag"]');
  await page.waitForTimeout(3000);
  const msgs = await page.evaluate(() =>
    [...document.querySelectorAll('#chat-log .msg')].map((m) => `${m.className}: ${m.textContent.slice(0, 40)}`)
  );
  console.log('CHAT LOG:', JSON.stringify(msgs, null, 1));

  // звук
  await page.click('#sound-toggle');
  console.log('SOUND TOGGLE:', await page.textContent('#sound-toggle'));

  // клавиатура: End → последняя глава
  await page.keyboard.press('End');
  await page.waitForTimeout(800);
  console.log('AFTER END hash:', await page.evaluate(() => location.hash));

  // слайдер поворота на главе 04 (стек)
  await page.goto(BASE + '/#stack', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('#rotation').fill('90');
  console.log('ROTATION OUT:', await page.textContent('#rotation-value'));

  await page.close();
}

console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
