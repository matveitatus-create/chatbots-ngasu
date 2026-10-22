// Крайние форматы: узкий телефон 320x568 и ландшафт 844x390.
// Горизонтальный overflow по главам + геометрия навигации + кадры.
// Использование: node scripts/check-small.mjs [url]
import { chromium } from 'playwright-core';

const TARGET = process.argv[2] ?? 'http://localhost:4174/';
const OUT = 'C:/Users/user/AppData/Local/Temp/opencode';

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
for (const vp of [
  { name: '320x568', width: 320, height: 568 },
  { name: '844x390', width: 844, height: 390 },
]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('.chapter-nav a')].map((a) => a.getAttribute('href').slice(1))
  );
  const over = [];
  for (const id of ids) {
    await page.evaluate((hash) => { location.hash = hash; }, id);
    await page.waitForTimeout(500);
    const bad = await page.evaluate(() => {
      const ch = document.querySelector('.chapter.is-active');
      const doc = document.documentElement.scrollWidth > innerWidth;
      const chOver = ch && ch.scrollWidth > ch.clientWidth + 1;
      if (!doc && !chOver) return null;
      // Виновники ищем только внутри активной главы (навигация скроллится сама)
      const out = [];
      const walk = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > innerWidth + 1) out.push(el);
        for (const kid of el.children) walk(kid);
      };
      if (ch) walk(ch);
      return {
        docScrollW: document.documentElement.scrollWidth,
        chScrollW: ch ? ch.scrollWidth : 0,
        items: out.slice(0, 8).map((el) => {
          const r = el.getBoundingClientRect();
          return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${Math.round(r.left)}..${Math.round(r.right)}] «${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}»`;
        }),
      };
    });
    if (bad) over.push(`${id} → ${JSON.stringify(bad)}`);
  }
  const nav = await page.evaluate(() => {
    const r = document.querySelector('.chapter-nav').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, vh: innerHeight };
  });
  console.log(`--- ${vp.name} ---`);
  console.log('H-OVERFLOW CHAPTERS:', over.length ? over.join(', ') : 'none');
  console.log('NAV RECT:', JSON.stringify(nav), '| в экране:', nav.top >= 0 && nav.bottom <= nav.vh && nav.left >= 0 && nav.right <= nav.vw);
  await page.evaluate(() => { location.hash = 'demo'; });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/small-${vp.name}-demo.png` });
  console.log('JS ERRORS:', errors.length ? errors : 'none');
  await page.close();
}
await browser.close();
