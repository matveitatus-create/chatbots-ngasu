// Проверка: свободный вопрос → ответ ИИ → голос реально ИГРАЕТ (не только запрос).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:4174/#demo', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#sound-toggle'); // звук вкл
console.log('SOUND:', await page.textContent('#sound-toggle'));

// Свободный вопрос
await page.fill('#chat-input', 'Расскажи шутку');
const before = await page.evaluate(() => document.querySelectorAll('#chat-log .msg').length);
await page.press('#chat-input', 'Enter');
await page.waitForFunction(
  (min) => {
    const msgs = [...document.querySelectorAll('#chat-log .msg')];
    const last = msgs[msgs.length - 1];
    return msgs.length > min && !!last && !last.classList.contains('typing') && last.textContent.trim().length > 0;
  },
  before,
  { timeout: 60000, polling: 500 }
);
console.log('ANSWER:', await page.evaluate(() => document.querySelector('#chat-log .msg.bot:last-child').textContent.slice(0, 100)));

// Ждём начала воспроизведения (индикатор «говорит»)
let speakingSeen = false;
for (let i = 0; i < 30; i++) {
  const cls = await page.evaluate(() => document.querySelector('.chat-head').className);
  if (cls.includes('speaking')) { speakingSeen = true; break; }
  await page.waitForTimeout(1000);
}
console.log('SPEAKING INDICATOR SEEN:', speakingSeen);

// Ответ от /api/tts дошёл целиком?
const tts = await page.evaluate(() =>
  performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/tts')).map((e) => `${e.responseStatus} ${e.transferSize}B`)
);
console.log('TTS RESOURCES:', JSON.stringify(tts));
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
