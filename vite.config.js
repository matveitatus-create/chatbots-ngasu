import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// Локальная нейро-озвучка произвольного текста через Edge TTS (Python .venv).
// Работает в `vite dev` и `vite preview`. На статическом хостинге эндпоинта
// не будет — клиент автоматически уходит на запасной системный синтезатор.

const PY = path.resolve('.venv/Scripts/python.exe');
const CACHE = path.resolve('.tts-cache');

const VOICES = {
  bot: { voice: 'ru-RU-SvetlanaNeural', rate: '+0%', pitch: '+0Hz' },
  toxis: { voice: 'ru-RU-DmitryNeural', rate: '-12%', pitch: '-8Hz' },
  swag: { voice: 'ru-RU-DmitryNeural', rate: '+15%', pitch: '+4Hz' },
  dora: { voice: 'ru-RU-SvetlanaNeural', rate: '-2%', pitch: '+4Hz' },
};

// Характеры персонажей для ИИ (пародийные пресеты)
const CONTEXT = ' Контекст: это демо к реферату «Чат-боты: как их программируют и где они используются» (НГАСУ). Темы: три поколения ботов (rule-based, NLP, LLM), стек Python/aiogram/LangChain, RAG с ChromaDB, применение в архитектуре — BIM-модели, нормоконтроль по СП/ГОСТ, стройплощадка, конфигуратор ТЗ.';
const PROMPTS = {
  bot: 'Ты — дружелюбный демо-бот на сайте о чат-ботах. Отвечай по-русски, кратко: одно-два предложения, без списков и форматирования.' + CONTEXT,
  toxis: 'Ты — рэпер Toxi$: ленивый, спокойный, растягиваешь слова. Сленг: йо, бро, свэг, короче, ну-у. Отвечай по-русски, кратко, одно-два предложения в своём стиле, по сути вопроса.' + CONTEXT,
  swag: 'Ты — рэпер SALUKI: энергичный трэп-стиль, короткие рубленые фразы, ад-либы: уо!, скр-скр!, свэг! Отвечай по-русски, кратко, одно-два предложения в своём стиле, по сути вопроса.' + CONTEXT,
  dora: 'Ты — певица Дора: милая, чуть капризная, мечтательная. Уменьшительные словечки, мм, вот, хи-хи. Отвечай по-русски, кратко, одно-два предложения в своём стиле, по сути вопроса.' + CONTEXT,
};

// Серверный прокси к бесплатной ИИ-модели (из браузера Pollinations требует Turnstile).
async function askHandler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const q = (url.searchParams.get('q') || '').slice(0, 300).trim();
  const persona = PROMPTS[url.searchParams.get('persona')] ?? PROMPTS.bot;
  if (!q) {
    res.statusCode = 400;
    res.end('no q');
    return;
  }
  try {
    // Бесплатный тир Pollinations ограничен по частоте — до трёх попыток с паузой
    let lastStatus = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const apiUrl = `https://text.pollinations.ai/${encodeURIComponent(q)}?model=openai&system=${encodeURIComponent(persona)}`;
      const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(40000) });
      lastStatus = apiRes.status;
      if (apiRes.ok) {
        const text = (await apiRes.text()).trim().replace(/\s+/g, ' ').slice(0, 500);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('X-Chatbots-Api', '1');
        res.end(text || 'пусто');
        return;
      }
      if (lastStatus !== 402 && lastStatus !== 429) throw new Error(`pollinations ${lastStatus}`);
      await new Promise((r) => setTimeout(r, 6000));
    }
    throw new Error(`pollinations ${lastStatus} after retries`);
  } catch (err) {
    console.error('[ask]', err.message);
    res.statusCode = 502;
    res.end('ai failed');
  }
}

function ttsHandler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const text = (url.searchParams.get('text') || '').slice(0, 500).trim();
  const persona = VOICES[url.searchParams.get('persona')] ?? VOICES.bot;
  if (!text) {
    res.statusCode = 400;
    res.end('no text');
    return;
  }

  const key = createHash('md5').update(`${persona.voice}|${persona.rate}|${persona.pitch}|${text}`).digest('hex');
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${key}.mp3`);

  const send = () => {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(file).pipe(res);
  };

  if (fs.existsSync(file) && fs.statSync(file).size > 1000) {
    send();
    return;
  }

  // ВАЖНО: stdout обязательно 'ignore' — с пайпом/наследованием stdout
  // edge-tts (asyncio на Windows) получает NoAudioReceived от сервиса.
  const run = (attempt) => {
    const proc = spawn(PY, [
      '-m', 'edge_tts',
      '--voice', persona.voice,
      `--rate=${persona.rate}`,
      `--pitch=${persona.pitch}`,
      '--text', text,
      '--write-media', file,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (chunk) => { stderr += chunk; });
    proc.on('error', (err) => console.error('[tts] spawn error:', err.message));
    const killer = setTimeout(() => proc.kill(), 30000);
    proc.on('close', (code) => {
      clearTimeout(killer);
      if (code === 0 && fs.existsSync(file) && fs.statSync(file).size > 1000) {
        send();
      } else if (attempt < 2) {
        setTimeout(() => run(attempt + 1), 1200);
      } else {
        console.error(`[tts] failed code=${code}:`, stderr.slice(0, 400));
        fs.rmSync(file, { force: true });
        res.statusCode = 502;
        res.end('tts failed');
      }
    });
  };
  run(1);
}

const ttsPlugin = {
  name: 'edge-tts-api',
  configureServer(server) {
    server.middlewares.use('/api/tts', ttsHandler);
    server.middlewares.use('/api/ask', askHandler);
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api/tts', ttsHandler);
    server.middlewares.use('/api/ask', askHandler);
  },
};

export default defineConfig({
  base: './',
  plugins: [ttsPlugin],
});
