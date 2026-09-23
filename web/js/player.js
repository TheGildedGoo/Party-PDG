(function () {
  var PDG = window.PDG;
  var params = new URLSearchParams(location.search);
  var session = {};
  try { session = JSON.parse(sessionStorage.getItem("pdg-player") || "{}"); } catch (e) { session = {}; }
  var ui = {
    room: (params.get("room") || session.room || "").toUpperCase(),
    name: session.name || "",
    avatar: session.avatar || "open-book",
    audience: false,
    error: "",
    state: null,
    ownOptionId: null,
    fibDraft: "",
    sjtMost: null,
    linked: false
  };
  var link = null;

  function saveSession() {
    sessionStorage.setItem("pdg-player", JSON.stringify({ room: ui.room, name: ui.name, avatar: ui.avatar }));
  }

  function avatarImg(id) { return "assets/img/avatar-" + (id || "open-book") + ".svg"; }

  function render() {
    var app = document.getElementById("app");
    var draft = document.getElementById("fibtext");
    if (draft) ui.fibDraft = draft.value;
    app.innerHTML = '<div class="wrap">' + (ui.state && ui.linked ? playHTML() : joinHTML()) + "</div>";
    bind();
    var box = document.getElementById("fibtext");
    if (box) { box.value = ui.fibDraft; box.focus(); }
  }

  function joinHTML() {
    var avatars = PDG.AVATARS.map(function (a) {
      var on = a.id === ui.avatar ? " on" : "";
      return '<button type="button" class="' + on + '" data-avatar="' + a.id + '"><img alt="' + PDG.esc(a.name) + '" src="' + avatarImg(a.id) + '"></button>';
    }).join("");
    return '' +
      '<p class="big-title">PDG <span style="color:#f5a623">PARTY</span></p>' +
      "<h1>Join the room</h1>" +
      '<p class="disclaimer">Unofficial study aid. Not an Air Force product. Not a substitute for AFH 1.</p>' +
      '<label class="field">Room code<input id="room" maxlength="4" autocomplete="off" value="' + PDG.esc(ui.room) + '"></label>' +
      '<label class="field">' + (ui.nameFromAccount ? "Username" : "Callsign") + '<input id="name" maxlength="20" value="' + PDG.esc(ui.name) + '"' + (ui.nameFromAccount ? " readonly" : "") + ' placeholder="Open Book"></label>' +
      (ui.nameFromAccount ? '<p class="fine">You show up on the board as your username.</p>' : "") +
      '<div class="avatar-pick">' + avatars + "</div>" +
      '<label class="fine"><input id="aud" type="checkbox"' + (ui.audience ? " checked" : "") + "> Audience only. I can watch, not score.</label>" +
      '<button class="btn amber" id="join" type="button">Join</button>' +
      (ui.error ? '<p class="warn">' + PDG.esc(ui.error) + "</p>" : "");
  }

  function playHTML() {
    var st = ui.state || {};
    var me = (st.players || []).filter(function (p) { return p.id === ui.myId; })[0];
    var head = '<p class="big-title">' + PDG.esc(st.modeTitle || "Lobby") + "</p>";
    head += "<p>" + PDG.esc((me && me.name) || ui.name) + (me && me.audience ? " · audience" : "") + (me && me.team != null ? " · Flight " + (me.team + 1) : "") + (me && me.captain ? " · Captain" : "") + "</p>";
    if (st.phase === "lobby" || st.phase === "attract" || !st.mode) {
      var hostBit = st.hostName ? '<p class="fine">Host · ' + PDG.esc(st.hostName) + "</p>" : "";
      return head + hostBit + '<div class="locked">You are in. Eyes on the host.</div><p class="fine">' + (st.players || []).map(function (p) { return PDG.esc(p.name); }).join(" · ") + "</p>";
    }
    if (st.phase === "interstitial" && st.interstitial) {
      return head + "<h1>" + PDG.esc(st.interstitial.title) + "</h1><p>" + PDG.esc(st.interstitial.body) + "</p>";
    }
    if (st.phase === "results") {
      var rows = (st.players || []).slice().sort(function (a, b) { return b.score - a.score; });
      return head + "<h1>Final board</h1><ol>" + rows.map(function (p) {
        return "<li>" + PDG.esc(p.name) + " — " + p.score + (p.nickname ? " (" + PDG.esc(p.nickname) + ")" : "") + "</li>";
      }).join("") + "</ol>";
    }
    if (st.phase === "reveal" && st.reveal) {
      return head + '<div class="cite">' + PDG.esc(st.reveal.citeText || "") + "</div><h1>" + PDG.esc(st.reveal.correctText || "Reveal") + "</h1><p>" + PDG.esc(st.reveal.explain || "") + "</p>" + (st.reveal.leastText ? "<p>Least effective: " + PDG.esc(st.reveal.leastText) + "</p>" : "") + '<p class="fine">' + PDG.esc(st.hostLine || "") + "</p>";
    }
    if (st.phase === "prompt") return head + '<div class="locked">Host is reading it.</div>';
    if (st.kind === "fibwrite" || st.kind === "fibvote") {
      return head + '<div class="locked">Free-text rounds are closed. This party is multiple choice.</div>';
    }
    if (needsWager(st) && ui.wager == null) return head + wagerHTML();
    if (st.kind === "decoy-sponsor") {
      var sponsored = st.youAnswered || (st.answered || []).indexOf(ui.myId) !== -1;
      if (sponsored) return head + "<h1>" + PDG.esc(st.prompt) + '</h1><div class="locked">Decoy is in. Waiting on the flight.</div>';
      return head + "<h1>" + PDG.esc(st.prompt) + "</h1><p>Sponsor one decoy. You cannot vote for it later.</p>" + buttons(st.choices, "sponsor");
    }
    if (st.kind === "decoy-vote") {
      return head + "<h1>Which line is the handbook?</h1>" + buttons(st.choices, "decoy");
    }
    if (st.kind === "sjt") {
      return head + "<h1>" + PDG.esc(st.prompt) + "</h1><p>" + (ui.sjtMost == null ? "Tap the MOST effective action." : "Tap the LEAST effective action.") + "</p>" + (st.choices || []).map(function (c) {
        return '<button class="choice" type="button" data-sjt="' + c.index + '">' + PDG.esc(c.text) + "</button>";
      }).join("");
    }
    if (st.kind === "teams") {
      var mine = me && me.team === st.turnTeam;
      if (!mine) return head + '<div class="locked">' + (st.steal ? "Other flight is stealing." : "Other flight is in the huddle.") + "</div>";
      var hint = me.captain ? "You are captain. Lock the flight's answer." : "Suggest one. Captain locks it.";
      return head + "<h1>" + PDG.esc(st.prompt) + "</h1><p>" + hint + "</p>" + buttons(st.choices, me.captain ? "lock" : "suggest");
    }
    var lockedIn = st.youAnswered || (st.answered || []).indexOf(ui.myId) !== -1;
    if (lockedIn && st.kind !== "teams" && st.kind !== "fibwrite") return head + '<div class="locked">Locked.</div>';
    return head + "<h1>" + PDG.esc(st.prompt || "") + "</h1>" + buttons(st.choices, "choice");
  }

  function needsWager(st) {
    if (!st || st.phase !== "collect") return false;
    if (st.mode === "boards" || st.mode === "lightning") return true;
    if (st.mode === "decoy" && st.kind !== "decoy-vote") return true;
    return false;
  }

  function wagerHTML() {
    return '<h1>Lock a stripe</h1><p>0 pays the base. 1–3 multiply a hit and cost the same factor on a miss.</p><div class="row">' +
      [0, 1, 2, 3].map(function (n) {
        return '<button class="btn' + (n === 3 ? " amber" : "") + '" type="button" data-wager="' + n + '">' + n + "</button>";
      }).join("") + "</div>";
  }

  function buttons(list, mode) {
    return '<div class="choices">' + (list || []).map(function (c, i) {
      var disabled = (mode === "fib" || mode === "decoy") && ui.ownOptionId && c.id === ui.ownOptionId;
      var letter = c.letter || PDG.LETTERS[i] || "";
      var shape = c.shape || PDG.SHAPES[i] || "square";
      var inner = shape === "diamond" ? "<span>" + PDG.esc(letter) + "</span>" : PDG.esc(letter);
      return '<button class="choice" type="button" data-mode="' + mode + '" data-id="' + PDG.esc(c.id) + '"' + (disabled ? " disabled" : "") + '><div class="mark ' + shape + '">' + inner + "</div><div>" + PDG.esc(c.text) + "</div></button>";
    }).join("") + "</div>";
  }

  function bind() {
    document.querySelectorAll("[data-avatar]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        ui.avatar = btn.getAttribute("data-avatar");
        render();
      });
    });
    var join = document.getElementById("join");
    if (join) join.addEventListener("click", doJoin);
    document.querySelectorAll("[data-wager]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        ui.wager = Number(btn.getAttribute("data-wager"));
        render();
      });
    });
    document.querySelectorAll(".choice[data-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-mode");
        var id = btn.getAttribute("data-id");
        var wager = ui.wager || 0;
        if (mode === "choice") link.sendAct({ type: "choice", choice: id, wager: wager });
        else if (mode === "sponsor") link.sendAct({ type: "sponsor", optionId: id, wager: wager });
        else if (mode === "decoy") link.sendAct({ type: "decoyvote", optionId: id, wager: wager });
        else if (mode === "lock") link.sendAct({ type: "lock", choice: id });
        else if (mode === "suggest") link.sendAct({ type: "suggest", choice: id });
        PDG.audio.play("tick");
      });
    });
    document.querySelectorAll("[data-sjt]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-sjt"));
        if (ui.sjtMost == null) { ui.sjtMost = idx; render(); return; }
        if (ui.sjtMost === idx) return;
        link.sendAct({ type: "sjt", most: ui.sjtMost, least: idx });
        ui.sjtMost = null;
      });
    });
  }

  function doJoin() {
    ui.room = (document.getElementById("room").value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    ui.name = ui.nameFromAccount ? ui.name : (document.getElementById("name").value || "Airman");
    ui.audience = document.getElementById("aud").checked;
    if (ui.room.length < 4) { ui.error = "Room codes are 4 characters."; render(); return; }
    saveSession();
    ui.localId = "p" + Math.random().toString(16).slice(2, 8);
    if (link) link.close();
    link = PDG.connect({
      role: ui.audience ? "audience" : "player",
      room: ui.room,
      name: ui.name,
      avatar: ui.avatar,
      audience: ui.audience,
      localId: ui.localId,
      handlers: {
        welcome: function (msg) {
          ui.myId = msg.id;
          ui.linked = true;
          ui.error = "";
          render();
        },
        state: function (state) {
          var prev = ui.state && ui.state.round;
          ui.state = state;
          if (state && state.round !== prev) { ui.sjtMost = null; ui.wager = null; }
          if (state && state.subphase !== "vote") ui.ownOptionId = null;
          render();
        },
        priv: function (payload) {
          if (payload && payload.ownOptionId) ui.ownOptionId = payload.ownOptionId;
          render();
        },
        error: function (message) { ui.error = message || "Could not join."; ui.linked = false; render(); },
        hostgone: function () { ui.error = "Host closed the room."; ui.linked = false; ui.state = null; render(); },
        offline: function () {
          var line = "Could not join the host. Use the same Wi-Fi, not a guest network, and allow Python through the firewall.";
          if (ui.error === line && !ui.linked) return;
          ui.linked = false;
          ui.error = line;
          render();
        },
        close: function () {
          if (!ui.linked) return;
          ui.linked = false;
          ui.error = "Connection dropped. Reconnecting…";
          render();
        }
      }
    });
  }

  document.addEventListener("keydown", function (ev) {
    if (!ui.state || ui.state.phase !== "collect") return;
    if (ev.key >= "0" && ev.key <= "3" && document.querySelector("[data-wager]")) {
      ui.wager = Number(ev.key);
      render();
      return;
    }
    var n = Number(ev.key);
    if (n >= 1 && n <= 4) {
      var buttonsLive = document.querySelectorAll(".choice[data-mode='choice'], .choice[data-mode='lock'], .choice[data-mode='sponsor'], .choice[data-mode='decoy']");
      if (buttonsLive[n - 1] && !buttonsLive[n - 1].disabled) buttonsLive[n - 1].click();
    }
  });

  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  render();
  if (location.protocol !== "file:") {
    fetch("/api/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } }).then(function (res) {
      var type = res.headers.get("content-type") || "";
      if (type.indexOf("json") === -1) return null;
      return res.json();
    }).then(function (data) {
      var name = data && data.user && data.user.username;
      if (!name || ui.linked) return;
      ui.name = String(name).slice(0, 20);
      ui.nameFromAccount = true;
      render();
    }).catch(function () { /* local relay has no account API */ });
  }
  if (ui.room && params.get("room")) {
    /* stay on the join form so they confirm a callsign, but the code is filled in */
  }
})();
