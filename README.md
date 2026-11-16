# Entre Deux Rives

Jeu coopératif pour **deux joueurs sur deux PC**, où l'on ne se comprend qu'en observant les mouvements de l'autre dans le jeu. Pas de chat, pas de voix, pas de signal : le mouvement est le seul langage.

Deux cartographes descendent une vallée effacée par une crue. Leurs trajets, mis bout à bout, redessinent la carte perdue.

| Acte | Mécanique | Ce que je vois de l'autre |
| --- | --- | --- |
| 1. Les Deux Rives | Chacun sa rive ; on voit les pièges d'en face, jamais les siens | Son personnage |
| 2. Le Radeau | Un radeau, deux axes : l'un la barre, l'autre la perche | La trajectoire du radeau |
| 3. Les Traces | L'un marche dans la brume, l'autre guette du haut d'une tour | Ses empreintes, qui s'effacent |
| Finale | Les trois, enchaînées, rôles inversés | — |

Durée visée : environ 1 heure. Public : joueurs expérimentés.

## Lancer le jeu

Il faut Node.js 18 ou plus. Aucune dépendance à installer.

```bash
node server.js
```

Puis, sur chaque PC, ouvrir `http://ADRESSE-DU-SERVEUR:8080`.

- **Même réseau local** : lancer le serveur sur l'un des deux PC, l'autre ouvre `http://IP-DU-PREMIER:8080`.
- **À distance** : déployer sur Render (ci-dessous) et ouvrir l'adresse publique sur les deux PC.
- **Pour tester seul** : ouvrir deux fenêtres de navigateur sur le même PC.

Dans le lobby : l'un clique **Créer une partie** et donne le code de 4 lettres, l'autre l'entre dans **Rejoindre**. **Partie rapide** associe deux inconnus.

## Déployer sur Render

Le dépôt contient un `render.yaml`. Sur [Render → Blueprints](https://dashboard.render.com/select-repo?type=blueprint), choisir ce dépôt : un service web Node gratuit est créé, sans étape de build. Les WebSockets passent en `wss` automatiquement en https.

## Commandes

- **Se déplacer** : flèches, ZQSD ou WASD.
- **Action** : Espace ou E (tirer un levier, basculer une passerelle).
- **Radeau** : le Barreur utilise gauche/droite ; le Perchiste utilise bas (pousser) et haut (freiner).
- **Guetteur** : les flèches déplacent le curseur, l'action bascule la passerelle ou la vanne sous le curseur.

## Structure du code

```
server.js            serveur HTTP + WebSocket (sans dépendance), salons par code
public/
  levels.js          les 13 niveaux, en ASCII, avec leur légende
  sim.js             simulation partagée (tourne sur l'hôte ; l'invité reçoit des instantanés)
  render.js          rendu canvas, par point de vue : ce que l'autre ne doit pas voir n'est pas dessiné
  net.js             liaison WebSocket côté client
  main.js            lobby, boucle hôte/invité, HUD, carte finale
  index.html, style.css
test/check.js        vérifications sans navigateur : cartes, rendu, bots qui finissent chaque niveau
render.yaml          blueprint Render
```

### Modèle réseau

Un seul monde simulé : le PC de l'hôte fait tourner `sim.js` à 60 Hz et envoie un instantané 20 fois par seconde. L'invité envoie ses touches et affiche l'instantané. Chaque écran dessine depuis son rôle : les calques cachés ne sont jamais envoyés à l'affichage de l'autre.

### Ajouter ou modifier un niveau

Tout est dans `public/levels.js` : une carte ASCII et quelques objets (éboulis, sables mouvants, vannes). La légende est en tête du fichier. Ajouter l'entrée dans `sequence`, puis lancer les tests.

## Tests

```bash
npm test
```

Vérifie que chaque carte est régulière, que chaque niveau se dessine pour les deux joueurs, et que deux bots scriptés finissent chacun des 13 niveaux. Pour suivre un bot pas à pas : `TRACE="Le Gué" npm test`.

## Licence

MIT.
