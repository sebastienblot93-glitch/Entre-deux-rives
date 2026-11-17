/*
 * Entre Deux Rives — données des niveaux
 *
 * Toutes les cartes sont en ASCII. Une lettre = une case (tuile de 32 px).
 *
 * Légende commune
 *   #  mur, rocher, roseaux (infranchissable)
 *   .  sol
 *   ~  eau profonde / fleuve (infranchissable à pied)
 *   X  sortie (Rives : chaque joueur doit être sur un X de sa rive ;
 *      Traces : le Marcheur doit l'atteindre ; Radeau : ligne d'arrivée)
 *
 * Rives (acte 1)
 *   W / E   départ du joueur ouest / est
 *   f       dalle fragile : mortelle, invisible depuis sa propre rive
 *   1 2 3   levier portant le numéro n ; un levier ouest et un levier est
 *           de même numéro, tirés à moins de 0,8 s d'écart, forment une paire
 *   A B C   portes fermées, ouvertes par une paire (pairOpens) ou par
 *           l'ordre complet (onOrderComplete), ou tenues ouvertes par une plaque
 *   a b c   plaque : tant qu'un joueur est dessus, les portes de même lettre s'ouvrent
 *   =       pont de corde : s'effondre si les deux joueurs ont plus de 2 cases d'écart en hauteur
 *   rockfalls : zones d'éboulis cycliques, visibles seulement depuis la rive d'en face
 *
 * Radeau (acte 2) — la rivière coule du haut vers le bas
 *   S  départ du radeau
 *   R  rocher (vu par le Barreur seulement) : arrache une planche
 *   O  tourbillon (vu par le Perchiste seulement) : renvoie 2 cases en amont
 *   (  banc de sable, on en sort par la gauche   (vu par le Perchiste)
 *   )  banc de sable, on en sort par la droite   (vu par le Perchiste)
 *   F  fragment de carte (vu par les deux)
 *   C  ligne de point de repos : planches réparées, retour ici en cas de naufrage
 *   current : vitesse du courant en cases par seconde
 *
 * Traces (acte 3)
 *   S       départ du Marcheur
 *   A à F   passerelle fermée au départ (infranchissable), basculée par le Guetteur
 *   a à f   la même passerelle, mais ouverte au départ (une lettre = une passerelle)
 *   %       chenal : inondé à marée haute si sa vanne est ouverte
 *   1 à 6   interrupteur caché dans les roseaux (vu par le Marcheur seulement) ;
 *           tant que le Marcheur est dessus, la passerelle A/B/C… correspondante
 *           peut être basculée même si elle est verrouillée (locked)
 *   quicksand : sables mouvants, vus par le Guetteur seulement ; ils se déplacent
 *   valves    : vannes ; couple = deux vannes liées (en fermer une inonde l'autre chenal)
 *   tide      : période de la marée en secondes (haute pendant la seconde moitié)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LEVELS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const maps = {};

  /* ---------------------------------------------------------------- */
  /* PROLOGUE                                                           */
  /* ---------------------------------------------------------------- */

  maps.serment = {
    map: [
      '################',
      '#..............#',
      '#..W........E..#',
      '#..............#',
      '#......XX......#',
      '#......XX......#',
      '#..............#',
      '#..............#',
      '#..............#',
      '################',
    ],
  };

  /* ---------------------------------------------------------------- */
  /* ACTE 1 — LES DEUX RIVES  (30 x 18, fleuve colonnes 13 à 16)        */
  /* ---------------------------------------------------------------- */

  // Le Gué : deux paires de leviers jumeaux, sans danger.
  maps.rives1 = {
    map: [
      '##############################',
      '#.....W......~~~~......E.....#',
      '#............~~~~............#',
      '#..1.........~~~~............#',
      '#............~~~~...........1#',
      '#............~~~~............#',
      '####AA#######~~~~######AA#####',
      '#............~~~~............#',
      '#...........2~~~~............#',
      '#............~~~~2...........#',
      '#............~~~~............#',
      '######BB#####~~~~#####BB######',
      '#............~~~~............#',
      '#............~~~~............#',
      '#............~~~~............#',
      '#.....X......~~~~......X.....#',
      '#............~~~~............#',
      '##############################',
    ],
    pairOpens: { 1: 'A', 2: 'B' },
  };

  // Le Miroir : chaque rive a son champ de dalles fragiles et son éboulis.
  // Le chemin sûr n'est visible que depuis la rive d'en face.
  maps.rives2 = {
    map: [
      '##############################',
      '#W...........~~~~...........E#',
      '#............~~~~............#',
      '#fffffffff.ff~~~~............#',
      '#ffffff....ff~~~~............#',
      '#ffffff.fffff~~~~............#',
      '#ff.....fffff~~~~............#',
      '#ff.fffffffff~~~~............#',
      '#ff.fffffffff~~~~............#',
      '#............~~~~............#',
      '#............~~~~ff.fffffffff#',
      '#............~~~~ff....ffffff#',
      '#............~~~~fffff.ffffff#',
      '#............~~~~fffff.....ff#',
      '#............~~~~fffffffff.ff#',
      '#.....X......~~~~fffffffff.ff#',
      '#............~~~~.........X..#',
      '##############################',
    ],
    rockfalls: [
      { x: 1, y: 2, w: 12, h: 1, period: 3.0, active: 0.7, phase: 0 },
      { x: 17, y: 8, w: 12, h: 2, period: 3.0, active: 0.7, phase: 1.5 },
    ],
  };

  // Le Pont-Levis : trois paires à tirer dans l'ordre 1, 2, 3.
  // Chacun voit les numéros des leviers d'en face, pas des siens.
  // Puis un pont de corde à traverser au même pas.
  maps.rives3 = {
    map: [
      '##############################',
      '#W...........~~~~...........E#',
      '#.2..........~~~~..........1.#',
      '#............~~~~............#',
      '#............~~~~............#',
      '#............~~~~............#',
      '#.3..........~~~~..........2.#',
      '#............~~~~............#',
      '#............~~~~............#',
      '#............~~~~............#',
      '#.1..........~~~~..........3.#',
      '#............~~~~............#',
      '######AA#####~~~~#####AA######',
      '######==#####~~~~#####==######',
      '######==#####~~~~#####==######',
      '######==#####~~~~#####==######',
      '######XX#####~~~~#####XX######',
      '##############################',
    ],
    order: [1, 2, 3],
    onOrderComplete: 'A',
    hideOwnNumbers: true,
  };

  /* ---------------------------------------------------------------- */
  /* ACTE 2 — LE RADEAU  (20 de large, défilement vertical)             */
  /* ---------------------------------------------------------------- */

  // Le Slalom : pas de courant, rochers et tourbillons alternés.
  maps.radeau1 = {
    current: 0,
    map: [
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~S~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~R~~~~~~~~~####',
      '####~~~~~~~~~R~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~O~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~RR~~~~~~~~~####',
      '####~~~~~~~~~RR~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~O~~~~~####',
      '####~~~~~~~~~~~~####',
      '####CCCCCCCCCCCC####',
      '####~~~~~~~~~~~~####',
      '####~~~R~~~~R~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~O~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~F~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~)~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~RRR~~~~~~~####',
      '####~~~~~~~~RRR~####',
      '####~~~~~~~~~~~~####',
      '####~~~O~~~~O~~~####',
      '####~~~~~~~~~~~~####',
      '####CCCCCCCCCCCC####',
      '####~~~~~~~~~~~~####',
      '####~~~~~F~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~R~~~~~~~~R~####',
      '####~~~~~O~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####XXXXXXXXXXXX####',
      '####~~~~~~~~~~~~####',
      '####################',
    ],
  };

  // Les Passes : le courant pousse en continu, goulets en diagonale.
  maps.radeau2 = {
    current: 2.0,
    map: [
      '####~~~~~~~~~~~~####',
      '####~~~~~S~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '#####~~~~~~~~~~~####',
      '######~~~~~~~~~#####',
      '#######~~~~~~~######',
      '########~~~~~~######',
      '#########~~~~~~#####',
      '##########~~~~~~####',
      '###########~~~~~####',
      '##########~~~~~~####',
      '#########~~~~~~~####',
      '########~~~~~~~~####',
      '#######~~~~~~~~~####',
      '######~~~~~~~~~~####',
      '#####~~~~~~O~~~~####',
      '####~~~~~~~~~~~~####',
      '####CCCCCCCCCCCC####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~#####',
      '####~~~~~~~~~~######',
      '####~~~~~~~~~#######',
      '####~~~~R~~~########',
      '####~~~~~~~#########',
      '####~~~~~~##########',
      '####~~~~~~~#########',
      '####~~~~~~~~########',
      '####~~~~~~~~~#######',
      '####~~~~~~~~~~######',
      '####~~~F~~~~~~~#####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####CCCCCCCCCCCC####',
      '####~~~~~~~~~~~~####',
      '#####~~~~~~~~~~~####',
      '######~~~~R~~~~~####',
      '#######~~~~~~~~~####',
      '########~~~~~~~~####',
      '#########~~~~~~~####',
      '##########~~~~~~####',
      '###########~~~~~####',
      '##########~~~~~~####',
      '#########~~~~~~~####',
      '########~~~~~~~~####',
      '#######~~~O~~~~~####',
      '######~~~~~~~~~~####',
      '#####~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####XXXXXXXXXXXX####',
      '####################',
    ],
  };

  // La Cascade : courant fort, fragments à attraper au passage.
  maps.radeau3 = {
    current: 3.5,
    map: [
      '####~~~~~~~~~~~~####',
      '####~~~~~S~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~R~~~~~~~~~~####',
      '####~~~~~~~~~~R~####',
      '####~~~~~F~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~O~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~R~~~~~~R~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~F~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~(~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####CCCCCCCCCCCC####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~RR~~~~~~~####',
      '####~~~~~~~~~RR~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~O~~~~~####',
      '####~~~F~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~R~~~R~~~R~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~)~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~F~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####CCCCCCCCCCCC####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~O~~~O~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~RR~~~~~~RR~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~F~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####XXXXXXXXXXXX####',
      '####~~~~~~~~~~~~####',
      '####################',
    ],
  };

  /* ---------------------------------------------------------------- */
  /* ACTE 3 — LES TRACES  (30 x 18)                                      */
  /* ---------------------------------------------------------------- */

  // La Brume : deux chemins, des passerelles fermées, des sables mouvants
  // qui se déplacent. Le Guetteur ouvre la bonne passerelle au bon moment.
  maps.traces1 = {
    map: [
      '##############################',
      '#S....#....~~~~~~~#..........#',
      '#.....#....~~~~~~~#..........#',
      '#.....A....~~~~~~~#..........#',
      '#.....#....~~~~~~~#..........#',
      '###B###....~~~~~~~#..........#',
      '#.....#....~~~~~~~#..........#',
      '#.....#....~~~~~~~#..........#',
      '#.....#.......C...........X..#',
      '#.....#....~~~~~~~#..........#',
      '#.....#....~~~~~~~#..........#',
      '#.....#....~~~~~~~#..........#',
      '#.....#....~~~~~~~#..........#',
      '#.....e....~~~~~~~#..........#',
      '#.....#....~~~~~~~#..........#',
      '#.....#...........D..........#',
      '#.....#....~~~~~~~#..........#',
      '##############################',
    ],
    quicksand: [
      { x: 7, y: 7, w: 4, h: 2, axis: 'y', amp: 6, period: 12 },
      { x: 22, y: 3, w: 3, h: 3, axis: 'x', amp: 3, period: 9 },
      { x: 22, y: 11, w: 3, h: 3, axis: 'x', amp: 3, period: 7 },
    ],
    tide: { period: 16 },
  };

  // Les Roseaux : l'information s'inverse. Le Marcheur trouve des
  // interrupteurs que le Guetteur ne voit pas ; les passerelles A et B
  // sont verrouillées tant qu'il n'est pas dessus.
  maps.traces2 = {
    map: [
      '##############################',
      '#S...#......##...............#',
      '#....#..##..##..~~~~~........#',
      '#.##.#..#1..##..~~~~~....##..#',
      '#.##.#..##..##..~~~~~....#2..#',
      '#.#..........A...........##..#',
      '#.#..#####..##...............#',
      '#.#..#......##...~~~~~.......#',
      '#.#..#.####.##...~~~~~.......#',
      '#....#......##...~~~~~.......#',
      '#.#####.....##...............#',
      '#...........##...............#',
      '#.####.####.##########BB######',
      '#...........##...............#',
      '#.#########.##...............#',
      '#...........##.............X.#',
      '#...........##...............#',
      '##############################',
    ],
    locked: ['A', 'B'],
    quicksand: [
      { x: 7, y: 10, w: 4, h: 2, axis: 'x', amp: 0, period: 1 },
      { x: 17, y: 10, w: 3, h: 2, axis: 'x', amp: 4, period: 10 },
      { x: 17, y: 14, w: 3, h: 2, axis: 'x', amp: 4, period: 8 },
    ],
    tide: { period: 16 },
  };

  // Le Phare de l'estuaire : la marée monte dans les chenaux. Les vannes
  // V1 et V2 sont liées : en fermer une garde son chenal à sec mais inonde
  // l'autre en permanence. La passerelle B est verrouillée par
  // l'interrupteur 2, sur l'île.
  maps.traces3 = {
    map: [
      '##############################',
      '#S....~~~~~~~~~~~~~~~~~~~~~~~#',
      '#.....~~~~~~~~~~~~~~~~~~~~~~~#',
      '#.....%%%%%%%....~~~~~~~~....#',
      '#.....~~~~~~~....~~~~~~~~....#',
      '#.....~~~~~~~..2.~~~~~~~~....#',
      '#.....~~~~~~~....%%%%BB%%....#',
      '#.....~~~~~~~....~~~~~~~~....#',
      '#.....~~~~~~~....~~~~~~~~....#',
      '#.....~~~~~~~~~~~~~~~~~~~....#',
      '#.....~~~~~~~~~~~~~~~~~~~..X.#',
      '#.....~~~~~~~~~~~~~~~~~~~....#',
      '#.....~~~~~~~~~~~~~~~~~~~....#',
      '#.....%%%%%%%%%%%%%%%%%%%....#',
      '#.....~~~~~~~~~~~~~~~~~~~....#',
      '#.....~~~~~~~~~~~~~~~~~~~....#',
      '#.....~~~~~~~~~~~~~~~~~~~....#',
      '##############################',
    ],
    locked: ['B'],
    valves: [
      { id: 'V1', x: 3, y: 3, rect: [6, 3, 7, 1], couple: 'V2' },
      { id: 'V2', x: 15, y: 7, rect: [17, 6, 8, 1], couple: 'V1' },
      { id: 'V3', x: 3, y: 13, rect: [6, 13, 19, 1] },
    ],
    quicksand: [
      { x: 25, y: 7, w: 2, h: 2, axis: 'y', amp: 3, period: 10 },
      { x: 26, y: 14, w: 2, h: 2, axis: 'y', amp: 2, period: 7 },
    ],
    tide: { period: 16 },
  };

  /* ---------------------------------------------------------------- */
  /* FINALE — L'ESTUAIRE  (les trois mécaniques, rôles inversés)        */
  /* ---------------------------------------------------------------- */

  maps.estuaireRives = {
    map: [
      '##############################',
      '#W...........~~~~...........E#',
      '#............~~~~............#',
      '#............~~~~............#',
      '#..1.........~~~~............#',
      '#............~~~~............#',
      '#............~~~~............#',
      '#............~~~~............#',
      '#............~~~~.........1..#',
      '#............~~~~............#',
      '#####AA######~~~~######AA#####',
      '#####==######~~~~######==#####',
      '#####==######~~~~######==#####',
      '#####==######~~~~######==#####',
      '#####==######~~~~######==#####',
      '#####XX######~~~~######XX#####',
      '#............~~~~............#',
      '##############################',
    ],
    pairOpens: { 1: 'A' },
    rockfalls: [
      { x: 1, y: 6, w: 12, h: 1, period: 3.5, active: 0.8, phase: 0 },
      { x: 17, y: 3, w: 12, h: 1, period: 3.5, active: 0.8, phase: 1.75 },
    ],
  };

  maps.estuaireRadeau = {
    current: 2.5,
    map: [
      '####~~~~~~~~~~~~####',
      '####~~~~~S~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~R~~~~~~O~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '#####~~~~~~~~~~~####',
      '######~~~R~~~~~#####',
      '#######~~~~~~~######',
      '########~~~~~~######',
      '#######~~~~O~~~#####',
      '######~~~~~~~~~~####',
      '#####~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~F~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####CCCCCCCCCCCC####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~(~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~RR~~~~RR~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~O~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~F~~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~R~~~~R~~~####',
      '####~~~~~~~~~~~~####',
      '####~~~~~~~~~~~~####',
      '####XXXXXXXXXXXX####',
      '####~~~~~~~~~~~~####',
      '####################',
    ],
  };

  maps.estuaireTraces = {
    map: [
      '##############################',
      '#.....#......~~~~~~~.........#',
      '#.S...A......~~~~~~~.........#',
      '#.....#......~~~~~~~.........#',
      '###B###......%%%%%%%.........#',
      '#.....#......~~~~~~~.........#',
      '#.....#......~~~~~~~...3.....#',
      '#.....#......~~~~~~~.........#',
      '#.....#......~~~~~~~.........#',
      '#.....#......~~~~~~~.........#',
      '#.....b......%%%%%%%.........#',
      '#.....#......~~~~~~~.........#',
      '#.....#......~~~~~~~.........#',
      '#.....#......~~~~~~~..#####..#',
      '#.....#......~~~~~~~..#...#..#',
      '#.....#......~~~~~~~..C.X.#..#',
      '#.....#......~~~~~~~..#####..#',
      '##############################',
    ],
    locked: ['C'],
    valves: [
      { id: 'V1', x: 10, y: 3, rect: [13, 4, 7, 1], couple: 'V2' },
      { id: 'V2', x: 10, y: 11, rect: [13, 10, 7, 1], couple: 'V1' },
    ],
    quicksand: [
      { x: 20, y: 6, w: 2, h: 2, axis: 'y', amp: 4, period: 9 },
      { x: 9, y: 7, w: 2, h: 2, axis: 'y', amp: 3, period: 8 },
    ],
    tide: { period: 14 },
  };

  /* ---------------------------------------------------------------- */
  /* SÉQUENCE DE LA PARTIE                                              */
  /* ---------------------------------------------------------------- */

  const sequence = [
    { act: 'Prologue', title: 'Le Serment du silence', mode: 'rives', level: 'serment', goal: 'Amenez vos deux personnages sur les 4 cercles du centre. Chacun ne bouge que le sien.', intro: 'Posez tous deux la main sur la pierre.' },

    { act: 'Acte 1 · Les Deux Rives', title: 'Le Gué', mode: 'rives', level: 'rives1', goal: 'Tirez en même temps (Espace) les deux leviers de même numéro, un sur chaque rive : la porte s’ouvre. Puis allez chacun sur le cercle de sortie de votre rive.', intro: 'Deux leviers de même numéro, tirés ensemble, ouvrent une porte.' },
    { act: 'Acte 1 · Les Deux Rives', title: 'Le Miroir', mode: 'rives', level: 'rives2', goal: 'Votre rive cache des dalles fragiles que seul votre partenaire voit. Montrez-lui le chemin sûr en marchant dessus côté d’en face, puis rejoignez la sortie.', intro: 'Vous voyez les pièges de la rive d’en face, jamais les vôtres.' },
    { act: 'Acte 1 · Les Deux Rives', title: 'Le Pont-Levis', mode: 'rives', level: 'rives3', goal: 'Tirez les paires de leviers dans l’ordre 1, 2, 3. Sur le pont de corde, avancez à la même hauteur que votre partenaire.', intro: 'Trois paires, dans l’ordre. Puis un pont qui ne tient qu’au même pas.' },

    { act: 'Acte 2 · Le Radeau', title: 'Le Slalom', mode: 'radeau', level: 'radeau1', goal: 'Barreur : gauche/droite pour éviter les rochers. Perchiste : bas pour avancer, haut pour freiner, et évitez tourbillons et bancs de sable. Atteignez la ligne d’arrivée.', intro: 'Un radeau, deux perches : l’un tient le cap, l’autre la vitesse.' },
    { act: 'Acte 2 · Le Radeau', title: 'Les Passes', mode: 'radeau', level: 'radeau2', goal: 'Même chose, mais le courant pousse sans arrêt. Le Barreur voit les rochers, le Perchiste les tourbillons.', intro: 'Le courant ne s’arrête plus.' },
    { act: 'Acte 2 · Le Radeau', title: 'La Cascade', mode: 'radeau', level: 'radeau3', goal: 'Ramassez les fragments de carte en passant dessus, puis atteignez la ligne d’arrivée.', intro: 'Attrapez les fragments au passage.' },

    { act: 'Acte 3 · Les Traces', title: 'La Brume', mode: 'traces', level: 'traces1', goal: 'Guetteur : déplacez le curseur et appuyez sur Espace pour basculer les passerelles. Marcheur : avancez dans la brume jusqu’à la sortie.', intro: 'Le Guetteur ne voit que des empreintes. Le Marcheur ne voit que ses pieds.' },
    { act: 'Acte 3 · Les Traces', title: 'Les Roseaux', mode: 'traces', level: 'traces2', goal: 'Une passerelle est verrouillée : le Marcheur doit se tenir sur l’interrupteur caché dans les roseaux pendant que le Guetteur la bascule.', intro: 'Certaines passerelles sont verrouillées. La clé est dans les roseaux.' },
    { act: 'Acte 3 · Les Traces', title: 'Le Phare de l’estuaire', mode: 'traces', level: 'traces3', goal: 'Le Guetteur ouvre et ferme les vannes pour que la marée n’inonde pas le chenal du Marcheur. Lui seul voit les sables mouvants.', intro: 'La marée monte dans les chenaux.' },

    { act: 'Finale · L’Estuaire', title: 'Les rives de l’estuaire', mode: 'rives', level: 'estuaireRives', goal: 'Comme l’acte 1, rives inversées : leviers ensemble, éboulis visibles d’en face, pont au même pas.', swap: true, intro: 'Rives inversées.' },
    { act: 'Finale · L’Estuaire', title: 'La traversée', mode: 'radeau', level: 'estuaireRadeau', goal: 'Comme l’acte 2, rôles échangés : le Barreur devient Perchiste et inversement.', swap: true, intro: 'Perches échangées.' },
    { act: 'Finale · L’Estuaire', title: 'La dernière pierre', mode: 'traces', level: 'estuaireTraces', goal: 'Comme l’acte 3, rôles échangés : celui qui marchait guide depuis le phare.', swap: true, intro: 'Celui qui marchait monte au phare.' },
  ];

  return { maps, sequence };
});
