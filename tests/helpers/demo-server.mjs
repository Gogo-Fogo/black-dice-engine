// Disposable, loopback-only browser verification. Never inherit provider configuration.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import {png} from './portrait-fixture.mjs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporaryRoot = resolve(root, 'tmp');
await mkdir(temporaryRoot, { recursive: true });
const folder = await mkdtemp(resolve(temporaryRoot, 'browser-demo-'));
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const ttrpg=process.argv.includes('--ttrpg');
Object.assign(env, { BDE_RUNTIME_PROFILE: ttrpg?'full':'party', BDE_AUTO_BACKUP: '0', BDE_HOST: '127.0.0.1', BDE_GAME_SERVER_PORT: '0', BDE_DB_PATH: resolve(folder, 'demo.db'), BDE_EXPORT_ROOT: resolve(folder, 'exports') });
if(ttrpg)await writeFile(resolve(folder,'demo-portrait.png'),png());
const child = spawn(process.execPath, ['--import', './tests/helpers/no-outgoing-fetch.mjs', './services/game-server/dist/index.js'],
  { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const exited = once(child, 'exit');
let output = '';
let announced = false;
child.stdout.on('data', async chunk => {
  output = (output + chunk).slice(-4000);
  const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
  if (match && !announced) {
    announced = true;
    const token = await readFile(resolve(folder, 'demo.db.host.key'), 'utf8');
    const response = await fetch(match[1] + '/api/session-snapshot', { headers: { authorization: `Bearer ${token}` } });
    const snapshot = await response.json();
    console.log(JSON.stringify({ base: match[1], code: snapshot.tablePin, fixture: folder, ...(ttrpg?{hostKey:token,portrait:resolve(folder,'demo-portrait.png')}:{}) }));
  }
});
child.stderr.on('data', chunk => process.stderr.write(chunk));
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await exited;
  if (!resolve(folder).startsWith(temporaryRoot + sep)) throw new Error('Fixture escaped temporary root');
  await rm(folder, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.stdin.on('data', () => { void stop(); });
process.stdin.resume();
await exited;
await stop();
