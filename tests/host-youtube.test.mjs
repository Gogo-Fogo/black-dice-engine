import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTrackSelection } from '../apps/gm-dashboard/src/ttrpg/youtube-selection.ts';
import { YoutubeMusicPanel } from '../apps/gm-dashboard/src/ttrpg/YoutubeMusicPanel.tsx';

test('host music switches only to the latest selection and ignores canceled callbacks', () => {
  const callbacks = [], active = new Set(), played = [];
  const selection = createTrackSelection({
    schedule(callback, delay) {
      assert.equal(delay, 300);
      callbacks.push(callback); active.add(callback); return callback;
    },
    cancel(timer) { active.delete(timer); }
  });
  selection.select('first', id => played.push(id));
  selection.select('latest', id => played.push(id));
  assert.equal(active.size, 1);
  callbacks[0](); // A canceled callback that was already queued cannot win.
  assert.deepEqual(played, []);
  callbacks[1]();
  assert.deepEqual(played, ['latest']);
  active.clear();
  selection.select('stopped-or-unmounted', id => played.push(id));
  selection.cancel(); selection.cancel();
  assert.equal(active.size, 0);
  callbacks[2]();
  assert.deepEqual(played, ['latest']);
  selection.select('after-remount', id => played.push(id));
  callbacks[3]();
  assert.deepEqual(played, ['latest', 'after-remount']);
});

test('host music panel is inert until explicitly selected and renders accessible track controls', () => {
  const music = { ytUrl: '', ytVideoId: '', ytPlaying: false, ytLoop: true, ytVolume: 30,
    ytTracks: [], ytFading: false };
  const render = () => renderToStaticMarkup(React.createElement(YoutubeMusicPanel, { music }));
  assert.doesNotMatch(render(), /<iframe/);
  music.ytTracks = [{ id: 'abcdefghijk', url: 'https://youtu.be/abcdefghijk', label: 'demo' }];
  assert.match(render(), /<button[^>]*>\/abcdefghijk<\/button>/);
  assert.doesNotMatch(render(), /<iframe/);
  music.ytVideoId = 'abcdefghijk'; music.ytPlaying = true;
  assert.match(render(), /title="Selected YouTube music"/);
  assert.match(render(), /embed\/abcdefghijk\?autoplay=1&amp;loop=1&amp;playlist=abcdefghijk/);
});
