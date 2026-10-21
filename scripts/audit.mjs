// Замеры дизайна: кегли видимого текста, тач-таргеты навигации, FPS, overflow.
// Использование: node scripts/audit.mjs [url]
import { chromium } from 'playwright-core';

const TARGET = process.argv[2] ?? 'http://localhost:4174/';
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const collect = () =>
    page.evaluate(() => {
      const visible = (el) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const hasText = (el) =>
        [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const small = [];
      const sizes = {};
      for (const el of document.querySelectorAll('body *')) {
        if (!hasText(el) || !visible(el)) continue;
        if (el.closest('[aria-hidden="true"]')) continue; // декор (водяные знаки) не считаем
        const px = parseFloat(getComputedStyle(el).fontSize);
        sizes[px] = (sizes[px] ?? 0) + 1;
        if (px < 12) small.push(`${el.className || el.tagName}:${px}`);
      }
      return { small, sizes };
    });

  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('.chapter-nav a')].map((a) => a.getAttribute('href').slice(1))
  );
  const total = {};
  const smallAll = new Set();
  for (const id of ids) {
    await page.evaluate((hash) => { location.hash = hash; }, id);
    await page.waitForTimeout(700);
    const part = await collect();
    for (const [px, count] of Object.entries(part.sizes)) total[px] = (total[px] ?? 0) + count;
    part.small.forEach((s) => smallAll.add(s));
  }
  const data = await page.evaluate(async () => {
    const nav = [...document.querySelectorAll('.chapter-nav a')].map((a) => {
      const r = a.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    });
    const h1 = document.querySelector('.hero-title');
    const fps = await new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      const tick = () => {
        frames += 1;
        if (performance.now() - start < 2000) requestAnimationFrame(tick);
        else resolve(Math.round(frames / 2));
      };
      requestAnimationFrame(tick);
    });
    return {
      navMin: nav.length ? nav.reduce((m, [w, h]) => Math.min(m, w, h), 999) : 0,
      h1px: parseFloat(getComputedStyle(h1).fontSize),
      h1over: h1.scrollWidth > h1.clientWidth + 2,
      hscroll: document.documentElement.scrollWidth > innerWidth,
      fps,
    };
  });
  console.log(`--- ${vp.name} ---`);
  console.log('FPS:', data.fps, '| HSCROLL:', data.hscroll, '| NAV MIN SIDE:', data.navMin);
  console.log('H1:', `${data.h1px}px`, 'overflow:', data.h1over);
  console.log(
    'SIZES (все главы):',
    Object.entries(total).sort((a, b) => +a[0] - +b[0]).map(([s, c]) => `${s}px×${c}`).join(' ')
  );
  console.log('BELOW 12px:', smallAll.size ? [...smallAll].join(', ') : 'none');
  await page.close();
}
await browser.close();
