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
      '<label class="field">Callsign<input id="name" maxlength="18" value="' + PDG.esc(ui.name) + '" placeholder="Open Book"></label>' +
      '<div class="avatar-pick">' + avatars + "</div>" +
      '<label class="fine"><input id="aud" type="checkbox"' + (ui.audience ? " checked" : "") + "> Audience only. I can vote, not bluff.</label>" +
      '<button class="btn amber" id="join" type="button">Join</button>' +
      (ui.error ? '<p class="warn">' + PDG.esc(ui.error) + "</p>" : "");
  }

  function playHTML() {
    var st = ui.state || {};
    var me = (st.players || []).filter(function (p) { return p.id === ui.myId; })[0];
    var head = '<p class="big-title">' + PDG.esc(st.modeTitle || "Lobby") + "</p>";
    head += "<p>" + PDG.esc((me && me.name) || ui.name) + (me && me.audience ? " · audience" : "") + (me && me.team != null ? " · Flight " + (me.team + 1) : "") + (me && me.captain ? " · Captain" : "") + "</p>";
    if (st.phase === "lobby" || st.phase === "attract" || !st.mode) {
      return head + '<div class="locked">You are in. Eyes on the host.</div><p class="fine">' + (st.players || []).map(function (p) { return PDG.esc(p.name); }).join(" · ") + "</p>";
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
    if (st.kind === "fibwrite") {
      var wrote = st.youAnswered || (st.answered || []).indexOf(ui.myId) !== -1;
      if (wrote) return head + "<h1>" + PDG.esc(st.prompt) + '</h1><div class="locked">Lie is in. Waiting on the flight.</div>';
      return head + "<h1>" + PDG.esc(st.prompt) + '</h1><label class="field">Your lie<textarea id="fibtext" maxlength="90"></textarea></label><button class="btn amber" id="sendfib" type="button">Lock the lie</button>';
    }
    if (st.kind === "fibvote") {
      return head + "<h1>Which one is the handbook?</h1>" + buttons(st.choices, "fib");
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

  function buttons(list, mode) {
    return '<div class="choices">' + (list || []).map(function (c, i) {
      var disabled = mode === "fib" && ui.ownOptionId && c.id === ui.ownOptionId;
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
    var send = document.getElementById("sendfib");
    if (send) send.addEventListener("click", function () {
      var text = document.getElementById("fibtext").value;
      link.sendAct({ type: "fibwrite", text: text });
      ui.fibDraft = "";
    });
    document.querySelectorAll(".choice[data-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-mode");
        var id = btn.getAttribute("data-id");
        if (mode === "choice") link.sendAct({ type: "choice", choice: id });
        else if (mode === "fib") link.sendAct({ type: "fibvote", optionId: id });
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
    ui.name = document.getElementById("name").value || "Airman";
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
          if (state && state.round !== prev) ui.sjtMost = null;
          if (state && state.subphase !== "vote") ui.ownOptionId = null;
          render();
        },
        priv: function (payload) {
          if (payload && payload.ownOptionId) ui.ownOptionId = payload.ownOptionId;
          render();
        },
        error: function (message) { ui.error = message || "Could not join."; ui.linked = false; render(); },
        hostgone: function () { ui.error = "Host closed the room."; ui.linked = false; ui.state = null; render(); },
        close: function () { if (ui.linked) ui.error = "Connection dropped. Join again."; }
      }
    });
  }

  document.addEventListener("keydown", function (ev) {
    if (!ui.state || ui.state.phase !== "collect") return;
    var n = Number(ev.key);
    if (n >= 1 && n <= 4) {
      var buttonsLive = document.querySelectorAll(".choice[data-mode='choice'], .choice[data-mode='lock']");
      if (buttonsLive[n - 1] && !buttonsLive[n - 1].disabled) buttonsLive[n - 1].click();
    }
  });

  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  render();
  if (ui.room && params.get("room")) {
    /* stay on the join form so they confirm a callsign, but the code is filled in */
  }
})();
