import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type DiceHandle = { throwDice(): void; dispose(): void };
type Renderer = Pick<THREE.WebGLRenderer, "domElement" | "setSize" | "setPixelRatio" | "render" | "dispose">;
export type DiceEnvironment = {
  load(path: string): Promise<THREE.Object3D>; renderer(): Renderer;
  viewport(): { width: number; height: number; pixelRatio: number };
  frame(callback: () => void): number; cancelFrame(id: number): void; now(): number;
  resized(callback: () => void): () => void;
};

const modelPaths: Record<number, string> = { 4: "d4", 6: "d6", 8: "d8", 10: "d10", 20: "d20", 100: "d100" };
export function diceVisual(notation: string) {
  const match = notation.trim().match(/^(\d*)d(\d+)/i);
  const count = match?.[1] ? Number(match[1]) : 1;
  const sides = match ? Number(match[2]) : 20;
  return { count: Math.max(1, Math.min(12, count)), path: `./dice/${modelPaths[sides] ?? "d20"}_low_003.glb` };
}

/** Only for exclusively owned GLTF trees. Clones within one overlay share these resources. */
export function disposeDiceModel(model: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  model.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    }
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  const images = new Set<{ close(): void }>();
  for (const texture of textures) {
    const image: unknown = texture.image;
    if (image && typeof image === "object" && "close" in image && typeof image.close === "function") images.add(image as { close(): void });
    texture.dispose();
  }
  for (const image of images) image.close();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}

function browserEnvironment(): DiceEnvironment {
  return {
    load: async path => (await new GLTFLoader().loadAsync(path)).scene,
    renderer: () => new THREE.WebGLRenderer({ alpha: true, antialias: true }),
    viewport: () => ({ width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight), pixelRatio: window.devicePixelRatio }),
    frame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id), now: () => performance.now(),
    resized: callback => { window.addEventListener("resize", callback); return () => window.removeEventListener("resize", callback); }
  };
}

/** Cosmetic animation only; no gameplay outcome is generated or returned. */
export function renderDiceOverlay(container: HTMLElement, notation: string, onDone: () => void, environment = browserEnvironment()): DiceHandle {
  const visual = diceVisual(notation);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 0, 6); camera.lookAt(0, 0, 0);
  const renderer = environment.renderer();
  const canvas = renderer.domElement;
  let disposed = false;
  let model: THREE.Object3D | null = null;
  let frameId: number | undefined;
  let removeResize = () => {};
  let thrown = false;
  let settled = false;
  let startedAt = 0;
  const dice: THREE.Object3D[] = [];
  const spin: number[] = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (frameId !== undefined) environment.cancelFrame(frameId);
    removeResize();
    if (model) { disposeDiceModel(model); model = null; }
    scene.clear(); renderer.dispose();
    if (canvas.parentNode === container) container.removeChild(canvas);
  };
  const resize = () => {
    if (disposed) return;
    const { width, height, pixelRatio } = environment.viewport();
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height); renderer.setPixelRatio(Math.min(pixelRatio || 1, 2));
    if (settled) renderer.render(scene, camera);
  };
  const animate = () => {
    if (disposed) return;
    frameId = undefined;
    if (!thrown) { for (const die of dice) die.rotation.y += 0.01; }
    else if (!settled && model) {
      const progress = Math.min((environment.now() - startedAt) / 3500, 1);
      const speed = 1 - (1 - Math.pow(1 - progress, 3)) * 0.95;
      dice.forEach((die, index) => { die.rotation.x += spin[index] * speed * .03; die.rotation.y += spin[index] * speed * .021; die.rotation.z += spin[index] * speed * .012; });
      if (progress >= 1) { settled = true; onDone(); }
    }
    if (!disposed) { renderer.render(scene, camera); if (!settled) frameId = environment.frame(animate); }
  };
  try {
    container.appendChild(canvas); canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    resize(); removeResize = environment.resized(resize);
    scene.add(new THREE.AmbientLight(0x606060, 2));
    const key = new THREE.DirectionalLight(0xffffff, 4); key.position.set(5, 10, 7); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffaa66, 2); fill.position.set(-5, -5, -5); scene.add(fill);
    void environment.load(visual.path).then(loaded => {
      if (disposed) { disposeDiceModel(loaded); return; }
      model = loaded; model.scale.set(150, 150, 150);
      for (let index = 0; index < visual.count; index++) {
        const die = model.clone(); die.position.set((index - (visual.count - 1) / 2) * 3, 0, 0);
        die.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        dice.push(die); spin.push(1 + Math.random() * 3); scene.add(die);
      }
    }).catch(() => { if (!disposed) { settled = true; onDone(); } });
    animate();
  } catch (error) { dispose(); throw error; }
  return { throwDice: () => { if (!disposed && !thrown) { thrown = true; startedAt = environment.now(); } }, dispose };
}
