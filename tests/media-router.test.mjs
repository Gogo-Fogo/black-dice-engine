import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { isRouterJobResponse, isRouterStatusResponse } from '../packages/contracts/dist/index.js';
const built = process.env.BDE_TEST_BUILT === '1';
const { createMediaRouterClient, createMediaJobPoller } = await import(`../services/game-server/${built ? 'dist/media-router-client.js' : 'src/media-router-client.ts'}`);
import { withIsolatedServer } from './helpers/isolated-server.mjs';

const endpoint = 'http://127.0.0.1:1';
const job = () => ({ id: 'demo-job', campaignId: 'demo', type: 'image', status: 'queued', priority: 'normal', visibility: 'gm_only',
  prompt: 'An original demo gate', workflowId: 'demo-workflow', runWhen: 'manual', createdAt: 'demo', settings: {} });
const routerJob = (status = 'prepared') => ({ id: 'demo-job', workflowId: 'demo-workflow', promptTemplateId: 'demo-template', type: 'image', status,
  prompt: 'An original demo gate', negativePrompt: '', outputRoot: null, readyForComfySubmission: false, warnings: [], createdAt: 'demo',
  ...(status !== 'prepared' ? { comfyPromptId: 'demo-prompt' } : {}) });
const result = status => ({ ok: true, job: routerJob(status), comfyStatus: status, error: null });

test('media router consumes actual nested status envelope and validates preparation/submission identity', async () => {
  const calls = [];
  const client = createMediaRouterClient(async (url, init) => {
    calls.push([url, init]);
    return Response.json(url.endsWith('/prepare') ? { ok: true, job: routerJob() } : url.endsWith('/submit') ?
      { ok: true, job: routerJob('submitted') } : result('completed'));
  });
  assert.deepEqual(await client.start(endpoint, job()), { routerJobId: 'demo-job', promptId: 'demo-prompt' });
  assert.equal((await client.poll(endpoint, 'demo-job', 'demo-prompt')).comfyStatus, 'completed');
  assert.deepEqual(calls.map(([url]) => url), [endpoint + '/api/jobs/prepare', endpoint + '/api/jobs/demo-job/submit', endpoint + '/api/jobs/demo-job/status']);
  assert.equal(JSON.parse(calls[0][1].body).id, 'demo-job');
  assert.ok(calls.every(([, init]) => init.signal instanceof AbortSignal));
});

test('media router rejects malformed, mismatched and failed confirmations without accepting top-level status', async () => {
  assert.equal(isRouterJobResponse({ ok: true, job: routerJob() }), true);
  for (const body of [null, {}, { ok: false, job: routerJob() }, { ok: true, job: { ...routerJob(), warnings: [null] } },
    { ok: true, job: { ...routerJob(), id: 'different' } }, { ok: true, job: routerJob('running') }]) {
    let calls = 0;
    const client = createMediaRouterClient(async () => { calls++; return Response.json(body); });
    await assert.rejects(client.start(endpoint, job()), /preparation/); assert.equal(calls, 1);
  }
  for (const body of [{ ok: true, job: routerJob() }, { ok: true, job: { ...routerJob('submitted'), comfyPromptId: undefined } },
    { ok: true, job: { ...routerJob('submitted'), workflowId: 'different' } }]) {
    let calls = 0;
    const client = createMediaRouterClient(async () => Response.json(++calls === 1 ? { ok: true, job: routerJob() } : body));
    await assert.rejects(client.start(endpoint, job()), /submission/);
  }
  for (const body of [{ status: 'completed' }, { ...result('completed'), comfyStatus: 'running' },
    { ...result('completed'), job: { ...routerJob('completed'), id: 'wrong' } },
    { ...result('completed'), job: { ...routerJob('completed'), comfyPromptId: 'old-prompt' } }]) {
    const client = createMediaRouterClient(async () => Response.json(body));
    await assert.rejects(client.poll(endpoint, 'demo-job', 'demo-prompt'), /status confirmation/);
  }
  assert.equal(isRouterStatusResponse(result('failed')), true);
  const unavailable = createMediaRouterClient(async () => new Response('private-upstream-canary', { status: 503 }));
  await assert.rejects(unavailable.start(endpoint, job()), error => /503/.test(error.message) && !error.message.includes('canary'));
  await assert.rejects(unavailable.poll(endpoint, 'demo-job'), /503/);
});

test('media polling single-flights and ignores terminal, replaced and reassigned jobs before applying completion', async () => {
  for (const stale of ['none', 'terminal', 'replaced', 'reassigned']) {
    const value = { ...job(), status: 'running', comfyRouterJobId: 'demo-job', comfyPromptId: 'demo-prompt' };
    let resolveRead, calls = 0, current = true;
    const applied = [];
    const poll = createMediaJobPoller({ poll: async () => { calls++; return new Promise(resolve => { resolveRead = resolve; }); } }, {
      current: () => current,
      completed: job => { job.status = 'generated'; applied.push('completed'); },
      failed: (_job, error) => applied.push(error)
    });
    const pending = poll(endpoint, value); await poll(endpoint, value); assert.equal(calls, 1);
    if (stale === 'terminal') value.status = 'failed';
    if (stale === 'replaced') current = false;
    if (stale === 'reassigned') value.comfyPromptId = 'new-prompt';
    resolveRead(result('completed')); await pending;
    assert.deepEqual(applied, stale === 'none' ? ['completed'] : []);
  }
  const value = { ...job(), status: 'running', comfyRouterJobId: 'demo-job' };
  let calls = 0; const failures = [];
  const poll = createMediaJobPoller({ poll: async () => { if (++calls === 1) throw new Error('unavailable'); return { ...result('failed'), error: 'Demo failure' }; } },
    { current: () => true, completed: () => assert.fail(), failed: (_job, error) => failures.push(error) });
  await assert.rejects(poll(endpoint, value), /unavailable/); await poll(endpoint, value);
  assert.equal(calls, 2); assert.deepEqual(failures, ['ComfyUI job failed']);
});

test('authenticated media start refuses malformed router response instead of marking the job running', { timeout: 10000 }, async () => {
  await withIsolatedServer(async server => {
    const token = await server.hostToken();
    const request = (path, body) => fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(3000) });
    const scene = await (await request('/api/scene-packet')).json();
    const queued = await (await request('/api/scene-packet/queue-media', scene.packet)).json();
    const id = queued.sessionSnapshot.mediaJobs[0].id;
    const db = new Database(resolve(server.folder, 'demo.db'));
    try {
      db.exec("CREATE TRIGGER fail_media_admission BEFORE INSERT ON media_jobs BEGIN SELECT RAISE(ABORT, 'synthetic admission failure'); END");
      assert.equal((await request(`/api/media-jobs/${id}/start`, {})).status, 503);
      db.exec('DROP TRIGGER fail_media_admission');
    } finally { db.close(); }
    const response = await request(`/api/media-jobs/${id}/start`, {});
    assert.equal(response.status, 200, 'Existing failure envelope remains compatible');
    const body = await response.json();
    assert.equal(body.job.status, 'failed'); assert.match(body.job.error, /Invalid media preparation/);
    assert.equal(body.job.comfyRouterJobId, undefined); assert.equal(body.job.comfyPromptId, undefined);
    assert.ok(body.job.settings.routerSubmissionAttemptedAt);
    assert.equal((await request(`/api/media-jobs/${id}/start`, {})).status, 409);
    await server.restart();
    assert.equal((await request(`/api/media-jobs/${id}/start`, {})).status, 409, 'Durable attempt prevents restart resubmission');
  }, { mockFetches: [{ url: endpoint + '/api/jobs/prepare', method: 'POST', body: { ok: true, job: { id: 'unvalidated' } } }] });
});


const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(done => setImmediate(done));

test('media owner shares pending/settled starts, bounds the request queue and refuses changed input', async () => {
  const first = deferred(), calls = [];
  const client = createMediaRouterClient(async (url, init) => {
    calls.push(url); assert.equal(init.redirect, 'error');
    if (calls.length === 1) return first.promise;
    const id = url.endsWith('/prepare') ? JSON.parse(init.body).id : decodeURIComponent(url.split('/').at(-2));
    return Response.json({ ok: true, job: { ...routerJob(url.endsWith('/prepare') ? 'prepared' : 'submitted'), id } });
  });
  try {
    const a = job(), b = { ...job(), id: 'second' }, c = { ...job(), id: 'third' };
    const pending = client.start(endpoint, a), duplicate = client.start(endpoint, a), second = client.start(endpoint, b), third = client.start(endpoint, c);
    assert.equal(pending, duplicate);
    await assert.rejects(client.start(endpoint, { ...job(), id: 'fourth' }), error => error.code === 'busy');
    assert.equal(calls.length, 1);
    first.resolve(Response.json({ ok: true, job: routerJob() }));
    await pending; await second; await third;
    assert.deepEqual(await client.start(endpoint, a), { routerJobId: 'demo-job', promptId: 'demo-prompt' }); assert.equal(calls.length, 6);
    await assert.rejects(client.start(endpoint, { ...a, prompt: 'Changed' }), /different input/);
    for (let i = 0; i < 61; i++) await client.start(endpoint, { ...job(), id: `extra-${i}` });
    assert.equal(client.canStart, false);
    await assert.rejects(client.start(endpoint, { ...job(), id: 'beyond-bound' }), error => error.code === 'busy');
  } finally { client.dispose(); }
});

test('media deadline covers ignored preparation transport/body and never posts submit after late completion', async () => {
  for (const stalledBody of [false, true]) {
    const late = deferred(); let calls = 0, signal;
    const client = createMediaRouterClient(async (_url, init) => {
      calls++; signal = init.signal;
      return stalledBody ? new Response(new ReadableStream({ pull: () => late.promise })) : late.promise;
    }, { startDeadlineMs: 15 });
    try {
      await assert.rejects(client.start(endpoint, job()), /timed out/); assert.equal(signal.aborted, true);
      late.resolve(Response.json({ ok: true, job: routerJob() })); await tick();
      await assert.rejects(client.start(endpoint, job()), /timed out/); assert.equal(calls, 1);
    } finally { client.dispose(); }
  }
});

test('media submit timeout retains ambiguous attempt and stale scope, replaced/terminal jobs and disposal cancel queued work', async () => {
  const late = deferred(); let calls = 0, signal;
  const client = createMediaRouterClient(async (url, init) => {
    calls++; signal = init.signal;
    return url.endsWith('/prepare') ? Response.json({ ok: true, job: routerJob() }) : late.promise;
  }, { startDeadlineMs: 20 });
  try {
    await assert.rejects(client.start(endpoint, job()), /timed out/); assert.equal(signal.aborted, true);
    late.resolve(Response.json({ ok: true, job: routerJob('submitted') })); await tick();
    await assert.rejects(client.start(endpoint, job()), /timed out/); assert.equal(calls, 2);
  } finally { client.dispose(); }
  for (const change of ['scope', 'terminal', 'removed', 'stop']) {
    const late = deferred(); let scope = 'room:ttrpg', current = true, signal, calls = 0;
    const active = job(), waiting = { ...job(), id: 'waiting' };
    const owner = createMediaRouterClient(async (_url, init) => { calls++; signal = init.signal; return late.promise; }, { scope: () => scope, current: () => current });
    const a = owner.start(endpoint, active), b = owner.start(endpoint, waiting);
    const checks = [assert.rejects(a, error => error.code === 'stale'), assert.rejects(b, error => error.code === 'stale')];
    if (change === 'scope') scope = 'new-room:party';
    if (change === 'terminal') { active.status = 'failed'; waiting.status = 'failed'; }
    if (change === 'removed') current = false;
    if (change === 'stop') owner.dispose(); else owner.cancelStale();
    await Promise.all(checks); assert.equal(signal.aborted, true); assert.equal(calls, 1);
    late.resolve(Response.json({ ok: true, job: routerJob() })); await tick(); assert.equal(calls, 1); owner.dispose();
  }
});

test('media polls share reads, release deadlines and discard late completion before callbacks', async () => {
  const late = deferred(); let calls = 0;
  const client = createMediaRouterClient(async () => { calls++; return calls === 1 ? late.promise : Response.json(result('completed')); }, { pollDeadlineMs: 15 });
  const active = { ...job(), status: 'running', comfyRouterJobId: 'demo-job', comfyPromptId: 'demo-prompt' }, applied = [];
  const poll = createMediaJobPoller(client, { current: () => true, completed: () => applied.push('done'), failed: () => assert.fail() });
  try {
    const pending = poll(endpoint, active); await poll(endpoint, active); assert.equal(calls, 1);
    await assert.rejects(pending, /timed out/);
    late.resolve(Response.json(result('completed'))); await tick(); assert.deepEqual(applied, []);
    await poll(endpoint, active); assert.deepEqual(applied, ['done']); assert.equal(calls, 2);
  } finally { client.dispose(); }
});

test('media bounded bodies and disabled owners fail without leaking provider errors or sending requests', async () => {
  for (const response of [new Response('PRIVATE_PROVIDER_BODY'), new Response('x'.repeat(128 * 1024 + 1)), new Response('PRIVATE_PROVIDER_BODY', { status: 502 })]) {
    const client = createMediaRouterClient(async () => response);
    try { await assert.rejects(client.start(endpoint, job()), error => !error.message.includes('PRIVATE')); } finally { client.dispose(); }
  }
  const client = createMediaRouterClient(async () => assert.fail('Disabled owner contacted provider'), { enabled: () => false });
  try { await assert.rejects(client.start(endpoint, job()), error => error.code === 'stale'); await assert.rejects(client.poll(endpoint, 'demo-job'), error => error.code === 'stale'); }
  finally { client.dispose(); }
});


test('actual pending media start cannot overwrite a manual failure or replacement room', { timeout: 15000 }, async () => {
  for (const action of ['fail', 'new-room']) await withIsolatedServer(async server => {
    const token = await server.hostToken();
    const api = (path, body, credential = token) => fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(4000) });
    const scene = await (await api('/api/scene-packet')).json();
    const queued = await (await api('/api/scene-packet/queue-media', scene.packet)).json();
    const id = queued.sessionSnapshot.mediaJobs[0].id;
    const pending = api(`/api/media-jobs/${id}/start`, {});
    for (let i = 0; i < 100 && !server.diagnostics().includes('SYNTHETIC_FETCH_PENDING'); i++) await new Promise(done => setTimeout(done, 10));
    assert.match(server.diagnostics(), /SYNTHETIC_FETCH_PENDING/);
    const control = action === 'fail' ? await api(`/api/media-jobs/${id}/fail`, { error: 'Demo host cancellation' }) : await api('/api/session/new-room', {});
    assert.ok(control.ok); const confirmation = await control.json();
    const cancelled = await pending; assert.equal(cancelled.status, 409);
    const snapshot = await (await api('/api/session-snapshot', undefined, action === 'fail' ? token : confirmation.token)).json();
    const retained = snapshot.mediaJobs.find(job => job.id === id);
    assert.equal(retained.status, action === 'fail' ? 'failed' : queued.sessionSnapshot.mediaJobs[0].status);
    assert.equal(retained.comfyPromptId, undefined);
    if (action === 'fail') assert.equal(retained.error, 'Demo host cancellation');
  }, { mockFetches: [{ url: endpoint + '/api/jobs/prepare', method: 'POST', hang: true }] });
});


test('actual confirmed media submission persists router identity and durable admission before restart', { timeout: 10000 }, async () => {
  await withIsolatedServer(async server => {
    const token = await server.hostToken();
    const db = new Database(resolve(server.folder, 'demo.db'));
    try {
      const value = { ...job(), createdAt: '2026-10-25T00:00:00Z' };
      db.prepare('INSERT INTO media_jobs (id, data, status, created_at) VALUES (?, ?, ?, ?)').run(value.id, JSON.stringify(value), value.status, value.createdAt);
    } finally { db.close(); }
    await server.restart();
    const api = (path, body) => fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(3000) });
    const response = await api('/api/media-jobs/demo-job/start', {}); assert.equal(response.status, 200);
    const accepted = await response.json(); assert.equal(accepted.job.status, 'running'); assert.equal(accepted.job.comfyPromptId, 'demo-prompt');
    assert.ok(accepted.job.settings.routerSubmissionSessionId);
    await server.restart();
    const snapshot = await (await api('/api/session-snapshot')).json(), saved = snapshot.mediaJobs.find(value => value.id === 'demo-job');
    assert.equal(saved.status, 'running'); assert.equal(saved.comfyPromptId, 'demo-prompt'); assert.equal(saved.comfyRouterJobId, 'demo-job');
    assert.equal((await api('/api/media-jobs/demo-job/start', {})).status, 409);
  }, { mockFetches: [{ url: endpoint + '/api/jobs/prepare', method: 'POST', body: { ok: true, job: routerJob() } },
    { url: endpoint + '/api/jobs/demo-job/submit', method: 'POST', body: { ok: true, job: routerJob('submitted') } }] });
});
