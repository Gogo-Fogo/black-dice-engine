import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LiveConnection } from '../apps/live-connection.mts';


function fixture() {
  let now = 0;
  let id = 0;
  const jobs = new Map();
  const schedule = (callback, delay, interval = false) => { const key = ++id; jobs.set(key, { callback, at: now + delay, delay, interval }); return key; };
  const timers = { timeout: (fn, ms) => schedule(fn, ms), interval: (fn, ms) => schedule(fn, ms, true),
    cancelTimeout: key => jobs.delete(key), cancelInterval: key => jobs.delete(key) };
  const advance = duration => {
    const target = now + duration;
    for (;;) {
      const next = [...jobs].filter(([, job]) => job.at <= target).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [key, job] = next;
      now = job.at;
      if (job.interval) job.at += job.delay; else jobs.delete(key);
      job.callback();
    }
    now = target;
  };
  const sockets = [];
  const statuses = [];
  const snapshots = [];
  let refreshes = 0;
  let expired = 0;
  class Socket {
    readyState = 0; onopen = null; onclose = null; onmessage = null; onerror = null; sent = [];
    open() { this.readyState = 1; this.onopen?.({}); }
    message(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
    send(message) { this.sent.push(JSON.parse(message)); }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  }
  const connection = new LiveConnection({ socket: () => { const socket = new Socket(); sockets.push(socket); return socket; },
    receive: value => { snapshots.push(value); return true; }, refresh: () => refreshes++, status: value => statuses.push(value),
    error: () => {}, expired: () => expired++, online: () => true }, () => now, timers);
  return { connection, sockets, statuses, snapshots, advance, jobs, refreshes: () => refreshes, expired: () => expired };
}
test('connection owns exactly one socket, bounded reconnect and cleanup across remounts', () => {
  const f = fixture();
  f.connection.start(); f.connection.start();
  assert.equal(f.sockets.length, 1);
  f.sockets[0].open();
  f.sockets[0].message({ type: 'connected', payload: { party: { revision: 1 } } });
  assert.equal(f.statuses.at(-1), 'Connected');
  f.advance(5000);
  assert.deepEqual(f.sockets[0].sent, [{ type: 'heartbeat' }]);
  f.connection.offline();
  assert.equal(f.statuses.at(-1), 'Offline');
  f.connection.wake();
  assert.equal(f.sockets.length, 1);
  f.sockets[0].message({ type: 'runtime_status', payload: {} });
  assert.equal(f.statuses.at(-1), 'Connected');
  const staleMessage = f.sockets[0].onmessage;
  f.sockets[0].close(1006);
  assert.equal(f.statuses.at(-1), 'Reconnecting');
  f.advance(499); assert.equal(f.sockets.length, 1);
  f.advance(1); assert.equal(f.sockets.length, 2);
  staleMessage({ data: JSON.stringify({ type: 'party_snapshot', payload: { revision: 999 } }) });
  assert.deepEqual(f.snapshots, [{ type: 'connected', payload: { party: { revision: 1 } } }, { type: 'runtime_status', payload: {} }], 'Old socket callbacks cannot overwrite a resumed session');
  f.sockets[1].open();
  f.connection.stop();
  assert.equal(f.jobs.size, 0);
  assert.equal(f.sockets[1].readyState, 3);
  const count = f.refreshes();
  f.advance(60000); f.connection.wake();
  assert.equal(f.refreshes(), count);
  assert.equal(f.sockets.length, 2);
  f.connection.start();
  assert.equal(f.sockets.length, 3);
  f.connection.stop();
});
test('silent sleeping connection is replaced and revoked credentials stop reconnect', () => {
  const f = fixture();
  f.connection.start(); f.sockets[0].open();
  f.advance(30500);
  assert.equal(f.sockets[0].readyState, 3);
  assert.equal(f.sockets.length, 2);
  f.sockets[1].open(); f.sockets[1].close(4001);
  assert.equal(f.expired(), 1);
  f.connection.wake();
  f.advance(60000);
  assert.equal(f.sockets.length, 2);
  f.connection.stop();
});
