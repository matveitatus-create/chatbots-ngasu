// Демо-чат: чипы с готовыми ответами + свободные вопросы через ИИ.
// ИИ отвечает в характере выбранного персонажа (системный промпт).

const ANSWERS = {
  rag: 'RAG — ответы с опорой на базу знаний: регламенты векторизуются в ChromaDB или FAISS, бот ищет релевантные фрагменты и отвечает со ссылкой на пункт СП.',
  bim: 'Через API цифрового двойника. Пишешь «выгрузи кубатуру бетона по фундаменту блока А» — бот запускает Python-скрипт и возвращает точную цифру.',
  kinds: 'Три поколения: rule-based на жёстких if-else, NLP с интентами и сущностями, и LLM-агенты на больших языковых моделях.',
  why: 'Бот — текстовый интерфейс к сложному софту: BIM-модель, нормативка и задачи на стройке — простым человеческим языком.',
};

const WELCOME = 'Привет! Я демо-бот. Спроси про RAG, BIM или поколения ботов — или напиши свой вопрос.';

// Характеры персонажей и сам ИИ-запрос живут в vite.config.js (/api/ask) —
// из браузера Pollinations требует антибот-токен, поэтому просим через сервер.
const ASK_URL = './api/ask';
const OFFLINE_ANSWER = 'Связь с ИИ сейчас барахлит... Попробуй ещё раз — или ткни в готовый вопрос ниже.';

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
    const url = `${ASK_URL}?persona=${persona.id}&q=${encodeURIComponent(question)}`;

    let answer = OFFLINE_ANSWER;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      // На статическом хостинге /api/ask нет — придёт HTML вместо текста
      if (response.ok && response.headers.get('X-Chatbots-Api')) {
        const text = (await response.text()).trim();
        if (text) answer = text;
      }
    } catch { /* офлайн или таймаут — ответ-заглушка */ }

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
