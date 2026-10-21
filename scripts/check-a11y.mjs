// Доступность: клавиатура (навигация главами, фокус не прыгает) и демо-чат на мобильном.
// Использование: node scripts/check-a11y.mjs [url]
import { chromium } from 'playwright-core';

const TARGET = process.argv[2] ?? 'http://localhost:4174/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });

for (const vp of [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 },
]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Клавиатура: Enter на точке навигации переключает главу, фокус остаётся на ссылке
  await page.focus('.chapter-nav a[href="#tasks"]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const nav = await page.evaluate(() => ({
    hash: location.hash,
    active: document.activeElement?.getAttribute('href') ?? document.activeElement?.tagName,
    current: document.querySelector('.chapter-nav a[aria-current]')?.getAttribute('href'),
  }));
  console.log(`--- ${vp.name} ---`);
  console.log('NAV ENTER:', JSON.stringify(nav));

  // Tab-обход: фокус не должен попадать в невидимые главы
  const tabStops = [];
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    tabStops.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        const cs = getComputedStyle(el);
        const hidden = cs.visibility === 'hidden' || el.closest('[aria-hidden="true"]') !== null;
        return `${el.tagName.toLowerCase()}.${el.className?.split?.(' ')[0] ?? ''}${hidden ? '(!HIDDEN)' : ''}`;
      })
    );
  }
  console.log('TAB ORDER:', tabStops.join(' → '));

  // Демо-чат на мобильном: фокус и скролл не ломаются
  if (vp.width === 390) {
    await page.evaluate(() => { location.hash = '#demo'; });
    await page.waitForTimeout(900);
    const before = await page.evaluate(() => ({
      chapter: document.querySelector('.chapter.is-active')?.id,
      top: document.querySelector('.chapter.is-active')?.scrollTop,
      win: window.scrollY,
    }));
    await page.fill('.chat-form input', 'Что такое RAG?');
    await page.press('.chat-form input', 'Enter');
    await page.waitForTimeout(20000);
    const after = await page.evaluate(() => ({
      chapter: document.querySelector('.chapter.is-active')?.id,
      top: document.querySelector('.chapter.is-active')?.scrollTop,
      win: window.scrollY,
      focus: document.activeElement?.className ?? document.activeElement?.tagName,
      msgs: [...document.querySelectorAll('.msg')].map((m) => m.textContent.slice(0, 24)),
    }));
    console.log('CHAT BEFORE:', JSON.stringify(before));
    console.log('CHAT AFTER :', JSON.stringify(after));
  }
  console.log('JS ERRORS:', errors.length ? errors : 'none');
  await page.close();
}
await browser.close();
