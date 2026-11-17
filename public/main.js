/*
 * Entre Deux Rives — client
 *
 * Lobby → partie. L'hôte fait tourner la simulation à 60 Hz et envoie un
 * instantané 20 fois par seconde. L'invité envoie ses touches et affiche
 * les instantanés. Les deux dessinent depuis leur propre point de vue.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const screens = { lobby: $('lobby'), game: $('game'), final: $('final') };
  const canvas = $('canvas'), ctx = canvas.getContext('2d');

  let net = null, role = null, g = null, running = false;
  let lastSend = 0, guestInputs = { up: false, down: false, left: false, right: false, action: false };

  function show(name) { for (const k in screens) screens[k].classList.toggle('hidden', k !== name); }

  /* ---------------------------------------------------------------- */
  /* Touches                                                            */
  /* ---------------------------------------------------------------- */

  const keys = { up: false, down: false, left: false, right: false, action: false };
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', KeyZ: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'action', KeyE: 'action', Enter: 'action',
  };
  let keysDirty = false;
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code]; if (!k) return;
    if (screens.game.classList.contains('hidden')) return;
    e.preventDefault();
    if (!keys[k]) { keys[k] = true; keysDirty = true; }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code]; if (!k) return;
    if (keys[k]) { keys[k] = false; keysDirty = true; }
  });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; keysDirty = true; });

  /* ---------------------------------------------------------------- */
  /* Lobby                                                              */
  /* ---------------------------------------------------------------- */

  function setError(msg) { $('lobby-error').textContent = msg || ''; }
  function setWaiting(text, code) {
    $('lobby-menu').classList.toggle('hidden', !!text);
    $('lobby-wait').classList.toggle('hidden', !text);
    $('wait-text').textContent = text || '';
    $('wait-code').textContent = code || '';
  }

  function ensureNet(then) {
    if (net && net.ready) return then();
    setError('');
    net = Net.connect({
      open: then,
      error: () => setError('Impossible de joindre le serveur.'),
      close: () => { if (running) { stopGame(); setError('Connexion perdue.'); show('lobby'); setWaiting(null); } },
      created: (m) => setWaiting('En attente du partenaire…', m.code),
      waiting: () => setWaiting('En attente d’un inconnu…', ''),
      serverError: (m) => { setWaiting(null); setError(m.msg); },
      start: (m) => startGame(m.role, m.code),
      peerLeft: () => { stopGame(); show('lobby'); setWaiting(null); setError('Votre partenaire a quitté la partie.'); },
      msg: (d) => onPeerMessage(d),
    });
  }

  $('btn-create').onclick = () => ensureNet(() => net.send({ t: 'create' }));
  $('btn-join').onclick = () => {
    const code = $('join-code').value.trim().toUpperCase();
    if (code.length !== 4) return setError('Le code a 4 caractères.');
    ensureNet(() => net.send({ t: 'join', code }));
  };
  $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
  $('btn-quick').onclick = () => ensureNet(() => net.send({ t: 'quick' }));
  $('btn-again').onclick = () => { stopGame(); show('lobby'); setWaiting(null); setError(''); };

  /* ---------------------------------------------------------------- */
  /* Partie                                                             */
  /* ---------------------------------------------------------------- */

  function startGame(r, code) {
    role = r;
    g = Sim.createGame(LEVELS);
    running = true;
    show('game');
    setError('');
    for (const k in keys) keys[k] = false;
    guestInputs = { up: false, down: false, left: false, right: false, action: false };
    lastSend = 0; acc = 0; snapTick = 0; finalSent = false; lastT = performance.now();
    disp = null; srv = null; dispLi = -1;
    if (role === 'host') startTicker();
    requestAnimationFrame(loop);
  }

  function stopGame() { running = false; g = null; stopTicker(); }

  function myIndex() { return role === 'host' ? 0 : 1; }

  function onPeerMessage(d) {
    if (!running || !g) return;
    if (role === 'host' && d.t === 'in') {
      guestInputs = { up: !!d.k[0], down: !!d.k[1], left: !!d.k[2], right: !!d.k[3], action: !!d.k[4] };
    } else if (role === 'guest' && d.t === 'st') {
      Sim.applySnapshot(g, d.s);
      guestAfterSnapshot();
    } else if (role === 'guest' && d.t === 'final') {
      g.tracks = d.tracks;
      g.final = true;
      showFinal();
    }
  }

  let acc = 0, lastT = 0, snapTick = 0, finalSent = false;
  const DT = 1 / 60;

  /*
   * La simulation de l'hôte tourne sur un minuteur de Web Worker et non sur
   * requestAnimationFrame : quand l'onglet de l'hôte passe en arrière-plan
   * (test à deux onglets, fenêtre réduite), le navigateur suspend
   * requestAnimationFrame et le partenaire ne pouvait plus bouger.
   */
  let ticker = null, simT = 0;
  function startTicker() {
    stopTicker();
    simT = performance.now();
    try {
      const src = 'setInterval(function(){postMessage(0)},16)';
      ticker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      ticker.onmessage = hostTick;
    } catch (e) {
      ticker = { id: setInterval(hostTick, 16), terminate() { clearInterval(this.id); } };
    }
  }
  function stopTicker() { if (ticker) { ticker.terminate(); ticker = null; } }

  function hostTick() {
    if (!running || !g || role !== 'host') return stopTicker();
    const now = performance.now();
    const dt = Math.min(0.1, (now - simT) / 1000 || 0);
    simT = now;
    {
      Object.assign(g.inputs[0], keys);
      Object.assign(g.inputs[1], guestInputs);
      acc += dt;
      while (acc >= DT) { Sim.step(g, DT); acc -= DT; }
      snapTick += dt;
      if (snapTick >= 1 / 30) {
        snapTick = 0;
        net.msg({ t: 'st', s: Sim.snapshot(g) });
      }
      if (g.phase === 'final' && !finalSent) {
        finalSent = true;
        net.msg({ t: 'final', tracks: g.tracks });
        showFinal();
        return;
      }
    }
  }

  function loop(now) {
    if (!running || !g) return;
    const dt = Math.min(0.1, (now - lastT) / 1000 || 0);
    lastT = now;
    if (role !== 'host') {
      if (keysDirty || now - lastSend > 100) {
        keysDirty = false; lastSend = now;
        net.msg({ t: 'in', k: [keys.up, keys.down, keys.left, keys.right, keys.action].map((b) => (b ? 1 : 0)) });
      }
      // léger avancement local du temps pour les animations entre deux instantanés
      g.t += dt;
      guestSmooth(dt);
      if (g.phase === 'final') { if (g.tracks.length) showFinal(); return; }
    }
    Render.draw(ctx, g, myIndex());
    updateHud();
    requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------------- */
  /* Fluidité côté invité                                               */
  /* ---------------------------------------------------------------- */
  /*
   * L'invité ne reçoit l'état que 30 fois par seconde, avec le délai d'un
   * aller-retour réseau. Pour qu'il ne sente pas ce délai :
   *  - il déplace lui-même son personnage (ou son curseur) tout de suite,
   *    avec les mêmes règles de collision que l'hôte (prédiction) ;
   *  - les autres objets glissent en douceur vers leur dernière position
   *    connue au lieu de sauter d'un instantané à l'autre.
   * L'hôte reste seul juge : en cas d'écart net (chute, réapparition,
   * porte refermée), l'affichage se recale sur lui.
   */
  let disp = null, srv = null, dispLi = -1;

  function readPos(gg) {
    const d = gg.dyn || {};
    return {
      p: gg.players.map((p) => ({ x: p.x, y: p.y, dir: p.dir, moving: p.moving })),
      c: d.cursor ? { x: d.cursor.x, y: d.cursor.y } : null,
      r: d.raft ? { x: d.raft.x, y: d.raft.y } : null,
    };
  }

  function writePos(gg, v) {
    v.p.forEach((a, i) => Object.assign(gg.players[i], a));
    if (v.c && gg.dyn.cursor) { gg.dyn.cursor.x = v.c.x; gg.dyn.cursor.y = v.c.y; }
    if (v.r && gg.dyn.raft) gg.dyn.raft = Object.assign({}, gg.dyn.raft, { x: v.r.x, y: v.r.y });
  }

  function guestAfterSnapshot() {
    srv = readPos(g);
    const reset = !disp || dispLi !== g.li || g.phase !== 'play' || !!disp.c !== !!srv.c || !!disp.r !== !!srv.r;
    if (reset) { disp = readPos(g); dispLi = g.li; return; }
    writePos(g, disp); // on garde l'affichage lissé ; srv sert de cible
  }

  function approach(a, b, k, snapDist) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) > snapDist || Math.abs(dy) > snapDist) { a.x = b.x; a.y = b.y; return; }
    a.x += dx * k; a.y += dy * k;
  }

  function guestSmooth(dt) {
    if (!disp || !srv || g.phase !== 'play') return;
    const me = myIndex(), r = Sim.roleOf(g, me), L = g.L;
    const kOther = Math.min(1, dt * 15);
    // personnage de l'invité : prédiction
    if (L.mode === 'rives' || r === 'marcheur') {
      const p = disp.p[me];
      const blocked = L.mode === 'rives'
        ? (ch) => Sim.rivesBlocked(g, ch)
        : (ch, tx, ty) => Sim.tracesBlocked(g, ch, tx, ty);
      Sim.movePlayer(L, p, keys, dt, blocked);
      const s = srv.p[me];
      if (Math.abs(s.x - p.x) > 1.5 || Math.abs(s.y - p.y) > 1.5) { p.x = s.x; p.y = s.y; }
      else if (!p.moving) approach(p, s, Math.min(1, dt * 6), 99);
    } else {
      approach(disp.p[me], srv.p[me], kOther, 2);
      disp.p[me].dir = srv.p[me].dir; disp.p[me].moving = srv.p[me].moving;
    }
    // curseur du Guetteur
    if (disp.c) {
      if (r === 'guetteur') {
        const c = disp.c;
        const mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
        c.x = Math.max(0.5, Math.min(L.w - 0.5, c.x + mx * Sim.C.CURSOR_SPEED * dt));
        c.y = Math.max(0.5, Math.min(L.h - 0.5, c.y + my * Sim.C.CURSOR_SPEED * dt));
        if (Math.abs(srv.c.x - c.x) > 3 || Math.abs(srv.c.y - c.y) > 3) { c.x = srv.c.x; c.y = srv.c.y; }
        else if (!mx && !my) approach(c, srv.c, Math.min(1, dt * 6), 99);
      } else approach(disp.c, srv.c, kOther, 3);
    }
    // l'autre joueur et le radeau : glissement doux
    const o = 1 - me;
    approach(disp.p[o], srv.p[o], kOther, 2);
    disp.p[o].dir = srv.p[o].dir; disp.p[o].moving = srv.p[o].moving;
    if (disp.r) approach(disp.r, srv.r, kOther, 2);
    writePos(g, disp);
  }

  const ROLE_TEXT = {
    W: 'Rive ouest', E: 'Rive est',
    barreur: 'Le Barreur — gauche / droite', perchiste: 'Le Perchiste — bas : pousser, haut : freiner',
    guetteur: 'Le Guetteur — curseur + action', marcheur: 'Le Marcheur — vous êtes dans la brume',
  };

  function updateHud() {
    const L = g.L, r = Sim.roleOf(g, myIndex());
    $('hud-act').textContent = L.act;
    $('hud-title').textContent = L.title;
    const me = myIndex() === 0 ? 'Vous êtes orange' : 'Vous êtes bleu';
    $('hud-role').textContent = me + ' · ' + (ROLE_TEXT[r] || r);
    const goal = (g.seq[g.li] && g.seq[g.li].goal) || '';
    if ($('hint').textContent !== goal) $('hint').textContent = goal;
    let extra = 'Fragment ' + (g.li + 1) + ' / ' + g.seq.length;
    if (L.mode === 'radeau') extra += ' · planches ' + g.dyn.raft.planks + ' / ' + Sim.C.PLANKS + ' · fragments ' + g.dyn.collected.length + ' / ' + L.fragments.length;
    if (L.mode === 'rives' && L.order) extra += ' · ordre ' + g.dyn.progress + ' / ' + L.order.length;
    if (g.deaths) extra += ' · chutes ' + g.deaths;
    $('hud-extra').textContent = extra;
  }

  function showFinal() {
    running = false;
    stopTicker();
    show('final');
    const mc = $('map-canvas');
    const stats = 'Partie terminée · ' + (g.deaths || 0) + ' chute(s)';
    Render.drawFinalMap(mc, LEVELS, g.tracks, stats);
    $('final-stats').textContent = stats;
    try { $('btn-download').href = mc.toDataURL('image/png'); } catch (e) { /* ignore */ }
  }

  window.addEventListener('load', () => { show('lobby'); });
})();
