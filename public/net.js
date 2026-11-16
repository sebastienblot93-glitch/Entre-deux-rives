/*
 * Entre Deux Rives — liaison réseau côté client
 *
 * Une connexion WebSocket vers le serveur qui a servi la page.
 * En https (par exemple sur Render), la connexion passe en wss.
 */
(function (root) {
  'use strict';

  function connect(handlers) {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    const ws = new WebSocket(proto + location.host);
    const api = {
      ready: false,
      send(obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); },
      msg(d) { api.send({ t: 'msg', d }); },
      close() { ws.close(); },
    };
    ws.onopen = () => { api.ready = true; if (handlers.open) handlers.open(); };
    ws.onclose = () => { api.ready = false; if (handlers.close) handlers.close(); };
    ws.onerror = () => { if (handlers.error) handlers.error(); };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.t === 'msg') { if (handlers.msg) handlers.msg(m.d); }
      else if (m.t === 'error') { if (handlers.serverError) handlers.serverError(m); }
      else if (handlers[m.t]) handlers[m.t](m);
    };
    return api;
  }

  root.Net = { connect };
})(typeof self !== 'undefined' ? self : this);
