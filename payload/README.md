# Transfert des réponses vers Claude Desktop

Le pont surveille les nouvelles réponses finales de Codex Desktop. Il réutilise une conversation Claude existante, puis lui demande de reproduire le texte. Il ne crée aucun chat. La lecture reste manuelle : cliquer sur « Lire à voix haute » dans Claude. Les messages des sous-agents et l'historique antérieur au démarrage sont ignorés, y compris après réécriture ou compaction d'un journal.

Le pont démarre maintenant et à l'ouverture de session Windows. Chaque réponse transférée utilise une requête Claude. Aucun premier plan, clavier, presse-papiers ou lancement de lecture automatique : seuls les contrôles d'accessibilité sont utilisés. Pour empêcher leur activation involontaire par l'application, ces contrôles ne sont actionnés que lorsque l'utilisateur a déjà placé Claude au premier plan. Les réponses attendent dans la file lorsque Claude est en arrière-plan, réduit ou fermé. La reproduction du texte dépend du modèle Claude sélectionné ; elle n'est pas une garantie de transcription exacte.

Ouvrir soi-même une conversation existante dans l'onglet Claude/Chat. Au premier transfert, son URL est retenue dans `conversation.txt` : les transferts suivants utilisent uniquement cette conversation. Si un autre chat est affiché, les réponses attendent le retour dans le chat retenu. Le pont ne lance, ne restaure et ne sélectionne aucune conversation. Les brouillons personnels, la génération en cours et la lecture audio en cours font également attendre le transfert.

## Commandes

- `Pause.cmd` : suspendre les transferts ; les réponses reçues pendant la pause sont ignorées.
- `Reprendre.cmd` : reprendre les transferts et démarrer le pont s'il est arrêté.
- `Arreter.cmd` : arrêter le pont jusqu'au prochain démarrage Windows ou lancement de `Start.vbs`.
- `Ignorer-erreur.cmd` : abandonner la réponse en erreur lorsque le pont est en pause, puis attendre deux secondes avant de reprendre.

Les situations d'attente normales reprennent automatiquement. Si une erreur réelle survient ou si le contrôle attendu reste absent, le pont se met en pause. Un envoi effectué ou incertain n'est jamais répété automatiquement : vérifier la conversation Claude, utiliser `Ignorer-erreur.cmd`, puis `Reprendre.cmd`. Un brouillon du pont peut être repris automatiquement si son contenu et son identifiant correspondent exactement à la réponse en attente.

Le statut se consulte avec `node bridge.mjs --status` ; `waiting` indique la raison d'une attente. `bridge.log` contient les états et erreurs, sans le texte des réponses. `queue.json` et `current.json` conservent localement les réponses en attente ; elles sont retirées après envoi confirmé par la remise à vide du champ de saisie.

## Installation locale

- Le `notify` existant de Codex reste intact.
- Bibliothèques Windows et Node déjà installés ; aucun téléchargement ni clé API.
- `Reader.cs` utilise Windows UI Automation, sans lien ouvrant l'application au premier plan.
- Le format des journaux locaux est celui vérifié lors de l'installation ; une évolution de Codex ou de l'interface Claude peut nécessiter une adaptation.
- Démarrage automatique : raccourci `Codex vers Claude.lnk` dans le dossier Windows `shell:startup`. Retirer ce raccourci, puis lancer `Arreter.cmd`, pour désactiver durablement le pont.

## Vérification

`node --test watch.test.mjs background.test.mjs` vérifie l'exclusion de l'historique, la déduplication, les sous-agents, les lignes UTF-8 partielles et l'absence des appels d'activation, de création de chat et de lecture automatique. `Reader.exe --self-test` vérifie la conservation du texte dans le message JSON. Le garde de premier plan a été vérifié avec Claude en arrière-plan : le transfert est différé sans action sur l'application.
