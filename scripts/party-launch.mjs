import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));

export function options(args) {
  const result = { port: 4310, host: '127.0.0.1', publicOrigin: '', dataDir: resolve(root, '_data/party'), build: true, buildOnly: false, check: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--lan') result.host = '0.0.0.0';
    else if (arg === '--no-build') result.build = false;
    else if (arg === '--build-only') result.buildOnly = true;
    else if (arg === '--check') { result.check = true; result.build = false; }
    else if (arg === '--help') result.help = true;
    else if (arg === '--port' || arg === '--data-dir' || arg === '--public-url') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      if (arg === '--port') {
        if (!/^\d+$/.test(value) || Number(value) > 65535) throw new Error('--port must be an integer from 0 to 65535');
        result.port = Number(value);
      } else if (arg === '--public-url') {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('--public-url must be an HTTPS origin without credentials, path, query or fragment');
        result.publicOrigin = url.origin;
      }
      else result.dataDir = isAbsolute(value) ? resolve(value) : resolve(root, value);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return result;
}

/** No shells, downloads or package-manager lifecycle scripts. Only installed tools. */
export async function buildParty() {
  const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
  const vite = resolve(root, 'node_modules/vite/bin/vite.js');
  await access(tsc).catch(() => { throw new Error('Installed TypeScript is missing. No dependencies were installed.'); });
  await access(vite).catch(() => { throw new Error('Installed Vite is missing. No dependencies were installed.'); });
  const steps = [
    ['packages/contracts', 'tsc -p tsconfig.json', [[tsc, '-p', 'tsconfig.json']]],
    ['packages/runtime-config', 'tsc -p tsconfig.json', [[tsc, '-p', 'tsconfig.json']]],
    ['apps/gm-dashboard', 'tsc -b && vite build', [[tsc, '-b'], [vite, 'build']]],
    ['apps/player-companion', 'tsc -b && vite build', [[tsc, '-b'], [vite, 'build']]],
    ['services/game-server', 'tsc -p tsconfig.json', [[tsc, '-p', 'tsconfig.json']]]
  ];
  for (const [workspace, expected, commands] of steps) {
    const cwd = resolve(root, workspace);
    const manifest = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'));
    if (manifest.scripts?.build !== expected) throw new Error(`Build command changed in ${workspace}; update the Party build steps before launching.`);
    console.log(`[party] Building ${workspace}`);
    for (const command of commands) {
      const child = spawnSync(process.execPath, command, { cwd, stdio: 'inherit', windowsHide: true });
      if (child.error || child.status !== 0) throw new Error(`Build failed in ${workspace} (${child.error?.message ?? child.status ?? child.signal}). Server was not started.`);
    }
  }
}

export async function verifyBuild() {
  await access(resolve(root, 'packages/runtime-config/dist/index.js')).catch(() => { throw new Error('Built runtime configuration is missing. Run npm run build:party.'); });
  await access(resolve(root, 'packages/contracts/dist/index.js')).catch(() => { throw new Error('Built contracts are missing. Run npm run build:party.'); });
  await access(resolve(root, 'services/game-server/dist/index.js')).catch(() => { throw new Error('Built server is missing. Run npm run build:party.'); });
  for (const workspace of ['gm-dashboard', 'player-companion']) {
    const dist = resolve(root, 'apps', workspace, 'dist');
    const html = await readFile(resolve(dist, 'index.html'), 'utf8').catch(() => { throw new Error(`Built ${workspace} is missing. Run npm run build:party.`); });
    const links = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]);
    if (!links.some(link => link.endsWith('.js'))) throw new Error(`Built ${workspace} has no module script.`);
    for (const link of links) {
      if (!link.startsWith('./assets/') || link.includes('..') || link.includes('\\')) throw new Error(`Built ${workspace} references a non-local asset.`);
      await access(resolve(dist, link)).catch(() => { throw new Error(`Built ${workspace} has a missing asset. Run npm run build:party.`); });
    }
  }
}

export async function checkPort(host, port) {
  await new Promise((accept, reject) => {
    const probe = createServer();
    probe.once('error', error => reject(new Error(`Cannot listen on ${host}:${port} (${error.code}). Choose another --port; no existing process was stopped.`)));
    probe.listen({ host, port, exclusive: true }, () => probe.close(error => error ? reject(error) : accept()));
  });
}

export async function main(args = process.argv.slice(2)) {
  const settings = options(args);
  if (settings.help) {
    console.log('Party launcher: node scripts/party-launch.mjs [--lan] [--public-url HTTPS_ORIGIN] [--port 4310] [--data-dir PATH] [--no-build | --check | --build-only]\nDefault: build five workspaces, loopback only, separate _data/party/session.db. No optional services or .env file. --public-url advertises an existing approved HTTPS tunnel; it does not start one. Relative data paths resolve from this repository. Ctrl+C stops this server.');
    return;
  }
  if (settings.build) await buildParty();
  await verifyBuild();
  if (settings.buildOnly) return;
  await checkPort(settings.host, settings.port);
  if (settings.check) { console.log('[party] Built surfaces and port are available. No database was opened.'); return; }
  Object.assign(process.env, { BDE_RUNTIME_PROFILE: 'party', BDE_HOST: settings.host, BDE_PUBLIC_ORIGIN: settings.publicOrigin, BDE_GAME_SERVER_PORT: String(settings.port),
    BDE_DB_PATH: resolve(settings.dataDir, 'session.db'), BDE_EXPORT_ROOT: resolve(settings.dataDir, 'exports'), BDE_BACKUPS_DIR: resolve(settings.dataDir, 'backups'), BDE_RECOVER_HOST: '0' });
  console.log(`[party] AI, ComfyUI, TTS and generated audio/video disabled. ${settings.host === '127.0.0.1' ? 'Local access only; use --lan deliberately for phones.' : 'LAN hosting enabled; use a trusted private network.'}`);
  console.log(`[party] Host key file: ${resolve(settings.dataDir, 'session.db.host.key')} (not printed).`);
  if (settings.publicOrigin) console.log(`[party] Advertised HTTPS address: ${settings.publicOrigin}. Keep the approved tunnel running.`);
  // The built server runs in this process. Ctrl+C never selects/kills another
  // server by name, port or PID; no background service or PID file is created.
  await import(pathToFileURL(resolve(root, 'services/game-server/dist/index.js')).href);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`[party] ${error.message}`); process.exitCode = 1; });
}
