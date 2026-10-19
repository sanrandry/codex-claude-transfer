# Manuel d’installation et d’utilisation

## 1. Préparer le PC Windows

Installez ou vérifiez :

- Windows 10 ou Windows 11, avec les composants .NET Framework Windows disponibles ;
- [Node.js](https://nodejs.org/) version 18 ou supérieure, accessible dans le `PATH` ;
- Codex Desktop installé et connecté à votre compte ;
- Claude Desktop installé et connecté à votre compte, avec l’accès à la fonction de lecture audio souhaitée.

Le pont n’installe pas Node.js ou les applications. Si vous venez d’installer Node.js, ouvrez un nouveau terminal pour vérifier `node --version`. Aucun module npm, jeton API ou droit administrateur n’est nécessaire pour installer le pont.

Ouvrez Codex Desktop et créez une première conversation : le dossier `%USERPROFILE%\.codex\sessions` doit exister. Le pont utilise cet emplacement Windows standard. Il ne recherche pas les sessions d’une installation WSL ni celles déplacées vers un autre dossier.

## 2. Télécharger et installer

1. Ouvrez la page du dépôt GitHub.
2. Cliquez sur **Code**, puis **Download ZIP**.
3. Enregistrez le ZIP sur le PC, puis faites **Extraire tout** dans l’Explorateur Windows.
4. Ouvrez le dossier extrait. Conservez `Installer.cmd`, `install.mjs` et le dossier `payload` ensemble.
5. Double-cliquez sur **`Installer.cmd`**. Ne choisissez pas « Exécuter en tant qu’administrateur ».
6. Lisez le résultat avant de fermer la fenêtre.

Le dossier d’installation est :

```text
%USERPROFILE%\.codex\tools\claude-reader
```

L’installateur utilise les chemins du PC qui l’exécute. Il compile d'abord `payload/Reader.cs` avec le compilateur .NET Framework Windows pour produire `payload/Reader.exe`. Il crée ensuite un raccourci **`Codex vers Claude.lnk`** dans le dossier de démarrage Windows et lance le pont en arrière-plan. Il ne modifie pas le fichier de configuration de Codex ni sa commande `notify`.

Si un pont est déjà installé, l’installateur s’arrête pour préserver ses fichiers. Pour appliquer cette mise à jour :

1. Lancez `Arreter.cmd` dans le dossier installé.
2. Attendez que `bridge.pid` disparaisse de ce dossier.
3. Téléchargez et extrayez le nouveau paquet dans un autre dossier.
4. Depuis PowerShell, dans le nouveau dossier extrait, lancez `node install.mjs --check`. Cette commande compile le programme et le vérifie sans installer ni envoyer de message.
5. Copiez uniquement `Reader.exe`, `Reader.cs` et `settings.json` du nouveau dossier `payload` vers `%USERPROFILE%\.codex\tools\claude-reader`, en remplaçant ces fichiers.
6. Lancez `Reprendre.cmd` dans le dossier installé.

Cette mise à jour active le transfert en arrière-plan. Vos fichiers de conversation et de file d’attente restent en place.

## 3. Choisir la conversation Claude

1. Ouvrez vous-même Claude Desktop.
2. Gardez une seule fenêtre Claude ouverte.
3. Dans l’onglet Chat, ouvrez une conversation existante. Vous pouvez créer vous-même une conversation dédiée avant cette étape.
4. Vérifiez qu’aucun brouillon personnel, génération ou lecture audio n’est en cours.
5. Demandez une nouvelle réponse à Codex Desktop après le démarrage du pont.
6. Laissez cette conversation ouverte. Le paquet permet le transfert avec Claude en arrière-plan ; Claude peut reprendre le premier plan pendant l’envoi.

Au premier transfert, le pont enregistre l’URL de cette conversation dans `conversation.txt`. Les transferts suivants attendent que vous ouvriez cette même conversation. Le pont ne crée pas de chat et ne sélectionne pas de conversation à votre place.

Claude reçoit une consigne de reproduction et un objet JSON contenant `texte` et `lecture_id`. `lecture_id` est un identifiant technique de transfert ; il permet de reconnaître un brouillon du pont. Claude doit reproduire uniquement le champ `texte`.

Une fois la réponse de Claude terminée, cliquez sur **« Lire à voix haute »**. Le pont ne déclenche pas la lecture.

## 4. Fonctionnement au quotidien

Le pont surveille les nouvelles réponses finales de toutes les conversations Codex Desktop enregistrées dans le dossier de sessions Windows standard. Il ignore l’historique antérieur à son démarrage et les messages des sous-agents.

Le paquet active le transfert en arrière-plan avec ce fichier `settings.json` dans le dossier d’installation :

```json
{ "allowBackground": true }
```

Claude doit rester ouvert sur la conversation retenue. Le pont utilise ses contrôles d’accessibilité ; Claude peut reprendre le premier plan pendant l’envoi. Le fonctionnement avec une fenêtre réduite dépend de ces contrôles.

Remplacez `true` par `false`, ou retirez `settings.json`, pour rétablir l’attente du premier plan. Le réglage est relu à chaque tentative, sans redémarrage.

Si Claude est fermé, occupé ou ouvert sur un autre chat, les réponses restent en attente. Le transfert reprend automatiquement lorsque vous ouvrez vous-même la bonne conversation dans les conditions requises.

Les fichiers de commande se trouvent dans le dossier d’installation. Pour l’ouvrir : **Windows + R**, puis saisissez :

```text
%USERPROFILE%\.codex\tools\claude-reader
```

| Commande | Utilisation |
| --- | --- |
| `Pause.cmd` | Suspendre les transferts. Les réponses déjà en attente sont conservées ; les nouvelles réponses détectées pendant la pause sont ignorées. |
| `Reprendre.cmd` | Lever la pause et lancer le pont s’il est arrêté. |
| `Arreter.cmd` | Arrêter le processus. Le démarrage automatique reste configuré pour la prochaine ouverture de session Windows. |
| `Ignorer-erreur.cmd` | Lorsque le pont est en pause, retirer la première réponse en attente. Attendre deux secondes, puis lancer `Reprendre.cmd`. |
| `Start.vbs` | Lancer le pont manuellement. Une pause existante reste active. |

L’arrêt prend quelques secondes. Il n’efface pas la file d’attente. Les réponses produites pendant que le pont est arrêté ne sont pas récupérées à son redémarrage.

## 5. Comprendre une attente ou une erreur

Dans PowerShell, consultez l’état :

```powershell
node "$env:USERPROFILE\.codex\tools\claude-reader\bridge.mjs" --status
```

- `paused` : indique si une pause est active.
- `pid` : identifiant enregistré du processus du pont ; `null` si aucun identifiant n’est enregistré.
- `pending` : nombre de réponses dans la file, y compris celle en cours de traitement.
- `waiting` : dernière raison d’attente enregistrée ; elle peut rester affichée pendant une pause ou après un arrêt.

Les attentes normales reprennent automatiquement : bonne conversation à ouvrir, fenêtre Claude à afficher, brouillon à terminer, génération ou lecture en cours à laisser finir.

Pour une erreur réelle, le pont se met en pause. Consultez `bridge.log` dans le dossier d’installation. Si l’envoi a pu avoir lieu, vérifiez d’abord la conversation Claude : le pont ne réessaie pas automatiquement un envoi incertain, afin de limiter les doublons. Utilisez ensuite `Ignorer-erreur.cmd`, attendez deux secondes, puis `Reprendre.cmd` pour passer à la réponse suivante.

Un contrôle Claude introuvable peut venir d’une évolution de l’interface ou d’une langue différente du français et de l’anglais. Ne modifiez pas les fichiers de file d’attente pendant que le pont tourne.

## 6. Changer la conversation de destination

1. Lancez `Arreter.cmd`.
2. Attendez quelques secondes et vérifiez que `bridge.pid` a disparu du dossier d’installation.
3. Supprimez uniquement `conversation.txt` dans ce dossier.
4. Ouvrez vous-même la nouvelle conversation Claude existante.
5. Lancez `Reprendre.cmd`.

Le prochain transfert enregistrera la conversation affichée. Les réponses encore en attente seront alors envoyées à cette nouvelle destination.

## 7. Données et quota

Le pont lit les journaux locaux Codex pour détecter les fins de réponse. Il transmet à Claude le texte final, une consigne de reproduction et un identifiant de transfert, via l’interface de Claude Desktop.

| Emplacement ou fichier | Contenu |
| --- | --- |
| `%USERPROFILE%\.codex\sessions` | Journaux Codex d’origine, lus par le pont. |
| `queue.json` et `current.json` | Texte des réponses en attente ; retiré de ces fichiers après confirmation de l’envoi. |
| `conversation.txt` | URL de la conversation Claude choisie. |
| `bridge.log` | États et erreurs du pont ; le code n’y ajoute pas volontairement le texte des réponses. |
| Conversation Claude | Messages transférés et réponses générées par Claude, conservés dans votre compte. |

Chaque transfert utilise une requête Claude : le texte est lu puis reproduit par le modèle sélectionné. Cette consommation existe même si vous ne cliquez pas sur le bouton de lecture. L’historique de la conversation peut aussi augmenter le contexte utilisé. Le pont n’effectue pas d’appel IA supplémentaire à Codex.

Pour transférer le programme sur un autre PC, téléchargez le dépôt ou copiez le paquet d’installation d’origine. Ne copiez pas le dossier installé avec ses fichiers de données, journaux, brouillons ou files d’attente.

## 8. Désactiver durablement ou désinstaller

1. Faites **Windows + R**, saisissez `shell:startup` et validez.
2. Retirez uniquement le raccourci **`Codex vers Claude.lnk`**. Vous pouvez le déplacer ailleurs pour pouvoir le restaurer.
3. Lancez `Arreter.cmd` dans le dossier d’installation.
4. Attendez que `bridge.pid` disparaisse.

À ce stade, le pont est désactivé. Garder le dossier permet de le relancer manuellement avec `Reprendre.cmd`. Restaurer le raccourci dans `shell:startup` rétablit le démarrage automatique.

Pour supprimer aussi le programme et ses données locales, supprimez ensuite uniquement `%USERPROFILE%\.codex\tools\claude-reader`. N’effacez pas tout le dossier `.codex`. Les conversations déjà envoyées dans Claude restent disponibles dans votre compte Claude.

## Vérifications sans transfert

Depuis PowerShell, dans le dossier du dépôt extrait :

```powershell
node --test .\payload\watch.test.mjs .\payload\background.test.mjs
```

Ces tests vérifient la surveillance et certaines protections dans le code. Ils ne démontrent pas, à eux seuls, le fonctionnement avec votre version de Claude Desktop.

Pour compiler et vérifier le programme depuis ses sources sans installer le pont ni transmettre de message :

```powershell
node install.mjs --check
```

Un essai manuel de transfert reste nécessaire après installation pour vérifier le comportement réel sur le nouveau PC.
