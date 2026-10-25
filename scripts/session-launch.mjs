import { spawn, spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { options, root, buildParty, verifyBuild, checkPort } from './party-launch.mjs';

const services = { audio: 'audio-service', comfy: 'comfy-router', runtime: 'runtime-service' };
export function sessionOptions(args) {
  const remaining = []; let selected = []; let servicesSpecified = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== '--services') { remaining.push(args[index]); continue; }
    if (servicesSpecified) throw new Error('Specify --services only once');
    servicesSpecified = true;
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error('--services requires audio,comfy,runtime or none');
    selected = value === 'none' ? [] : value.split(',');
    if (selected.some(name => !Object.hasOwn(services, name)) || new Set(selected).size !== selected.length) throw new Error('Unknown or repeated optional service');
  }
  return { ...options(remaining), services: selected, dataExplicit: remaining.includes('--data-dir'), portExplicit: remaining.includes('--port') };
}

async function buildSelected(selected) {
  await buildParty();
  for (const name of selected) {
    const cwd = resolve(root, 'services', services[name]);
    const manifest = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'));
    if (manifest.scripts?.build !== 'tsc -p tsconfig.json') throw new Error(`Build command changed in ${services[name]}; update the launcher.`);
    console.log(`[session] Building ${services[name]}`);
    const child = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd, stdio: 'inherit', windowsHide: true });
    if (child.error || child.status !== 0) throw new Error(`Build failed in ${services[name]}; no server was started.`);
  }
}

export async function main(args = process.argv.slice(2)) {
  const settings = sessionOptions(args);
  if (settings.help) {
    console.log('Full session: node scripts/session-launch.mjs [--services audio,comfy,runtime | --services none] [--lan] [--port PORT] [--data-dir PATH] [--no-build | --check | --build-only]\nDefault: build the two shared packages, both apps and game server; full profile, loopback, existing configured/default database. Optional Node services start only when named. No external ComfyUI, LLM, Python, model, browser or .env discovery. Ctrl+C stops only this launcher and its child services.');
    return;
  }
  if (settings.build) await buildSelected(settings.services);
  await verifyBuild();
  for (const name of settings.services) await access(resolve(root, 'services', services[name], 'dist/index.js'));
  if (settings.buildOnly) return;
  const { readRuntimeConfig, readServiceConfig } = await import(pathToFileURL(resolve(root, 'packages/runtime-config/dist/index.js')).href);
  const env = { ...process.env, BDE_RUNTIME_PROFILE: 'full', BDE_HOST: settings.host,
    ...(settings.portExplicit ? { BDE_GAME_SERVER_PORT: String(settings.port) } : {}),
    ...(settings.dataExplicit ? { BDE_DB_PATH: resolve(settings.dataDir, 'session.db'), BDE_EXPORT_ROOT: resolve(settings.dataDir, 'exports'), BDE_BACKUPS_DIR: resolve(settings.dataDir, 'backups') } : {}) };
  const config = readRuntimeConfig(env);
  if (config.gameServerPort === 0 && settings.services.includes('runtime')) throw new Error('The runtime monitor needs a fixed game --port; omit runtime for an ephemeral game port.');
  const ports = [config.gameServerPort];
  for (const name of settings.services) {
    const childConfig = readServiceConfig(name, { ...env, BDE_HOST: '127.0.0.1' });
    if (childConfig.port !== 0 && ports.includes(childConfig.port)) throw new Error('Selected services need distinct nonzero ports. No existing process was stopped.');
    ports.push(childConfig.port);
    await checkPort('127.0.0.1', childConfig.port);
  }
  await checkPort(config.host, config.gameServerPort);
  if (settings.check) { console.log('[session] Built surfaces, selected services, configuration and ports verified. No data or optional service was opened.'); return; }

  const children = new Set(); let stopping = false;
  const stopChildren = async () => {
    stopping = true;
    await Promise.all([...children].map(async owned => {
      if (owned.child.exitCode === null && owned.child.signalCode === null) owned.child.kill();
      await owned.exited;
    }));
  };
  const terminate = async code => { if (stopping) return; await stopChildren(); process.exit(code); };
  process.once('SIGINT', () => void terminate(0));
  process.once('SIGTERM', () => void terminate(0));
  // Cooperative local parent control; no network shutdown endpoint.
  process.on('message', message => { if (message?.type === 'bde-stop') void terminate(0); });
  try {
    for (const name of settings.services) {
      const child = spawn(process.execPath, [resolve(root, 'services', services[name], 'dist/index.js')], {
        cwd: root, env: { ...env, BDE_HOST: '127.0.0.1', BDE_GAME_SERVER_ENDPOINT: `http://127.0.0.1:${config.gameServerPort}` },
        stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
      });
      let resolveExit;
      const exited = new Promise(accept => { resolveExit = accept; });
      const owned = { child, exited }; children.add(owned);
      process.send?.({ type: 'bde-child', name, pid: child.pid });
      child.once('exit', code => {
        children.delete(owned); resolveExit();
        if (!stopping) { console.error(`[session] ${services[name]} exited (${code}); stopping owned session processes.`); void terminate(1); }
      });
      child.stderr.on('data', chunk => process.stderr.write(chunk));
      const base = await new Promise((accept, reject) => {
        let output = '';
        const timer = setTimeout(() => reject(new Error(`${services[name]} startup timed out`)), 8000);
        child.once('error', error => { clearTimeout(timer); resolveExit(); children.delete(owned); reject(error); });
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`${services[name]} exited during startup (${code})`)); });
        child.stdout.on('data', chunk => {
          process.stdout.write(chunk); output = (output + chunk).slice(-4000);
          const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
          if (match) { clearTimeout(timer); accept(match[1]); }
        });
      });
      if (name === 'audio') env.BDE_AUDIO_SERVICE_ENDPOINT = base;
      if (name === 'comfy') env.BDE_COMFY_ROUTER_ENDPOINT = base;
    }
    Object.assign(process.env, env);
    console.log('[session] Full profile. External models/ComfyUI/TTS are not launched. Optional adapters use only explicit environment configuration.');
    await import(pathToFileURL(resolve(root, 'services/game-server/dist/index.js')).href);
  } catch (error) { await stopChildren(); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`[session] ${error.message}`); process.exit(1); });
}
