// Демо-чат: чипы с готовыми ответами + свободные вопросы через ИИ.
// ИИ отвечает в характере выбранного персонажа (системный промпт).

const ANSWERS = {
  rag: 'RAG — ответы с опорой на базу знаний: регламенты векторизуются в ChromaDB или FAISS, бот ищет релевантные фрагменты и отвечает со ссылкой на пункт СП.',
  bim: 'Через API цифрового двойника. Пишешь «выгрузи кубатуру бетона по фундаменту блока А» — бот запускает Python-скрипт и возвращает точную цифру.',
  kinds: 'Три поколения: rule-based на жёстких if-else, NLP с интентами и сущностями, и LLM-агенты на больших языковых моделях.',
  why: 'Бот — текстовый интерфейс к сложному софту: BIM-модель, нормативка и задачи на стройке — простым человеческим языком.',
};

const WELCOME = 'Привет! Я демо-бот. Спроси про RAG, BIM или поколения ботов — или напиши свой вопрос.';

// Основной путь — локальный серверный прокси /api/ask (vite dev/preview).
// На статическом хостинге (GitHub Pages) его нет, поэтому запасной путь —
// публичные CORS-прокси к Pollinations: прокси делает запрос со своего
// сервера, без браузерного Origin и антибот-токена Turnstile.
const ASK_URL = './api/ask';
const OFFLINE_ANSWER = 'Связь с ИИ сейчас барахлит... Попробуй ещё раз — или ткни в готовый вопрос ниже.';

// Те же характеры персонажей, что и в vite.config.js (для прямого запроса).
const CONTEXT =
  ' Контекст: это демо к реферату «Чат-боты: как их программируют и где они используются» (НГАСУ). Темы: три поколения ботов (rule-based, NLP, LLM), стек Python/aiogram/LangChain, RAG с ChromaDB, применение в архитектуре — BIM-модели, нормоконтроль по СП/ГОСТ, стройплощадка, конфигуратор ТЗ.';
const PROMPTS = {
  bot: 'Ты — дружелюбный демо-бот на сайте о чат-ботах. Отвечай по-русски, кратко: одно-два предложения, без списков и форматирования.' + CONTEXT,
  toxis: 'Ты — рэпер Toxi$: ленивый, спокойный, растягиваешь слова. Сленг: йо, бро, свэг, короче, ну-у. Отвечай по-русски, кратко, одно-два предложения в своём стиле, по сути вопроса.' + CONTEXT,
  swag: 'Ты — рэпер SALUKI: энергичный трэп-стиль, короткие рубленые фразы, ад-либы: уо!, скр-скр!, свэг! Отвечай по-русски, кратко, одно-два предложения в своём стиле, по сути вопроса.' + CONTEXT,
  dora: 'Ты — певица Дора: милая, чуть капризная, мечтательная. Уменьшительные словечки, мм, вот, хи-хи. Отвечай по-русски, кратко, одно-два предложения в своём стиле, по сути вопроса.' + CONTEXT,
};

const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

/** GET с таймаутом; возвращает чистый текст ответа или null. */
async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const text = (await response.text()).trim().replace(/\s+/g, ' ').slice(0, 500);
    if (!text || text.startsWith('<')) return null; // HTML = страница ошибки прокси
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Превращает «пустой» результат в отказ, чтобы Promise.any ждал следующий ответ. */
const want = (promise) =>
  promise.then((text) => {
    if (!text) throw new Error('empty');
    return text;
  });

/** Стриминг Pollinations (POST /openai): отдаёт текст в onToken по мере генерации,
    чтобы ответ начинал печататься через пару секунд, а не ждал целиком. */
async function askStream(system, question, onToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        private: true,
        referrer: location.hostname,
        stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: question.slice(0, 300) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const raw = line.trim();
        if (!raw.startsWith('data:')) continue;
        const data = raw.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onToken(full.replace(/\s+/g, ' ').slice(0, 500));
          }
        } catch { /* обрывок JSON — дожидёмся следующий чанк */ }
      }
    }
    full = full.trim().replace(/\s+/g, ' ').slice(0, 500);
    return full || null;
  } catch { return null; } finally { clearTimeout(timer); }
}

/** Свободный вопрос → ИИ: локальный /api/ask и стриминг параллельно,
    затем прямой запрос и CORS-прокси, пауза и финальная попытка. */
async function askModel(question, personaId, onToken = () => {}) {
  // Повторный вопрос отдаём из кэша мгновенно
  const cacheKey = `chatbots-answer:${personaId}:${question.trim().toLowerCase()}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch { /* хранилище недоступно — работаем без кэша */ }

  const system = PROMPTS[personaId] ?? PROMPTS.bot;
  const target = `https://text.pollinations.ai/${encodeURIComponent(
    question.slice(0, 300)
  )}?model=openai&system=${encodeURIComponent(system)}&referrer=${encodeURIComponent(
    location.hostname
  )}`;

  // 1+2) Локальный серверный прокси и прямой запрос из браузера — гонка:
  // на статике /api/ask отпадает сразу (404), локально обычно выигрывает он.
  const local = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 75000);
      const response = await fetch(
        `${ASK_URL}?persona=${personaId}&q=${encodeURIComponent(question)}`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      // На статическом хостинге /api/ask нет — придёт HTML без спец-заголовка
      if (response.ok && response.headers.get('X-Chatbots-Api')) {
        const text = (await response.text()).trim();
        if (text) return text;
      }
    } catch { /* офлайн или статика — прямой запрос решит */ }
    return null;
  })();

  const answer =
    (await Promise.any([
      want(local),
      want(askStream(system, question, onToken)),
    ]).catch(() => null)) ??
    // 3) Напрямую из браузера и публичные CORS-прокси — все сразу
    (await Promise.any([
      want(fetchText(target, 15000)),
      ...PROXIES.map((make) => want(fetchText(make(target), 20000))),
    ]).catch(() => null)) ??
    // 4) Бесплатный тир лимитирует по частоте — короткая пауза и финальная гонка
    ((await sleep(3000)),
    (await Promise.any([
      want(fetchText(target, 15000)),
      want(fetchText(PROXIES[0](target), 20000)),
    ]).catch(() => null)));

  if (answer) {
    try { sessionStorage.setItem(cacheKey, answer); } catch { /* без кэша */ }
  }
  return answer;
}

export function createChat({ log, chips, form, input, onEvent, getPersona }) {
  let busy = false;
  let greeted = false;

  function scrollToEnd() {
    log.scrollTop = log.scrollHeight;
  }

  function addMessage(text, who) {
    const el = document.createElement('div');
    el.className = `msg ${who}`;
    el.textContent = text;
    log.append(el);
    scrollToEnd();
    return el;
  }

  function addTyping() {
    const el = document.createElement('div');
    el.className = 'msg bot typing';
    el.innerHTML = '<i></i><i></i><i></i>';
    log.append(el);
    scrollToEnd();
    return el;
  }

  function setControlsEnabled(enabled) {
    chips.querySelectorAll('button').forEach((b) => { b.disabled = !enabled; });
    input.disabled = !enabled;
    form.querySelector('button').disabled = !enabled;
  }

  function ask(questionKey) {
    if (busy) return;
    const button = chips.querySelector(`[data-q="${questionKey}"]`);
    if (!button) return;
    busy = true;
    setControlsEnabled(false);

    addMessage(button.textContent, 'user');
    onEvent('send');

    const typing = addTyping();
    const typingTicks = setInterval(() => onEvent('tick'), 320);

    // Бот «печатает» — задержка зависит от длины ответа
    const answer = ANSWERS[questionKey];
    const delay = Math.min(700 + answer.length * 12, 2200);
    setTimeout(() => {
      clearInterval(typingTicks);
      typing.remove();
      addMessage(answer, 'bot');
      onEvent('receive', questionKey);
      busy = false;
      setControlsEnabled(true);
    }, delay);
  }

  /** Свободный вопрос → ИИ-модель в характере персонажа. */
  async function askAI(question) {
    if (busy) return;
    busy = true;
    setControlsEnabled(false);

    addMessage(question, 'user');
    onEvent('send');

    const typing = addTyping();
    const typingTicks = setInterval(() => onEvent('tick'), 320);

    const persona = getPersona();
    let live = null;
    const answer =
      (await askModel(question, persona.id, (text) => {
        // Стриминг: заменяем «печатает» на живое сообщение с первыми токенами
        if (!live) {
          clearInterval(typingTicks);
          typing.remove();
          live = addMessage('', 'bot');
        }
        live.textContent = text;
        scrollToEnd();
      })) ?? OFFLINE_ANSWER;

    clearInterval(typingTicks);
    typing.remove();
    if (live) live.textContent = answer;
    else addMessage(answer, 'bot');
    onEvent('receive-text', answer);
    busy = false;
    setControlsEnabled(true);
    input.focus();
  }

  chips.addEventListener('click', (event) => {
    const button = event.target.closest('[data-q]');
    if (button) ask(button.dataset.q);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    askAI(question);
  });

  return {
    greet() {
      if (greeted) return;
      greeted = true;
      const typing = addTyping();
      setTimeout(() => {
        typing.remove();
        addMessage(WELCOME, 'bot');
        onEvent('receive', 'welcome');
      }, 900);
    },
  };
}
