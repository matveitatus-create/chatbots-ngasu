// Список доступных голосов speechSynthesis на этой машине.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('http://localhost:4174/', { waitUntil: 'domcontentloaded' });

const voices = await page.evaluate(async () => {
  const get = () => speechSynthesis.getVoices();
  let list = get();
  if (!list.length) {
    await new Promise((res) => {
      speechSynthesis.addEventListener('voiceschanged', res, { once: true });
      setTimeout(res, 2000);
    });
    list = get();
  }
  return list.map((v) => `${v.name} | ${v.lang} | local=${v.localService}`);
});
console.log('ALL VOICES:', JSON.stringify(voices, null, 1));
await browser.close();
