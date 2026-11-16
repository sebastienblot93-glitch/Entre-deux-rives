/*
 * Vérifications automatiques, sans navigateur :
 *   node test/check.js
 *
 * 1. Les cartes sont régulières et contiennent ce qu'il faut.
 * 2. Le rendu de chaque niveau, de chaque point de vue, ne lève aucune erreur
 *    (contexte canvas simulé).
 * 3. Deux bots silencieux finissent chaque niveau (parcours scriptés).
 */
'use strict';

const path = require('path');
const LEVELS = require(path.join(__dirname, '..', 'public', 'levels.js'));
const S = require(path.join(__dirname, '..', 'public', 'sim.js'));

let failures = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { failures++; console.log('  ✗ ' + msg); } }

/* ---------------------------------------------------------------- */
/* 1. Cartes                                                          */
/* ---------------------------------------------------------------- */

console.log('\n1. Cartes');
for (const entry of LEVELS.sequence) {
  const raw = LEVELS.maps[entry.level];
  const w = raw.map[0].length;
  const regular = raw.map.every((r) => r.length === w);
  const text = raw.map.join('');
  let need = [];
  if (entry.mode === 'rives') need = ['W', 'E', 'X'];
  if (entry.mode === 'radeau') need = ['S', 'X', 'C'];
  if (entry.mode === 'traces') need = ['S', 'X'];
  const has = need.every((c) => text.includes(c));
  ok(regular && has, entry.level + ' : ' + w + 'x' + raw.map.length + ', tuiles requises présentes');
}

/* ---------------------------------------------------------------- */
/* 2. Rendu                                                           */
/* ---------------------------------------------------------------- */

console.log('\n2. Rendu (canvas simulé)');
const fakeCtx = () => {
  const canvas = { width: 0, height: 0 };
  const grad = { addColorStop() {} };
  return new Proxy({ canvas }, {
    get(target, prop) {
      if (prop === 'canvas') return canvas;
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => grad;
      if (prop === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set() { return true; },
  });
};
global.self = global;
global.Sim = S;
require(path.join(__dirname, '..', 'public', 'render.js'));
const Render = global.Render;
{
  const g = S.createGame(LEVELS);
  let errors = 0;
  for (let li = 0; li < LEVELS.sequence.length; li++) {
    S.loadLevel(g, li);
    for (const phase of ['intro', 'play', 'dead', 'won']) {
      g.phase = phase; g.pt = 0.3;
      if (phase === 'dead') g.reveal = { kind: 'fragile', tiles: [{ x: 1, y: 1 }], zone: { x: 1, y: 1, w: 2, h: 1 }, rect: { x: 1, y: 1, w: 1, h: 1 }, x: 1, y: 1 };
      for (const viewer of [0, 1]) {
        try { Render.draw(fakeCtx(), g, viewer); } catch (e) { errors++; console.log('    erreur', LEVELS.sequence[li].level, phase, viewer, e.message); }
      }
    }
  }
  try { Render.drawFinalMap({ width: 1200, height: 900, getContext: () => fakeCtx() }, LEVELS, g.tracks, 'test'); } catch (e) { errors++; console.log('    erreur carte finale', e.message); }
  ok(errors === 0, 'tous les niveaux se dessinent pour les deux joueurs et toutes les phases');
}

/* ---------------------------------------------------------------- */
/* 3. Bots                                                            */
/* ---------------------------------------------------------------- */

console.log('\n3. Niveaux finissables par des bots');

const DT = 1 / 60;

function bfs(L, passable, from, to) {
  const key = (x, y) => y * L.w + x;
  const prev = new Map();
  const q = [from];
  prev.set(key(from.x, from.y), null);
  while (q.length) {
    const c = q.shift();
    if (c.x === to.x && c.y === to.y) {
      const out = [];
      for (let k = key(c.x, c.y), n = c; n; n = prev.get(k), k = n ? key(n.x, n.y) : 0) { out.push(n); if (prev.get(k) === null) break; }
      return out.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      if (prev.has(key(nx, ny))) continue;
      if (!passable(nx, ny)) continue;
      prev.set(key(nx, ny), c);
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}

function tileOf(p) { return { x: Math.floor(p.x), y: Math.floor(p.y) }; }

function steer(inp, p, target) {
  const dx = target.x + 0.5 - p.x, dy = target.y + 0.5 - p.y;
  inp.left = dx < -0.06; inp.right = dx > 0.06; inp.up = dy < -0.06; inp.down = dy > 0.06;
  return Math.abs(dx) <= 0.06 && Math.abs(dy) <= 0.06;
}
function stop(inp) { inp.left = inp.right = inp.up = inp.down = false; }

// Marche vers une case en évitant les dangers connus du bot (qui triche :
// il lit l'état complet, ce que les joueurs ne peuvent pas faire).
function walker(g, pi, target, opts) {
  const L = g.L, p = g.players[pi], inp = g.inputs[pi];
  const here = tileOf(p);
  if (here.x === target.x && here.y === target.y) {
    if (steer(inp, p, target)) { stop(inp); return true; }
    return false;
  }
  const passable = (x, y) => {
    const ch = L.g[y][x];
    if (L.mode === 'rives') { if (S.rivesBlocked(g, ch)) return false; if (ch === 'f') return false; }
    else { if (S.tracesBlocked(g, ch, x, y) && ch !== '%') return false; }
    if (opts.avoidRects) for (const r of opts.avoidRects()) if (S.inRect(x + 0.5, y + 0.5, { x: r.x - 0.6, y: r.y - 0.6, w: r.w + 1.2, h: r.h + 1.2 })) return false;
    return true;
  };
  // Sur un chenal, on s'en tient à la route décidée avant d'y entrer :
  // changer d'avis au milieu, c'est se faire prendre par la marée.
  const st = opts.state || (opts.state = {});
  let route = null;
  const onChannel = L.g[here.y][here.x] === '%';
  if (onChannel && st.route) {
    const k = st.route.findIndex((n) => n.x === here.x && n.y === here.y);
    if (k >= 0) route = st.route.slice(k);
  }
  if (!route) route = bfs(L, (x, y) => (x === here.x && y === here.y) || passable(x, y), here, target);
  if (!route || route.length < 2) { stop(inp); return false; }
  st.route = route;
  const next = route[1];
  if (!onChannel && opts.safeToEnter && !opts.safeToEnter(next, route)) { stop(inp); return false; }
  steer(inp, p, next);
  return false;
}

function rivesSafe(g) {
  return (next, route) => {
    const L = g.L;
    for (const z of L.rockfalls) {
      const inside = (t) => S.inRect(t.x + 0.5, t.y + 0.5, z);
      if (!inside(next)) continue;
      // nombre de cases consécutives dans la zone
      let n = 0; for (const t of route.slice(1)) { if (inside(t)) n++; else break; }
      if (S.rockfallSafeFor(g.t, z) < n / S.C.SPEED + 0.5) return false;
    }
    return true;
  };
}

function tracesSafe(g) {
  return (next, route) => {
    const L = g.L;
    for (const q of L.quicksand) {
      for (const ahead of [0, 0.3, 0.6]) {
        const rc = S.quicksandRect(q, g.t + ahead);
        if (S.inRect(next.x + 0.5, next.y + 0.5, { x: rc.x - 0.4, y: rc.y - 0.4, w: rc.w + 0.8, h: rc.h + 0.8 })) return false;
      }
    }
    if (L.g[next.y][next.x] === '%') {
      const here = route[0];
      if (L.g[here.y][here.x] !== '%') {
        let n = 0; for (const t of route.slice(1)) { if (L.g[t.y][t.x] === '%') n++; else break; }
        const v = S.valveFor(L, next.x, next.y);
        if (v && v.couple && !S.toggleState(g.dyn, v.couple)) return false;
        if (v && !S.toggleState(g.dyn, v.id)) return true;
        if (S.tideLowFor(L, g.t) < n / S.C.SPEED + 0.6) return false;
      }
    }
    return true;
  };
}

function run(name, g, controllers, maxT) {
  const t0 = g.t;
  let frames = 0;
  const trace = process.env.TRACE && name.includes(process.env.TRACE);
  while (g.phase !== 'won' && g.phase !== 'final' && g.t - t0 < maxT) {
    if (g.phase === 'play') controllers.forEach((c, i) => c(g, i));
    if (trace && frames % 30 === 0) {
      const dbg = controllers[0].debug ? JSON.stringify(controllers[0].debug()) : '';
      console.log('    t=' + (g.t - t0).toFixed(1), g.phase, g.players.map((p) => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' | '),
        'in', g.inputs.map((i) => (i.left ? 'L' : '') + (i.right ? 'R' : '') + (i.up ? 'U' : '') + (i.down ? 'D' : '') + (i.action ? 'A' : '')).join('/'), dbg);
    }
    S.step(g, DT);
    frames++;
  }
  const done = g.phase === 'won' || g.phase === 'final';
  ok(done, name + ' : ' + (done ? 'terminé en ' + (g.t - t0).toFixed(1) + ' s, ' + g.deaths + ' chute(s)' : 'NON terminé (' + g.phase + ', ' + g.deaths + ' chutes)'));
  return done;
}

// Exécute une liste d'étapes pour chaque rôle. Une étape 'barrier' attend
// que les deux bots y soient ; 'pull' presse l'action le même frame.
function scripted(g, plans) {
  const idx = {}, state = {}, passed = {};
  for (const role of Object.keys(plans)) { idx[role] = 0; state[role] = {}; passed[role] = 0; }
  const roleOf = (i) => S.roleOf(g, i);
  const atBarrier = (role) => { const st = plans[role][idx[role]]; return !!(st && st.barrier); };
  const ctrl = (gg, i) => {
    const role = roleOf(i), plan = plans[role], inp = gg.inputs[i];
    inp.action = false;
    const st = plan[idx[role]];
    if (!st) { stop(inp); return; }
    if (st.go) {
      const done = (gg.L.mode === 'rives')
        ? walker(gg, i, { x: st.go[0], y: st.go[1] }, { safeToEnter: rivesSafe(gg) })
        : walker(gg, i, { x: st.go[0], y: st.go[1] }, { state: state[role], safeToEnter: tracesSafe(gg), avoidRects: () => gg.L.quicksand.map((q) => S.quicksandRect(q, gg.t)) });
      if (done) { idx[role]++; state[role].route = null; }
    } else if (st.barrier) {
      stop(inp);
      const other = Object.keys(plans).find((r) => r !== role);
      // l'autre est à la même barrière, ou l'a déjà franchie (il a tiré au frame précédent)
      const otherHere = (atBarrier(other) && passed[other] === passed[role]) || passed[other] > passed[role];
      if (otherHere) {
        if (st.pull) inp.action = true;
        idx[role]++; passed[role]++;
      }
    } else if (st.wait) {
      stop(inp);
      if (st.wait(gg)) idx[role]++;
    } else if (st.cursor) {
      // Guetteur : amener le curseur sur une bascule et la presser
      const L = gg.L, d = gg.dyn, c = d.cursor;
      const tg = L.toggles.find((t) => t.id === st.cursor);
      const target = tg.kind === 'gate' ? { x: tg.tiles[0].x + 0.5, y: tg.tiles[0].y + 0.5 } : { x: tg.x, y: tg.y };
      const dx = target.x - c.x, dy = target.y - c.y;
      inp.left = dx < -0.1; inp.right = dx > 0.1; inp.up = dy < -0.1; inp.down = dy > 0.1;
      if (Math.abs(dx) <= 0.1 && Math.abs(dy) <= 0.1) {
        stop(inp);
        const open = S.toggleState(d, tg.id);
        if (open === st.open) { idx[role]++; state[role].pressed = false; }
        else if (!state[role].pressed) { inp.action = true; state[role].pressed = true; }
        else state[role].pressed = false;
      }
    }
  };
  ctrl.debug = () => ({ idx, passed });
  return ctrl;
}

function game(level) {
  const g = S.createGame(LEVELS);
  const li = LEVELS.sequence.findIndex((e) => e.level === level);
  S.loadLevel(g, li);
  g.phase = 'play';
  return g;
}

// Prologue
{
  const g = game('serment');
  const c = scripted(g, { W: [{ go: [7, 4] }], E: [{ go: [8, 4] }] });
  run('Le Serment', g, [c, c], 30);
}

// Acte 1
{
  const g = game('rives1');
  const c = scripted(g, {
    W: [{ go: [3, 3] }, { barrier: true, pull: true }, { go: [12, 8] }, { barrier: true, pull: true }, { go: [6, 15] }],
    E: [{ go: [28, 4] }, { barrier: true, pull: true }, { go: [17, 9] }, { barrier: true, pull: true }, { go: [23, 15] }],
  });
  run('Le Gué', g, [c, c], 60);
}
{
  const g = game('rives2');
  const c = scripted(g, { W: [{ go: [6, 15] }], E: [{ go: [26, 16] }] });
  run('Le Miroir', g, [c, c], 60);
}
{
  const g = game('rives3');
  const c = scripted(g, {
    W: [{ go: [2, 10] }, { barrier: true, pull: true }, { go: [2, 2] }, { barrier: true, pull: true }, { go: [2, 6] }, { barrier: true, pull: true }, { go: [6, 11] }, { barrier: true }, { go: [6, 16] }],
    E: [{ go: [27, 2] }, { barrier: true, pull: true }, { go: [27, 6] }, { barrier: true, pull: true }, { go: [27, 10] }, { barrier: true, pull: true }, { go: [22, 11] }, { barrier: true }, { go: [22, 16] }],
  });
  run('Le Pont-Levis', g, [c, c], 90);
}

// Acte 2 : pilote automatique du radeau
function raftPilot(g) {
  const L = g.L;
  const blocked = new Set(L.obstacles.map((o) => Math.floor(o.x) + ',' + Math.floor(o.y)));
  const passable = (x, y) => L.g[y][x] !== '#' && !blocked.has(x + ',' + y);
  const start = { x: Math.floor(L.start.x), y: Math.floor(L.start.y) };
  const goal = { x: 9, y: L.finish };
  const route = bfs(L, passable, start, goal);
  ok(!!route, L.id + ' : un chemin existe entre le départ et l’arrivée');
  return (gg, i) => {
    const r = gg.dyn.raft, inp = gg.inputs[i], role = S.roleOf(gg, i);
    inp.action = false; stop(inp);
    if (r.stuck) { if (role === 'barreur') { inp.left = r.stuck.dir === 'L'; inp.right = r.stuck.dir === 'R'; } return; }
    // point de passage : le premier nœud de la route à au moins 1,2 case en aval
    let wp = route.find((n) => n.y + 0.5 >= r.y + 1.2) || route[route.length - 1];
    const here = route.filter((n) => Math.abs(n.y + 0.5 - r.y) < 0.6);
    const tx = (here.length ? here[here.length - 1].x : wp.x) + 0.5;
    const dx = tx - r.x;
    if (role === 'barreur') { inp.left = dx < -0.15; inp.right = dx > 0.15; }
    else { const aligned = Math.abs(dx) < 0.35 && Math.abs(wp.x + 0.5 - r.x) < 1.6; inp.down = aligned; inp.up = !aligned && r.vy > 0.3; }
  };
}
for (const lv of ['radeau1', 'radeau2', 'radeau3']) {
  const g = game(lv);
  const c = raftPilot(g);
  run(LEVELS.sequence.find((e) => e.level === lv).title, g, [c, c], 240);
}

// Acte 3
{
  const g = game('traces1');
  const c = scripted(g, {
    marcheur: [{ go: [13, 8] }, { go: [26, 8] }],
    guetteur: [{ cursor: 'A', open: true }, { cursor: 'C', open: true }],
  });
  run('La Brume', g, [c, c], 120);
}
{
  const g = game('traces2');
  const c = scripted(g, {
    marcheur: [{ go: [9, 3] }, { wait: (gg) => S.toggleState(gg.dyn, 'A') }, { go: [26, 4] }, { wait: (gg) => S.toggleState(gg.dyn, 'B') }, { go: [27, 15] }],
    guetteur: [{ wait: (gg) => gg.dyn.onSwitch === 'A' }, { cursor: 'A', open: true }, { wait: (gg) => gg.dyn.onSwitch === 'B' }, { cursor: 'B', open: true }],
  });
  run('Les Roseaux', g, [c, c], 150);
}
{
  const g = game('traces3');
  const c = scripted(g, {
    marcheur: [{ go: [15, 5] }, { wait: (gg) => S.toggleState(gg.dyn, 'B') }, { go: [27, 10] }],
    guetteur: [{ wait: (gg) => gg.dyn.onSwitch === 'B' }, { cursor: 'B', open: true }],
  });
  run('Le Phare de l’estuaire', g, [c, c], 150);
}

// Finale
{
  const g = game('estuaireRives');
  const c = scripted(g, {
    W: [{ go: [3, 4] }, { barrier: true, pull: true }, { go: [5, 9] }, { barrier: true }, { go: [5, 15] }],
    E: [{ go: [26, 8] }, { barrier: true, pull: true }, { go: [23, 9] }, { barrier: true }, { go: [23, 15] }],
  });
  run('Les rives de l’estuaire (rôles inversés)', g, [c, c], 90);
}
{
  const g = game('estuaireRadeau');
  const c = raftPilot(g);
  run('La traversée (rôles inversés)', g, [c, c], 240);
}
{
  const g = game('estuaireTraces');
  const c = scripted(g, {
    marcheur: [{ wait: (gg) => S.toggleState(gg.dyn, 'A') }, { go: [23, 6] }, { wait: (gg) => S.toggleState(gg.dyn, 'C') }, { go: [24, 15] }],
    guetteur: [{ cursor: 'A', open: true }, { wait: (gg) => gg.dyn.onSwitch === 'C' }, { cursor: 'C', open: true }],
  });
  run('La dernière pierre (rôles inversés)', g, [c, c], 150);
}

// Enchaînement complet : les transitions de niveau et la fin de partie
{
  const g = S.createGame(LEVELS);
  for (let i = 0; i < 60 * 4; i++) S.step(g, DT);
  ok(g.phase === 'play' && g.li === 0, 'intro → jeu');
  g.phase = 'won'; g.pt = 0;
  for (let i = 0; i < 60 * 3; i++) S.step(g, DT);
  ok(g.li === 1 && g.phase === 'intro', 'niveau gagné → niveau suivant');
  S.loadLevel(g, LEVELS.sequence.length - 1); g.phase = 'won'; g.pt = 0;
  for (let i = 0; i < 60 * 3; i++) S.step(g, DT);
  ok(g.phase === 'final', 'dernier niveau gagné → carte finale');
}

console.log('\n' + (failures ? failures + ' échec(s)' : 'Tout est bon.'));
process.exit(failures ? 1 : 0);
