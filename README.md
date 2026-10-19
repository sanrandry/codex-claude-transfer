# Codex → Claude Desktop

Un petit pont Windows pour envoyer les nouvelles réponses finales de Codex Desktop dans une conversation Claude Desktop existante, puis les écouter avec le bouton « Lire à voix haute » de Claude.

- Réutilise la même conversation Claude.
- Attend que vous placiez Claude au premier plan sur la conversation choisie avant de transférer.
- Laisse la lecture audio manuelle.
- Ignore l’historique antérieur au démarrage et les messages des sous-agents.
- Ne modifie pas la configuration `notify` de Codex.

## Installation rapide

Prérequis : Windows 10/11, Node.js 18 ou supérieur dans le `PATH`, .NET Framework Windows disponible, Codex Desktop et Claude Desktop déjà installés et connectés.

1. Sur GitHub, cliquez sur **Code → Download ZIP**.
2. Dans l’Explorateur Windows, faites **Extraire tout**. Ne lancez pas l’installation depuis le ZIP.
3. Ouvrez Codex Desktop et créez une première conversation si nécessaire.
4. Dans le dossier extrait, double-cliquez sur **`Installer.cmd`**, sans droits administrateur.
5. Ouvrez vous-même une conversation Claude existante, dans l’onglet Chat, puis demandez une nouvelle réponse à Codex.
6. Placez cette conversation au premier plan pour permettre le transfert. Une fois la réponse de Claude terminée, cliquez sur **« Lire à voix haute »**.

La conversation affichée au premier transfert devient la destination des suivants. L’installateur place le pont dans `%USERPROFILE%\.codex\tools\claude-reader` et configure son démarrage à l’ouverture de session Windows. Aucun `npm install`, compte développeur ni jeton API à fournir.

Le paquet attend le premier plan avec `"allowBackground": false` dans `settings.json`. Aucune action sur Claude n’est effectuée en arrière-plan. L’option `true` autorise explicitement le transfert en arrière-plan, mais Claude peut alors reprendre le premier plan pendant l’envoi. Le réglage est relu à chaque tentative.

Le [manuel d’installation](docs/INSTALLATION.md) détaille la configuration, les commandes, les erreurs et la désinstallation.

## Commandes

Les fichiers suivants se trouvent dans `%USERPROFILE%\.codex\tools\claude-reader` après installation :

| Fichier | Effet |
| --- | --- |
| `Pause.cmd` | Suspend les transferts. Les nouvelles réponses reçues pendant la pause sont ignorées. |
| `Reprendre.cmd` | Reprend les transferts et redémarre le pont s’il est arrêté. |
| `Arreter.cmd` | Arrête le pont jusqu’au prochain démarrage Windows ou lancement manuel. |
| `Ignorer-erreur.cmd` | Quand le pont est en pause, abandonne la première réponse en attente. Attendez deux secondes avant de reprendre. |

Fermer Claude ne désactive pas le pont : les réponses s’accumulent dans sa file locale. Utilisez `Pause.cmd` pour les ignorer.

## Données et consommation

Le pont lit les journaux locaux des conversations Codex Desktop dans `%USERPROFILE%\.codex\sessions`. Il surveille toutes les conversations présentes à cet emplacement, sans choix d’un chat source. Une installation Codex dans WSL ou un autre dossier n’est pas couverte automatiquement.

Chaque transfert envoie le texte et une courte consigne à Claude, qui doit le reproduire. Cela utilise le quota Claude, même sans lancer la lecture audio. La conversation Claude conserve les messages transférés. Les réponses en attente restent dans `queue.json` et `current.json`, puis sont retirées de ces fichiers après confirmation de l’envoi. N’ajoutez pas ces fichiers au dépôt.

## Limites

Le pont dépend du format des journaux Codex et des contrôles d’accessibilité de Claude Desktop en français ou en anglais. Une mise à jour peut nécessiter une adaptation. Il fonctionne avec une seule fenêtre Claude ouverte, une conversation existante, sans brouillon personnel ni génération ou lecture audio en cours.

Claude peut modifier le texte en le reproduisant. Cette solution ne garantit pas une transcription exacte et n’est pas une fonction officielle de Codex ou de Claude.

## Vérifications locales

Les vérifications sans transfert de message sont décrites dans le [manuel](docs/INSTALLATION.md#vérifications-sans-transfert). Un essai réel reste nécessaire sur chaque PC pour vérifier la compatibilité avec les versions des applications installées.

L'installation compile automatiquement `payload/Reader.exe` depuis `payload/Reader.cs`, avec le compilateur .NET Framework de Windows. Aucun exécutable téléchargé n'est requis. Pour le recompiler manuellement :

```powershell
node build.mjs
```
