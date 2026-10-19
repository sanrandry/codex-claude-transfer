import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'win32') throw new Error('Compilation disponible sur Windows uniquement.');
const root = path.dirname(fileURLToPath(import.meta.url));
const windows = process.env.WINDIR;
if (!windows) throw new Error('Le dossier Windows est introuvable.');
const framework = ['Framework64', 'Framework'].map(arch =>
  path.join(windows, 'Microsoft.NET', arch, 'v4.0.30319'))
  .find(folder => fs.existsSync(path.join(folder, 'csc.exe')));
if (!framework) throw new Error('Compilateur .NET Framework Windows introuvable.');
const args = ['/nologo', '/target:exe', '/out:' + path.join(root, 'payload', 'Reader.exe'),
  ...['UIAutomationClient.dll', 'UIAutomationTypes.dll', 'WindowsBase.dll']
    .map(name => '/reference:' + path.join(framework, 'WPF', name)),
  '/reference:System.Web.Extensions.dll', path.join(root, 'payload', 'Reader.cs')];
execFileSync(path.join(framework, 'csc.exe'), args, { windowsHide: true, stdio: 'inherit' });
console.log('Reader.exe compile depuis les sources.');
