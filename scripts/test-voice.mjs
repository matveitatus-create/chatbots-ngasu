// Проверка озвучки: реплики играют из MP3-файлов, персонажи переключаются,
// индикатор «говорит» загорается, mute обрывает воспроизведение.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const played = [];
page.on('response', (res) => {
  if (res.url().includes('/voice/')) played.push(`${res.url().split('/voice/')[1]} [${res.status()}]`);
});

await page.goto('http://localhost:4174/#demo', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000); // приветствие при выкл. звуке — молчим
console.log('BEFORE SOUND ON, files:', played.length);

await page.click('#sound-toggle');
await page.click('[data-q="rag"]');
await page.waitForTimeout(2500); // ответ пришёл, озвучка играет
console.log('SPEAKING MID-PLAY:', await page.evaluate(() => document.querySelector('.chat-head').className));
await page.waitForTimeout(4000); // доиграл

await page.click('#voice-toggle'); // → Toxi$ (announce)
await page.waitForTimeout(400);
console.log('PERSONA 1:', await page.textContent('#voice-toggle'));
await page.click('[data-q="why"]');
await page.waitForTimeout(3200);

await page.click('#voice-toggle'); // → Swag
await page.click('#voice-toggle'); // → Дора
console.log('PERSONA 3:', await page.textContent('#voice-toggle'));
await page.click('[data-q="bim"]');
await page.waitForTimeout(3200);

console.log('PLAYED FILES:', JSON.stringify(played, null, 1));

await page.click('#sound-toggle'); // выкл
console.log('AFTER MUTE speaking:', await page.evaluate(() => document.querySelector('.chat-head').className));
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
