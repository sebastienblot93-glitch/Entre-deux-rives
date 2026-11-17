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
    requestAnimationFrame(loop);
  }

  function stopGame() { running = false; g = null; }

  function myIndex() { return role === 'host' ? 0 : 1; }

  function onPeerMessage(d) {
    if (!running || !g) return;
    if (role === 'host' && d.t === 'in') {
      guestInputs = { up: !!d.k[0], down: !!d.k[1], left: !!d.k[2], right: !!d.k[3], action: !!d.k[4] };
    } else if (role === 'guest' && d.t === 'st') {
      Sim.applySnapshot(g, d.s);
    } else if (role === 'guest' && d.t === 'final') {
      g.tracks = d.tracks;
      g.final = true;
      showFinal();
    }
  }

  let acc = 0, lastT = 0, snapTick = 0, finalSent = false;
  const DT = 1 / 60;

  function loop(now) {
    if (!running || !g) return;
    const dt = Math.min(0.1, (now - lastT) / 1000 || 0);
    lastT = now;
    if (role === 'host') {
      Object.assign(g.inputs[0], keys);
      Object.assign(g.inputs[1], guestInputs);
      acc += dt;
      while (acc >= DT) { Sim.step(g, DT); acc -= DT; }
      snapTick += dt;
      if (snapTick >= 1 / 20) {
        snapTick = 0;
        net.msg({ t: 'st', s: Sim.snapshot(g) });
      }
      if (g.phase === 'final' && !finalSent) {
        finalSent = true;
        net.msg({ t: 'final', tracks: g.tracks });
        showFinal();
        return;
      }
    } else {
      if (keysDirty || now - lastSend > 100) {
        keysDirty = false; lastSend = now;
        net.msg({ t: 'in', k: [keys.up, keys.down, keys.left, keys.right, keys.action].map((b) => (b ? 1 : 0)) });
      }
      // léger avancement local du temps pour les animations entre deux instantanés
      g.t += dt;
      if (g.phase === 'final') { if (g.tracks.length) showFinal(); return; }
    }
    Render.draw(ctx, g, myIndex());
    updateHud();
    requestAnimationFrame(loop);
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
    show('final');
    const mc = $('map-canvas');
    const stats = 'Partie terminée · ' + (g.deaths || 0) + ' chute(s)';
    Render.drawFinalMap(mc, LEVELS, g.tracks, stats);
    $('final-stats').textContent = stats;
    try { $('btn-download').href = mc.toDataURL('image/png'); } catch (e) { /* ignore */ }
  }

  window.addEventListener('load', () => { show('lobby'); });
})();
