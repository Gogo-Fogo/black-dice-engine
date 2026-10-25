import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { renderDiceOverlay, diceVisual } from '../apps/dice-presentation.mts';
import { playDiceRollSound } from '../apps/dice-audio.mts';

function ownedModel() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial();
  let imageClosed = 0;
  const texture = new THREE.Texture({ close: () => imageClosed++ });
  material.map = texture; material.emissiveMap = texture;
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, [material, material]));
  const disposed = { geometry: 0, material: 0, texture: 0 };
  for (const [key, resource] of Object.entries({ geometry, material, texture })) resource.addEventListener('dispose', () => disposed[key]++);
  return { root, disposed, imageClosed: () => imageClosed };
}

function fixture() {
  let resolve; let reject; let now = 0; let resize; let resizeRemoved = 0; let frames = 0;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const scheduled = new Map(); const renders = [];
  const canvas = { style: {}, parentNode: null };
  const container = { appendChild: value => { value.parentNode = container; }, removeChild: value => { value.parentNode = null; } };
  let rendererDisposed = 0;
  const sizes = [];
  const environment = { load: () => pending, renderer: () => ({ domElement: canvas, setSize: (...args) => sizes.push(args), setPixelRatio: () => {},
    render: scene => renders.push(scene.children.length), dispose: () => rendererDisposed++ }), viewport: () => ({ width: 360, height: 740, pixelRatio: 3 }),
    frame: callback => { scheduled.set(++frames, callback); return frames; }, cancelFrame: id => scheduled.delete(id), now: () => now,
    resized: callback => { resize = callback; return () => resizeRemoved++; } };
  const advance = milliseconds => { now += milliseconds; const callbacks = [...scheduled.values()]; scheduled.clear(); for (const callback of callbacks) callback(); };
  return { environment, container, canvas, resolve, reject, advance, resize: () => resize(), scheduled, renders, sizes,
    rendererDisposed: () => rendererDisposed, resizeRemoved: () => resizeRemoved };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('shared dice overlays dispose exclusively owned resources once and cancel frames/listeners/canvas', async () => {
  const f = fixture(); const model = ownedModel(); let completed = 0;
  const handle = renderDiceOverlay(f.container, '2d20', () => completed++, f.environment);
  handle.throwDice(); handle.throwDice();
  f.resolve(model.root); await settle(); f.resize(); f.advance(4000); f.advance(4000);
  assert.equal(completed, 1); assert.ok(f.renders.includes(5)); assert.deepEqual(f.sizes.at(-1), [360,740]);
  assert.equal(f.scheduled.size, 0, 'Settled dice do not keep the phone GPU loop running');
  handle.dispose(); handle.dispose(); handle.throwDice();
  assert.deepEqual(model.disposed, { geometry: 1, material: 1, texture: 1 }); assert.equal(model.imageClosed(), 1);
  assert.equal(f.rendererDisposed(), 1); assert.equal(f.resizeRemoved(), 1); assert.equal(f.scheduled.size, 0); assert.equal(f.canvas.parentNode, null);
  const renders = f.renders.length; f.advance(4000); assert.equal(f.renders.length, renders);
  assert.equal(diceVisual('1000d6').count, 12); assert.equal(diceVisual('d4').path, './dice/d4_low_003.glb');
});

test('late model load/failure cannot revive disposed dice and failure leaves the saved-result callback usable', async () => {
  for (const failure of [false, true]) {
    const f = fixture(); const model = ownedModel(); let completed = 0;
    const handle = renderDiceOverlay(f.container, 'd20', () => completed++, f.environment);
    handle.dispose();
    if (failure) f.reject(new Error('Missing model')); else f.resolve(model.root);
    await settle(); assert.equal(completed, 0); assert.equal(f.scheduled.size, 0);
    if (!failure) assert.deepEqual(model.disposed, { geometry: 1, material: 1, texture: 1 });
  }
  const f = fixture(); let completed = 0;
  const handle = renderDiceOverlay(f.container, 'd20', () => completed++, f.environment);
  f.reject(new Error('Missing optional model')); await settle(); assert.equal(completed, 1); handle.dispose();
});

test('dice render setup failure and reentrant completion disposal leave no live animation resources', async () => {
  const failed = fixture();
  const renderer = failed.environment.renderer;
  failed.environment.renderer = () => ({ ...renderer(), setSize: () => { throw new Error('GPU setup failed'); } });
  assert.throws(() => renderDiceOverlay(failed.container, 'd20', () => {}, failed.environment), /GPU setup failed/);
  assert.equal(failed.canvas.parentNode, null); assert.equal(failed.rendererDisposed(), 1);
  const f = fixture(); const model = ownedModel(); let handle;
  handle = renderDiceOverlay(f.container, 'd6', () => handle.dispose(), f.environment);
  f.resolve(model.root); await settle(); handle.throwDice(); f.advance(4000);
  assert.equal(f.scheduled.size, 0); assert.equal(f.rendererDisposed(), 1);
});

test('dice sounds own independent audio/timers and stop on cleanup or rejected playback', async () => {
  const timers = new Map(); const sounds = []; let id = 0; let rejectPlay = false;
  const environment = { audio: path => {
    const sound = { path, currentTime: 0, pauses: 0, removed: 0, loads: 0, play: () => rejectPlay ? Promise.reject(new Error('Gesture required')) : Promise.resolve(),
      pause() { this.pauses++; }, removeAttribute(name) { assert.equal(name, 'src'); this.removed++; }, load() { this.loads++; } };
    sounds.push(sound); return sound;
  }, later: callback => { timers.set(++id, callback); return id; }, cancel: key => timers.delete(key), random: () => .5 };
  const stopFirst = playDiceRollSound(environment); const stopSecond = playDiceRollSound(environment);
  timers.get(1)(); assert.equal(sounds[0].pauses, 1); assert.equal(sounds[1].pauses, 0);
  stopFirst(); stopSecond(); stopSecond(); assert.equal(timers.size, 0); assert.equal(sounds[1].loads, 1);
  rejectPlay = true; playDiceRollSound(environment); await settle();
  assert.equal(sounds[2].pauses, 1); assert.equal(sounds[2].removed, 1); assert.equal(timers.size, 0);
});
