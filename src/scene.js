// 3D-сцена: голова робота-ассистента.
// Узлы (корпус, лицо, уши, антенна, шея) разъезжаются при «разборке».
// Глаза мигают, рот-эквалайзер и антенна реагируют на энергию (пинг, чат).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp01, lerp, pose } from './poses.js';

/** Токарная поверхность из профиля [[радиус, высота], ...], ось — Z. */
function lathe(points, material, segments = 128) {
  const geometry = new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments
  );
  geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

/** Тор с разрешением, зависящим от размера. */
function ring(radius, tube, material) {
  return new THREE.Mesh(
    new THREE.TorusGeometry(
      radius,
      tube,
      radius < 0.1 ? 6 : 8,
      radius < 0.1 ? 16 : radius < 0.7 ? 64 : 112
    ),
    material
  );
}

/** Схлопнуть все меши группы в один меш на материал (меньше draw calls). */
function flatten(group, exclude = new Set()) {
  group.updateMatrixWorld(true);
  const byMaterial = new Map();
  const originals = new Set();
  const inverse = group.matrixWorld.clone().invert();

  for (const child of [...group.children]) {
    if (exclude.has(child)) continue;
    child.traverse((node) => {
      if (!node.isMesh) return;
      const geometry = node.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(node.matrixWorld));
      if (!byMaterial.has(node.material)) byMaterial.set(node.material, []);
      byMaterial.get(node.material).push(geometry);
      originals.add(node.geometry);
    });
    group.remove(child);
  }

  for (const [material, geometries] of byMaterial) {
    group.add(new THREE.Mesh(mergeGeometries(geometries), material));
    for (const geometry of geometries) geometry.dispose();
  }
  for (const geometry of originals) geometry.dispose();
}

/** Скруглённый прямоугольник для чат-пузыря. */
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Дефолты взгляда и «жизни» для update(). */
const ZERO_GAZE = { x: 0, y: 0 };
const ZERO_LIFE = { hum: 0, wiggle: 0, focus: false };

function buildBot() {
  const root = new THREE.Group();

  // --- Материалы ---
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xe9e6de, metalness: 0.08, roughness: 0.38 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xc9c9c4, metalness: 1, roughness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x17181c, metalness: 0.6, roughness: 0.28 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x222422, roughness: 0.55, metalness: 0.3 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xa4532a, roughness: 0.32, metalness: 1 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x0a0f1e, emissive: 0x5f8bff, emissiveIntensity: 1, roughness: 0.3,
  });

  // --- Корпус: купол головы + швы + винты ---
  const shell = new THREE.Group();
  shell.add(lathe([
    [0, -0.95], [0.5, -0.92], [0.86, -0.82], [1.12, -0.62], [1.26, -0.34],
    [1.3, 0], [1.26, 0.3], [1.12, 0.55], [0.88, 0.72], [0.5, 0.8], [0, 0.82],
  ], shellMat));

  // Швы корпуса
  for (const z of [-0.42, 0.42]) {
    const seam = ring(1.272, 0.008, metalMat);
    seam.position.z = z;
    shell.add(seam);
  }
  const equator = ring(1.304, 0.01, metalMat);
  shell.add(equator);

  // Винты вокруг визора
  const screwGeo = new THREE.CylinderGeometry(0.035, 0.038, 0.02, 12);
  for (const [sx, sy] of [[0.78, 0.72], [-0.78, 0.72], [0.78, -0.62], [-0.78, -0.62]]) {
    const screw = new THREE.Mesh(screwGeo, metalMat);
    screw.position.set(sx, sy, 0.66);
    screw.rotation.x = Math.PI / 2;
    shell.add(screw);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.007, 0.004), darkMat);
    slot.position.set(sx, sy, 0.672);
    slot.rotation.z = sx * sy > 0 ? 0.5 : -0.4;
    shell.add(slot);
  }

  // --- Сервисная панель на затылке ---
  // Люк крепится НА поверхность: каждая следующая деталь чуть ближе к зрителю
  const hatchPlate = new THREE.Mesh(new THREE.CircleGeometry(0.4, 48), rubberMat);
  hatchPlate.position.z = -0.825;
  hatchPlate.rotation.y = Math.PI;
  shell.add(hatchPlate);
  const hatch = ring(0.42, 0.028, metalMat);
  hatch.position.z = -0.83;
  shell.add(hatch);
  // Вентиляционные прорези
  for (let i = 0; i < 5; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.028, 0.015), metalMat);
    vent.position.set(0, -0.14 + i * 0.07, -0.84);
    shell.add(vent);
  }
  // Статус-LED затылка
  const hatchLed = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), glowMat.clone());
  hatchLed.position.set(0, 0.3, -0.845);
  shell.add(hatchLed);
  // Болты люка
  for (const [bx, by] of [[0.24, 0.24], [-0.24, 0.24], [0.24, -0.24], [-0.24, -0.24]]) {
    const bolt = new THREE.Mesh(screwGeo, metalMat);
    bolt.position.set(bx, by, -0.84);
    bolt.rotation.x = Math.PI / 2;
    shell.add(bolt);
  }
  root.add(shell);

  // --- Лицо: визор, глаза, рот-эквалайзер ---
  const face = new THREE.Group();
  const visor = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), darkMat);
  visor.scale.set(1.0, 0.62, 0.5);
  visor.position.set(0, 0.05, 0.55);
  face.add(visor);

  const eyes = [];
  const eyeGeo = new THREE.CapsuleGeometry(0.09, 0.14, 6, 16);
  for (const x of [-0.34, 0.34]) {
    const eye = new THREE.Mesh(eyeGeo, glowMat.clone());
    eye.position.set(x, 0.13, 1.0);
    eye.userData.baseX = x;
    eye.userData.baseY = 0.13;
    face.add(eye);
    eyes.push(eye);
  }

  const mouthBars = [];
  const barGeo = new THREE.BoxGeometry(0.05, 0.14, 0.03);
  for (let i = 0; i < 7; i++) {
    const bar = new THREE.Mesh(barGeo, glowMat.clone());
    bar.position.set((i - 3) * 0.13, -0.28, 0.98);
    face.add(bar);
    mouthBars.push(bar);
  }
  root.add(face);

  // --- Уши: диски с кольцами и светящейся сердцевиной ---
  const earL = new THREE.Group();
  const earR = new THREE.Group();
  for (const [group, sign] of [[earL, -1], [earR, 1]]) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.12, 48), shellMat);
    disc.rotation.z = Math.PI / 2;
    group.add(disc);
    const trim = ring(0.24, 0.018, metalMat);
    trim.rotation.y = Math.PI / 2;
    trim.position.x = sign * 0.065;
    group.add(trim);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), glowMat.clone());
    core.position.x = sign * 0.08;
    group.add(core);
    group.userData.core = core;
    group.position.set(sign * 1.24, 0, 0);
    group.userData.baseX = sign * 1.24;
    root.add(group);
  }

  // --- Антенна: стойка, колечко, светящийся кончик ---
  const antenna = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.045, 0.5, 16), metalMat);
  stem.position.y = 1.5;
  antenna.add(stem);
  const collar = ring(0.07, 0.016, rubberMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.27;
  antenna.add(collar);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 18), glowMat.clone());
  tip.position.y = 1.78;
  antenna.add(tip);
  root.add(antenna);

  // --- Шея и постамент с микросхемами ---
  const neck = new THREE.Group();
  [0.5, 0.56, 0.62].forEach((r, i) => {
    const collarRing = ring(r, 0.028, i === 1 ? metalMat : rubberMat);
    collarRing.rotation.x = Math.PI / 2;
    collarRing.position.y = -1.34 - i * 0.09;
    neck.add(collarRing);
  });
  const base = lathe(
    [[0, -0.02], [0.85, -0.02], [0.95, 0.06], [0.98, 0.16], [0.9, 0.22], [0, 0.24]],
    shellMat
  );
  base.rotation.x = Math.PI / 2; // токарная ось обратно в вертикаль
  base.position.y = -1.62;
  neck.add(base);

  // Микросхемы на постаменте
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.4;
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.12), darkMat);
    chip.position.set(Math.cos(angle) * 0.68, -1.47, Math.sin(angle) * 0.68);
    chip.rotation.y = -angle;
    neck.add(chip);
    const pins = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.02, 0.03), copperMat);
    pins.position.copy(chip.position);
    pins.position.y += 0.005;
    pins.rotation.y = -angle;
    neck.add(pins);
  }
  // Статус-LED на постаменте
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), glowMat.clone());
  led.position.set(0, -1.5, 0.94);
  neck.add(led);
  root.add(neck);

  // --- Орбитальные кольца позади головы ---
  const halo = new THREE.Group();
  const ringA = ring(1.85, 0.012, metalMat);
  ringA.rotation.x = 0.35;
  halo.add(ringA);
  const ringB = ring(2.05, 0.007, metalMat);
  ringB.rotation.x = -0.2;
  ringB.rotation.y = 0.3;
  halo.add(ringB);
  halo.position.z = -0.35;
  root.add(halo);

  // --- Летающие чат-пузыри ---
  const bubbles = new THREE.Group();
  const bubbleShape = roundedRectShape(0.46, 0.3, 0.09);
  const bubbleGeo = new THREE.ExtrudeGeometry(bubbleShape, { depth: 0.07, bevelEnabled: false });
  bubbleGeo.center();
  const dotGeo = new THREE.SphereGeometry(0.032, 12, 10);
  const bubbleList = [];
  for (let i = 0; i < 3; i++) {
    const bubble = new THREE.Group();
    const body = new THREE.Mesh(bubbleGeo, shellMat);
    bubble.add(body);
    for (let d = 0; d < 3; d++) {
      const dot = new THREE.Mesh(dotGeo, glowMat.clone());
      dot.position.set((d - 1) * 0.11, 0.01, 0.045);
      bubble.add(dot);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 4), shellMat);
    tail.position.set(-0.13, -0.18, 0);
    tail.rotation.z = 0.5;
    bubble.add(tail);

    const angle = i * 2.1 + 0.5;
    bubble.userData = { angle, radius: 2.0, baseY: 0.55 - i * 0.45, phase: i * 2.1 };
    bubbles.add(bubble);
    bubbleList.push(bubble);
  }
  root.add(bubbles);

  // Схлопываем статичные узлы (анимированные детали не трогаем)
  flatten(shell);
  flatten(earL, new Set([earL.userData.core]));
  flatten(earR, new Set([earR.userData.core]));
  flatten(antenna, new Set([tip]));
  flatten(neck, new Set([led]));

  return {
    root,

    setFinish(finish) {
      shellMat.color.set(finish === 'graphite' ? 0x3a3d42 : 0xe9e6de);
      shellMat.roughness = finish === 'graphite' ? 0.55 : 0.38;
      shellMat.metalness = finish === 'graphite' ? 0.5 : 0.08;
    },

    update(explode, energy, time, motion, gaze = ZERO_GAZE, life = ZERO_LIFE) {
      // Разборка по осям
      face.position.z = explode * 1.0;
      earL.position.x = earL.userData.baseX - explode * 0.55 - life.wiggle * Math.sin(time * 26) * 0.05;
      earR.position.x = earR.userData.baseX + explode * 0.55 + life.wiggle * Math.sin(time * 26) * 0.05;
      antenna.position.y = explode * 0.6;
      neck.position.y = -explode * 0.5;
      halo.position.z = -0.35 - explode * 0.4;
      halo.rotation.z = time * 0.1;

      // Взгляд: глаза, лицо и антенна следят за курсором, в простое — блуждают
      for (const eye of eyes) {
        eye.position.x = eye.userData.baseX + gaze.x * 0.075;
        eye.position.y = eye.userData.baseY + gaze.y * 0.06;
      }
      face.rotation.y = gaze.x * 0.1;
      face.rotation.x = -gaze.y * 0.07;
      antenna.rotation.z = gaze.x * 0.22 + (motion ? Math.sin(time * 1.1) * 0.05 : 0);
      antenna.rotation.x = -gaze.y * 0.18;
      halo.rotation.y = gaze.x * 0.25;

      // В простое бот тихо «бубнит» сам с собой — рот-эквалайзер чуть дышит
      const murmur = motion ? 0.05 + 0.04 * Math.sin(time * 0.9) : 0;
      const e = Math.max(motion ? energy : 0, life.hum * 0.4, murmur);

      // Моргание глаз (+ лёгкий прищур, когда смотрит на курсор)
      const blinkPhase = time % 3.9;
      const blink = blinkPhase < 0.25 ? Math.sin((blinkPhase / 0.25) * Math.PI) : 0;
      const squint = life.focus ? 0.9 : 1;
      for (const eye of eyes) {
        eye.scale.y = (1 - blink * 0.88) * squint;
        eye.material.emissiveIntensity = 0.9 + e * 2.2 + (life.focus ? 0.35 : 0);
      }

      // Рот-эквалайзер
      for (let i = 0; i < mouthBars.length; i++) {
        const bar = mouthBars[i];
        bar.scale.y = 0.25 + e * (0.9 + 0.6 * Math.sin(time * 18 + i * 1.7));
        bar.material.emissiveIntensity = 0.7 + e * 2.5;
      }

      // Кончик антенны и сердцевины ушей
      tip.material.emissiveIntensity = 0.8 + e * 2.5 + 0.35 * Math.sin(time * 2.4);
      tip.scale.setScalar(1 + e * 0.3 * Math.sin(time * 12));
      for (const ear of [earL, earR]) {
        ear.userData.core.material.emissiveIntensity =
          0.6 + e * 2 + 0.2 * Math.sin(time * 3) + (life.focus ? 0.4 : 0);
      }
      led.material.emissiveIntensity = 0.7 + e * 2.5;

      // Чат-пузыри: орбита, покачивание, встряска от энергии
      bubbles.rotation.y = motion ? time * 0.12 : 0;
      for (const bubble of bubbleList) {
        const { angle, radius, baseY, phase } = bubble.userData;
        const spread = radius + explode * 0.5;
        bubble.position.set(
          Math.cos(angle) * spread,
          baseY + (motion ? Math.sin(time * 1.3 + phase) * 0.07 : 0),
          Math.sin(angle) * spread
        );
        bubble.rotation.y = -bubbles.rotation.y; // всегда лицом к камере
        const pop = 1 + e * 0.22 * Math.sin(time * 10 + phase);
        bubble.scale.setScalar(pop);
      }
    },

    dispose() {
      root.traverse((node) => {
        node.geometry?.dispose();
        if (node.material?.dispose) node.material.dispose();
      });
    },
  };
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();

  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(room, 0.035);
  scene.environment = envTarget.texture;
  room.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const keyLight = new THREE.DirectionalLight(0xfff6e7, 2.3);
  keyLight.position.set(-3, 5, 6);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 1.5);
  fillLight.position.set(5, 1, 2);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xd2d9e1, 0.7);
  rimLight.position.set(-3, -2, 1);
  scene.add(rimLight);

  const bot = buildBot();
  scene.add(bot.root);

  let width = 1;
  let height = 1;
  let isMobile = false;
  const pointerState = { x: 0, y: 0 };

  // «Мозг» бота: следит за курсором, а в простое живёт своей жизнью —
  // блуждающий взгляд и случайные действия (подпрыгнуть, наклонить, побубнить…)
  const brain = {
    lastPointer: -1e9,
    gaze: { x: 0, y: 0 },
    wander: { x: 0, y: 0 },
    wanderNext: 0,
    action: null,
    nextAction: 3000,
  };

  function resize() {
    width = document.documentElement.clientWidth;
    height = innerHeight;
    isMobile = width <= 650;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = isMobile ? 10.2 : 9;
    camera.updateProjectionMatrix();
  }
  resize();

  function render(
    progress,
    energy,
    time,
    motion,
    mobileShift = 0,
    { rotation = Math.PI, lightAngle = -35 } = {}
  ) {
    const p = pose(progress, isMobile);
    const aspect = width / height;
    const fit = isMobile ? Math.min(1, width / 420) * (800 / height) : Math.min(1, aspect / 1.5);

    // --- Взгляд и случайные действия ---
    const nowMs = time * 1000;
    const focus = motion && nowMs - brain.lastPointer < 2500;
    if (motion && nowMs > brain.wanderNext) {
      brain.wanderNext = nowMs + 1800 + Math.random() * 2600;
      brain.wander.x = (Math.random() * 2 - 1) * 0.85;
      brain.wander.y = (Math.random() * 2 - 1) * 0.55;
    }
    const gazeTarget = focus ? pointerState : brain.wander;
    brain.gaze.x = lerp(brain.gaze.x, motion ? gazeTarget.x : 0, 0.07);
    brain.gaze.y = lerp(brain.gaze.y, motion ? gazeTarget.y : 0, 0.07);

    if (motion && nowMs > brain.nextAction) {
      brain.nextAction = nowMs + 5000 + Math.random() * 8000;
      const kinds = ['hop', 'tilt', 'hum', 'wiggle', 'look'];
      brain.action = {
        kind: kinds[(Math.random() * kinds.length) | 0],
        start: nowMs,
        dur: 900 + Math.random() * 1000,
        dir: Math.random() < 0.5 ? -1 : 1,
      };
    }
    let hop = 0;
    let tilt = 0;
    let hum = 0;
    let wiggle = 0;
    if (brain.action) {
      const t = (nowMs - brain.action.start) / brain.action.dur;
      if (t >= 1) {
        brain.action = null;
      } else {
        const s = Math.sin(t * Math.PI);
        if (brain.action.kind === 'hop') hop = s * 0.14;
        else if (brain.action.kind === 'tilt') tilt = s * 0.1 * brain.action.dir;
        else if (brain.action.kind === 'hum') hum = s;
        else if (brain.action.kind === 'wiggle') wiggle = s;
        else {
          // «look» — резко заинтересовался и посмотрел в сторону
          brain.wander.x = brain.action.dir;
          brain.wander.y = brain.action.dir > 0 ? 0.4 : -0.3;
          brain.wanderNext = nowMs + 1500;
        }
      }
    }

    // Дыхание и покачивание — бот живой, даже когда ничего не происходит
    const sway = motion ? Math.sin(time * 0.8) * 0.02 : 0;
    const breathe = motion ? 1 + Math.sin(time * 1.7) * 0.012 : 1;

    bot.root.position.set(
      p.x * (isMobile ? 1 : Math.min(1, aspect / 1.65)),
      p.y + mobileShift + hop + sway,
      0
    );
    bot.root.scale.setScalar(p.scale * fit * breathe);

    // Слайдер поворота живёт в главе 04 (стек), слайдер света — в 06 (PropTech)
    const rotationMix = clamp01(1 - Math.abs(progress - 4));
    const lightMix = clamp01(1 - Math.abs(progress - 6));
    const angle = (lerp(-35, lightAngle, lightMix) * Math.PI) / 180;
    keyLight.position.set(Math.sin(angle) * 8, 5, Math.cos(angle) * 8);

    bot.root.rotation.set(
      p.rx + brain.gaze.y * 0.09,
      p.ry + (rotation - Math.PI) * rotationMix + brain.gaze.x * 0.16,
      p.rz + tilt + (motion ? Math.sin(time * 0.6) * 0.015 : 0)
    );

    bot.update(p.explode, energy, time, motion, brain.gaze, { hum, wiggle, focus });
    renderer.render(scene, camera);
  }

  return {
    resize,
    render,
    pointer(x, y) {
      pointerState.x = x;
      pointerState.y = y;
      brain.lastPointer = performance.now();
    },
    setFinish: bot.setFinish,
    dispose() {
      bot.dispose();
      envTarget.dispose();
      renderer.dispose();
    },
  };
}
