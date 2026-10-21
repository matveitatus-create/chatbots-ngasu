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

/** Свободный вопрос → ИИ: локальный /api/ask → напрямую → CORS-прокси → повтор. */
async function askModel(question, personaId) {
  // 1) Локальный серверный прокси (vite dev / preview) — он сам ретраит лимиты
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
  } catch { /* офлайн или статика — идём дальше */ }

  const system = PROMPTS[personaId] ?? PROMPTS.bot;
  const target = `https://text.pollinations.ai/${encodeURIComponent(
    question.slice(0, 300)
  )}?model=openai&system=${encodeURIComponent(system)}&referrer=${encodeURIComponent(
    location.hostname
  )}`;

  // 2) Напрямую из браузера: сработает, если хост разрешён Pollinations
  const direct = await fetchText(target, 20000);
  if (direct) return direct;

  // 3) Публичные CORS-прокси (запрос идёт с их сервера, без браузерного Origin)
  for (const make of PROXIES) {
    const text = await fetchText(make(target), 22000);
    if (text) return text;
  }

  // 4) Бесплатный тир лимитирует по частоте — пауза и финальные попытки
  await sleep(8000);
  return (await fetchText(target, 20000)) ?? (await fetchText(PROXIES[0](target), 22000));
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
    const answer = (await askModel(question, persona.id)) ?? OFFLINE_ANSWER;

    clearInterval(typingTicks);
    typing.remove();
    addMessage(answer, 'bot');
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
