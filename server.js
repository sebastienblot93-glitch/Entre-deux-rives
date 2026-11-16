/*
 * Entre Deux Rives — serveur
 *
 * Sert les fichiers de public/ et relaie les messages WebSocket entre les
 * deux joueurs d'un salon. Aucune dépendance : le protocole WebSocket est
 * implémenté à la main (RFC 6455, trames texte, ping/pong, close).
 *
 * Lancement :  node server.js        (port 8080, ou la variable PORT)
 *
 * Protocole (JSON) :
 *   client → serveur
 *     { t: 'create' }                → { t: 'created', code }
 *     { t: 'join', code }            → { t: 'error', msg } ou démarrage
 *     { t: 'quick' }                 → file d'attente pour un inconnu
 *     { t: 'msg', d: ... }           → relayé au partenaire tel quel
 *   serveur → client
 *     { t: 'start', role: 'host' | 'guest', code }
 *     { t: 'msg', d: ... }
 *     { t: 'peerLeft' }
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* ---------------------------------------------------------------- */
/* HTTP : fichiers statiques                                           */
/* ---------------------------------------------------------------- */

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

/* ---------------------------------------------------------------- */
/* WebSocket minimal                                                   */
/* ---------------------------------------------------------------- */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(data, opcode = 1) {
  const payload = Buffer.from(data);
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

class Client {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.room = null;
    this.isHost = false;
    this.alive = true;
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('close', () => this.onClose());
    socket.on('error', () => this.onClose());
    this.ping = setInterval(() => { if (this.alive) this.raw(encodeFrame('', 9)); }, 25000);
  }
  raw(buf) { if (this.alive) this.socket.write(buf); }
  send(obj) { this.raw(encodeFrame(JSON.stringify(obj))); }
  close() {
    if (!this.alive) return;
    this.alive = false;
    clearInterval(this.ping);
    try { this.socket.write(encodeFrame('', 8)); } catch (e) { /* ignore */ }
    this.socket.end();
  }
  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const opcode = b0 & 0x0f, masked = !!(b1 & 0x80);
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (masked) off += 4;
      if (this.buf.length < off + len) return;
      let payload = this.buf.subarray(off, off + len);
      if (masked) {
        const mask = this.buf.subarray(off - 4, off);
        const out = Buffer.alloc(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
        payload = out;
      }
      this.buf = this.buf.subarray(off + len);
      if (opcode === 8) { this.close(); this.onClose(); return; }
      if (opcode === 9) { this.raw(encodeFrame(payload, 10)); continue; }
      if (opcode === 1) {
        let msg;
        try { msg = JSON.parse(payload.toString('utf8')); } catch (e) { continue; }
        handle(this, msg);
      }
    }
  }
  onClose() {
    if (!this.alive) { leaveRoom(this); return; }
    this.alive = false;
    clearInterval(this.ping);
    leaveRoom(this);
  }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  new Client(socket);
});

/* ---------------------------------------------------------------- */
/* Salons                                                              */
/* ---------------------------------------------------------------- */

const rooms = new Map(); // code → { code, host, guest }
let waiting = null;      // client en attente d'une partie rapide

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!rooms.has(code)) return code;
  }
}

function startRoom(room) {
  room.host.send({ t: 'start', role: 'host', code: room.code });
  room.guest.send({ t: 'start', role: 'guest', code: room.code });
  console.log('[salon ' + room.code + '] partie lancée');
}

function leaveRoom(c) {
  if (waiting === c) waiting = null;
  const room = c.room;
  if (!room) return;
  c.room = null;
  const other = room.host === c ? room.guest : room.host;
  if (other && other.alive) { other.send({ t: 'peerLeft' }); other.room = null; }
  rooms.delete(room.code);
  console.log('[salon ' + room.code + '] fermé');
}

function handle(c, msg) {
  switch (msg.t) {
    case 'create': {
      leaveRoom(c);
      const room = { code: makeCode(), host: c, guest: null };
      rooms.set(room.code, room);
      c.room = room; c.isHost = true;
      c.send({ t: 'created', code: room.code });
      break;
    }
    case 'join': {
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return c.send({ t: 'error', msg: 'Aucune partie avec le code ' + code + '.' });
      if (room.guest) return c.send({ t: 'error', msg: 'Cette partie est déjà complète.' });
      leaveRoom(c);
      room.guest = c; c.room = room; c.isHost = false;
      startRoom(room);
      break;
    }
    case 'quick': {
      leaveRoom(c);
      if (waiting && waiting.alive && waiting !== c) {
        const room = { code: makeCode(), host: waiting, guest: c };
        rooms.set(room.code, room);
        waiting.room = room; waiting.isHost = true;
        c.room = room; c.isHost = false;
        waiting = null;
        startRoom(room);
      } else {
        waiting = c;
        c.send({ t: 'waiting' });
      }
      break;
    }
    case 'msg': {
      const room = c.room;
      if (!room) return;
      const other = room.host === c ? room.guest : room.host;
      if (other && other.alive) other.send({ t: 'msg', d: msg.d });
      break;
    }
    default:
      break;
  }
}

server.listen(PORT, () => {
  console.log('Entre Deux Rives — http://localhost:' + PORT);
});
