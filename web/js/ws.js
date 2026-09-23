/* Party relay client. Call this only when a person hosts a room or a phone taps Join.
   Solo and Quiet Hours must not call it. file:// party tabs use BroadcastChannel
   on this computer only. http(s) uses the WebSocket and reconnects with backoff.
   BroadcastChannel is not a phone path. */
(function (root) {
  var PDG = root.PDG = root.PDG || {};

  function connect(opts) {
    var handlers = opts.handlers || {};
    var room = String(opts.room || "").toUpperCase();
    var role = opts.role || "player";
    var closed = false;
    var ws = null;
    var bc = null;
    var mode = "ws";
    var attempt = 0;
    var timer = null;
    var pingTimer = null;
    var generation = 0;

    function emit(name, arg) {
      if (handlers[name]) handlers[name](arg);
    }

    function sendRaw(obj) {
      var text = JSON.stringify(obj);
      if (mode === "ws" && ws && ws.readyState === 1) ws.send(text);
      else if (mode === "bc" && bc) bc.postMessage(obj);
    }

    function hello() {
      sendRaw({
        op: "hello",
        role: role,
        room: room,
        name: opts.name || "",
        avatar: opts.avatar || "",
        audience: !!opts.audience
      });
    }

    function scheduleReconnect() {
      if (closed || mode === "bc" || location.protocol === "file:") return;
      var delay = Math.min(8000, 500 * Math.pow(2, attempt));
      attempt += 1;
      if (timer) clearTimeout(timer);
      emit("reconnecting", delay);
      timer = setTimeout(startWs, delay);
    }

    function bindSocket(socket, gen) {
      ws = socket;
      var opened = false;
      ws.onmessage = function (ev) {
        if (closed || gen !== generation) return;
        if (ev.data === "pong") return;
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.op === "welcome") emit("welcome", msg);
        else if (msg.op === "joined") emit("joined", msg.player);
        else if (msg.op === "left") emit("left", msg.id);
        else if (msg.op === "act") emit("act", msg);
        else if (msg.op === "meta") emit("meta", msg);
        else if (msg.op === "state") emit("state", msg.state);
        else if (msg.op === "priv") emit("priv", msg.payload);
        else if (msg.op === "hostgone") emit("hostgone", msg);
        else if (msg.op === "err") emit("error", msg.msg || "Connection refused.");
      };
      ws.onopen = function () {
        if (closed || gen !== generation) return;
        opened = true;
        attempt = 0;
        hello();
        startPing();
      };
      ws.onclose = function () {
        if (closed || gen !== generation) return;
        if (!opened) emit("offline");
        else emit("close");
        scheduleReconnect();
      };
    }

    function socketUrl() {
      var base;
      if (useLanRelay()) {
        var proto = location.protocol === "https:" ? "wss://" : "ws://";
        base = proto + location.host + "/ws";
      } else {
        base = String(root.PDG_RELAY_URL || "").replace(/\/$/, "");
      }
      if (!base || base.indexOf("SUBDOMAIN") !== -1) return "";
      var join = base.indexOf("?") === -1 ? "?" : "&";
      return base + join + "room=" + encodeURIComponent(room);
    }

    function startPing() {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      if (useLanRelay()) return;
      pingTimer = setInterval(function () {
        if (closed || !ws || ws.readyState !== 1) return;
        try { ws.send("ping"); } catch (e) { /* ignore */ }
      }, 20000);
    }

    function startWs() {
      if (closed) return;
      mode = "ws";
      var gen = ++generation;
      var url = socketUrl();
      if (!url) {
        emit("error", "Hosted room relay is not configured.");
        emit("offline");
        return;
      }
      var socket;
      try {
        socket = new WebSocket(url);
      } catch (e) {
        emit("offline");
        scheduleReconnect();
        return;
      }
      bindSocket(socket, gen);
    }

    function startBc() {
      mode = "bc";
      if (typeof BroadcastChannel === "undefined") {
        emit("error", "Multiplayer needs the PDG Party launcher so phones can join.");
        return;
      }
      bc = new BroadcastChannel("pdg-party");
      var id = opts.localId || ("local-" + Math.random().toString(16).slice(2, 8));
      bc.onmessage = function (ev) {
        if (closed) return;
        var msg = ev.data || {};
        if (msg.room && msg.room !== room) return;
        if (msg.op === "hello" && role === "host" && msg.role !== "host") {
          emit("joined", {
            id: msg.localId,
            name: msg.name || "Airman",
            avatar: msg.avatar || "open-book",
            audience: !!msg.audience
          });
          bc.postMessage({ op: "welcome-local", room: room, to: msg.localId, id: msg.localId });
        } else if (msg.op === "welcome-local" && msg.to === id) {
          emit("welcome", { id: id, role: role, room: room });
        } else if (msg.op === "state" && role !== "host") {
          emit("state", msg.state);
        } else if (msg.op === "priv" && msg.to === id) {
          emit("priv", msg.payload);
        } else if (msg.op === "act" && role === "host") {
          emit("act", { from: msg.from, payload: msg.payload });
        } else if (msg.op === "left" && role === "host") {
          emit("left", msg.id);
        }
      };
      if (role === "host") {
        emit("welcome", { id: "host-local", role: "host", room: room });
      } else {
        bc.postMessage({
          op: "hello",
          room: room,
          role: role,
          localId: id,
          name: opts.name || "",
          avatar: opts.avatar || "",
          audience: !!opts.audience
        });
      }
      emit("fallback", "broadcast");
    }

    function onBrowserOffline() {
      if (closed || mode !== "ws") return;
      if (ws && ws.readyState !== 3) {
        try { ws.close(); } catch (e) { /* ignore */ }
      }
    }

    function onBrowserOnline() {
      if (closed || mode !== "ws") return;
      if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
      if (timer) clearTimeout(timer);
      timer = null;
      attempt = 0;
      startWs();
    }

    if (location.protocol === "file:") startBc();
    else {
      startWs();
      if (typeof root.addEventListener === "function") {
        root.addEventListener("offline", onBrowserOffline);
        root.addEventListener("online", onBrowserOnline);
      }
    }

    return {
      sendState: function (state) {
        if (mode === "ws") sendRaw({ op: "state", state: state });
        else if (bc) bc.postMessage({ op: "state", room: room, state: state });
      },
      sendAct: function (payload) {
        if (mode === "ws") sendRaw({ op: "act", payload: payload });
        else if (bc) bc.postMessage({ op: "act", room: room, from: opts.localId, payload: payload });
      },
      sendPriv: function (to, payload) {
        if (mode === "ws") sendRaw({ op: "priv", to: to, payload: payload });
        else if (bc) bc.postMessage({ op: "priv", room: room, to: to, payload: payload });
      },
      close: function () {
        closed = true;
        generation += 1;
        if (timer) clearTimeout(timer);
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        if (typeof root.removeEventListener === "function") {
          root.removeEventListener("offline", onBrowserOffline);
          root.removeEventListener("online", onBrowserOnline);
        }
        if (ws) try { ws.close(); } catch (e) { /* ignore */ }
        if (bc) {
          bc.postMessage({ op: "left", room: room, id: opts.localId });
          bc.close();
        }
      }
    };
  }

  function useLanRelay() {
    var loc = root.location;
    if (!loc) return false;
    var relay = "";
    try { relay = new URLSearchParams(loc.search || "").get("relay") || ""; } catch (e) { relay = ""; }
    if (String(relay).toLowerCase() === "lan") return true;
    var host = loc.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  }

  function relayHttpBase() {
    var base = String(root.PDG_RELAY_URL || "").replace(/\/$/, "");
    if (!base || base.indexOf("SUBDOMAIN") !== -1) return "";
    return base.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/ws$/, "");
  }

  PDG.connect = connect;
  PDG.usesHostedRelay = function () {
    var protocol = root.location && root.location.protocol;
    return protocol !== "file:" && !useLanRelay();
  };
  PDG.mintRoom = function () {
    var base = relayHttpBase();
    if (!base) return Promise.reject(new Error("unconfigured"));
    return fetch(base + "/rooms", { method: "POST", cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("mint");
      return res.json();
    }).then(function (body) {
      var code = String(body && body.room || "").toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(code)) throw new Error("mint");
      return code;
    });
  };
  PDG.lookupRoom = function (room) {
    var base = relayHttpBase();
    var code = String(room || "").toUpperCase();
    if (!base || !/^[A-Z0-9]{4}$/.test(code)) return Promise.reject(new Error("lookup"));
    return fetch(base + "/rooms/" + encodeURIComponent(code), { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("lookup");
      return res.json();
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
