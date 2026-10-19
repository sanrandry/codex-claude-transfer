import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { RolloutTailer } from './watch.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const file = name => path.join(root, name);
const paused = () => fs.existsSync(file('paused'));
const run = promisify(execFile);
const arg = process.argv[2];
const log = (status, detail = '') => fs.appendFileSync(file('bridge.log'),
  `${new Date().toISOString()} ${status} ${String(detail).replace(/[\r\n]/g, ' ')}\n`);

if (arg === '--pause') {
  fs.writeFileSync(file('paused'), '');
  console.log('Transfert automatique en pause.');
} else if (arg === '--resume') {
  fs.rmSync(file('paused'), { force: true });
  console.log('Transfert automatique actif.');
} else if (arg === '--stop') {
  fs.writeFileSync(file('stop'), '');
  console.log('Arrêt demandé.');
} else if (arg === '--skip') {
  fs.writeFileSync(file('skip'), '');
  console.log('Abandon de la réponse en erreur demandé.');
} else if (arg === '--status') {
  console.log(JSON.stringify({ paused: paused(),
    pid: fs.existsSync(file('bridge.pid')) ? fs.readFileSync(file('bridge.pid'), 'utf8').trim() : null,
    pending: fs.existsSync(file('queue.json')) ? JSON.parse(fs.readFileSync(file('queue.json'), 'utf8')).length : 0,
    waiting: fs.existsSync(file('waiting.txt')) ? fs.readFileSync(file('waiting.txt'), 'utf8') : null }));
} else {
  await main();
}

async function main() {
  if (fs.existsSync(file('bridge.pid'))) {
    const previous = Number(fs.readFileSync(file('bridge.pid'), 'utf8'));
    try { process.kill(previous, 0); console.log('Pont déjà démarré.'); return; }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    fs.rmSync(file('bridge.pid'));
  }
  fs.writeFileSync(file('bridge.pid'), String(process.pid), { flag: 'wx' });
  fs.rmSync(file('stop'), { force: true });
  const queue = fs.existsSync(file('queue.json')) ? JSON.parse(fs.readFileSync(file('queue.json'), 'utf8')) : [];
  const saveQueue = () => {
    fs.writeFileSync(file('queue.tmp'), JSON.stringify(queue));
    fs.renameSync(file('queue.tmp'), file('queue.json'));
  };
  let busy = false;
  let readerChild;
  let shutdown = false;
  const cancel = () => paused() || shutdown || fs.existsSync(file('stop'));

  async function pump() {
    if (busy || cancel() || !queue.length) return;
    if (queue[0].sendUncertain) {
      fs.writeFileSync(file('paused'), '');
      log('envoi-deja-effectue-ou-incertain', 'Vérifier Claude, puis ignorer cette réponse avant reprise.');
      return;
    }
    busy = true;
    try {
      const item = queue[0];
      item.deliveryId ||= randomUUID();
      fs.writeFileSync(file('current.json'), JSON.stringify({ texte: item.text, lecture_id: item.deliveryId }));
      item.sendUncertain = true;
      saveQueue();
      const operation = run(file('Reader.exe'), [file('current.json')], {
        windowsHide: true, timeout: 3 * 60 * 1000, maxBuffer: 64 * 1024,
      });
      readerChild = operation.child;
      const result = await operation;
      for (const status of result.stdout.trim().split(/\r?\n/).filter(Boolean)) {
        log(status, `${item.sessionId}/${item.turnId}`);
      }
      queue.shift();
      saveQueue();
      fs.rmSync(file('waiting.txt'), { force: true });
      fs.rmSync(file('current.json'), { force: true });
    } catch (error) {
      queue[0].sendUncertain = /envoi-en-cours|message-envoye/.test(error.stdout || '');
      saveQueue();
      if (error.code === 3 && !queue[0].sendUncertain) {
        const reason = (error.stderr || 'Transfert en attente.').trim();
        if (!fs.existsSync(file('waiting.txt')) || fs.readFileSync(file('waiting.txt'), 'utf8') !== reason) {
          fs.writeFileSync(file('waiting.txt'), reason);
          log('attente', reason);
        }
        return;
      }
      fs.writeFileSync(file('paused'), '');
      log('erreur-pause', error.message);
    } finally { readerChild = null; busy = false; }
  }

  const tailer = new RolloutTailer({ sessionsDir: path.join(os.homedir(), '.codex/sessions'),
    onCompletion: item => {
      if (cancel()) return;
      if (queue.some(old => old.sessionId === item.sessionId && old.turnId === item.turnId)) return;
      queue.push(item);
      saveQueue();
      log('nouvelle-reponse', `${item.sessionId}/${item.turnId}`);
      void pump();
    }, onError: error => log('erreur-lecture', error.message) });
  function cleanup() {
    shutdown = true;
    readerChild?.kill();
    void tailer.close();
    if (fs.existsSync(file('bridge.pid')) && fs.readFileSync(file('bridge.pid'), 'utf8') === String(process.pid)) {
      fs.rmSync(file('bridge.pid'));
    }
  }
  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  await tailer.start();
  log('demarre', `pid=${process.pid}`);
  setInterval(() => {
    if (fs.existsSync(file('stop'))) process.exit(0);
    if (!busy && paused() && fs.existsSync(file('skip'))) {
      queue.shift();
      saveQueue();
      fs.rmSync(file('skip'), { force: true });
      log('reponse-abandonnee');
    }
    void pump();
  }, 2000);
}
