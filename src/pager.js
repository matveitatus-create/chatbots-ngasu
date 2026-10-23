// Постраничная навигация: колесо мыши, клавиатура, свайпы, якорные ссылки.
// Главы фиксированы на весь экран, переключаются жестом — как сцены.

import { clamp } from './poses.js';

/** Накопитель прокрутки колеса: ждет решительного жеста, игнорирует дрожь. */
class WheelAccumulator {
  constructor() {
    this.sum = 0;
    this.last = -Infinity;
    this.lockedUntil = 0;
    this.consumed = false;
  }

  consume(now) {
    this.last = now;
    this.sum = 0;
    this.consumed = true;
  }

  step(delta, now) {
    const gap = now - this.last > 180;
    this.last = now;
    if (gap) {
      this.sum = 0;
      this.consumed = false;
    }
    if (now < this.lockedUntil || this.consumed || !Number.isFinite(delta)) return 0;
    if (Math.sign(delta) !== Math.sign(this.sum)) this.sum = 0;
    this.sum += delta;
    if (Math.abs(this.sum) < 18) return 0;
    this.consumed = true;
    this.lockedUntil = now + 850;
    return Math.sign(this.sum);
  }
}

/** Определитель вертикального свайпа. */
class SwipeDetector {
  start(x, y) {
    this.x = x;
    this.y = y;
    this.done = false;
  }

  move(x, y) {
    if (this.done || this.x === undefined) return 0;
    const dx = x - this.x;
    const dy = this.y - y; // палец вверх = листаем вперёд
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      this.done = true; // горизонтальный жест — не наше
      return 0;
    }
    if (Math.abs(dy) < 28 || Math.abs(dy) < Math.abs(dx) * 1.2) return 0;
    this.done = true;
    return Math.sign(dy);
  }
}

/** Может ли элемент (или предок) прокрутиться сам в этом направлении? */
function canScrollNatively(target, delta) {
  for (let el = target; el instanceof HTMLElement && el !== document.body; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
      if (delta > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 2) return true;
      if (delta < 0 && el.scrollTop > 2) return true;
    }
  }
  return false;
}

export function createPager(chapters, onChange) {
  let index = -1;
  let touch = null;
  let suppressClickUntil = 0;
  const wheel = new WheelAccumulator();
  const swipe = new SwipeDetector();

  function go(next, { history = true, focus = false } = {}) {
    next = clamp(next, 0, chapters.length - 1);
    if (next === index) return;
    index = next;
    chapters[index].scrollTop = 0;
    chapters.forEach((chapter, i) => {
      chapter.inert = i !== index;
      chapter.classList.toggle('is-active', i === index);
      chapter.setAttribute('aria-hidden', String(i !== index));
    });
    if (history) window.history.pushState(null, '', `#${chapters[index].id}`);
    onChange(index);
    if (focus || chapters.some((ch, i) => i !== index && ch.contains(document.activeElement))) {
      chapters[index].setAttribute('tabindex', '-1');
      chapters[index].focus({ preventScroll: true });
    }
  }

  function goFromHash() {
    const found = chapters.findIndex((ch) => `#${ch.id}` === location.hash);
    go(found < 0 ? 0 : found, { history: false });
  }

  document.documentElement.classList.add('paged');

  // Глушим клики, прилетевшие сразу после свайпа
  document.addEventListener('click', (event) => {
    if (performance.now() < suppressClickUntil && event.detail !== 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  // Якорные ссылки ведут на главы
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const found = chapters.findIndex((ch) => `#${ch.id}` === link.getAttribute('href'));
    if (found < 0) return;
    event.preventDefault();
    go(found, { focus: true });
  });

  addEventListener('wheel', (event) => {
    if (document.body.classList.contains('modal-open')) return; // модалка: не листаем главы
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    if (canScrollNatively(event.target, delta)) {
      wheel.consume(performance.now());
      return;
    }
    event.preventDefault();
    const dir = wheel.step(delta, performance.now());
    if (dir) go(index + dir);
  }, { passive: false });

  document.addEventListener('keydown', (event) => {
    if (document.body.classList.contains('modal-open')) return; // модалка: Esc обрабатывает main.js
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('input,textarea,select,button,[contenteditable=true],[data-doc]')) return;
    const dir = ['ArrowDown', 'PageDown', ' '].includes(event.key)
      ? (event.shiftKey ? -1 : 1)
      : ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : 0;
    if (dir && canScrollNatively(event.target, dir)) return;
    if (dir || ['Home', 'End'].includes(event.key)) {
      event.preventDefault();
      go(
        event.key === 'Home' ? 0 : event.key === 'End' ? chapters.length - 1 : index + dir,
        { focus: true }
      );
    }
  });

  document.addEventListener('touchstart', (event) => {
    if (document.body.classList.contains('modal-open')) { touch = null; return; }
    if (event.touches.length !== 1 || event.target.closest('input,textarea,select,[contenteditable=true]')) {
      touch = null;
      return;
    }
    const t = event.touches[0];
    const onControls = event.target.closest('.console,.detail-control,.surface-controls');
    touch = {
      x: t.clientX,
      y: t.clientY,
      paged: false,
      native: !!onControls && (canScrollNatively(event.target, 1) || canScrollNatively(event.target, -1)),
    };
    swipe.start(t.clientX, t.clientY);
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (!touch || event.touches.length !== 1) { touch = null; return; }
    if (touch.native) return;
    const t = event.touches[0];
    if (!touch.paged && Math.abs(t.clientX - touch.x) > Math.abs(t.clientY - touch.y) * 1.2) {
      swipe.move(t.clientX, t.clientY);
      return;
    }
    if (event.cancelable) event.preventDefault();
    const dir = swipe.move(t.clientX, t.clientY);
    if (dir) {
      touch.paged = true;
      suppressClickUntil = performance.now() + 450;
      go(index + dir);
    }
  }, { passive: false });

  document.addEventListener('touchend', (event) => {
    if (!touch || !event.changedTouches.length) return;
    const t = event.changedTouches[0];
    const dir = touch.native ? 0 : swipe.move(t.clientX, t.clientY);
    if (dir) {
      suppressClickUntil = performance.now() + 450;
      go(index + dir);
    }
    if (touch.paged) suppressClickUntil = performance.now() + 450;
    touch = null;
  }, { passive: true });

  document.addEventListener('touchcancel', () => { touch = null; }, { passive: true });

  addEventListener('hashchange', goFromHash);
  addEventListener('popstate', goFromHash);
  goFromHash();

  return {
    go,
    get index() { return index; },
  };
}
