/*
 * Entre Deux Rives — rendu
 *
 * draw(ctx, g, viewerIndex) dessine l'état de la partie du point de vue
 * d'un joueur. C'est ici que l'information asymétrique est appliquée :
 * ce que le joueur ne doit pas voir n'est tout simplement pas dessiné.
 */
(function (root) {
  'use strict';
  const S = root.Sim;
  const T = 32; // pixels par case

  const COL = {
    paper: '#f3ead7', paperDark: '#e4d7bb', ink: '#2b2a28', inkSoft: '#6b655a',
    ochre: '#c0803a', slate: '#4a6b8a', water: '#9fc1d4', waterDeep: '#7ea7bf',
    wood: '#9a6b3c', woodLight: '#c9a06c', danger: '#b4392f', good: '#4f8a4a',
    sand: '#e8d9a8', reed: '#6e7a3a', fog: 'rgba(43,42,40,0.93)', mud: '#c9b58a',
  };

  /* ---------------------------------------------------------------- */
  /* Primitives                                                         */
  /* ---------------------------------------------------------------- */

  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }

  function ground(ctx, px, py, tone) {
    ctx.fillStyle = tone || COL.paper;
    ctx.fillRect(px, py, T, T);
    const r = hash(px, py);
    if (r > 0.6) { ctx.fillStyle = 'rgba(43,42,40,0.08)'; ctx.fillRect(px + 6 + r * 14, py + 8 + r * 10, 2, 2); }
  }

  function wall(ctx, px, py) {
    ctx.fillStyle = COL.ink;
    ctx.fillRect(px, py, T, T);
    ctx.strokeStyle = 'rgba(243,234,215,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -T; i < T; i += 8) { ctx.moveTo(px + i, py + T); ctx.lineTo(px + i + T, py); }
    ctx.stroke();
  }

  function reeds(ctx, px, py) {
    ctx.fillStyle = '#3f4a2a';
    ctx.fillRect(px, py, T, T);
    ctx.strokeStyle = COL.reed;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const x = px + 5 + i * 8 + hash(px + i, py) * 3; ctx.moveTo(x, py + T); ctx.lineTo(x - 2, py + 6 + hash(px, py + i) * 6); }
    ctx.stroke();
  }

  function water(ctx, px, py, t, deep) {
    ctx.fillStyle = deep ? COL.waterDeep : COL.water;
    ctx.fillRect(px, py, T, T);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.2;
    const ph = (t * 0.8 + hash(px, py) * 6) % 6;
    ctx.beginPath();
    ctx.moveTo(px + 4, py + 10 + ph);
    ctx.quadraticCurveTo(px + 10, py + 6 + ph, px + 16, py + 10 + ph);
    ctx.quadraticCurveTo(px + 22, py + 14 + ph, px + 28, py + 10 + ph);
    ctx.stroke();
  }

  function cracked(ctx, px, py) {
    ground(ctx, px, py, COL.paperDark);
    ctx.strokeStyle = COL.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + 6, py + 4); ctx.lineTo(px + 14, py + 14); ctx.lineTo(px + 10, py + 22); ctx.lineTo(px + 18, py + 30);
    ctx.moveTo(px + 14, py + 14); ctx.lineTo(px + 26, py + 10);
    ctx.moveTo(px + 10, py + 22); ctx.lineTo(px + 2, py + 26);
    ctx.stroke();
  }

  function gate(ctx, px, py, open, horizontal) {
    if (open) {
      ground(ctx, px, py, COL.woodLight);
      ctx.strokeStyle = COL.wood; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 4; i < T; i += 8) { if (horizontal) { ctx.moveTo(px + i, py); ctx.lineTo(px + i, py + T); } else { ctx.moveTo(px, py + i); ctx.lineTo(px + T, py + i); } }
      ctx.stroke();
      return;
    }
    ground(ctx, px, py, COL.paperDark);
    ctx.fillStyle = COL.wood;
    for (let i = 3; i < T; i += 7) { if (horizontal) ctx.fillRect(px + i, py + 2, 3, T - 4); else ctx.fillRect(px + 2, py + i, T - 4, 3); }
    ctx.fillStyle = COL.ink;
    if (horizontal) { ctx.fillRect(px, py + 6, T, 2); ctx.fillRect(px, py + T - 8, T, 2); } else { ctx.fillRect(px + 6, py, 2, T); ctx.fillRect(px + T - 8, py, 2, T); }
  }

  function plate(ctx, px, py, held) {
    ground(ctx, px, py);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
    ctx.fillStyle = held ? COL.inkSoft : COL.paperDark;
    ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function ropeBridge(ctx, px, py) {
    ctx.fillStyle = COL.water; ctx.fillRect(px, py, T, T);
    ctx.fillStyle = COL.woodLight;
    for (let i = 1; i < T; i += 6) ctx.fillRect(px + 3, py + i, T - 6, 4);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px + 3, py); ctx.lineTo(px + 3, py + T); ctx.moveTo(px + T - 3, py); ctx.lineTo(px + T - 3, py + T); ctx.stroke();
  }

  function exitMark(ctx, px, py, t) {
    ground(ctx, px, py);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 3.5 + Math.sin(t * 4) * 1, 0, Math.PI * 2); ctx.fill();
  }

  function lever(ctx, lv, pulled, number, t) {
    const px = lv.x * T, py = lv.y * T;
    ctx.fillStyle = COL.ink;
    ctx.fillRect(px + 12, py + 18, 8, 10);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px + 16, py + 22);
    if (pulled) ctx.lineTo(px + 26, py + 8); else ctx.lineTo(px + 6, py + 8);
    ctx.stroke();
    ctx.fillStyle = pulled ? COL.danger : COL.ochre;
    ctx.beginPath(); ctx.arc(pulled ? px + 26 : px + 6, py + 8, 4, 0, Math.PI * 2); ctx.fill();
    if (number != null) {
      ctx.fillStyle = COL.paper; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px + 24, py + 26, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COL.ink; ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(number), px + 24, py + 26.5);
    }
  }

  function rockfallZone(ctx, z, t, active) {
    const px = z.x * T, py = z.y * T, w = z.w * T, h = z.h * T;
    ctx.fillStyle = active ? 'rgba(180,57,47,0.25)' : 'rgba(43,42,40,0.10)';
    ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = active ? COL.danger : COL.inkSoft; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.strokeRect(px + 1, py + 1, w - 2, h - 2); ctx.setLineDash([]);
    // petits rochers
    const n = Math.max(3, Math.floor(w / 24));
    for (let i = 0; i < n; i++) {
      const rx = px + 8 + ((i * 97) % Math.max(1, w - 16)), ry = py + ((t * 90 + i * 37) % (h + 10)) - 6;
      ctx.fillStyle = active ? COL.ink : 'rgba(43,42,40,0.25)';
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + 7, ry + 3); ctx.lineTo(rx + 4, ry + 8); ctx.lineTo(rx - 3, ry + 6); ctx.closePath(); ctx.fill();
    }
  }

  function player(ctx, p, idx, alpha) {
    const px = p.x * T, py = p.y * T;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = 'rgba(43,42,40,0.18)';
    ctx.beginPath(); ctx.ellipse(px, py + 9, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = idx === 0 ? COL.ochre : COL.slate;
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const d = [[0, 1], [-1, 0], [1, 0], [0, -1]][p.dir] || [0, 1];
    ctx.fillStyle = COL.paper;
    ctx.beginPath(); ctx.arc(px + d[0] * 4, py + d[1] * 4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function label(ctx, text, x, y, size, color, align) {
    ctx.font = (size || 14) + 'px Georgia';
    ctx.fillStyle = color || COL.ink;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  /* ---------------------------------------------------------------- */
  /* Rives                                                              */
  /* ---------------------------------------------------------------- */

  function drawRives(ctx, g, viewer) {
    const L = g.L, d = g.dyn, me = S.roleOf(g, viewer), t = g.t;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const ch = L.g[y][x], px = x * T, py = y * T, bank = L.bankOf(x);
      const seesHazard = L.river ? bank !== me : false;
      if (ch === '#') wall(ctx, px, py);
      else if (ch === '~') water(ctx, px, py, t);
      else if (ch === 'f') (seesHazard ? cracked(ctx, px, py) : ground(ctx, px, py));
      else if (S.isRivesGate(ch)) gate(ctx, px, py, !!(d.opened[ch] || d.held[ch]), false);
      else if (S.isRivesPlate(ch)) plate(ctx, px, py, !!d.held[ch.toUpperCase()]);
      else if (ch === '=') ropeBridge(ctx, px, py);
      else if (ch === 'X') exitMark(ctx, px, py, t);
      else ground(ctx, px, py);
    }
    for (const z of L.rockfalls) {
      const seesHazard = L.river ? L.bankOf(z.x) !== me : false;
      if (seesHazard) rockfallZone(ctx, z, t, S.rockfallActive(t, z));
    }
    L.levers.forEach((lv, k) => {
      const pulled = d.levers[k].pulledAt >= 0;
      const showNumber = !L.hideOwnNumbers || lv.bank !== me;
      lever(ctx, lv, pulled, showNumber ? lv.n : null, t);
    });
    if (d.flash && t - d.flash.t < 1.0) {
      ctx.fillStyle = d.flash.ok ? 'rgba(79,138,74,0.25)' : 'rgba(180,57,47,0.25)';
      ctx.fillRect(0, 0, L.w * T, L.h * T);
    }
    if (L.order) {
      // progression de l'ordre, visible par les deux
      for (let i = 0; i < L.order.length; i++) {
        const cx = (L.w * T) / 2 - (L.order.length - 1) * 14 + i * 28, cy = 16;
        ctx.fillStyle = i < d.progress ? COL.good : COL.paper;
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    g.players.forEach((p, i) => player(ctx, p, i));
  }

  /* ---------------------------------------------------------------- */
  /* Radeau                                                             */
  /* ---------------------------------------------------------------- */

  function cameraRadeau(g) {
    const L = g.L, r = g.dyn.raft;
    return { x: 0, y: Math.max(0, Math.min(L.h - S.C.VIEW_H, r.y - S.C.VIEW_H / 2)) };
  }

  function drawRadeau(ctx, g, viewer) {
    const L = g.L, d = g.dyn, r = d.raft, me = S.roleOf(g, viewer), t = g.t;
    const cam = cameraRadeau(g);
    ctx.save();
    ctx.translate(0, -cam.y * T);
    const y0 = Math.floor(cam.y), y1 = Math.min(L.h, y0 + S.C.VIEW_H + 2);
    for (let y = y0; y < y1; y++) for (let x = 0; x < L.w; x++) {
      const ch = L.g[y][x], px = x * T, py = y * T;
      if (ch === '#') wall(ctx, px, py);
      else water(ctx, px, py, t + L.current * 0, false);
      if (ch === 'C') { ctx.strokeStyle = COL.ink; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, py + T / 2); ctx.lineTo(px + T, py + T / 2); ctx.stroke(); ctx.setLineDash([]); }
      if (ch === 'X') { ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py + 10); ctx.lineTo(px + T, py + 10); ctx.moveTo(px, py + 18); ctx.lineTo(px + T, py + 18); ctx.stroke(); }
    }
    // courant : traits qui défilent
    if (L.current > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 24; i++) {
        const x = 4 * T + ((i * 53) % (12 * T)), yy = y0 * T + ((t * L.current * T + i * 71) % ((S.C.VIEW_H + 2) * T));
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x, yy + 14); ctx.stroke();
      }
    }
    // obstacles, selon le rôle
    for (const o of L.obstacles) {
      if (o.y < y0 - 1 || o.y > y1 + 1) continue;
      const px = o.x * T, py = o.y * T;
      const flash = d.flashes.find((f) => f.x === o.x && f.y === o.y);
      if (o.k === 'rock' && (me === 'barreur' || flash)) {
        ctx.fillStyle = flash ? COL.danger : '#5a5750'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px - 12, py + 6); ctx.lineTo(px - 4, py - 11); ctx.lineTo(px + 8, py - 8); ctx.lineTo(px + 13, py + 4); ctx.lineTo(px + 2, py + 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (o.k === 'whirl' && (me === 'perchiste' || flash)) {
        ctx.strokeStyle = flash ? COL.danger : COL.ink; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 6; a += 0.2) { const rr = a * 0.9; const ang = a + t * 3; const x = px + Math.cos(ang) * rr, y = py + Math.sin(ang) * rr; if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      } else if (o.k === 'sand' && (me === 'perchiste' || flash)) {
        ctx.fillStyle = flash ? COL.danger : COL.sand; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(px, py, 15, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); const s = o.dir === 'L' ? -1 : 1; ctx.moveTo(px - s * 6, py); ctx.lineTo(px + s * 7, py); ctx.lineTo(px + s * 3, py - 4); ctx.moveTo(px + s * 7, py); ctx.lineTo(px + s * 3, py + 4); ctx.stroke();
      }
    }
    for (const f of L.fragments) {
      if (d.collected.includes(f.id)) continue;
      const px = f.x * T, py = f.y * T + Math.sin(t * 3 + f.x) * 2;
      ctx.fillStyle = COL.paper; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px - 8, py - 7); ctx.lineTo(px + 7, py - 9); ctx.lineTo(px + 9, py + 6); ctx.lineTo(px - 6, py + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = COL.ochre; ctx.beginPath(); ctx.moveTo(px - 4, py - 2); ctx.lineTo(px + 4, py + 3); ctx.stroke();
    }
    // radeau
    const px = r.x * T, py = r.y * T;
    ctx.save();
    ctx.translate(px, py); ctx.rotate(r.angle);
    ctx.fillStyle = COL.woodLight; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
    ctx.fillRect(-16, -14, 32, 28); ctx.strokeRect(-16, -14, 32, 28);
    ctx.strokeStyle = COL.wood;
    for (let i = -9; i <= 9; i += 6) { ctx.beginPath(); ctx.moveTo(-16, i); ctx.lineTo(16, i); ctx.stroke(); }
    // planches manquantes
    for (let i = r.planks; i < S.C.PLANKS; i++) { ctx.fillStyle = COL.water; ctx.fillRect(-14 + i * 10, -12, 8, 24); }
    ctx.restore();
    // les deux cartographes sur le radeau
    const a = { x: r.x - 0.22, y: r.y, dir: 0 }, b = { x: r.x + 0.22, y: r.y, dir: 0 };
    player(ctx, a, 0); player(ctx, b, 1);
    if (r.stuck) {
      ctx.fillStyle = COL.ink; ctx.beginPath();
      const s = r.stuck.dir === 'L' ? -1 : 1;
      ctx.moveTo(px + s * 26, py - 24); ctx.lineTo(px + s * 38, py - 24); ctx.lineTo(px + s * 32, py - 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(43,42,40,0.3)'; ctx.fillRect(px - 20, py - 34, 40 * Math.min(1, r.stuck.hold / S.C.SAND_HOLD), 4);
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /* Traces                                                             */
  /* ---------------------------------------------------------------- */

  function drawTraces(ctx, g, viewer) {
    const L = g.L, d = g.dyn, me = S.roleOf(g, viewer), t = g.t;
    const wi = S.indexOfRole(g, 'marcheur'), w = g.players[wi];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const ch = L.g[y][x], px = x * T, py = y * T;
      if (ch === '#') reeds(ctx, px, py);
      else if (ch === '~') water(ctx, px, py, t, true);
      else if (S.isUpper(ch) || S.isLower(ch)) {
        const open = S.toggleState(d, ch.toUpperCase());
        if (open) gate(ctx, px, py, true, true);
        else { water(ctx, px, py, t, true); ctx.fillStyle = COL.wood; ctx.fillRect(px + 4, py + 4, 5, 5); ctx.fillRect(px + T - 9, py + T - 9, 5, 5); }
      } else if (ch === '%') {
        if (S.channelFlooded(L, d, t, x, y)) water(ctx, px, py, t, false);
        else { ground(ctx, px, py, COL.mud); ctx.strokeStyle = 'rgba(43,42,40,0.25)'; ctx.beginPath(); ctx.moveTo(px, py + 8); ctx.lineTo(px + T, py + 8); ctx.moveTo(px, py + T - 8); ctx.lineTo(px + T, py + T - 8); ctx.stroke(); }
      } else if (ch === 'X') {
        ground(ctx, px, py);
        ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.moveTo(px + 10, py + 28); ctx.lineTo(px + 13, py + 6); ctx.lineTo(px + 19, py + 6); ctx.lineTo(px + 22, py + 28); ctx.closePath(); ctx.fill();
        ctx.fillStyle = COL.ochre; ctx.beginPath(); ctx.arc(px + 16, py + 6, 4 + Math.sin(t * 5) * 1, 0, Math.PI * 2); ctx.fill();
      } else if (S.isDigit(ch)) {
        ground(ctx, px, py);
        if (me === 'marcheur') {
          ctx.fillStyle = d.onSwitch === S.digitLetter(ch) ? COL.good : COL.paperDark; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
          ctx.fillRect(px + 8, py + 8, 16, 16); ctx.strokeRect(px + 8, py + 8, 16, 16);
          label(ctx, ch, px + 16, py + 16.5, 11, COL.ink);
        }
      } else ground(ctx, px, py);
    }
    // sables mouvants : Guetteur seulement (et révélation)
    if (me === 'guetteur') for (const q of L.quicksand) {
      const rc = S.quicksandRect(q, t);
      ctx.fillStyle = 'rgba(192,128,58,0.45)';
      ctx.fillRect(rc.x * T, rc.y * T, rc.w * T, rc.h * T);
      ctx.strokeStyle = COL.ochre; ctx.lineWidth = 1.5;
      for (let i = 0; i < rc.w * rc.h; i++) {
        const cx = rc.x * T + 16 + (i % rc.w) * T, cy = rc.y * T + 16 + Math.floor(i / rc.w) * T;
        ctx.beginPath(); for (let a = 0; a < Math.PI * 4; a += 0.3) { const rr = a * 1.6; const x = cx + Math.cos(a + t * 2) * rr, y = cy + Math.sin(a + t * 2) * rr; if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
      }
    }
    // vannes
    for (const tg of L.toggles) {
      if (tg.kind !== 'valve') continue;
      const open = S.toggleState(d, tg.id), px = tg.x * T, py = tg.y * T;
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.5; ctx.fillStyle = open ? COL.water : COL.paperDark;
      ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 4 + (open ? 0 : Math.PI / 8); ctx.moveTo(px - Math.cos(a) * 10, py - Math.sin(a) * 10); ctx.lineTo(px + Math.cos(a) * 10, py + Math.sin(a) * 10); } ctx.stroke();
      if (me === 'guetteur') label(ctx, tg.id, px, py + 20, 11, COL.ink);
    }
    // cadenas sur les passerelles verrouillées (Guetteur)
    if (me === 'guetteur') for (const tg of L.toggles) {
      if (tg.kind !== 'gate' || !tg.lock) continue;
      const px = tg.x * T, py = tg.y * T;
      ctx.fillStyle = COL.paper; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
      ctx.fillRect(px - 7, py - 4, 14, 11); ctx.strokeRect(px - 7, py - 4, 14, 11);
      ctx.beginPath(); ctx.arc(px, py - 5, 5, Math.PI, 0); ctx.stroke();
    }
    // empreintes (Guetteur) ou Marcheur
    if (me === 'guetteur') {
      for (const f of d.foot) {
        const age = (t - f.t) / S.C.FOOT_LIFE, a = Math.max(0, 1 - age);
        ctx.fillStyle = 'rgba(43,42,40,' + (a * 0.8).toFixed(2) + ')';
        const px = f.x * T, py = f.y * T;
        const vert = f.dir === 0 || f.dir === 3;
        ctx.beginPath(); ctx.ellipse(px - (vert ? 4 : 0), py - (vert ? 0 : 4), 2.5, 4, vert ? 0 : Math.PI / 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(px + (vert ? 4 : 0), py + (vert ? 0 : 4), 2.5, 4, vert ? 0 : Math.PI / 2, 0, Math.PI * 2); ctx.fill();
      }
      // curseur du Guetteur
      const c = d.cursor, px = c.x * T, py = c.y * T;
      const near = S.toggleNear(L, c);
      ctx.strokeStyle = near ? COL.ochre : COL.ink; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px - 18, py); ctx.lineTo(px - 9, py); ctx.moveTo(px + 9, py); ctx.lineTo(px + 18, py); ctx.moveTo(px, py - 18); ctx.lineTo(px, py - 9); ctx.moveTo(px, py + 9); ctx.lineTo(px, py + 18); ctx.stroke();
      if (d.flash && t - d.flash.t < 0.6) {
        ctx.strokeStyle = d.flash.ok ? COL.good : COL.danger; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px, py, 13 + (t - d.flash.t) * 30, 0, Math.PI * 2); ctx.stroke();
      }
      // jauge de marée
      const ph = S.tidePhase(L, t), high = ph >= 0.5;
      const gx = L.w * T - 150, gy = 10;
      ctx.fillStyle = 'rgba(243,234,215,0.85)'; ctx.fillRect(gx - 6, gy - 4, 146, 22);
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, 100, 12);
      ctx.fillStyle = high ? COL.waterDeep : COL.sand; ctx.fillRect(gx, gy, 100 * ph, 12);
      label(ctx, high ? 'marée haute' : 'marée basse', gx + 122, gy + 6, 11, COL.ink);
    } else {
      player(ctx, w, wi);
      // brume
      const px = w.x * T, py = w.y * T, R = S.C.FOG_R * T;
      const grad = ctx.createRadialGradient(px, py, R * 0.55, px, py, R);
      grad.addColorStop(0, 'rgba(43,42,40,0)'); grad.addColorStop(1, COL.fog);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, L.w * T, L.h * T);
      ctx.fillStyle = COL.fog;
      ctx.beginPath(); ctx.rect(0, 0, L.w * T, L.h * T); ctx.arc(px, py, R, 0, Math.PI * 2, true); ctx.fill();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Révélation d'un échec, superpositions                              */
  /* ---------------------------------------------------------------- */

  function drawReveal(ctx, g, camY) {
    const rv = g.reveal; if (!rv) return;
    ctx.save(); ctx.translate(0, -camY * T);
    ctx.strokeStyle = COL.danger; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
    const blink = Math.floor(g.pt * 6) % 2 === 0;
    if (!blink) { ctx.restore(); return; }
    if (rv.tiles) for (const tl of rv.tiles) ctx.strokeRect(tl.x * T + 2, tl.y * T + 2, T - 4, T - 4);
    if (rv.zone) ctx.strokeRect(rv.zone.x * T + 2, rv.zone.y * T + 2, rv.zone.w * T - 4, rv.zone.h * T - 4);
    if (rv.rect) ctx.strokeRect(rv.rect.x * T + 2, rv.rect.y * T + 2, rv.rect.w * T - 4, rv.rect.h * T - 4);
    if (rv.kind === 'sink') { ctx.beginPath(); ctx.arc(rv.x * T, rv.y * T, 18, 0, Math.PI * 2); ctx.stroke(); }
    if (rv.kind === 'pace') { ctx.beginPath(); ctx.moveTo(g.players[0].x * T, g.players[0].y * T); ctx.lineTo(g.players[1].x * T, g.players[1].y * T); ctx.stroke(); }
    ctx.restore();
  }

  const REVEAL_TEXT = {
    fragile: 'Une dalle fragile a cédé.', rockfall: 'Les pierres sont tombées.', pace: 'Le pont de corde a lâché.',
    sink: 'Le radeau a coulé.', quicksand: 'Les sables mouvants.', tide: 'La marée a recouvert le chenal.',
  };

  function overlay(ctx, g, W, H) {
    if (g.phase === 'intro') {
      const a = Math.min(1, g.pt * 2, (S.C.INTRO_T - g.pt) * 2);
      ctx.fillStyle = 'rgba(43,42,40,' + (0.75 * a).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a;
      label(ctx, g.L.act, W / 2, H / 2 - 44, 16, '#b7ab93');
      label(ctx, g.L.title, W / 2, H / 2 - 10, 34, COL.paper);
      label(ctx, g.L.intro, W / 2, H / 2 + 30, 15, '#d8c08a');
      ctx.globalAlpha = 1;
    } else if (g.phase === 'dead') {
      ctx.fillStyle = 'rgba(180,57,47,0.12)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(43,42,40,0.8)'; ctx.fillRect(W / 2 - 180, H - 54, 360, 36);
      label(ctx, REVEAL_TEXT[(g.reveal || {}).kind] || 'Échec.', W / 2, H - 36, 16, COL.paper);
    } else if (g.phase === 'won') {
      const a = Math.min(1, g.pt * 2);
      ctx.fillStyle = 'rgba(243,234,215,' + (0.6 * a).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a;
      label(ctx, 'Fragment de carte retrouvé', W / 2, H / 2 - 8, 28, COL.ink);
      label(ctx, 'Fragment ' + (g.li + 1) + ' sur ' + g.seq.length, W / 2, H / 2 + 24, 14, COL.inkSoft);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Point d'entrée                                                     */
  /* ---------------------------------------------------------------- */

  function sizeFor(L) {
    if (L.mode === 'radeau') return { w: L.w * T, h: S.C.VIEW_H * T };
    return { w: L.w * T, h: L.h * T };
  }

  function draw(ctx, g, viewer) {
    const L = g.L, sz = sizeFor(L);
    const canvas = ctx.canvas;
    if (canvas.width !== sz.w || canvas.height !== sz.h) { canvas.width = sz.w; canvas.height = sz.h; }
    ctx.clearRect(0, 0, sz.w, sz.h);
    let camY = 0;
    if (L.mode === 'rives') drawRives(ctx, g, viewer);
    else if (L.mode === 'radeau') { camY = cameraRadeau(g).y; drawRadeau(ctx, g, viewer); }
    else drawTraces(ctx, g, viewer);
    if (g.phase === 'dead') drawReveal(ctx, g, camY);
    overlay(ctx, g, sz.w, sz.h);
  }

  /* ---------------------------------------------------------------- */
  /* Carte finale : tous les trajets, à l'encre                         */
  /* ---------------------------------------------------------------- */

  function drawFinalMap(canvas, levels, tracks, stats) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = COL.paper; ctx.fillRect(0, 0, W, H);
    const seq = levels.sequence, cols = 4, rows = Math.ceil(seq.length / cols);
    const cw = (W - 40) / cols, chh = (H - 120) / rows;
    seq.forEach((entry, li) => {
      const L = S.prepare(levels, entry);
      const cx = 20 + (li % cols) * cw, cy = 70 + Math.floor(li / cols) * chh;
      const sc = Math.min((cw - 24) / L.w, (chh - 40) / L.h);
      const ox = cx + (cw - L.w * sc) / 2, oy = cy + 24 + (chh - 40 - L.h * sc) / 2;
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const ch = L.g[y][x];
        if (ch === '#') ctx.fillStyle = 'rgba(43,42,40,0.35)';
        else if (ch === '~') ctx.fillStyle = 'rgba(126,167,191,0.6)';
        else continue;
        ctx.fillRect(ox + x * sc, oy + y * sc, sc + 0.5, sc + 0.5);
      }
      const tr = tracks[li] || [];
      ctx.lineWidth = Math.max(1, sc * 0.35); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const who of [0, 1, 2]) {
        ctx.strokeStyle = who === 0 ? COL.ochre : who === 1 ? COL.slate : COL.ink;
        ctx.globalAlpha = 0.85;
        let prev = null;
        ctx.beginPath();
        for (const p of tr) {
          if (p[2] !== who) continue;
          const x = ox + p[0] * sc, y = oy + p[1] * sc;
          if (prev && Math.hypot(x - prev[0], y - prev[1]) < sc * 4) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          prev = [x, y];
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      label(ctx, entry.title, cx + cw / 2, cy + 10, 13, COL.ink);
    });
    label(ctx, 'Entre Deux Rives', W / 2, 28, 26, COL.ink);
    label(ctx, stats || '', W / 2, H - 24, 13, COL.inkSoft);
    label(ctx, 'ocre : hôte · bleu : invité · encre : le radeau', W - 20, H - 24, 12, COL.inkSoft, 'right');
  }

  root.Render = { draw, drawFinalMap, T, COL };
})(typeof self !== 'undefined' ? self : this);
