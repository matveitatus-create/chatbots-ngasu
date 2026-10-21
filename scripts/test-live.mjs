// Живой тест задеплоенного сайта: структура, модалки, свободный вопрос к ИИ.
import { chromium } from 'playwright-core';

const SITE = process.argv[2] || 'https://matveitatus-create.github.io/sait-with-bot/';

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

page.on('response', (res) => {
  const u = res.url();
  if (/pollinations|allorigins|codetabs|\/api\/ask/.test(u)) console.log('NET:', res.status(), u.slice(0, 110));
});
page.on('requestfailed', (req) => {
  const u = req.url();
  if (/pollinations|allorigins|codetabs/.test(u)) console.log('NET FAIL:', u.slice(0, 110), req.failure()?.errorText);
});

await page.goto(SITE + '#demo', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

console.log('CHAPTERS:', await page.evaluate(() => document.querySelectorAll('.chapter').length));
console.log('HAS MODAL:', await page.evaluate(() => !!document.querySelector('#doc-modal')));
console.log('HAS TITLE-CARD:', await page.evaluate(() => document.body.textContent.includes('Тазова Полина Александровна')));
console.log('HAS SLIDE9 TEXT:', await page.evaluate(() => document.body.textContent.includes('интеллектуальная прослойка между человеком')));

// Модалка на живом сайте
await page.goto(SITE + '#tasks', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1200);
await page.click('[data-doc="gen1"]').catch(() => {});
await page.click('[data-doc="object"]');
await page.waitForTimeout(400);
console.log('MODAL VISIBLE:', await page.isVisible('.doc-modal-window'));
console.log('MODAL TITLE:', await page.textContent('#doc-modal-title'));
await page.keyboard.press('Escape');

// Свободный вопрос через всю цепочку
await page.goto(SITE + '#demo', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
await page.fill('#chat-input', 'Зачем боту RAG?');
const before = await page.evaluate(() => document.querySelectorAll('#chat-log .msg').length);
await page.press('#chat-input', 'Enter');
await page.waitForFunction(
  (min) => {
    const msgs = [...document.querySelectorAll('#chat-log .msg')];
    const last = msgs[msgs.length - 1];
    return msgs.length > min && !!last && !last.classList.contains('typing') && last.textContent.trim().length > 0;
  },
  before,
  { timeout: 170000, polling: 500 }
);
const msgs = await page.evaluate(() =>
  [...document.querySelectorAll('#chat-log .msg')].slice(-2).map((m) => m.textContent.slice(0, 140))
);
console.log('LIVE ANSWER:', JSON.stringify(msgs, null, 1));
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
