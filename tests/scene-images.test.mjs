import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
const built = process.env.BDE_TEST_BUILT === '1';
const { createSceneImages } = await import(`../services/game-server/${built ? 'dist/scene-images.js' : 'src/scene-images.ts'}`);
const scope = () => ({ sessionId: 'demo', mode: 'ttrpg', roundId: null, stage: 'table', revision: 1 });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const reply = id => Response.json({ prompt_id: id });
const create = (request, extra = {}) => createSceneImages({ request, endpoint: 'http://127.0.0.1:1', current: scope, active: () => true, ...extra });

test('scene submissions deduplicate pending and settled attempts and bound admission in FIFO order', async () => {
  const first = deferred(), calls = [];
  const owner = create(async (_url, init) => { const prompt = JSON.parse(init.body).prompt; calls.push(prompt['2'].inputs.text); assert.equal(init.redirect, 'error'); return calls.length === 1 ? first.promise : reply(`image-${calls.length}`); });
  try {
    const a = owner.request('Demo A'), duplicate = owner.request(' Demo A '), b = owner.request('Demo B'), c = owner.request('Demo C');
    assert.equal(a, duplicate); assert.deepEqual(await owner.request('Demo D'), { status: 'busy' }); assert.deepEqual(calls, ['Demo A']);
    first.resolve(reply('image-1'));
    assert.deepEqual(await a, { status: 'submitted', promptId: 'image-1' }); await b; await c;
    assert.deepEqual(await owner.request('Demo A'), await a); assert.deepEqual(calls, ['Demo A', 'Demo B', 'Demo C']);
    for (let i = 0; i < 61; i++) await owner.request(`Extra ${i}`);
    assert.deepEqual(await owner.request('Beyond attempt bound'), { status: 'busy' }); assert.equal(calls.length, 64);
  } finally { owner.dispose(); }
});

test('scene deadlines cover ignored transport and body without automatically retrying ambiguous acceptance', async () => {
  for (const bodyStall of [false, true]) {
    const late = deferred(); let calls = 0, signal;
    const owner = create(async (_url, init) => {
      calls++; signal = init.signal;
      if (calls > 1) return reply('next');
      return bodyStall ? new Response(new ReadableStream({ pull: () => late.promise })) : late.promise;
    }, { deadlineMs: 15 });
    try {
      assert.deepEqual(await owner.request('Demo'), { status: 'failed' }); assert.equal(signal.aborted, true);
      assert.deepEqual(await owner.request('Demo'), { status: 'failed' }); assert.equal(calls, 1);
      assert.deepEqual(await owner.request('Different'), { status: 'submitted', promptId: 'next' });
      late.resolve(reply('too-late')); await Promise.resolve(); assert.deepEqual(await owner.request('Demo'), { status: 'failed' });
    } finally { owner.dispose(); }
  }
});

test('scene scope advancement and disposal settle active and queued work without accepting late results', async () => {
  for (const change of [{ sessionId: 'new' }, { mode: 'party' }, { roundId: 2 }, { stage: 'ending' }, { revision: 2 }]) {
    const late = deferred(); let current = scope(), signal, calls = 0;
    const owner = create(async (_url, init) => { calls++; signal = init.signal; return late.promise; }, { current: () => current });
    const first = owner.request('Demo'), queued = owner.request('Queued');
    current = { ...current, ...change }; owner.cancelStale();
    assert.deepEqual(await first, { status: 'stale' }); assert.deepEqual(await queued, { status: 'stale' }); assert.equal(signal.aborted, true); assert.equal(calls, 1);
    late.resolve(reply('late')); owner.dispose(); assert.deepEqual(await owner.request('After'), { status: 'stale' });
  }
  const owner = create(async () => new Promise(() => {})); const pending = owner.request('Stop'); owner.dispose(); assert.deepEqual(await pending, { status: 'stale' });
});

test('scene acknowledgments reject error envelopes, oversized bodies and malformed IDs; disabled paths make zero calls', async () => {
  for (const response of [new Response('PRIVATE_BODY', { status: 500 }), Response.json({ prompt_id: 'ok', error: 'PRIVATE_ERROR' }), reply('../bad'), Response.json({}), new Response('x'.repeat(16385))]) {
    const owner = create(async () => response);
    try { assert.deepEqual(await owner.request('Demo'), { status: 'failed' }); } finally { owner.dispose(); }
  }
  for (const config of [{ endpoint: '' }, { current: () => ({ ...scope(), mode: 'party' }) }]) {
    const owner = create(async () => assert.fail('Disabled generation contacted provider'), config);
    assert.deepEqual(await owner.request('Demo'), { status: 'disabled' }); owner.dispose();
  }
});

test('actual scene commands submit after durable success and never on rollback, receipt replay or restart replay', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const token = await server.hostToken();
    const post = body => fetch(server.base + '/api/set-scene', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    const body = { requestId: 'demo-scene', title: 'Demo moonlit bell tower' };
    const db = new Database(resolve(server.folder, 'demo.db'));
    try {
      db.exec("CREATE TRIGGER fail_scene_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
      assert.equal((await post(body)).status, 503); assert.doesNotMatch(server.diagnostics(), /SYNTHETIC_IMAGE_SUBMITTED/);
      db.exec('DROP TRIGGER fail_scene_receipt');
      const accepted = await post(body); assert.equal(accepted.status, 200); const receipt = await accepted.json();
      assert.deepEqual(await (await post(body)).json(), receipt);
      // Stdout can arrive after the HTTP response; bounded observation, never another submission.
      for (let i = 0; i < 40 && !server.diagnostics().includes('SYNTHETIC_IMAGE_SUBMITTED'); i++) await new Promise(done => setTimeout(done, 10));
      assert.equal(server.diagnostics().match(/SYNTHETIC_IMAGE_SUBMITTED/g)?.length, 1);
      await server.restart(); assert.deepEqual(await (await post(body)).json(), receipt);
      assert.equal(server.diagnostics().match(/SYNTHETIC_IMAGE_SUBMITTED/g)?.length, 1);
    } finally { db.close(); }
  }, { mockFetches: [{ url: 'http://127.0.0.1:1/prompt', method: 'POST', body: { prompt_id: 'demo-image' } }] });
});
