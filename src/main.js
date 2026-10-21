// CHATBOTS — точка входа: пейджер, 3D-сцена, демо-чат, UI.

import './style.css';
import { SoundKit } from './audio.js';
import { createChat } from './chat.js';
import { createPager } from './pager.js';
import { DOCS } from './docs.js';
import { VoiceBox } from './voice.js';
import { clamp01, lerp, mobileAnchor, pose } from './poses.js';

const $ = (selector) => document.querySelector(selector);

const chapters = [...document.querySelectorAll('.chapter')];
const navLinks = [...document.querySelectorAll('.chapter-nav a')];
const sounds = new SoundKit();
const voice = new VoiceBox();

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let motionOK = !reducedMotion.matches;
let scene = null;
let graphicsFailed = false;
let strikeTime = -Infinity;
let strikeAmp = 1;
let rotation = Math.PI;       // слайдер «Поворот», рад
let lightAngle = -35;         // слайдер «Направление света», градусы
let frameQueued = false;
let displayed = 0;            // сглаженный прогресс главы
let target = 0;               // целевая глава
let snapped = false;          // первый кадр — без анимации
let lastFrame = 0;
let warmupFrames = 4;
let finish = 'plastic';

const PULSE_CHAPTER = 10;
const CHAT_CHAPTER = 10;
const DARK_CHAPTERS = [3, 6, 10];

const shadowEl = $('.stage-shadow');

// Заполнение трека слайдеров
document.querySelectorAll('input[type="range"]').forEach((input) => {
  const update = () =>
    input.style.setProperty(
      '--fill',
      `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`
    );
  input.addEventListener('input', update);
  update();
});

// Оборачиваем содержимое глав в .scene-content
for (const chapter of chapters) {
  const wrapper = document.createElement('div');
  wrapper.className = 'scene-content';
  wrapper.append(...chapter.childNodes);
  chapter.append(wrapper);
  chapter.addEventListener('scroll', scheduleFrame, { passive: true });
}

/** Толчок бота: глаза, рот, антенна оживают. */
function poke(strength = 1) {
  strikeAmp = strength;
  strikeTime = performance.now();
  scheduleFrame();
}

const chat = createChat({
  log: $('#chat-log'),
  chips: $('#chat-chips'),
  form: $('#chat-form'),
  input: $('#chat-input'),
  getPersona: () => voice.persona,
  onEvent(kind, payload) {
    if (kind === 'send') { sounds.send(); poke(0.45); }
    if (kind === 'receive') { sounds.receive(); poke(0.6); voice.speak(payload); }
    if (kind === 'receive-text') { sounds.receive(); poke(0.6); voice.speakText(payload); }
    if (kind === 'tick') { sounds.tick(); }
  },
});

// Индикатор «бот говорит» в шапке чата
voice.onStateChange = (speaking) => {
  $('.chat-head').classList.toggle('speaking', speaking);
  if (speaking) scheduleFrame();
};

function scheduleFrame() {
  warmupFrames = Math.max(warmupFrames, 3);
  if (!frameQueued && !document.hidden) {
    frameQueued = true;
    requestAnimationFrame(frame);
  }
}

function frame(now) {
  frameQueued = false;
  if (document.hidden) return;

  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  displayed = motionOK ? lerp(displayed, target, 1 - Math.exp(-dt * 9)) : Math.round(target);

  const isMobile = innerWidth <= 650;
  let mobileShift = 0;
  if (isMobile) {
    mobileShift =
      (0.5 - (mobileAnchor(displayed, Math.max(760, innerHeight)) - chapters[target].scrollTop) / innerHeight) *
        6.24 -
      pose(displayed, true).y;
  }

  shadowEl.style.opacity = String(clamp01(1 - displayed * 1.4) * 0.9);

  if (!scene) {
    const fallback = $('.fallback-object');
    fallback.style.opacity = String(clamp01(1 - target * 1.4));
    fallback.style.top = '50%';
  }

  if (scene && !graphicsFailed) {
    const nearPulse = clamp01(1 - Math.abs(displayed - PULSE_CHAPTER));
    const nearChat = clamp01(1 - Math.abs(displayed - CHAT_CHAPTER));
    const windowed = Math.max(nearPulse, nearChat);
    let impulse = motionOK
      ? strikeAmp * Math.exp(-(now - strikeTime) / 480) * windowed
      : 0;
    // Пока бот говорит, рот-эквалайзер «играет» в такт речи
    if (motionOK && voice.speaking) {
      impulse = Math.max(impulse, (0.42 + 0.28 * Math.sin(now / 110)) * windowed);
    }
    try {
      scene.render(displayed, impulse, now / 1000, motionOK, mobileShift, { rotation, lightAngle });
    } catch (error) {
      failGraphics('Не удалось отобразить 3D. Демо-чат доступен отдельно.');
      console.error(error);
    }
  }

  warmupFrames--;

  if (
    (motionOK && (Math.abs(displayed - target) > 5e-4 || now - strikeTime < 2800 || voice.speaking)) ||
    warmupFrames > 0
  ) {
    frameQueued = true;
    requestAnimationFrame(frame);
  }
}

function resize() {
  scene?.resize();
  scheduleFrame();
}

function onChapterChange(index) {
  target = index;
  if (!snapped) {
    displayed = index;
    snapped = true;
  }
  navLinks.forEach((link, i) =>
    i === index ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current')
  );
  document.body.classList.toggle('dark-current', DARK_CHAPTERS.includes(index));
  if (index === CHAT_CHAPTER) chat.greet();
  scheduleFrame();
}

function applyMotionPreference() {
  document.documentElement.classList.toggle('motion-off', !motionOK);
  scheduleFrame();
}

reducedMotion.addEventListener('change', (event) => {
  motionOK = !event.matches;
  applyMotionPreference();
});

// --- Звук чата ---
$('#sound-toggle').addEventListener('click', (event) => {
  const on = sounds.toggle();
  voice.enabled = on;
  if (!on) voice.cancel();
  event.currentTarget.setAttribute('aria-pressed', String(on));
  event.currentTarget.textContent = on ? 'Звук вкл' : 'Звук выкл';
  if (on) sounds.ping();
});

// --- Голос бота: переключение персонажей (Бот / Toxi$ / Swag / Дора) ---
const voiceToggle = $('#voice-toggle');
function refreshVoiceToggle() {
  voiceToggle.hidden = !voice.supported;
  voiceToggle.textContent = voice.label;
}
voice.onVoicesReady = refreshVoiceToggle;
refreshVoiceToggle();

voiceToggle.addEventListener('click', () => {
  if (voice.cycle()) {
    voiceToggle.textContent = voice.label;
    $('.chat-name').textContent = voice.persona.id === 'bot' ? 'helper-bot' : voice.label;
    voice.speak('announce');
  }
});

// --- Материал и свет ---
document.querySelectorAll('[data-finish]').forEach((button) =>
  button.addEventListener('click', () => {
    finish = button.dataset.finish;
    scene?.setFinish(finish);
    document.querySelectorAll('[data-finish]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b === button))
    );
    $('.fallback-object').style.filter = finish === 'graphite' ? 'brightness(.55) saturate(.8)' : 'none';
    scheduleFrame();
  })
);

$('#rotation').addEventListener('input', (event) => {
  rotation = (Number(event.target.value) * Math.PI) / 180;
  $('#rotation-value').textContent = `${event.target.value}°`;
  scheduleFrame();
});

$('#light').addEventListener('input', (event) => {
  lightAngle = Number(event.target.value);
  $('#light-value').textContent = `${event.target.value}°`;
  scheduleFrame();
});

// --- Полный текст из реферата: клик по карточке/пункту открывает модалку ---
const docModal = $('#doc-modal');
if (docModal) {
  const docTitle = $('#doc-modal-title');
  const docBody = $('#doc-modal-body');
  let lastTrigger = null;

  const setModal = (open) => {
    docModal.hidden = !open;
    document.body.classList.toggle('modal-open', open);
    if (open) {
      $('.doc-modal-close')?.focus();
    } else {
      lastTrigger?.focus?.();
    }
    scheduleFrame();
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-doc]');
    if (trigger) {
      const doc = DOCS[trigger.dataset.doc];
      if (!doc) return;
      lastTrigger = trigger;
      docTitle.textContent = doc.title;
      docBody.replaceChildren(
        ...doc.paragraphs.map((text) => {
          const p = document.createElement('p');
          p.textContent = text;
          return p;
        })
      );
      setModal(true);
      return;
    }
    if (event.target.closest('[data-close]')) setModal(false);
  });

  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !docModal.hidden) setModal(false);
  });
}

addEventListener('resize', resize, { passive: true });
addEventListener('pointermove', (event) => {
  if (!motionOK || event.pointerType === 'touch') return;
  scene?.pointer((event.clientX / innerWidth) * 2 - 1, (event.clientY / innerHeight) * 2 - 1);
  scheduleFrame();
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    voice.cancel();
  } else {
    lastFrame = performance.now();
    scheduleFrame();
  }
});

// --- Отказ 3D: сайт остаётся рабочим ---
function failGraphics(message) {
  graphicsFailed = true;
  document
    .querySelectorAll('.detail-control input, .surface-controls input, .surface-controls button')
    .forEach((el) => { el.disabled = true; });
  document.body.classList.add('graphics-fallback');
  try { scene?.dispose(); } catch { /* уже мёртв */ }
  scene = null;
  document.body.classList.remove('webgl-ready');
  $('#scene-status').textContent = message;
  $('#scene').style.display = 'none';
  resize();
}

$('#scene').addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  failGraphics('3D остановлено браузером. Обнови страницу, чтобы вернуть сцену.');
});

// --- Старт ---
createPager(chapters, onChapterChange);
resize();
applyMotionPreference();
document.fonts.ready.then(resize);

import('./scene.js')
  .then(({ createScene }) => {
    scene = createScene($('#scene'));
    scene.setFinish(finish);
    document.body.classList.add('webgl-ready');
    $('#scene-status').textContent = '';
    resize();
  })
  .catch((error) => {
    failGraphics('3D недоступно. Демо-чат работает отдельно; постер есть на первом экране.');
    console.warn('CHATBOTS: 3D fallback', error.message);
  });
