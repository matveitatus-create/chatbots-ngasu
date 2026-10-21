// Тест свободных вопросов: ввод → ИИ (Pollinations) → ответ в характере персонажа
// → озвучка через локальный /api/tts (Edge TTS).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const ttsCalls = [];
page.on('request', (req) => {
  const u = new URL(req.url());
  if (u.pathname === '/api/tts') ttsCalls.push(`${u.searchParams.get('persona')}: ${decodeURIComponent(u.searchParams.get('text') || '').slice(0, 50)}`);
});

await page.goto('http://localhost:4174/#demo', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#sound-toggle');

// Свободный вопрос (персонаж: Бот)
await page.fill('#chat-input', 'Что такое чат-бот?');
const beforeFirst = await page.evaluate(() => document.querySelectorAll('#chat-log .msg').length);
await page.press('#chat-input', 'Enter');
await page.waitForTimeout(1200);
console.log('TYPING SHOWN:', await page.evaluate(() => !!document.querySelector('.msg.typing')));

// Ждём ответ ИИ (бесплатный тир Pollinations может тормозить — до 150 с)
await page.waitForFunction(
  (min) => {
    const msgs = [...document.querySelectorAll('#chat-log .msg')];
    const last = msgs[msgs.length - 1];
    return msgs.length > min && !!last && !last.classList.contains('typing') && last.textContent.trim().length > 0;
  },
  beforeFirst,
  { timeout: 150000, polling: 500 }
);
let msgs = await page.evaluate(() => [...document.querySelectorAll('#chat-log .msg')].map((m) => `${m.className.replace('msg ', '')}: ${m.textContent.slice(0, 90)}`));
console.log('LOG AFTER AI (bot):', JSON.stringify(msgs, null, 1));

// Переключаем персонажа → Toxi$, задаём вопрос снова
await page.click('#voice-toggle');
await page.fill('#chat-input', 'Как дела?');
const beforeSecond = await page.evaluate(() => document.querySelectorAll('#chat-log .msg').length);
await page.press('#chat-input', 'Enter');
await page.waitForFunction(
  (min) => {
    const msgs = [...document.querySelectorAll('#chat-log .msg')];
    const last = msgs[msgs.length - 1];
    return msgs.length > min && !!last && !last.classList.contains('typing') && last.textContent.trim().length > 0;
  },
  beforeSecond,
  { timeout: 150000, polling: 500 }
);
msgs = await page.evaluate(() => [...document.querySelectorAll('#chat-log .msg')].slice(-2).map((m) => `${m.className.replace('msg ', '')}: ${m.textContent.slice(0, 90)}`));
console.log('LOG AFTER AI (toxis):', JSON.stringify(msgs, null, 1));
console.log('CHAT NAME:', await page.textContent('.chat-name'));

// ждём озвучку
await page.waitForTimeout(6000);
console.log('TTS API CALLS:', JSON.stringify(ttsCalls, null, 1));
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
