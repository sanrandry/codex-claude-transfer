import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('background transfer never activates a window or uses keyboard and clipboard', async () => {
  const source = await readFile(new URL('./Reader.cs', import.meta.url), 'utf8');
  assert.equal(/SetForegroundWindow|ShowWindow|SetFocus\(|Clipboard\.|SendKeys\.|Process\.Start\(/.test(source), false,
    'No window activation, keyboard, clipboard or deep-link launch is permitted.');
});

test('transfer leaves speech playback to the user', async () => {
  const source = await readFile(new URL('./Reader.cs', import.meta.url), 'utf8');
  assert.equal(/Click\(read\)|lecture-demandee/.test(source), false, 'Audio must remain manual.');
});

test('transfer reuses an existing conversation without creating a chat', async () => {
  const source = await readFile(new URL('./Reader.cs', import.meta.url), 'utf8');
  assert.equal(/"Nouveau"|"New chat"|claude:\/\/.*\/new/.test(source), false,
    'No new-chat control or link is permitted.');
});
