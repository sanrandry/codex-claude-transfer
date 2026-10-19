import assert from 'node:assert/strict';
import { appendFile, mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RolloutTailer } from './watch.mjs';

const line = (value) => `${JSON.stringify(value)}\n`;
const metadata = (id, source = 'vscode') => ({
  type: 'session_meta',
  payload: { id, originator: 'Desktop Client', source },
});
const completion = (turnId, text, timestamp = new Date(Date.now() + 1).toISOString()) => ({
  timestamp,
  type: 'event_msg',
  payload: { type: 'task_complete', turn_id: turnId, last_agent_message: text },
});

test('tails new final answers while excluding history, duplicates and subagents', async (t) => {
  const sessionsDir = await mkdtemp(join(tmpdir(), 'reader-watch-'));
  const delivered = [];
  const errors = [];
  const watcher = new RolloutTailer({
    sessionsDir,
    expectedOriginator: 'Desktop Client',
    intervalMs: 60_000,
    onCompletion: (value) => delivered.push(value),
    onError: (error) => errors.push(error),
  });
  t.after(async () => {
    await watcher.close();
    await rm(sessionsDir, { recursive: true, force: true });
  });

  const existing = join(sessionsDir, 'rollout-existing.jsonl');
  await writeFile(existing, line(metadata('session-a')) + line(completion('turn-old', 'Ancienne réponse.')));
  await watcher.start();
  assert.deepEqual(delivered, []);

  await appendFile(existing, line(completion('turn-a', 'Première réponse.')));
  await watcher.scan();
  assert.deepEqual(delivered, [{ sessionId: 'session-a', turnId: 'turn-a', text: 'Première réponse.' }]);

  const nested = join(sessionsDir, 'year', 'month', 'day');
  await mkdir(nested, { recursive: true });
  await writeFile(join(nested, 'rollout-child.jsonl'), line(metadata('session-child', {
    subagent: { thread_spawn: { parent_thread_id: 'session-a' } },
  })) + line(completion('turn-child', 'Réponse interne.')));
  await writeFile(join(nested, 'rollout-new.jsonl'), line(metadata('session-b')) + line(completion('turn-b', 'Nouvelle réponse.')));
  const foreign = metadata('session-other');
  foreign.payload.originator = 'Other Client';
  await writeFile(join(nested, 'rollout-other.jsonl'), line(foreign) + line(completion('turn-other', 'Autre client.')));
  await appendFile(existing, line(completion('turn-a', 'Première réponse.')));
  await watcher.scan();
  assert.equal(delivered.length, 2);
  assert.deepEqual(delivered[1], { sessionId: 'session-b', turnId: 'turn-b', text: 'Nouvelle réponse.' });

  const text = 'Réponse prête 👋';
  const bytes = Buffer.from(line(completion('turn-unicode', text)));
  const split = bytes.indexOf(Buffer.from('👋')) + 2;
  await appendFile(existing, bytes.subarray(0, split));
  await watcher.scan();
  assert.equal(delivered.length, 2);
  await appendFile(existing, bytes.subarray(split));
  await watcher.scan();
  assert.deepEqual(delivered[2], { sessionId: 'session-a', turnId: 'turn-unicode', text });
  assert.deepEqual(errors, []);
});

test('waits for a new file header to finish and ignores a startup partial line', async (t) => {
  const sessionsDir = await mkdtemp(join(tmpdir(), 'reader-watch-'));
  const delivered = [];
  const watcher = new RolloutTailer({
    sessionsDir,
    expectedOriginator: 'Desktop Client',
    intervalMs: 60_000,
    onCompletion: (value) => delivered.push(value),
  });
  t.after(async () => {
    await watcher.close();
    await rm(sessionsDir, { recursive: true, force: true });
  });
  const existing = join(sessionsDir, 'rollout-existing.jsonl');
  const oldLine = line(completion('turn-old', 'Réponse passée.'));
  await writeFile(existing, line(metadata('session-a')) + oldLine.slice(0, 20));
  await watcher.start();
  await appendFile(existing, oldLine.slice(20) + line(completion('turn-a', 'Réponse suivante.')));
  const fresh = join(sessionsDir, 'rollout-new.jsonl');
  const header = line(metadata('session-b'));
  await writeFile(fresh, header.slice(0, 15));
  await watcher.scan();
  assert.equal(delivered.length, 1);
  await appendFile(fresh, header.slice(15) + line(completion('turn-b', 'Réponse terminée.')));
  await watcher.scan();
  assert.deepEqual(delivered, [
    { sessionId: 'session-a', turnId: 'turn-a', text: 'Réponse suivante.' },
    { sessionId: 'session-b', turnId: 'turn-b', text: 'Réponse terminée.' },
  ]);
});

test('does not replay history when a baseline file is truncated or replaced', async (t) => {
  const startedAt = Date.parse('2026-10-19T06:00:00.000Z');
  t.mock.method(Date, 'now', () => startedAt);
  const sessionsDir = await mkdtemp(join(tmpdir(), 'reader-watch-'));
  const delivered = [];
  const watcher = new RolloutTailer({
    sessionsDir,
    expectedOriginator: 'Desktop Client',
    intervalMs: 60_000,
    onCompletion: (value) => delivered.push(value),
  });
  t.after(async () => {
    await watcher.close();
    await rm(sessionsDir, { recursive: true, force: true });
  });
  const existing = join(sessionsDir, 'rollout-existing.jsonl');
  const history = line(metadata('session-a'))
    + line(completion('turn-old', 'Ancienne réponse.', '2026-10-19T05:00:00.000Z'));
  await writeFile(existing, history + line({ type: 'padding', value: 'a'.repeat(1000) }));
  await watcher.start();

  await writeFile(existing, history + line(completion('turn-a', 'Réponse actuelle.')));
  await watcher.scan();
  assert.deepEqual(delivered, [
    { sessionId: 'session-a', turnId: 'turn-a', text: 'Réponse actuelle.' },
  ]);

  const replacement = join(sessionsDir, 'replacement.jsonl');
  await writeFile(replacement, history + line(completion('turn-b', 'Réponse suivante.')));
  await rename(replacement, existing);
  await watcher.scan();
  assert.deepEqual(delivered, [
    { sessionId: 'session-a', turnId: 'turn-a', text: 'Réponse actuelle.' },
    { sessionId: 'session-a', turnId: 'turn-b', text: 'Réponse suivante.' },
  ]);
});

test('ignores historical completions discovered in new rollout paths', async (t) => {
  const startedAt = Date.parse('2026-10-19T06:00:00.000Z');
  t.mock.method(Date, 'now', () => startedAt);
  const sessionsDir = await mkdtemp(join(tmpdir(), 'reader-watch-'));
  const delivered = [];
  const watcher = new RolloutTailer({
    sessionsDir,
    expectedOriginator: 'Desktop Client',
    intervalMs: 60_000,
    onCompletion: (value) => delivered.push(value),
  });
  t.after(async () => {
    await watcher.close();
    await rm(sessionsDir, { recursive: true, force: true });
  });
  const history = line(metadata('session-a'))
    + line(completion('turn-old', 'Ancienne réponse.', '2026-10-19T05:00:00.000Z'));
  await writeFile(join(sessionsDir, 'rollout-existing.jsonl'), history);
  await watcher.start();

  await writeFile(join(sessionsDir, 'rollout-renamed.jsonl'), history);
  const newlyDiscovered = join(sessionsDir, 'rollout-discovered.jsonl');
  await writeFile(newlyDiscovered, line(metadata('session-b'))
    + line(completion('turn-other-old', 'Autre réponse passée.', '2026-10-19T05:30:00.000Z'))
    + line(completion('turn-new', 'Nouvelle réponse.')));
  await watcher.scan();
  assert.deepEqual(delivered, [
    { sessionId: 'session-b', turnId: 'turn-new', text: 'Nouvelle réponse.' },
  ]);
});

test('requires a completion timestamp at or after watcher startup', async (t) => {
  const startedAt = Date.parse('2026-10-19T06:00:00.000Z');
  t.mock.method(Date, 'now', () => startedAt);
  const sessionsDir = await mkdtemp(join(tmpdir(), 'reader-watch-'));
  const delivered = [];
  const watcher = new RolloutTailer({
    sessionsDir,
    expectedOriginator: 'Desktop Client',
    intervalMs: 60_000,
    onCompletion: (value) => delivered.push(value),
  });
  t.after(async () => {
    await watcher.close();
    await rm(sessionsDir, { recursive: true, force: true });
  });
  await watcher.start();
  const undated = completion('turn-undated', 'Réponse sans date.');
  delete undated.timestamp;
  await writeFile(join(sessionsDir, 'rollout-new.jsonl'), line(metadata('session-a'))
    + line(undated)
    + line(completion('turn-invalid', 'Réponse avec date invalide.', 'invalid'))
    + line(completion('turn-old', 'Réponse passée.', new Date(startedAt - 1).toISOString()))
    + line(completion('turn-current', 'Réponse actuelle.', new Date(startedAt).toISOString())));
  await watcher.scan();
  assert.deepEqual(delivered, [
    { sessionId: 'session-a', turnId: 'turn-current', text: 'Réponse actuelle.' },
  ]);
});
