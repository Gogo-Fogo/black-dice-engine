// Web Audio API ambient sound engine — procedural, no external resources, crossfade between scenes

let audioCtx: AudioContext | null = null;
let ambientNodes: {
  gain: GainNode;
  osc1: OscillatorNode | null;
  osc2: OscillatorNode | null;
  noise: AudioBufferSourceNode | null;
} | null = null;

const SCENE_PRESETS: Record<string, { freq1: number; freq2: number; type: OscillatorType; noiseVol: number; oscVol: number; desc: string }> = {
  forest:     { freq1: 200, freq2: 400, type: "sine",     noiseVol: 0.3, oscVol: 0.08, desc: "Forest ambience" },
  dungeon:    { freq1: 60, freq2: 90, type: "sawtooth", noiseVol: 0.15, oscVol: 0.06, desc: "Dungeon depths" },
  cave:       { freq1: 50, freq2: 80, type: "sawtooth", noiseVol: 0.1, oscVol: 0.04, desc: "Cave echoes" },
  tavern:     { freq1: 150, freq2: 300, type: "triangle", noiseVol: 0.25, oscVol: 0.05, desc: "Tavern murmur" },
  combat:     { freq1: 100, freq2: 200, type: "square",   noiseVol: 0.2, oscVol: 0.1, desc: "Combat tension" },
  temple:     { freq1: 120, freq2: 240, type: "sine",     noiseVol: 0.1, oscVol: 0.12, desc: "Temple serenity" },
  ocean:      { freq1: 80, freq2: 160, type: "sine",     noiseVol: 0.4, oscVol: 0.03, desc: "Ocean waves" },
  storm:      { freq1: 40, freq2: 80, type: "sawtooth", noiseVol: 0.35, oscVol: 0.06, desc: "Storm brewing" },
  desert:     { freq1: 250, freq2: 500, type: "sine",     noiseVol: 0.15, oscVol: 0.04, desc: "Desert wind" },
  town:       { freq1: 180, freq2: 360, type: "triangle", noiseVol: 0.2, oscVol: 0.05, desc: "Town ambience" },
  night:      { freq1: 60, freq2: 120, type: "sine",     noiseVol: 0.12, oscVol: 0.04, desc: "Nightfall" },
  default:    { freq1: 140, freq2: 280, type: "triangle", noiseVol: 0.18, oscVol: 0.05, desc: "Ambient atmosphere" },
};

function matchPreset(scene: string) {
  const lower = scene.toLowerCase();
  for (const key of Object.keys(SCENE_PRESETS)) {
    if (key === "default") continue;
    if (lower.includes(key)) return SCENE_PRESETS[key];
  }
  return SCENE_PRESETS.default;
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx);
  source.loop = true;
  return source;
}

export function startAmbient(scene: string) {
  const preset = matchPreset(scene);

  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  const ctx = audioCtx;
  const FADE_MS = 1.5; // seconds to crossfade

  // Create new nodes
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + FADE_MS);
  masterGain.connect(ctx.destination);

  // Low-pass filter for noise
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 800;
  noiseFilter.connect(masterGain);

  const noiseSource = createNoiseSource(ctx);
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = preset.noiseVol;
  noiseSource.connect(noiseGain);
  noiseGain.connect(noiseFilter);
  noiseSource.start();

  const osc1 = ctx.createOscillator();
  osc1.type = preset.type;
  osc1.frequency.value = preset.freq1;
  const osc1Gain = ctx.createGain();
  osc1Gain.gain.value = preset.oscVol;
  osc1.connect(osc1Gain);
  osc1Gain.connect(masterGain);
  osc1.start();

  let osc2: OscillatorNode | null = null;
  if (preset.freq2 > 0) {
    osc2 = ctx.createOscillator();
    osc2.type = preset.type;
    osc2.frequency.value = preset.freq2;
    osc2.detune.value = 10; // slight detune for richness
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = preset.oscVol * 0.6;
    osc2.connect(osc2Gain);
    osc2Gain.connect(masterGain);
    osc2.start();
  }

  // Fade out old nodes
  if (ambientNodes) {
    const old = ambientNodes;
    old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_MS);
    setTimeout(() => {
      old.osc1?.stop();
      old.osc2?.stop();
      old.noise?.stop();
    }, FADE_MS * 1000 + 100);
  }

  ambientNodes = { gain: masterGain, osc1, osc2, noise: noiseSource };
}

export function stopAmbient() {
  if (!ambientNodes || !audioCtx) return;
  const ctx = audioCtx;
  ambientNodes.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
  const nodes = ambientNodes;
  setTimeout(() => {
    nodes.osc1?.stop();
    nodes.osc2?.stop();
    nodes.noise?.stop();
  }, 1600);
  ambientNodes = null;
}

export function setAmbientVolume(vol: number) {
  if (ambientNodes) {
    ambientNodes.gain.gain.linearRampToValueAtTime(vol, (audioCtx?.currentTime ?? 0) + 0.3);
  }
}
