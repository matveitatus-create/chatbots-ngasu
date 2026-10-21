// Звуковой интерфейс демо-чата на Web Audio API.
// Короткие блипы: отправка, ответ, тик «печати». Звук выключен по умолчанию.

export class SoundKit {
  constructor() {
    this.enabled = false;
    this.context = null;
    this.master = null;
  }

  _ensure() {
    if (!this.context) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio is unavailable in this browser.');
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') this.context.resume();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this._ensure();
    return this.enabled;
  }

  /** Один короткий блип с экспоненциальным затуханием. */
  blip(frequency = 600, duration = 0.07, type = 'sine', level = 0.4) {
    if (!this.enabled) return;
    try {
      this._ensure();
      const ctx = this.context;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch { /* звук недоступен — молчим */ }
  }

  send() { this.blip(740, 0.06, 'sine', 0.4); }

  receive() {
    this.blip(520, 0.07, 'sine', 0.35);
    setTimeout(() => this.blip(660, 0.06, 'sine', 0.28), 75);
  }

  tick() { this.blip(1150, 0.02, 'square', 0.07); }

  ping() {
    this.blip(440, 0.09, 'sine', 0.35);
    setTimeout(() => this.blip(880, 0.12, 'sine', 0.3), 90);
  }
}
