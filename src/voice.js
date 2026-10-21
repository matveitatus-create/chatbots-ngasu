// Озвучка бота: заранее сгенерированные нейросетевые голоса (Edge TTS, MP3).
// Голоса-персонажи: Бот / Toxi$ / Swag / Дора — пародийные пресеты
// (не реальные голоса артистов). Файлы генерит scripts/gen-voice.py.
// Если MP3 не загрузился — запасной вариант на системном speechSynthesis.

const PERSONAS = [
  { id: 'bot', label: 'Бот', pitch: 1, rate: 1.05 },
  { id: 'toxis', label: 'Toxi$', pitch: 0.88, rate: 0.9 },
  { id: 'swag', label: 'Swag', pitch: 1.06, rate: 1.15 },
  { id: 'dora', label: 'Дора', pitch: 1.15, rate: 0.97 },
];

// Тексты реплик — нужны только запасному синтезатору
const TEXTS = {
  welcome: 'Привет! Я демо-бот. Спроси про RAG, BIM или поколения ботов — или напиши свой вопрос.',
  rag: 'RAG — ответы с опорой на базу знаний: регламенты векторизуются в ChromaDB или FAISS, бот ищет релевантные фрагменты и отвечает со ссылкой на пункт СП.',
  bim: 'Через API цифрового двойника. Пишешь «выгрузи кубатуру бетона по фундаменту блока А» — бот запускает Python-скрипт и возвращает точную цифру.',
  kinds: 'Три поколения: rule-based на жёстких if-else, NLP с интентами и сущностями, и LLM-агенты на больших языковых моделях.',
  why: 'Бот — текстовый интерфейс к сложному софту: BIM-модель, нормативка и задачи на стройке — простым человеческим языком.',
};

export class VoiceBox {
  constructor() {
    this.enabled = false;
    this.speaking = false;
    this.onStateChange = null; // индикатор «говорит» в UI
    this.supported = true; // аудиофайлы доступны всегда
    this.personaIndex = 0;

    this._audio = new Audio();
    this._audio.preload = 'auto';
    this._audio.addEventListener('playing', () => this._setSpeaking(true));
    this._audio.addEventListener('ended', () => this._setSpeaking(false));
    this._audio.addEventListener('error', () => this._setSpeaking(false));

    this._ttsSupported = 'speechSynthesis' in globalThis;
  }

  get persona() {
    return PERSONAS[this.personaIndex];
  }

  /** Имя персонажа для кнопки. */
  get label() {
    return this.persona.label;
  }

  /** Следующий персонаж. Возвращает его label. */
  cycle() {
    this.personaIndex = (this.personaIndex + 1) % PERSONAS.length;
    return this.label;
  }

  _setSpeaking(value) {
    if (this.speaking === value) return;
    this.speaking = value;
    this.onStateChange?.(value);
  }

  /** Проиграть реплику: 'welcome' | 'rag' | 'bim' | 'kinds' | 'why' | 'announce'. */
  speak(key) {
    if (!this.enabled || !key) return;
    this.cancel();
    this._playUrl(`./voice/${this.persona.id}/${key}.mp3`, () => this._fallbackSpeak(key));
  }

  /** Озвучить произвольный текст (ответ ИИ) через локальный Edge TTS. */
  speakText(text) {
    if (!this.enabled || !text) return;
    this.cancel();
    const url = `./api/tts?persona=${this.persona.id}&text=${encodeURIComponent(text)}`;
    this._playUrl(url, () => this._fallbackSpeakText(text));
  }

  _playUrl(url, onError) {
    let called = false;
    const once = () => {
      if (!called) {
        called = true;
        onError();
      }
    };
    const audio = this._audio;
    audio.onerror = once;
    audio.src = url;
    audio.play()?.catch(once);
  }

  /** Запасной путь: системный синтезатор, если MP3 не нашёлся. */
  _fallbackSpeak(key) {
    const text = key === 'announce' ? `Включён голос: ${this.label}` : TEXTS[key];
    this._fallbackSpeakText(text);
  }

  /** Запасной путь для произвольного текста. */
  _fallbackSpeakText(text) {
    if (!this._ttsSupported || !this.enabled || !text) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    utterance.pitch = this.persona.pitch;
    utterance.rate = this.persona.rate;
    utterance.onstart = () => this._setSpeaking(true);
    utterance.onend = () => this._setSpeaking(false);
    utterance.onerror = () => this._setSpeaking(false);
    speechSynthesis.speak(utterance);
  }

  cancel() {
    this._audio.pause();
    this._audio.onerror = null;
    if (this._ttsSupported) speechSynthesis.cancel();
    this._setSpeaking(false);
  }
}
