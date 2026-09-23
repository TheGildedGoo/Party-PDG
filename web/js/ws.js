/* WebSocket relay client. Falls back to BroadcastChannel on the same browser. */
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

    function emit(name, arg) {
      if (handlers[name]) handlers[name](arg);
    }

    function sendRaw(obj) {
      var text = JSON.stringify(obj);
      if (mode === "ws" && ws && ws.readyState === 1) ws.send(text);
      else if (mode === "bc" && bc) bc.postMessage(obj);
    }

    function bindSocket(socket) {
      ws = socket;
      ws.onmessage = function (ev) {
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
      ws.onclose = function () {
        if (!closed) emit("close");
      };
      ws.onerror = function () {
        if (ws.readyState === 0 || ws.readyState === 3) {
          /* onclose follows */
        }
      };
      ws.onopen = function () {
        sendRaw({
          op: "hello",
          role: role,
          room: room,
          name: opts.name || "",
          avatar: opts.avatar || "",
          audience: !!opts.audience
        });
      };
    }

    function startWs() {
      var proto = location.protocol === "https:" ? "wss://" : "ws://";
      var socket;
      try {
        socket = new WebSocket(proto + location.host + "/ws");
      } catch (e) {
        startBc();
        return;
      }
      var opened = false;
      socket.addEventListener("open", function () { opened = true; });
      socket.addEventListener("error", function () {
        if (!opened) {
          try { socket.close(); } catch (err) { /* ignore */ }
          startBc();
        }
      });
      bindSocket(socket);
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

    if (location.protocol === "file:") startBc();
    else startWs();

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
        if (ws) try { ws.close(); } catch (e) { /* ignore */ }
        if (bc) {
          bc.postMessage({ op: "left", room: room, id: opts.localId });
          bc.close();
        }
      }
    };
  }

  PDG.connect = connect;
})(typeof globalThis !== "undefined" ? globalThis : this);
