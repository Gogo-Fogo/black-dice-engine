import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import type express from 'express';
import type { Character, SessionSnapshot } from '../../../packages/contracts/dist/index.js';
import { SessionError } from './session-authority.js';
import { identityFor } from './session-http.js';
import type { CommandBoundary } from './command-boundary.js';

const fail = () => new SessionError(400, 'Use a valid PNG portrait up to 512 KiB and 768×768 pixels.');
const crc = (bytes: Buffer) => {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
};
/** Validate decoded size and checksums; discard metadata, animation and ancillary chunks. */
export function normalizePortrait(input: unknown) {
  if (typeof input !== 'string' || input.length > 750000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input)) throw fail();
  const bytes = Buffer.from(input.slice('data:image/png;base64,'.length), 'base64');
  if (bytes.length > 512 * 1024 || bytes.length < 57 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw fail();
  const kept = [bytes.subarray(0, 8)], data: Buffer[] = [];
  let offset = 8, width = 0, height = 0, channels = 0, ended = false, dataEnded = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw fail();
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (end > bytes.length) throw fail();
    const type = bytes.toString('ascii', offset + 4, offset + 8), content = bytes.subarray(offset + 8, end - 4);
    if (crc(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw fail();
    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) throw fail();
      width = content.readUInt32BE(0); height = content.readUInt32BE(4); channels = content[9] === 6 ? 4 : content[9] === 2 ? 3 : 0;
      if (!width || !height || width > 768 || height > 768 || !channels || content[8] !== 8 || content[10] || content[11] || content[12]) throw fail();
    } else if (type === 'IHDR' || type === 'acTL' || type === 'fcTL' || type === 'fdAT') throw fail();
    if (type === 'IDAT') { if (dataEnded) throw fail(); data.push(content); }
    else if (data.length) dataEnded = true;
    if (['IHDR', 'IDAT', 'IEND'].includes(type)) kept.push(bytes.subarray(offset, end));
    else if (type[0] === type[0].toUpperCase() && type !== 'PLTE') throw fail();
    offset = end;
    if (type === 'IEND') { if (length || offset !== bytes.length || !data.length) throw fail(); ended = true; break; }
  }
  if (!ended) throw fail();
  const row = width * channels + 1;
  let decoded: Buffer;
  try { decoded = inflateSync(Buffer.concat(data), {maxOutputLength: row * height}); } catch { throw fail(); }
  if (decoded.length !== row * height) throw fail();
  for (let y = 0; y < height; y++) if (decoded[y * row] > 4) throw fail();
  return Buffer.concat(kept);
}

export function createCharacterPortraits(db: Database.Database) {
  const key = (characterId: string, id: string) => `character-portrait:${characterId}:${id}`;
  const read = (characterId: string, id: string) => {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key(characterId, id)) as {value: string} | undefined;
    return row ? JSON.parse(row.value) as {image: string; description: string; seed: number} : undefined;
  };
  return { read,
    prepare(character: Character, image: unknown, description: string) {
      const bytes = normalizePortrait(image);
      const id = createHash('sha256').update(bytes).update('\0' + description).digest('hex');
      const seed = parseInt(id.slice(0, 8), 16);
      const count = db.prepare("SELECT count(*) AS n FROM meta WHERE key LIKE ?").get(`character-portrait:${character.id}:%`) as {n: number};
      if (!read(character.id, id) && count.n >= 20) throw new SessionError(409, 'This character has reached the 20-reference limit. Ask the host before adding more.');
      return {id, seed, save: () => db.prepare('INSERT OR IGNORE INTO meta (key,value) VALUES (?,?)').run(key(character.id,id), JSON.stringify({image:'data:image/png;base64,'+bytes.toString('base64'),description,seed}))};
    }
  };
}

export function installCharacterPortraitRoutes(app: express.Express, hooks: {
  party: Character[]; portraits: ReturnType<typeof createCharacterPortraits>; commands: CommandBoundary; publish(): SessionSnapshot;
}) {
  const characterFor = (id: string) => { const character = hooks.party.find(c => c.id === id); if (!character) throw new SessionError(404, 'Character not found.'); return character; };
  app.post('/api/characters/:id/portrait', (request, response) => {
    const character = characterFor(String(request.params.id)), viewer = identityFor(request);
    if (viewer.role !== 'gm' && (viewer.role !== 'player' || character.claimedByClientId !== viewer.actorId)) throw new SessionError(403, 'Upload only for your claimed character.');
    const description = typeof request.body.description === 'string' ? request.body.description.trim() : '';
    const reference = hooks.portraits.prepare(character, request.body.image, description);
    hooks.commands.persist(reference.save);
    character.portrait = {...character.portrait, pendingId: reference.id, description, seed: reference.seed, version:(character.portrait?.version ?? 0)+1};
    response.json({ok:true, sessionSnapshot:hooks.publish()});
  });
  app.post('/api/characters/:id/portrait/review', (request, response) => {
    if (identityFor(request).role !== 'gm') throw new SessionError(403, 'Host approval required.');
    const character = characterFor(String(request.params.id)), portrait = character.portrait;
    if (!portrait?.pendingId || portrait.pendingId !== request.body.referenceId) throw new SessionError(409, 'The submitted reference changed. Refresh before reviewing.');
    const previous=portrait.approvedId?hooks.portraits.read(character.id,portrait.approvedId):undefined;
    character.portrait = {...portrait, ...(request.body.approve ? {approvedId:portrait.pendingId} : {description:previous?.description??'',seed:previous?.seed??portrait.seed}), pendingId:undefined};
    response.json({ok:true, sessionSnapshot:hooks.publish()});
  });
  app.get('/api/characters/:id/portrait/:referenceId', (request, response) => {
    const character = characterFor(String(request.params.id)), id = String(request.params.referenceId), viewer = identityFor(request);
    const own = viewer.role === 'player' && character.claimedByClientId === viewer.actorId;
    if (viewer.role !== 'gm' && id !== character.portrait?.approvedId && !(own && id === character.portrait?.pendingId)) throw new SessionError(403, 'This portrait is not shared with you.');
    const reference = hooks.portraits.read(character.id, id); if (!reference) throw new SessionError(404, 'Portrait not found.');
    response.setHeader('X-Content-Type-Options','nosniff'); response.setHeader('Content-Security-Policy',"default-src 'none'");
    response.type('image/png').send(Buffer.from(reference.image.split(',')[1], 'base64'));
  });
}
