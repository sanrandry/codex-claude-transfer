import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const source = path.join(path.dirname(fileURLToPath(import.meta.url)), 'payload');
const repository = path.dirname(fileURLToPath(import.meta.url));
const destination = path.join(os.homedir(), '.codex/tools/claude-reader');
const names = ['bridge.mjs', 'watch.mjs', 'watch.test.mjs', 'background.test.mjs', 'Reader.cs', 'Reader.exe', 'README.md'];
const vbsString = value => '"' + value.replaceAll('"', '""') + '"';
const quoted = value => '"' + value + '"';

async function install() {
  if (process.platform !== 'win32') throw new Error('Ce paquet est reserve a Windows.');
  if (Number(process.versions.node.split('.')[0]) < 18) throw new Error('Node.js 18 ou plus recent est requis.');
  if (!fs.existsSync(path.join(source, 'Reader.exe'))) {
    execFileSync(process.execPath, [path.join(repository, 'build.mjs')], { windowsHide: true, stdio: 'inherit' });
  }
  for (const name of names) {
    if (!fs.statSync(path.join(source, name)).isFile()) throw new Error('Fichier du paquet absent : ' + name);
  }
  execFileSync(path.join(source, 'Reader.exe'), ['--self-test'], { windowsHide: true, timeout: 15000 });
  if (process.argv.includes('--check')) {
    console.log('Paquet et runtime valides. Aucune installation effectuee.');
    return;
  }
  if (!fs.existsSync(path.join(os.homedir(), '.codex/sessions'))) {
    throw new Error('Ouvrez Codex Desktop et creez une premiere conversation, puis relancez l installation.');
  }
  if (fs.existsSync(path.join(destination, 'bridge.mjs'))) {
    throw new Error('Un pont existe deja dans ' + destination + '. Installation annulee pour le conserver.');
  }
  fs.mkdirSync(destination, { recursive: true });
  for (const name of names) fs.copyFileSync(path.join(source, name), path.join(destination, name));

  const bridge = quoted(process.execPath) + ' ' + quoted(path.join(destination, 'bridge.mjs'));
  fs.writeFileSync(path.join(destination, 'Start.vbs'),
    'Set shell = CreateObject("WScript.Shell")\r\n'
    + 'shell.Run ' + vbsString(bridge) + ', 0, False\r\n');
  const controls = { 'Pause.cmd': '--pause', 'Arreter.cmd': '--stop', 'Ignorer-erreur.cmd': '--skip', 'Reprendre.cmd': '--resume' };
  for (const [name, command] of Object.entries(controls)) {
    const restart = command === '--resume' ? '\r\nwscript.exe "%~dp0Start.vbs"' : '';
    // Current directory is resolved by cmd at launch, not inherited from this PC.
    fs.writeFileSync(path.join(destination, name),
      '@echo off\r\n' + quoted(process.execPath) + ' "%~dp0bridge.mjs" ' + command + restart + '\r\n');
  }
  const setupFile = path.join(destination, 'startup.vbs');
  fs.writeFileSync(setupFile,
    'Set shell = CreateObject("WScript.Shell")\r\n'
    + 'Set files = CreateObject("Scripting.FileSystemObject")\r\n'
    + 'root = files.GetParentFolderName(WScript.ScriptFullName)\r\n'
    + 'linkPath = files.BuildPath(shell.SpecialFolders("Startup"), "Codex vers Claude.lnk")\r\n'
    + 'If files.FileExists(linkPath) Then\r\n'
    + '  WScript.Echo "Un raccourci de meme nom existe deja. Installation du demarrage annulee."\r\n'
    + '  WScript.Quit 1\r\n'
    + 'End If\r\n'
    + 'Set link = shell.CreateShortcut(linkPath)\r\n'
    + 'link.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%\\System32\\wscript.exe")\r\n'
    + 'link.Arguments = Chr(34) & files.BuildPath(root, "Start.vbs") & Chr(34)\r\n'
    + 'link.WorkingDirectory = root\r\n'
    + 'link.Description = "Lecture des nouvelles reponses dans Claude Desktop"\r\n'
    + 'link.Save\r\n'
    + 'shell.Run Chr(34) & link.TargetPath & Chr(34) & " " & link.Arguments, 0, False\r\n');
  execFileSync('cscript.exe', ['//nologo', setupFile], { windowsHide: true, timeout: 15000, stdio: 'pipe' });
  for (let attempt = 0; attempt < 25; attempt++) {
    await delay(200);
    const pidFile = path.join(destination, 'bridge.pid');
    if (fs.existsSync(pidFile)) {
      try {
        process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 0);
        console.log('Installe et actif : ' + destination);
        console.log('Demarrage automatique Windows configure. Pause.cmd et Reprendre.cmd sont dans ce dossier.');
        return;
      } catch { /* Allow the initial launch to finish. */ }
    }
  }
  throw new Error('Fichiers installes, mais le demarrage doit etre verifie dans ' + destination + '.');
}

try { await install(); }
catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
