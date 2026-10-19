import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export function extractCompletion(event, metadata, expectedOriginator = 'Codex Desktop') {
  if (
    metadata?.originator !== expectedOriginator ||
    metadata?.parent_thread_id ||
    metadata?.source?.subagent ||
    event?.type !== 'event_msg' ||
    event.payload?.type !== 'task_complete'
  ) return null;

  const sessionId = metadata.id ?? metadata.session_id;
  const { turn_id: turnId, last_agent_message: text } = event.payload;
  if (typeof sessionId !== 'string' || typeof turnId !== 'string' || typeof text !== 'string' || !text.trim()) {
    return null;
  }
  return { sessionId, turnId, text };
}

async function rolloutFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await rolloutFiles(path));
    else if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function readMetadata(handle) {
  let position = 0;
  let pending = Buffer.alloc(0);
  const chunk = Buffer.alloc(64 * 1024);
  while (true) {
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
    if (!bytesRead) return null;
    position += bytesRead;
    pending = Buffer.concat([pending, chunk.subarray(0, bytesRead)]);
    const newline = pending.indexOf(10);
    if (newline < 0) continue;
    try {
      const first = JSON.parse(pending.subarray(0, newline).toString('utf8'));
      return first.type === 'session_meta' ? first.payload : null;
    } catch {
      return null;
    }
  }
}

export class RolloutTailer {
  constructor({ sessionsDir, onCompletion, onError = () => {}, intervalMs = 2000, expectedOriginator = 'Codex Desktop' }) {
    if (typeof onCompletion !== 'function') throw new TypeError('onCompletion must be a function.');
    Object.assign(this, { sessionsDir, onCompletion, onError, intervalMs, expectedOriginator });
    this.files = new Map();
    this.seen = new Set();
    this.closed = false;
  }

  async start() {
    if (this.timer || this.closed) return;
    await this._scan(true);
    if (!this.closed) this.timer = setInterval(() => void this.scan(), this.intervalMs);
  }

  scan() {
    if (this.closed) return Promise.resolve();
    if (!this.scanning) this.scanning = this._scan(false).finally(() => { this.scanning = null; });
    return this.scanning;
  }

  async close() {
    this.closed = true;
    clearInterval(this.timer);
    await this.scanning;
  }

  _report(error) {
    try { this.onError(error); } catch { /* An error reporter must not stop polling. */ }
  }

  async _scan(baseline) {
    this.startedAt ??= Date.now();
    try {
      const paths = await rolloutFiles(this.sessionsDir);
      const present = new Set(paths);
      for (const path of this.files.keys()) if (!present.has(path)) this.files.delete(path);
      for (const path of paths) {
        if (this.closed) return;
        try {
          const info = await stat(path);
          let state = this.files.get(path);
          if (!state || info.size < state.offset || info.ino !== state.ino) {
            state = { ino: info.ino, offset: baseline ? info.size : 0, pending: Buffer.alloc(0), metadata: null, baseline };
            this.files.set(path, state);
          }
          if (!baseline && info.size > state.offset) await this._read(path, state, info.size);
        } catch (error) {
          if (error.code !== 'ENOENT') this._report(error);
        }
      }
    } catch (error) {
      this._report(error);
    }
  }

  async _read(path, state, end) {
    const handle = await open(path, 'r');
    try {
      if (state.baseline) {
        state.metadata = await readMetadata(handle);
        if (state.offset) {
          const previous = Buffer.alloc(1);
          await handle.read(previous, 0, 1, state.offset - 1);
          state.discardPartial = previous[0] !== 10;
        }
        state.baseline = false;
      }
      if (!state.metadata && state.offset) state.metadata = await readMetadata(handle);
      const chunk = Buffer.alloc(64 * 1024);
      while (state.offset < end && !this.closed) {
        const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, end - state.offset), state.offset);
        if (!bytesRead) break;
        state.offset += bytesRead;
        state.pending = Buffer.concat([state.pending, chunk.subarray(0, bytesRead)]);
        let newline;
        while ((newline = state.pending.indexOf(10)) >= 0 && !this.closed) {
          const line = state.pending.subarray(0, newline);
          state.pending = state.pending.subarray(newline + 1);
          if (state.discardPartial) {
            state.discardPartial = false;
            continue;
          }
          await this._line(line, state);
        }
      }
    } finally {
      await handle.close();
    }
  }

  async _line(line, state) {
    if (!line.toString('utf8').trim()) return;
    let event;
    try {
      event = JSON.parse(line.toString('utf8'));
    } catch {
      this._report(new Error('Ignored malformed rollout JSON line.'));
      return;
    }
    if (event.type === 'session_meta') state.metadata = event.payload;
    const completion = extractCompletion(event, state.metadata, this.expectedOriginator);
    if (!completion) return;
    // Compaction and renamed rollouts can expose history that was skipped at startup.
    const completedAt = Date.parse(event.timestamp);
    if (!Number.isFinite(completedAt) || completedAt < this.startedAt) return;
    const key = `${completion.sessionId}:${completion.turnId}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    try {
      await this.onCompletion(completion);
    } catch (error) {
      this._report(error);
    }
  }
}
