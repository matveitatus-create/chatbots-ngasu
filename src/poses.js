// Математика и ключевые кадры позы 3D-робота для каждой главы.

export const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export const clamp01 = (value) => clamp(value, 0, 1);

export const lerp = (a, b, t) => a + (b - a) * t;

export const smoothstep = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};

// [x, y, scale, rotX, rotY, rotZ, explode] для глав 00–06 (десктоп)
const POSES_DESKTOP = [
  [0, -0.12, 0.98, -0.1, -0.55, -0.12, 0],      // 00 интро
  [1.8, 0.02, 0.82, 0.02, -1.0, -0.08, 0],      // 01 зачем нужны
  [1.55, -0.05, 0.88, 0.08, -1.25, 0.04, 1],    // 02 устройство (разборка)
  [1.7, -0.02, 0.95, -0.06, Math.PI, 0.06, 0],  // 03 пайплайн (поворот)
  [2.1, -0.25, 1.3, -0.12, -0.5, -0.18, 0],     // 04 обучение (крупно)
  [1.9, -0.45, 1.1, -0.25, 0.3, 0.12, 0],       // 05 пинг
  [1.65, 0.02, 0.85, 0.02, -0.4, 0, 0],         // 06 демо-чат
];

// То же для мобильной раскладки (объект по центру)
const POSES_MOBILE = [
  [0, 0, 0.8, -0.1, -0.4, -0.08, 0],
  [0, 0.05, 0.55, 0, -0.9, 0, 0],
  [0, 0, 0.62, 0.08, -1.2, 0, 1],
  [0, 0, 0.7, -0.05, Math.PI, 0, 0],
  [0, -0.3, 0.62, -0.1, -0.5, -0.1, 0],
  [0, -0.1, 0.75, -0.2, 0.3, 0.08, 0],
  [0, 0.1, 0.5, 0, -0.35, 0, 0],
];

const KEYS = ['x', 'y', 'scale', 'rx', 'ry', 'rz', 'explode'];

/** Интерполированная поза объекта для дробного прогресса главы. */
export function pose(progress, mobile = false) {
  const poses = mobile ? POSES_MOBILE : POSES_DESKTOP;
  const p = clamp(progress, 0, poses.length - 1);
  const i = Math.min(poses.length - 2, Math.floor(p));
  const t = smoothstep(p - i);
  const out = {};
  for (let k = 0; k < KEYS.length; k++) {
    out[KEYS[k]] = lerp(poses[i][k], poses[i + 1][k], t);
  }
  return out;
}

/** Вертикальный якорь объекта на мобильных (зависит от высоты экрана). */
export function mobileAnchor(progress, height) {
  const values = [
    height * 0.5, height * 0.6, height * 0.52, height * 0.55,
    height * 0.72, height * 0.58, 250,
  ];
  const p = clamp(progress, 0, 6);
  const i = Math.min(5, Math.floor(p));
  return lerp(values[i], values[i + 1], smoothstep(p - i));
}
