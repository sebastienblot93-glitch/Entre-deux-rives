/*
 * Entre Deux Rives — simulation partagée
 *
 * Ce module tourne à l'identique dans le navigateur et dans Node (tests).
 * Le PC hôte fait tourner la simulation (step). L'invité reçoit des
 * instantanés (snapshot / applySnapshot) et ne fait que les afficher.
 *
 * Joueur 0 = hôte, joueur 1 = invité. Les rôles dépendent du mode :
 *   rives  : W (rive ouest) / E (rive est)
 *   radeau : barreur (axe gauche-droite) / perchiste (axe amont-aval)
 *   traces : guetteur (tour, curseur) / marcheur (au sol, brume)
 * Un niveau marqué swap inverse ces rôles.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const C = {
    SPEED: 6,            // vitesse des personnages, cases par seconde
    PR: 0.3,             // demi-largeur de la boîte de collision
    LEVER_WINDOW: 0.8,   // écart maximal entre deux leviers jumeaux (s)
    LEVER_REACH: 0.9,    // distance pour tirer un levier (cases)
    PACE_GAP: 2.2,       // écart vertical toléré sur un pont de corde
    INTRO_T: 2.5,
    DEAD_T: 1.4,
    WON_T: 2.5,
    FOOT_LIFE: 8,        // durée de vie d'une empreinte (s)
    FOOT_EVERY: 0.25,    // intervalle entre deux empreintes (s)
    FOG_R: 2.6,          // rayon de vision du Marcheur
    CURSOR_SPEED: 10,    // vitesse du curseur du Guetteur
    TOGGLE_REACH: 1.1,   // distance curseur → passerelle ou vanne
    RAFT_R: 0.45,        // demi-largeur du radeau
    RAFT_VX: 4,          // vitesse latérale maximale
    RAFT_PUSH: 4,        // poussée du perchiste
    RAFT_BRAKE: -2.5,    // freinage du perchiste
    HIT_R: 0.7,          // distance de contact avec un obstacle
    PLANKS: 3,
    SAND_HOLD: 1.0,      // temps à tenir la bonne direction pour sortir d'un banc
    VIEW_H: 18,          // hauteur de la fenêtre du radeau (cases)
    TRACK_EVERY: 0.2,
  };

  // Rives : portes A à D (E est un départ, f une dalle fragile).
  // Traces : passerelles A à F.
  const LETTERS = 'ABCDEF';
  const RIVES_LETTERS = 'ABCD';
  const digitLetter = (d) => LETTERS[parseInt(d, 10) - 1];
  const isUpper = (ch) => ch >= 'A' && ch <= 'F';
  const isLower = (ch) => ch >= 'a' && ch <= 'f';
  const isRivesGate = (ch) => ch >= 'A' && ch <= 'D';
  const isRivesPlate = (ch) => ch >= 'a' && ch <= 'd';
  const isDigit = (ch) => ch >= '1' && ch <= '6';

  /* ---------------------------------------------------------------- */
  /* Cartes                                                             */
  /* ---------------------------------------------------------------- */

  function parseMap(rows) {
    const h = rows.length, w = rows[0].length;
    const g = [];
    for (let y = 0; y < h; y++) {
      if (rows[y].length !== w) throw new Error('Ligne ' + y + ' : largeur ' + rows[y].length + ' au lieu de ' + w);
      g.push(rows[y].split(''));
    }
    return { w, h, g };
  }

  function tileAt(L, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return '#';
    return L.g[ty][tx];
  }

  function findAll(L, pred) {
    const out = [];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (pred(L.g[y][x])) out.push({ x, y, ch: L.g[y][x] });
    return out;
  }

  function prepare(levels, entry) {
    const raw = levels.maps[entry.level];
    if (!raw) throw new Error('Niveau inconnu : ' + entry.level);
    const m = parseMap(raw.map);
    const L = {
      id: entry.level, title: entry.title, act: entry.act, intro: entry.intro || '',
      mode: entry.mode, swap: !!entry.swap, w: m.w, h: m.h, g: m.g, raw,
    };
    if (L.mode === 'rives') prepRives(L);
    else if (L.mode === 'radeau') prepRadeau(L);
    else if (L.mode === 'traces') prepTraces(L);
    else throw new Error('Mode inconnu : ' + L.mode);
    return L;
  }

  function prepRives(L) {
    let rMin = Infinity, rMax = -Infinity;
    for (const t of findAll(L, (c) => c === '~')) { rMin = Math.min(rMin, t.x); rMax = Math.max(rMax, t.x); }
    L.river = rMin <= rMax ? { min: rMin, max: rMax } : null;
    L.bankOf = (x) => (!L.river ? 'W' : x < L.river.min ? 'W' : x > L.river.max ? 'E' : 'R');
    const w = findAll(L, (c) => c === 'W')[0], e = findAll(L, (c) => c === 'E')[0];
    L.spawn = { W: { x: w.x + 0.5, y: w.y + 0.5 }, E: { x: e.x + 0.5, y: e.y + 0.5 } };
    L.levers = findAll(L, isDigit).map((t) => ({ x: t.x, y: t.y, n: parseInt(t.ch, 10), bank: L.bankOf(t.x) }));
    L.rockfalls = (L.raw.rockfalls || []).map((z) => Object.assign({ active: 0.7, phase: 0 }, z));
    L.order = L.raw.order || null;
    L.onOrderComplete = L.raw.onOrderComplete || null;
    L.pairOpens = L.raw.pairOpens || {};
    L.hideOwnNumbers = !!L.raw.hideOwnNumbers;
    L.exits = findAll(L, (c) => c === 'X');
  }

  function prepRadeau(L) {
    const s = findAll(L, (c) => c === 'S')[0];
    L.start = { x: s.x + 0.5, y: s.y + 0.5 };
    L.current = L.raw.current || 0;
    L.obstacles = findAll(L, (c) => c === 'R' || c === 'O' || c === '(' || c === ')')
      .map((t) => ({ x: t.x + 0.5, y: t.y + 0.5, k: t.ch === 'R' ? 'rock' : t.ch === 'O' ? 'whirl' : 'sand', dir: t.ch === '(' ? 'L' : 'R', id: t.x + ',' + t.y }));
    L.fragments = findAll(L, (c) => c === 'F').map((t) => ({ x: t.x + 0.5, y: t.y + 0.5, id: t.x + ',' + t.y }));
    L.checkpoints = [...new Set(findAll(L, (c) => c === 'C').map((t) => t.y))].sort((a, b) => a - b);
    L.finish = Math.min(...findAll(L, (c) => c === 'X').map((t) => t.y));
  }

  function prepTraces(L) {
    const s = findAll(L, (c) => c === 'S')[0];
    L.start = { x: s.x + 0.5, y: s.y + 0.5 };
    L.toggles = [];
    const locked = L.raw.locked || [];
    for (const letter of LETTERS) {
      const tiles = findAll(L, (c) => c.toUpperCase() === letter);
      if (!tiles.length) continue;
      const cx = tiles.reduce((a, t) => a + t.x, 0) / tiles.length + 0.5;
      const cy = tiles.reduce((a, t) => a + t.y, 0) / tiles.length + 0.5;
      L.toggles.push({ id: letter, kind: 'gate', initOpen: isLower(tiles[0].ch), x: cx, y: cy, tiles, lock: locked.includes(letter) });
    }
    for (const v of (L.raw.valves || [])) {
      L.toggles.push({ id: v.id, kind: 'valve', initOpen: v.open !== false, x: v.x + 0.5, y: v.y + 0.5, rect: v.rect, couple: v.couple || null });
    }
    L.quicksand = (L.raw.quicksand || []).map((q) => Object.assign({ axis: 'x', amp: 0, period: 1 }, q));
    L.switches = findAll(L, isDigit).map((t) => ({ x: t.x, y: t.y, gate: digitLetter(t.ch) }));
    L.tide = Object.assign({ period: 16 }, L.raw.tide || {});
    L.exit = findAll(L, (c) => c === 'X')[0];
  }

  /* ---------------------------------------------------------------- */
  /* Aides partagées avec le rendu                                      */
  /* ---------------------------------------------------------------- */

  function rockfallActive(t, z) {
    const ph = ((t + z.phase) % z.period + z.period) % z.period;
    return ph < z.active;
  }
  function rockfallSafeFor(t, z) {
    // temps restant avant la prochaine chute
    const ph = ((t + z.phase) % z.period + z.period) % z.period;
    return ph < z.active ? 0 : z.period - ph;
  }
  function inRect(px, py, r) { return px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h; }

  function quicksandRect(q, t) {
    const off = q.amp * Math.sin((2 * Math.PI * t) / q.period);
    return { x: q.x + (q.axis === 'x' ? off : 0), y: q.y + (q.axis === 'y' ? off : 0), w: q.w, h: q.h };
  }

  function tidePhase(L, t) { return ((t % L.tide.period) + L.tide.period) % L.tide.period / L.tide.period; }
  function tideHigh(L, t) { return tidePhase(L, t) >= 0.5; }
  function tideLowFor(L, t) { const p = tidePhase(L, t); return p >= 0.5 ? 0 : (0.5 - p) * L.tide.period; }

  function valveFor(L, tx, ty) {
    for (const tg of L.toggles) if (tg.kind === 'valve' && inRect(tx, ty, { x: tg.rect[0], y: tg.rect[1], w: tg.rect[2], h: tg.rect[3] })) return tg;
    return null;
  }
  function toggleState(d, id) { const tg = d.toggles.find((x) => x.id === id); return tg ? tg.open : true; }
  function channelFlooded(L, d, t, tx, ty) {
    const v = valveFor(L, tx, ty);
    if (!v) return tideHigh(L, t);
    if (v.couple && !toggleState(d, v.couple)) return true;
    return toggleState(d, v.id) && tideHigh(L, t);
  }

  function roleOf(g, pi) {
    const L = g.L, first = (pi === 0) !== L.swap;
    if (L.mode === 'rives') return first ? 'W' : 'E';
    if (L.mode === 'radeau') return first ? 'barreur' : 'perchiste';
    return first ? 'guetteur' : 'marcheur';
  }
  function indexOfRole(g, role) { return roleOf(g, 0) === role ? 0 : 1; }

  /* ---------------------------------------------------------------- */
  /* Partie                                                             */
  /* ---------------------------------------------------------------- */

  const mkP = () => ({ x: 0, y: 0, dir: 0, moving: false });
  const mkI = () => ({ up: false, down: false, left: false, right: false, action: false, edge: false });

  function createGame(levels) {
    const g = {
      levels, seq: levels.sequence, li: -1, L: null,
      phase: 'intro', pt: 0, t: 0,
      players: [mkP(), mkP()], inputs: [mkI(), mkI()], prevAct: [false, false],
      dyn: null, reveal: null, deaths: 0,
      tracks: [], trackT: 0, final: false,
    };
    loadLevel(g, 0);
    return g;
  }

  function loadLevel(g, li) {
    g.li = li;
    g.L = prepare(g.levels, g.seq[li]);
    if (!g.tracks[li]) g.tracks[li] = [];
    fullReset(g);
    g.phase = 'intro';
    g.pt = 0;
  }

  function fullReset(g) {
    g.reveal = null;
    g.epoch = (g.epoch || 0) + 1;
    const L = g.L;
    if (L.mode === 'rives') resetRives(g);
    else if (L.mode === 'radeau') resetRadeau(g, true);
    else resetTraces(g, true);
  }

  function respawn(g) {
    g.reveal = null;
    g.epoch = (g.epoch || 0) + 1;
    const L = g.L;
    if (L.mode === 'rives') resetRives(g);
    else if (L.mode === 'radeau') resetRadeau(g, false);
    else resetTraces(g, false);
  }

  function die(g, kind, data) {
    if (g.phase !== 'play') return;
    g.phase = 'dead'; g.pt = 0; g.deaths++;
    g.reveal = Object.assign({ kind }, data || {});
  }
  function win(g) { if (g.phase === 'play') { g.phase = 'won'; g.pt = 0; } }

  function step(g, dt) {
    g.t += dt; g.pt += dt;
    for (let i = 0; i < 2; i++) {
      const inp = g.inputs[i];
      inp.edge = !!inp.action && !g.prevAct[i];
      g.prevAct[i] = !!inp.action;
    }
    if (g.phase === 'intro') { if (g.pt >= C.INTRO_T) { g.phase = 'play'; g.pt = 0; } return; }
    if (g.phase === 'dead') { if (g.pt >= C.DEAD_T) { respawn(g); g.phase = 'play'; g.pt = 0; } return; }
    if (g.phase === 'won') {
      if (g.pt >= C.WON_T) { if (g.li + 1 < g.seq.length) loadLevel(g, g.li + 1); else { g.phase = 'final'; g.final = true; } }
      return;
    }
    if (g.phase !== 'play') return;
    const L = g.L;
    if (L.mode === 'rives') stepRives(g, dt);
    else if (L.mode === 'radeau') stepRadeau(g, dt);
    else stepTraces(g, dt);
    g.trackT += dt;
    if (g.trackT >= C.TRACK_EVERY) { g.trackT = 0; recordTrack(g); }
  }

  function recordTrack(g) {
    const tr = g.tracks[g.li];
    if (g.L.mode === 'radeau') { const r = g.dyn.raft; tr.push([+r.x.toFixed(2), +r.y.toFixed(2), 2]); return; }
    for (let i = 0; i < 2; i++) {
      if (g.L.mode === 'traces' && roleOf(g, i) === 'guetteur') continue;
      const p = g.players[i];
      tr.push([+p.x.toFixed(2), +p.y.toFixed(2), i]);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Déplacement avec collisions                                        */
  /* ---------------------------------------------------------------- */

  function boxBlocked(L, blocked, x, y, r) {
    for (const cx of [x - r, x + r]) for (const cy of [y - r, y + r]) {
      if (blocked(tileAt(L, cx, cy), Math.floor(cx), Math.floor(cy))) return true;
    }
    return false;
  }

  function moveBox(L, blocked, p, dx, dy, r) {
    if (dx) {
      if (!boxBlocked(L, blocked, p.x + dx, p.y, r)) p.x += dx;
      else if (dx > 0) p.x = Math.ceil(p.x + r) - r - 0.001;
      else p.x = Math.floor(p.x - r) + r + 0.001;
    }
    if (dy) {
      if (!boxBlocked(L, blocked, p.x, p.y + dy, r)) p.y += dy;
      else if (dy > 0) p.y = Math.ceil(p.y + r) - r - 0.001;
      else p.y = Math.floor(p.y - r) + r + 0.001;
    }
  }

  function movePlayer(L, p, inp, dt, blocked) {
    let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    let dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    p.moving = !!(dx || dy);
    if (!p.moving) return;
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 1) : (dy > 0 ? 0 : 3);
    moveBox(L, blocked, p, dx * C.SPEED * dt, dy * C.SPEED * dt, C.PR);
  }

  /* ---------------------------------------------------------------- */
  /* Mode RIVES                                                         */
  /* ---------------------------------------------------------------- */

  function resetRives(g) {
    const L = g.L;
    g.dyn = {
      opened: {}, held: {}, progress: 0, flash: null,
      levers: L.levers.map((l) => ({ pulledAt: -1 })),
    };
    for (let i = 0; i < 2; i++) {
      const s = L.spawn[roleOf(g, i)];
      g.players[i] = Object.assign(mkP(), { x: s.x, y: s.y });
    }
  }

  function rivesBlocked(g, ch) {
    if (ch === '#' || ch === '~') return true;
    if (isRivesGate(ch)) return !(g.dyn.opened[ch] || g.dyn.held[ch]);
    return false;
  }

  function stepRives(g, dt) {
    const L = g.L, d = g.dyn;
    for (let i = 0; i < 2; i++) {
      const p = g.players[i], inp = g.inputs[i], bank = roleOf(g, i);
      movePlayer(L, p, inp, dt, (ch) => rivesBlocked(g, ch));
      if (inp.edge) {
        let best = null, bd = C.LEVER_REACH;
        L.levers.forEach((lv, k) => {
          if (lv.bank !== bank) return;
          const dd = Math.hypot(lv.x + 0.5 - p.x, lv.y + 0.5 - p.y);
          if (dd < bd) { bd = dd; best = k; }
        });
        if (best !== null) d.levers[best].pulledAt = g.t;
      }
    }
    // plaques
    const held = {};
    for (const p of g.players) { const ch = tileAt(L, p.x, p.y); if (isRivesPlate(ch)) held[ch.toUpperCase()] = true; }
    d.held = held;
    // leviers jumeaux
    d.levers.forEach((s) => { if (s.pulledAt >= 0 && g.t - s.pulledAt > C.LEVER_WINDOW) s.pulledAt = -1; });
    for (let n = 1; n <= 6; n++) {
      const pulled = (bank) => L.levers.findIndex((lv, k) => lv.n === n && lv.bank === bank && d.levers[k].pulledAt >= 0);
      const w = pulled('W'), e = pulled('E');
      if (w < 0 || e < 0) continue;
      d.levers[w].pulledAt = -1; d.levers[e].pulledAt = -1;
      if (L.pairOpens[n]) d.opened[L.pairOpens[n]] = true;
      if (L.order) {
        if (n === L.order[d.progress]) {
          d.progress++;
          d.flash = { ok: true, t: g.t, n };
          if (d.progress >= L.order.length && L.onOrderComplete) d.opened[L.onOrderComplete] = true;
        } else {
          d.progress = 0;
          d.flash = { ok: false, t: g.t, n };
        }
      } else d.flash = { ok: true, t: g.t, n };
    }
    // dangers
    for (let i = 0; i < 2; i++) {
      const p = g.players[i], tx = Math.floor(p.x), ty = Math.floor(p.y), ch = tileAt(L, p.x, p.y);
      if (ch === 'f') { die(g, 'fragile', { tiles: [{ x: tx, y: ty }], who: i }); return; }
      for (const z of L.rockfalls) {
        if (rockfallActive(g.t, z) && inRect(p.x, p.y, z)) { die(g, 'rockfall', { zone: z, who: i }); return; }
      }
      if (ch === '=' && Math.abs(g.players[0].y - g.players[1].y) > C.PACE_GAP) { die(g, 'pace', { who: i }); return; }
    }
    if (g.players.every((p) => tileAt(L, p.x, p.y) === 'X')) win(g);
  }

  /* ---------------------------------------------------------------- */
  /* Mode RADEAU                                                        */
  /* ---------------------------------------------------------------- */

  function resetRadeau(g, full) {
    const L = g.L;
    const prev = full ? null : g.dyn;
    const cp = prev ? prev.cp : { x: L.start.x, y: L.start.y };
    g.dyn = {
      raft: { x: cp.x, y: cp.y, vx: 0, vy: 0, planks: C.PLANKS, spin: 0, cool: 0, stuck: null, angle: 0 },
      cp: { x: cp.x, y: cp.y },
      collected: prev ? prev.collected : [],
      flashes: [],
    };
    for (let i = 0; i < 2; i++) g.players[i] = Object.assign(mkP(), { x: cp.x, y: cp.y });
  }

  function raftBlocked(ch) { return ch === '#'; }

  function stepRadeau(g, dt) {
    const L = g.L, d = g.dyn, r = d.raft;
    const ib = g.inputs[indexOfRole(g, 'barreur')], ip = g.inputs[indexOfRole(g, 'perchiste')];
    r.cool = Math.max(0, r.cool - dt);
    r.spin = Math.max(0, r.spin - dt);
    if (r.spin > 0) r.angle += dt * 9;
    if (r.stuck) {
      const want = r.stuck.dir === 'L' ? ib.left && !ib.right : ib.right && !ib.left;
      r.stuck.hold = want ? r.stuck.hold + dt : 0;
      if (r.stuck.hold >= C.SAND_HOLD) {
        r.x += r.stuck.dir === 'L' ? -1.4 : 1.4;
        r.stuck = null; r.cool = 1.0;
      }
      r.vx = 0; r.vy = 0;
    } else if (r.spin <= 0) {
      const txv = (ib.right ? C.RAFT_VX : 0) - (ib.left ? C.RAFT_VX : 0);
      r.vx += (txv - r.vx) * Math.min(1, dt * 8);
      const tyv = L.current + (ip.down ? C.RAFT_PUSH : 0) + (ip.up ? C.RAFT_BRAKE : 0);
      r.vy += (tyv - r.vy) * Math.min(1, dt * 6);
      moveBox(L, raftBlocked, r, r.vx * dt, 0, C.RAFT_R);
      moveBox(L, raftBlocked, r, 0, r.vy * dt, C.RAFT_R);
    }
    r.y = Math.max(1, Math.min(L.h - 1.5, r.y));
    // obstacles
    if (!r.stuck && r.cool <= 0) {
      for (const o of L.obstacles) {
        const dd = Math.hypot(o.x - r.x, o.y - r.y);
        if (dd > C.HIT_R) continue;
        d.flashes.push({ x: o.x, y: o.y, k: o.k, t: g.t });
        if (o.k === 'rock') {
          r.planks--;
          const ax = r.x - o.x, ay = r.y - o.y, n = Math.hypot(ax, ay) || 1;
          r.x += (ax / n) * 1.2; r.y += (ay / n) * 1.2;
          r.vx = 0; r.vy = 0; r.cool = 1.0;
          if (r.planks <= 0) { die(g, 'sink', { x: o.x, y: o.y }); return; }
        } else if (o.k === 'whirl') {
          r.spin = 1.2; r.y = Math.max(1, r.y - 2); r.vx = 0; r.vy = 0; r.cool = 1.8;
        } else {
          r.stuck = { dir: o.dir, hold: 0 }; r.vx = 0; r.vy = 0;
        }
        break;
      }
    }
    d.flashes = d.flashes.filter((f) => g.t - f.t < 1.5);
    // fragments
    for (const f of L.fragments) {
      if (d.collected.includes(f.id)) continue;
      if (Math.hypot(f.x - r.x, f.y - r.y) < 0.8) d.collected.push(f.id);
    }
    // points de repos
    for (const cy of L.checkpoints) {
      if (r.y >= cy + 0.5 && d.cp.y < cy) { d.cp = { x: r.x, y: cy + 0.5 }; r.planks = C.PLANKS; }
    }
    for (let i = 0; i < 2; i++) { g.players[i].x = r.x; g.players[i].y = r.y; }
    if (r.y >= L.finish + 0.4) win(g);
  }

  /* ---------------------------------------------------------------- */
  /* Mode TRACES                                                        */
  /* ---------------------------------------------------------------- */

  function resetTraces(g, full) {
    const L = g.L, prev = full ? null : g.dyn;
    g.dyn = {
      toggles: L.toggles.map((t, k) => ({ id: t.id, open: prev ? prev.toggles[k].open : t.initOpen })),
      cursor: prev ? prev.cursor : { x: L.w / 2, y: L.h / 2 },
      foot: [], footT: 0, onSwitch: null, flash: null,
    };
    const wi = indexOfRole(g, 'marcheur');
    g.players[wi] = Object.assign(mkP(), { x: L.start.x, y: L.start.y });
    g.players[1 - wi] = Object.assign(mkP(), { x: -10, y: -10 });
  }

  function tracesBlocked(g, ch, tx, ty) {
    const L = g.L, d = g.dyn;
    if (ch === '#' || ch === '~') return true;
    if (isUpper(ch) || isLower(ch)) return !toggleState(d, ch.toUpperCase());
    if (ch === '%') return channelFlooded(L, d, g.t, tx, ty);
    return false;
  }

  function toggleNear(L, c) {
    let best = null, bd = C.TOGGLE_REACH;
    for (const tg of L.toggles) {
      let dd;
      if (tg.kind === 'gate') dd = Math.min(...tg.tiles.map((t) => Math.hypot(t.x + 0.5 - c.x, t.y + 0.5 - c.y)));
      else dd = Math.hypot(tg.x - c.x, tg.y - c.y);
      if (dd < bd) { bd = dd; best = tg; }
    }
    return best;
  }

  function stepTraces(g, dt) {
    const L = g.L, d = g.dyn;
    const wi = indexOfRole(g, 'marcheur'), gi = 1 - wi;
    const w = g.players[wi], iw = g.inputs[wi], ig = g.inputs[gi];
    // curseur du Guetteur
    const c = d.cursor;
    c.x += ((ig.right ? 1 : 0) - (ig.left ? 1 : 0)) * C.CURSOR_SPEED * dt;
    c.y += ((ig.down ? 1 : 0) - (ig.up ? 1 : 0)) * C.CURSOR_SPEED * dt;
    c.x = Math.max(0.5, Math.min(L.w - 0.5, c.x));
    c.y = Math.max(0.5, Math.min(L.h - 0.5, c.y));
    if (ig.edge) {
      const tg = toggleNear(L, c);
      if (tg) {
        const st = d.toggles.find((x) => x.id === tg.id);
        if (!tg.lock || d.onSwitch === tg.id) { st.open = !st.open; d.flash = { id: tg.id, t: g.t, ok: true }; }
        else d.flash = { id: tg.id, t: g.t, ok: false };
      }
    }
    // Marcheur
    movePlayer(L, w, iw, dt, (ch, tx, ty) => tracesBlocked(g, ch, tx, ty));
    const ch = tileAt(L, w.x, w.y), tx = Math.floor(w.x), ty = Math.floor(w.y);
    d.onSwitch = isDigit(ch) ? digitLetter(ch) : null;
    if (w.moving) {
      d.footT += dt;
      if (d.footT >= C.FOOT_EVERY) { d.footT = 0; d.foot.push({ x: w.x, y: w.y, t: g.t, dir: w.dir }); }
    }
    d.foot = d.foot.filter((f) => g.t - f.t < C.FOOT_LIFE);
    // dangers
    for (const q of L.quicksand) {
      const rc = quicksandRect(q, g.t);
      if (inRect(w.x, w.y, rc)) { die(g, 'quicksand', { rect: rc }); return; }
    }
    if (ch === '%' && channelFlooded(L, d, g.t, tx, ty)) {
      const v = valveFor(L, tx, ty);
      die(g, 'tide', { rect: v ? { x: v.rect[0], y: v.rect[1], w: v.rect[2], h: v.rect[3] } : { x: tx, y: ty, w: 1, h: 1 } });
      return;
    }
    if (ch === 'X') win(g);
  }

  /* ---------------------------------------------------------------- */
  /* Instantanés réseau                                                 */
  /* ---------------------------------------------------------------- */

  const r3 = (v) => Math.round(v * 1000) / 1000;

  function snapshot(g) {
    const d = g.dyn, L = g.L;
    const s = {
      li: g.li, ph: g.phase, pt: r3(g.pt), t: r3(g.t), de: g.deaths, ep: g.epoch,
      p: g.players.map((p) => [r3(p.x), r3(p.y), p.dir, p.moving ? 1 : 0]),
      rv: g.reveal,
    };
    if (L.mode === 'rives') s.d = { op: d.opened, he: d.held, lv: d.levers.map((l) => l.pulledAt), pg: d.progress, fl: d.flash };
    else if (L.mode === 'radeau') s.d = { r: d.raft, cp: d.cp, col: d.collected, fx: d.flashes };
    else s.d = { tg: d.toggles.map((t) => (t.open ? 1 : 0)), c: [r3(d.cursor.x), r3(d.cursor.y)], ft: d.foot.map((f) => [r3(f.x), r3(f.y), r3(f.t), f.dir]), sw: d.onSwitch, fl: d.flash };
    return s;
  }

  function applySnapshot(g, s) {
    if (s.li !== g.li) loadLevel(g, s.li);
    g.phase = s.ph; g.pt = s.pt; g.t = s.t; g.deaths = s.de; g.reveal = s.rv; g.epoch = s.ep;
    if (s.ph === 'final') g.final = true;
    s.p.forEach((a, i) => { const p = g.players[i]; p.x = a[0]; p.y = a[1]; p.dir = a[2]; p.moving = !!a[3]; });
    const d = g.dyn, L = g.L;
    if (L.mode === 'rives') { d.opened = s.d.op; d.held = s.d.he; s.d.lv.forEach((v, k) => { d.levers[k].pulledAt = v; }); d.progress = s.d.pg; d.flash = s.d.fl; }
    else if (L.mode === 'radeau') { d.raft = s.d.r; d.cp = s.d.cp; d.collected = s.d.col; d.flashes = s.d.fx; }
    else { s.d.tg.forEach((v, k) => { d.toggles[k].open = !!v; }); d.cursor = { x: s.d.c[0], y: s.d.c[1] }; d.foot = s.d.ft.map((a) => ({ x: a[0], y: a[1], t: a[2], dir: a[3] })); d.onSwitch = s.d.sw; d.flash = s.d.fl; }
  }

  /* ---------------------------------------------------------------- */

  return {
    C, LETTERS, RIVES_LETTERS, digitLetter, isUpper, isLower, isRivesGate, isRivesPlate, isDigit,
    parseMap, tileAt, prepare, createGame, loadLevel, step, snapshot, applySnapshot,
    roleOf, indexOfRole, rockfallActive, rockfallSafeFor, quicksandRect, inRect,
    tidePhase, tideHigh, tideLowFor, channelFlooded, valveFor, toggleState, toggleNear,
    rivesBlocked, tracesBlocked, movePlayer,
  };
});
