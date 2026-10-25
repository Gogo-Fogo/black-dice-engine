import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const modelCache: Record<string, THREE.Group> = {};
const loadingPromises: Record<string, Promise<THREE.Group>> = {};

export function preloadDice() {
  ["./dice/d20_low_003.glb", "./dice/d6_low_003.glb", "./dice/d4_low_003.glb"].forEach((path) => loadModel(path).catch(() => {}));
}

function parseDiceNotation(notation: string): { count: number; sides: number } {
  const m = notation.trim().toLowerCase().match(/^(\d*)d(\d+)/);
  if (!m) return { count: 1, sides: 20 };
  return { count: m[1] ? parseInt(m[1], 10) : 1, sides: parseInt(m[2], 10) };
}

function getModelPath(sides: number): string {
  const map: Record<number, string> = {
    4: "./dice/d4_low_003.glb",
    6: "./dice/d6_low_003.glb",
    8: "./dice/d8_low_003.glb",
    10: "./dice/d10_low_003.glb",
    20: "./dice/d20_low_003.glb",
    100: "./dice/d100_low_003.glb",
  };
  return map[sides] || "./dice/d20_low_003.glb";
}

const DICE_SCALE = 150;

function loadModel(path: string): Promise<THREE.Group> {
  if (modelCache[path]) return Promise.resolve(modelCache[path].clone());
  return new Promise((resolve, reject) => {
    loader.load(path, (gltf) => {
      const model = gltf.scene;
      model.scale.set(DICE_SCALE, DICE_SCALE, DICE_SCALE);
      modelCache[path] = model;
      resolve(model.clone());
    }, undefined, () => reject(new Error("Failed to load " + path)));
  });
}

export interface DiceHandle {
  throwDice: () => void;
  dispose: () => void;
}

export function renderDiceOverlay(
  container: HTMLElement,
  notation: string,
  onDone: () => void
): DiceHandle {
  const { count, sides } = parseDiceNotation(notation);
  const modelPath = getModelPath(sides);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;";

  scene.add(new THREE.AmbientLight(0x606060, 2));
  const dl1 = new THREE.DirectionalLight(0xffffff, 4);
  dl1.position.set(5, 10, 7);
  dl1.castShadow = true;
  scene.add(dl1);
  const dl2 = new THREE.DirectionalLight(0xffaa66, 2);
  dl2.position.set(-5, -5, -5);
  scene.add(dl2);

  const dice: THREE.Group[] = [];
  const spinSpeeds: number[] = [];
  let thrown = false;
  let settled = false;
  let startTime = 0;
  let frameId = 0;
  let loaded = false;

  loadModel(modelPath).then((model) => {
    for (let i = 0; i < count; i++) {
      const die = model.clone();
      const spread = count > 1 ? (i - (count - 1) / 2) * 3 : 0;
      die.position.set(spread, 0, 0);
      die.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(die);
      dice.push(die);
      spinSpeeds.push(1 + Math.random() * 3);
    }
    loaded = true;
  }).catch(() => { loaded = true; onDone(); });

  function throwDice() {
    if (thrown) return;
    thrown = true;
    startTime = performance.now();
  }

  function animate() {
    frameId = requestAnimationFrame(animate);
    if (!loaded || dice.length === 0) { renderer.render(scene, camera); return; }

    if (!thrown) {
      for (let i = 0; i < dice.length; i++) {
        dice[i].rotation.y += 0.01;
      }
    } else if (!settled) {
      const elapsed = performance.now() - startTime;
      const dur = 3500;
      const t = Math.min(elapsed / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      for (let i = 0; i < dice.length; i++) {
        const s = 1 - ease * 0.95;
        dice[i].rotation.x += spinSpeeds[i] * s * 0.03;
        dice[i].rotation.y += spinSpeeds[i] * 0.7 * s * 0.03;
        dice[i].rotation.z += spinSpeeds[i] * 0.4 * s * 0.03;
      }
      if (t >= 1) { settled = true; onDone(); }
    }
    renderer.render(scene, camera);
  }
  animate();

  return { throwDice, dispose: () => {
    cancelAnimationFrame(frameId);
    renderer.dispose();
    scene.clear();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }};
}