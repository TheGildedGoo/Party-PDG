(function () {
  var PDG = window.PDG;
  var LIVE_AWARDS = ["first-light", "lightning-streak-5", "lightning-streak-10", "high-stakes", "judgment-call", "steal-artist", "master-of-deceit"];
  var ACH_KEY = "pdg-party-ach-v1";
  var FOCUS_KEY = "pdg-party-focus-v1";
  var COACH = "Use the same Wi-Fi, not a guest network, and allow Python through the firewall.";
  var joinInfo = null;
  var ui = {
    screen: "attract",
    error: "",
    notice: "",
    party: false,
    lanUnreachable: false,
    solo: null,
    mock: null,
    wager: null,
    wagerRound: null,
    hostSjt: null,
    attempts: [],
    session: null,
    sessionUnlocked: [],
    stats: null,
    toasts: [],
    streak: 0,
    streakBest: 0,
    comboPeak: 0,
    fools: 0,
    stole: false,
    judgment: false,
    mockScore: null,
    capturedKey: "",
    shownAt: 0,
    prevScores: {}
  };
  var bank = null;
  var game = null;
  var link = null;
  var lastKey = "";
  var lastPhase = "";
  var rendering = false;
  var playGate = false;

  function $(id) { return document.getElementById(id); }

  function localPlay() { return !ui.party; }

  function wagerMode() {
    return game && (game.modeId === "boards" || game.modeId === "lightning" || game.modeId === "decoy");
  }

  function wagerGateOpen() {
    if (!localPlay() || !wagerMode() || ui.wager != null) return false;
    if (ui.screen !== "game" || !game) return false;
    return game.phase === "prompt" || game.phase === "collect";
  }

  function publicMode(mode) {
    if (mode === "teams") return "flights";
    if (mode === "hotwash") return "boards";
    return mode;
  }

  function soloTrack() {
    var el = $("solo-rank");
    if (el && el.value) return el.value;
    if (ui.solo && ui.solo.track) return ui.solo.track;
    if (ui.mock && ui.mock.track) return ui.mock.track;
    return (game && game.settings && game.settings.rank) || "E5";
  }

  function soloChapter() {
    var el = $("solo-chapter");
    if (!el || !el.value || el.value === "all") return null;
    return Number(el.value);
  }

  function loadAch() {
    try {
      var data = JSON.parse(localStorage.getItem(ACH_KEY) || "");
      if (!data || typeof data !== "object") return { unlocked: {} };
      data.unlocked = data.unlocked || {};
      return data;
    } catch (e) {
      return { unlocked: {} };
    }
  }

  function touchProgress() {
    if (PDG.onProgressSaved) {
      try { PDG.onProgressSaved(); } catch (e) { /* ignore */ }
    }
  }

  function saveAch(data) {
    try { localStorage.setItem(ACH_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    touchProgress();
  }

  function loadFocus() {
    try {
      var raw = JSON.parse(localStorage.getItem(FOCUS_KEY) || "null");
      if (!raw || !raw.weakChapters) return [];
      return raw.weakChapters.map(function (row) { return row.chapter; });
    } catch (e) {
      return [];
    }
  }

  function saveFocus(rollup) {
    try { localStorage.setItem(FOCUS_KEY, JSON.stringify(rollup || {})); } catch (e) { /* ignore */ }
    touchProgress();
  }

  function choiceHTML(list, revealId) {
    return (list || []).map(function (c) {
      var cls = "choice";
      if (revealId && c.id === revealId) cls += " right";
      else if (revealId) cls += " wrong";
      return '<div class="' + cls + '">' + markHTML(c) + "<div>" + PDG.esc(c.text) + "</div></div>";
    }).join("");
  }

  function markHTML(c) {
    var letter = PDG.esc(c.letter || "");
    var shape = PDG.esc(c.shape || "square");
    var inner = c.shape === "diamond" ? "<span>" + letter + "</span>" : letter;
    return '<div class="mark ' + shape + '">' + inner + "</div>";
  }

  function avatarImg(id) {
    return "assets/img/avatar-" + (id || "open-book") + ".svg";
  }

  function chiefFrame() {
    if (!game) return "assets/img/chief-idle.svg";
    if (game.phase === "reveal" && game.reveal && game.reveal.bucket === "wrong") return "assets/img/chief-facepalm.svg";
    if (game.phase === "reveal" && game.reveal && game.reveal.bucket === "fibfool") return "assets/img/chief-roast.svg";
    if (game.phase === "reveal") return "assets/img/chief-celebrate.svg";
    if (game.phase === "results") return "assets/img/chief-celebrate.svg";
    if (game.phase === "collect" || game.phase === "prompt") return "assets/img/chief-talk.svg";
    return "assets/img/chief-idle.svg";
  }

  function loadBank() {
    if (window.PDG_BUNDLE) return Promise.resolve(window.PDG_BUNDLE);
    return Promise.all([
      fetch("data/questions.json").then(function (r) { return r.json(); }),
      fetch("data/sjt.json").then(function (r) { return r.json(); }),
      fetch("data/lines.json").then(function (r) { return r.json(); }),
      fetch("data/chapters.json").then(function (r) { return r.json(); })
    ]).then(function (parts) {
      return { questions: parts[0], sjt: parts[1], lines: parts[2], chapters: parts[3], decoys: [] };
    });
  }

  function applyJoin() {
    if (!game) return;
    var next = game.joinUrl;
    var unreachable = ui.lanUnreachable;
    if (location.protocol === "file:") {
      next = "Phones need the launcher. This file is Quiet Hours only.";
      unreachable = true;
    } else if (joinInfo && joinInfo.join) {
      next = joinInfo.join + "?room=" + game.room;
      unreachable = joinInfo.reachable === false || joinInfo.ip === "127.0.0.1";
    }
    var changed = game.joinUrl !== next || ui.lanUnreachable !== unreachable;
    game.joinUrl = next;
    ui.lanUnreachable = unreachable;
    if (changed && (ui.screen === "lobby" || (game.phase === "lobby" && ui.screen !== "solo" && ui.screen !== "mock" && ui.screen !== "about"))) {
      lastKey = "";
      render();
    }
  }

  function refreshJoin() {
    if (!game) return;
    if (location.protocol === "file:") {
      var firstFile = !refreshJoin.sawFile;
      refreshJoin.sawFile = true;
      applyJoin();
      if (firstFile) {
        ui.screen = "solo";
        ui.solo = ui.solo || { track: "E5" };
        game.hostLine = "Quiet Hours. This screen is the whole session.";
        render();
      }
      return;
    }
    fetch("api/info", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("info");
      return r.json();
    }).then(function (info) {
      joinInfo = info;
      applyJoin();
    }).catch(function () {
      if (!game.joinUrl) game.joinUrl = location.origin + "/play?room=" + game.room;
      var hostName = location.hostname;
      var local = hostName === "localhost" || hostName === "127.0.0.1";
      if (local && !ui.lanUnreachable) {
        ui.lanUnreachable = true;
        if (ui.screen === "lobby") {
          lastKey = "";
          render();
        }
      }
    });
  }

  function closePartyLink() {
    if (link) link.close();
    link = null;
    ui.party = false;
  }

  function connectHost() {
    if (link) link.close();
    var welcomed = false;
    link = PDG.connect({
      role: "host",
      room: game.room,
      handlers: {
        welcome: function () {
          welcomed = true;
          var had = ui.error;
          ui.error = "";
          pushState();
          if (had) render();
        },
        joined: function (p) {
          game.addPlayer(p);
          PDG.audio.play("join");
        },
        left: function (id) { game.dropPlayer(id); },
        act: function (msg) { game.receive(msg.from, msg.payload || {}); },
        error: function (message) {
          ui.error = message || "Room error";
          if (!welcomed && String(message).indexOf("already") !== -1) {
            game.configureRoom(PDG.roomCode());
            applyJoin();
            connectHost();
            return;
          }
          render();
        },
        offline: function () {
          if (welcomed) return;
          var line = "Room relay is not reachable. " + COACH;
          if (ui.error === line) return;
          ui.error = line;
          render();
        }
      }
    });
  }

  function pushState() {
    if (!link || !game || !ui.party) return;
    link.sendState(game.playerView(null));
    game.players.forEach(function (p) {
      var priv = game.privateFor(p.id);
      if (priv) link.sendPriv(p.id, priv);
    });
  }

  function render() {
    var app = $("app");
    if (!app || !game) return;
    if (PDG.account && PDG.account.blocksPlay && PDG.account.blocksPlay()) {
      playGate = true;
      var gateKey = "gate:" + PDG.account.viewKey();
      if (lastKey === gateKey) return;
      lastKey = gateKey;
      rendering = true;
      app.innerHTML = PDG.account.renderGate();
      rendering = false;
      PDG.account.bindGate();
      return;
    }
    if (playGate) {
      playGate = false;
      var stayingInDemo = PDG.account && PDG.account.demoOnly && PDG.account.demoOnly();
      if (!stayingInDemo) {
        ui.party = false;
        ui.screen = "attract";
        ui.error = "";
        ui.solo = null;
        game.phase = "attract";
        game.toLobby();
        game.hostLine = "This laptop can run the whole session. Phones join when you host a room.";
      }
    }
    if (ui.wagerRound !== game.index) {
      ui.wagerRound = game.index;
      ui.wager = null;
      ui.hostSjt = null;
    }
    captureReveal();
    if (game.phase === "results") finalizeSession();
    var accountKey = PDG.account && PDG.account.viewKey ? PDG.account.viewKey() : "";
    var key = [
      ui.screen, ui.party ? 1 : 0, accountKey, ui.wager, ui.hostSjt, ui.notice, (ui.toasts || []).length,
      game.phase, game.index, game.subphase, game.reveal ? 1 : 0, game.steal ? 1 : 0,
      game.turnTeam, game.players.length, Object.keys(game.answers || {}).length,
      game.interstitial ? 1 : 0, ui.streak
    ].join("|");
    if (key === lastKey && ui.screen === "game") {
      patchLive();
      return;
    }
    lastKey = key;
    if (game.phase !== lastPhase) {
      if (game.phase === "reveal") {
        var bucket = game.reveal && game.reveal.bucket;
        PDG.audio.play(bucket === "wrong" || bucket === "fibfool" ? "wrong" : bucket === "win" ? "fanfare" : "reveal");
        if (bucket === "correct" || bucket === "fibtruth") PDG.audio.play("correct");
      }
      lastPhase = game.phase;
    }
    rendering = true;
    app.innerHTML = shell(screen());
    rendering = false;
    bind();
    patchLive();
  }

  function shell(inner) {
    var muteLabel = PDG.audio.muted ? "Sound off" : "Sound on";
    var quietLabel = PDG.audio.quiet ? "Quiet on" : "Quiet mode";
    return '' +
      '<div class="sky tv-safe">' +
      '<div class="hazard"></div>' +
      '<header class="topbar">' +
      '<div class="brand">PDG <span>PARTY</span></div>' +
      modeSwitchHTML() +
      '<div class="top-actions">' +
      ((PDG.account && PDG.account.chromeHTML) ? PDG.account.chromeHTML() : "") +
      '<button class="icon-btn" id="mute" type="button">' + PDG.esc(muteLabel) + "</button>" +
      '<button class="icon-btn" id="quiet" type="button">' + PDG.esc(quietLabel) + "</button>" +
      '<button class="icon-btn" id="about" type="button">About</button>' +
      "</div></header>" +
      '<div class="stage"><aside class="chief-col"><img class="chief" alt="Chief Hot Wash, the game host" src="' + chiefFrame() + '"><div class="bubble" aria-live="polite">' + PDG.esc(game.hostLine) + "</div></aside>" +
      '<section class="panel" id="panel">' + inner + "</section></div>" +
      '<footer class="scorestrip" id="scores">' + scoreHTML() + "</footer>" +
      toastHTML() +
      "</div>";
  }

  function modeSwitchHTML() {
    var soloOn = !ui.party;
    var room = ui.party ? '<div class="roompill">ROOM ' + PDG.esc(game.room) + "</div>" : "";
    return '<div class="mode-switch">' +
      '<div class="mode-toggle" role="group" aria-label="Solo or multiplayer">' +
      '<button type="button" id="mode-solo" aria-pressed="' + (soloOn ? "true" : "false") + '">Solo</button>' +
      '<button type="button" id="mode-party" aria-pressed="' + (soloOn ? "false" : "true") + '">Multiplayer</button>' +
      "</div>" + room + "</div>";
  }

  function toastHTML() {
    if (!ui.toasts.length) return "";
    return '<div class="toasts" aria-live="polite">' + ui.toasts.map(function (t) {
      return '<div class="toast"><img alt="" src="assets/icons/' + PDG.esc(t.icon) + '.svg"><div><strong>' + PDG.esc(t.title) + "</strong><p>" + PDG.esc(t.copy) + "</p></div></div>";
    }).join("") + "</div>";
  }

  function scoreHTML() {
    if (!ui.party && ui.screen !== "game") {
      var data = PDG.sr.load();
      var due = PDG.sr.dueIds(data).length;
      return '<div class="fine">Solo desk · Due ' + due + " · Cards " + Object.keys(data.cards).length + " · Best streak " + (ui.streakBest || 0) + "</div>";
    }
    if (!game.players.length) return '<div class="fine">Players show up here when a party starts.</div>';
    return game.players.filter(function (p) { return p.connected !== false; }).map(function (p) {
      var tag = p.audience ? "Audience" : (p.team != null ? "Flight " + (p.team + 1) : "Player");
      if (p.captain) tag += " · Captain";
      if (p.nickname) tag += " · " + p.nickname;
      var bump = ui.prevScores[p.id] != null && ui.prevScores[p.id] !== p.score ? " bump" : "";
      ui.prevScores[p.id] = p.score;
      return '<div class="player-chip' + bump + '"><img alt="" src="' + avatarImg(p.avatar) + '"><div><strong>' + PDG.esc(p.name) + '</strong><div class="meta">' + PDG.esc(tag) + (p.combo ? " · combo " + p.combo : "") + '</div></div><div class="score-num">' + p.score + "</div></div>";
    }).join("");
  }

  function screen() {
    if (PDG.account && PDG.account.panelHTML) {
      var accountPanel = PDG.account.panelHTML();
      if (accountPanel) return accountPanel;
    }
    if (ui.screen === "about") return aboutHTML();
    if (ui.screen === "decoy-empty") return decoyEmptyHTML();
    if (ui.screen === "rollup") return rollupHTML();
    if (ui.screen === "solo") return soloHTML();
    if (ui.screen === "mock") return mockHTML();
    if (ui.screen === "attract" || game.phase === "attract") return attractHTML();
    if (game.phase === "lobby" || ui.screen === "lobby") return lobbyHTML();
    if (game.phase === "results") return resultsHTML();
    return stageHTML();
  }

  function attractHTML() {
    return '' +
      '<p class="kicker">Ready room · AFH 1 study party</p>' +
      "<h1>PDG PARTY</h1>" +
      '<p class="disclaimer">Unofficial study aid. Not an Air Force product, not a substitute for AFH 1, and not a source the Air Force uses to write the PFE. Promotion test content is determined solely by the Air Force. Group study for the purpose of enlisted promotion testing is prohibited by DAFMAN 36-2664.</p>' +
      "<p>This laptop can run the whole session. Phones and a room code are only for a party.</p>" +
      '<div class="row">' +
      '<button class="btn amber" id="solo" type="button">Quiet Hours</button>' +
      '<button class="btn" id="host" type="button">Host a party</button>' +
      "</div>" +
      '<p class="fine">Quiet Hours stays on this computer. Phones join only after you host a room.</p>' +
      (ui.error ? '<p class="warn">' + PDG.esc(ui.error) + "</p>" : "");
  }

  function qrSVG() {
    try {
      if (window.qrcode && game.joinUrl) {
        qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
        var q = qrcode(0, "M");
        q.addData(game.joinUrl);
        q.make();
        return q.createSvgTag(6, 2);
      }
    } catch (e) { /* QR stays empty */ }
    return "";
  }

  function lobbyHTML() {
    var s = game.settings;
    var roster = game.players.filter(function (p) { return p.connected !== false && p.id !== "host-seat"; }).map(function (p) {
      return '<div class="chip"><img alt="" src="' + avatarImg(p.avatar) + '"><div><strong>' + PDG.esc(p.name) + '</strong><div class="meta">' + (p.audience ? "Audience" : "Player") + "</div></div></div>";
    }).join("") || '<p class="fine">Waiting for phones. Late join closes when round 1 starts. Cap is 8 players. Audience is uncapped.</p>';
    return '' +
      '<p class="kicker">Party lobby</p><h2>Same Wi-Fi. Type the code.</h2>' +
      '<p class="disclaimer">Unofficial study aid. Not an Air Force product, not a substitute for AFH 1. PFE content is determined solely by the Air Force.</p>' +
      '<div class="grid-2"><div>' +
      '<div class="row">' +
      fieldRank(s.rank) + fieldRounds(s.rounds) + fieldRoast(s.roast) + fieldFlights(s.flights) +
      "</div>" +
      '<label class="field"><span>Demo seed</span><select id="demo"><option value="no"' + (s.demo ? "" : " selected") + '>Full bank</option><option value="yes"' + (s.demo ? " selected" : "") + ">3-minute demo</option></select></label>" +
      '<div class="row">' +
      '<button class="btn amber" id="go-boards" type="button">Boards & Brief</button>' +
      '<button class="btn" id="go-decoy" type="button">Decoy Brief</button>' +
      '<button class="btn" id="go-light" type="button">Lightning</button>' +
      '<button class="btn" id="go-teams" type="button">Flight vs Flight</button>' +
      '<button class="btn" id="go-sjt" type="button">SJT Brief</button>' +
      '<button class="btn ghost" id="go-hot" type="button">Hot Wash</button>' +
      '<button class="btn ghost" id="go-demo" type="button">3-minute brief</button>' +
      "</div>" +
      (ui.error ? '<p class="warn">' + PDG.esc(ui.error) + "</p>" : "") +
      '<div class="roster">' + roster + "</div></div>" +
      '<div class="room-hero"><p class="fine">Room code</p><p class="room-code">' + PDG.esc(game.room) + '</p><div class="qr qr-lg" id="qr">' + qrSVG() + '</div><p class="fine">Join URL</p><p class="join-url">' + PDG.esc(game.joinUrl || "Starting local server…") + "</p>" +
      (ui.lanUnreachable ? '<p class="warn">Phones cannot reach this computer. ' + PDG.esc(COACH) + "</p>" : "") +
      "</div></div>";
  }

  function fieldRank(v) {
    return '<label class="field">Rank track<select id="rank">' +
      opt("E5", "E-5", v) + opt("E6", "E-6", v) + opt("mixed", "Mixed", v) + opt("all", "All chapters", v) +
      "</select></label>";
  }
  function fieldRounds(v) {
    return '<label class="field">Rounds<select id="rounds">' + [2, 5, 8, 10, 12].map(function (n) {
      return '<option' + (Number(v) === n ? " selected" : "") + ">" + n + "</option>";
    }).join("") + "</select></label>";
  }
  function fieldRoast(v) {
    return '<label class="field">Roast<select id="roast">' + opt("mild", "Mild", v) + opt("chief", "Chief", v) + "</select></label>";
  }
  function fieldFlights(v) {
    return '<label class="field">Flights<select id="flights">' + [2, 3, 4].map(function (n) {
      return '<option' + (Number(v) === n ? " selected" : "") + ">" + n + "</option>";
    }).join("") + "</select></label>";
  }
  function opt(value, label, current) {
    return '<option value="' + value + '"' + (current === value ? " selected" : "") + ">" + label + "</option>";
  }

  function roundHead() {
    var round = (game.index + 1) + " / " + game.deck.length;
    var title = game.mode ? game.mode.title : "";
    var extra = game.steal ? " · STEAL" : "";
    if (localPlay()) extra += " · THIS SCREEN";
    return '<p class="kicker">' + PDG.esc(title) + " · " + PDG.esc(round) + extra + "</p>";
  }

  function timerHTML() {
    var urgent = game.modeId === "lightning" ? " urgent-ready" : "";
    return '<div class="timer' + urgent + '" aria-hidden="true"><span id="timerbar"></span></div><div id="clock" class="fine"></div>';
  }

  function wagerHTML() {
    var base = "Base 100";
    if (game.modeId === "lightning") base = "Base 50 × combo step";
    if (game.modeId === "decoy") base = "Truth base 100. Fooling a player is a flat +50.";
    return '<div class="wager" role="group" aria-label="Stripe wager"><p class="kicker">Stripe wager</p><p>Lock a stripe before the options open. Correct pays base × max(1, wager). Wrong costs base × wager.</p><p class="fine">' + base + "</p><div class=\"row\">" +
      [0, 1, 2, 3].map(function (n) {
        var label = n === 0 ? "0 · flat" : String(n) + " · ×" + n;
        return '<button class="btn' + (n === 3 ? " amber" : "") + '" type="button" data-wager="' + n + '">' + label + "</button>";
      }).join("") +
      "</div></div>";
  }

  function stageHTML() {
    if (game.modeId === "teams") return teamsHTML();
    if (game.modeId === "sjt") return sjtHTML();
    var view = game.view || {};
    if (game.phase === "interstitial" && game.interstitial) return interstitialHTML();
    var body = roundHead() + timerHTML();
    if (game.modeId === "lightning") body += comboHTML();
    if (localPlay() && game.modeId === "boards") body += '<div class="streak-ribbon">Streak ' + ui.streak + "</div>";
    if (ui.notice) body += '<p class="fine">' + PDG.esc(ui.notice) + "</p>";
    body += '<h2 class="prompt">' + PDG.esc(view.prompt || "") + "</h2>";
    if (wagerGateOpen()) return body + wagerHTML();
    if (game.phase === "prompt") {
      body += '<p class="fine">' + (wagerMode() && localPlay() ? "Options open after the stripe." : "Reading the stem.") + "</p>";
      return body;
    }
    if (game.phase === "reveal") return body + revealBlock();
    if (localPlay() && game.phase === "collect") return body + localChoices(view);
    var locked = Object.keys(game.answers || {}).length;
    body += '<p class="fine">Phones are live. ' + locked + " locked.</p>";
    if (view.kind === "decoy-vote" && view.choices) body += staticChoices(view.choices);
    return body;
  }

  function comboHTML() {
    var best = 0;
    game.active().forEach(function (p) { if ((p.combo || 0) > best) best = p.combo; });
    return '<div class="combo-badge" aria-label="Combo">×' + best + "</div>";
  }

  function interstitialHTML() {
    var card = game.interstitial;
    var body = "<h2>" + PDG.esc(card.title) + '</h2><p class="prompt">' + PDG.esc(card.body) + "</p>";
    if (card.dare) body += '<div class="row"><button class="btn amber" id="skip" type="button">Skip dare</button><button class="btn" id="next" type="button">Done</button></div>';
    return body;
  }

  function localChoices(view) {
    var choices = view.choices || [];
    if (view.kind === "decoy-sponsor") {
      return '<p class="fine">Sponsor one decoy.</p><div class="choices">' + choices.map(function (c) {
        return '<button class="choice" type="button" data-host-sponsor="' + PDG.esc(c.id) + '">' + markHTML(c) + "<div>" + PDG.esc(c.text) + "</div></button>";
      }).join("") + "</div>";
    }
    if (!choices.length) return '<p class="fine">No options on this item.</p>';
    return '<div class="choices">' + choices.map(function (c) {
      return '<button class="choice" type="button" data-host-choice="' + PDG.esc(c.id) + '">' + markHTML(c) + "<div>" + PDG.esc(c.text) + "</div></button>";
    }).join("") + '<p class="fine">Keys 1–4 or A–D.</p></div>';
  }

  function staticChoices(list) {
    return '<div class="choices">' + (list || []).map(function (c) {
      return '<div class="choice">' + markHTML(c) + "<div>" + PDG.esc(c.text) + "</div></div>";
    }).join("") + "</div>";
  }

  function revealBlock() {
    var reveal = game.reveal || {};
    var view = game.view || {};
    var stamp = (reveal.bucket === "wrong" || reveal.bucket === "fibfool") ? '<div class="stamp retrain motion-stamp">RETRAIN</div>' : '<div class="stamp motion-stamp">PROMOTED</div>';
    var body = stamp;
    body += '<div class="cite">' + PDG.esc(PDG.citeLabel(reveal.cite)) + "</div>";
    body += "<p>" + PDG.esc(reveal.explain || "") + "</p>";
    if (reveal.competency) body += '<p class="fine">Competency: ' + PDG.esc(reveal.competency) + "</p>";
    if (reveal.leastText) body += '<p class="fine">Least effective: ' + PDG.esc(reveal.leastText) + "</p>";
    if (reveal.source && reveal.source !== reveal.explain) {
      body += '<div class="source"><strong>Handbook locator. </strong>' + PDG.esc(reveal.source) + "</div>";
    }
    if (reveal.decoyOptions && reveal.decoyOptions.length) body += decoyReveal(reveal.decoyOptions);
    else if (view.choices) body += '<div class="choices reveal-lines">' + choiceHTML(view.choices, reveal.correctId) + "</div>";
    if (!game.mode || !game.mode.autoAdvance) body += '<div class="row"><button class="btn amber" id="next" type="button">Next</button></div>';
    return body;
  }

  function decoyReveal(options) {
    return '<div class="choices reveal-lines">' + options.map(function (o) {
      var who = o.truth ? "Handbook" : "Decoy";
      return '<div class="choice ' + (o.truth ? "right" : "wrong") + '">' + markHTML(o) + '<div><strong>' + PDG.esc(o.text) + '</strong><div class="meta">' + who + "</div></div></div>";
    }).join("") + "</div>";
  }

  function teamsHTML() {
    if (game.phase === "interstitial" && game.interstitial) return interstitialHTML();
    var groups = {};
    game.active().forEach(function (p) {
      if (p.team == null) return;
      if (!groups[p.team]) groups[p.team] = [];
      groups[p.team].push(p);
    });
    var keys = Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b); });
    var banner = game.steal ? '<div class="steal-banner">STEAL — Flight ' + (Number(game.turnTeam) + 1) + " can take the point</div>" : "";
    var cols = keys.map(function (k) {
      var on = Number(k) === Number(game.turnTeam) && game.phase !== "reveal" ? " on" : "";
      var state = (game.teamResult && game.teamResult[k]) || (Number(k) === Number(game.turnTeam) ? "Live" : "Waiting");
      if (state === "hit") state = "Hit";
      if (state === "miss") state = "Miss";
      var names = groups[k].map(function (p) {
        return PDG.esc(p.name) + (p.captain ? " · Captain" : "") + " · " + p.score;
      }).join("<br>");
      return '<article class="flight' + on + '"><p class="kicker">Flight ' + (Number(k) + 1) + "</p><h2>" + PDG.esc(state) + "</h2><p>" + names + "</p></article>";
    }).join("");
    var body = banner + roundHead() + timerHTML() + '<div class="flights">' + cols + "</div>";
    body += '<h2 class="prompt">' + PDG.esc((game.view && game.view.prompt) || "") + "</h2>";
    if (game.phase === "reveal") body += revealBlock();
    else body += '<p class="fine">Captains lock on their phones. A miss opens the steal for the next flight.</p>';
    return body;
  }

  function sjtHTML() {
    if (game.phase === "interstitial" && game.interstitial) return interstitialHTML();
    var view = game.view || {};
    var actions = view.actions || view.choices || [];
    var body = roundHead() + timerHTML();
    body += '<h2 class="prompt">' + PDG.esc(view.prompt || "") + "</h2>";
    body += '<div class="sjt-board"><div><p class="kicker">Most effective</p><p>' + (ui.hostSjt == null ? "Pick the strongest action." : "Most is locked. Pick the least.") + '</p></div><div><p class="kicker">Least effective</p><p>Same scenario. A swap scores zero.</p></div></div>';
    if (game.phase === "reveal") return body + revealBlock();
    if (localPlay() && game.phase === "collect") {
      body += '<div class="choices">' + actions.map(function (c) {
        var picked = ui.hostSjt === c.index ? " picked" : "";
        return '<button class="choice' + picked + '" type="button" data-host-sjt="' + c.index + '"><div>' + PDG.esc(c.text) + "</div></button>";
      }).join("") + "</div>";
      return body;
    }
    body += staticChoices(actions.map(function (c, i) {
      return { letter: PDG.LETTERS[i] || String(i + 1), shape: PDG.SHAPES[i] || "square", text: c.text };
    }));
    body += '<p class="fine">Phones mark most, then least.</p>';
    return body;
  }

  function resultsHTML() {
    var rows = game.active().slice().sort(function (a, b) { return b.score - a.score; });
    var list = rows.map(function (p, i) {
      return "<li><strong>" + (i + 1) + ". " + PDG.esc(p.name) + "</strong> — " + p.score + (p.nickname ? " (" + PDG.esc(p.nickname) + ")" : "") + "</li>";
    }).join("");
      return '<p class="kicker">Results</p><h2>Board is closed.</h2><ol>' + list + "</ol>" + rollupBlock() +
      '<div class="row"><button class="btn amber" id="hot" type="button">Hot Wash the misses</button><button class="btn" id="quiet-block" type="button">Quiet Hours block</button><button class="btn" id="lobby" type="button">' + (ui.party ? "Back to lobby" : "Quiet Hours") + "</button></div>";
  }

  function rollupHTML() {
    return '<p class="kicker">Focus rollup</p><h2>Where to study next</h2>' +
      '<p class="disclaimer">Unofficial study aid. Not an Air Force product and not a substitute for AFH 1. PFE content is determined solely by the Air Force.</p>' +
      rollupBlock() +
      '<div class="row"><button class="btn amber" id="quiet-block" type="button">Quiet Hours block</button><button class="btn" id="hot" type="button">Hot Wash</button><button class="btn ghost" id="back-desk" type="button">Study desk</button></div>';
  }

  function rollupBlock() {
    var stats = ui.stats;
    if (!stats) return '<p class="fine">Finish a session to build the rollup.</p>';
    var t = stats.totals || {};
    var roll = stats.focusRollup || {};
    var weak = (roll.weakChapters || []).map(function (row) {
      return "<li>Chapter " + row.chapter + " · " + Math.round(row.accuracy * 100) + "% · " + row.correct + "/" + row.answered + "</li>";
    }).join("") || "<li>No chapter has five answers yet.</li>";
    var sections = (roll.weakSections || []).slice(0, 6).map(function (row) {
      return "<li>Ch " + row.chapter + " " + PDG.esc(row.section || "—") + " · " + Math.round(row.accuracy * 100) + "%</li>";
    }).join("");
    var next = (roll.recommendedNext || []).map(function (ch) { return "Ch " + ch; }).join(", ") || "None yet";
    var awards = (stats.achievementsUnlocked || []).map(function (id) {
      var meta = PDG.ACHIEVEMENTS[id] || { title: id, copy: "" };
      return "<li>" + PDG.esc(meta.title) + " — " + PDG.esc(meta.copy) + "</li>";
    }).join("") || "<li>None this session.</li>";
    var scoreLine = "";
    if (stats.modeId === "mock" && ui.mockScore != null) {
      scoreLine = "<p>Study mock " + ui.mockScore + " / 100. The pass bar in this game is 70. It is not an official cut score.</p>";
    }
    return '<div class="rollup">' + scoreLine +
      '<div class="totals"><div><b>' + t.answered + '</b><span>Answered</span></div><div><b>' + Math.round((t.accuracy || 0) * 100) + '%</b><span>Accuracy</span></div><div><b>' + t.streakBest + '</b><span>Best streak</span></div><div><b>' + t.wagerNet + '</b><span>Wager net</span></div><div><b>' + t.avgLatencyMs + '</b><span>Avg ms</span></div></div>' +
      "<h3>Weak chapters</h3><p class=\"fine\">Five or more answers, worst accuracy first. The first three become the Quiet Hours block.</p><ul>" + weak + "</ul>" +
      (sections ? "<h3>Weak sections</h3><ul>" + sections + "</ul>" : "") +
      "<p><strong>Recommended next: </strong>" + PDG.esc(next) + "</p>" +
      missPanel(stats) +
      "<h3>Achievements this session</h3><ul>" + awards + "</ul></div>";
  }

  function missPanel(stats) {
    var rows = [];
    (stats.byChapter || []).forEach(function (row) {
      (row.missIds || []).forEach(function (id) {
        rows.push("<li>" + PDG.esc(id) + " · ch " + row.chapter + " " + PDG.esc(row.section || "") + "</li>");
      });
    });
    var body = rows.slice(0, 12).join("") || "<li>No misses recorded.</li>";
    return '<section class="miss-panel"><h3>Hot Wash</h3><p>Misses from this session feed the next focused block.</p><ul>' + body + "</ul></section>";
  }

  function aboutHTML() {
    var chapters = (bank.chapters || []).map(function (c) {
      var tag = c.waps === "both" ? "E-5 and E-6" : c.waps === "e6" ? "E-6 only" : "Not on 2026 PFE";
      return "<li>Ch " + c.chapter + " " + PDG.esc(c.title) + " — " + tag + "</li>";
    }).join("");
    return '<p class="kicker">About</p><h2>Read this before you trust a score.</h2>' +
      '<p class="disclaimer">Unofficial study aid. Not an Air Force product, not a substitute for AFH 1 (15 February 2025), and not how the Air Force writes the PFE. PFE content is determined solely by the Air Force. Group study for the purpose of enlisted promotion testing is prohibited by DAFMAN 36-2664.</p>' +
      "<p>Every mode is multiple choice. Decoy Brief uses a handbook line and three decoys. There is no free-text lie box.</p>" +
      "<p>Questions are original to this game. They are tagged with chapter, section, paragraph or section anchor, page hint, ranks, difficulty, and sourceEdition AFH1-2025. They are not copied from commercial banks.</p>" +
      "<p>Branding is original: chevron-inspired geometry, not the Air Force seal and not a Hap Arnold wings lockup. Rank pips on the scoreboard are game tokens, not official insignia.</p>" +
      "<ul>" + chapters + "</ul>" +
      '<p class="fine">Icons: Lucide (ISC). QR: Kazuhiko Arase (MIT). Type: Barlow Condensed and Source Sans 3 (OFL). Audio: original generated tones. Illustrations: original.</p>' +
      '<button class="btn" id="back" type="button">Back</button>';
  }

  function chapterField() {
    var current = ui.solo && ui.solo.chapter ? String(ui.solo.chapter) : "all";
    var options = '<option value="all"' + (current === "all" ? " selected" : "") + ">Any chapter</option>";
    (bank.chapters || []).filter(function (c) { return c.waps !== "off"; }).forEach(function (c) {
      options += '<option value="' + c.chapter + '"' + (current === String(c.chapter) ? " selected" : "") + ">Ch " + c.chapter + " " + PDG.esc(c.title) + "</option>";
    });
    return '<label class="field">Chapter<select id="solo-chapter">' + options + "</select></label>";
  }

  function soloHTML() {
    var s = ui.solo || { track: "E5" };
    if (!s.current) {
      var dueN = PDG.sr.dueIds(PDG.sr.load()).length;
      return '<p class="kicker">Quiet Hours · solo</p><h2>Study desk</h2>' +
        '<p class="disclaimer">Unofficial study aid. Not an Air Force product, not a substitute for AFH 1, and not a source the Air Force uses to write the PFE. Promotion test content is determined solely by the Air Force.</p>' +
        "<p>No phone. No room code. Answers stay on this screen. Due now: " + dueN + ".</p>" +
        (ui.error ? '<p class="warn">' + PDG.esc(ui.error) + "</p>" : "") +
        (s.empty ? '<p class="warn">' + PDG.esc(s.empty) + "</p>" : "") +
        '<div class="row">' + fieldRank(s.track || "E5").replace('id="rank"', 'id="solo-rank"') + chapterField() + "</div>" +
        '<div class="row">' +
        '<button class="btn amber" id="due" type="button">Due queue</button>' +
        '<button class="btn" id="drill" type="button">Chapter block</button>' +
        '<button class="btn" id="missed" type="button">Missed queue</button>' +
        '<button class="btn" id="mock" type="button">Mock PFE · 80</button>' +
        "</div>" +
        '<div class="row">' +
        '<button class="btn ghost" id="solo-boards" type="button">Boards</button>' +
        '<button class="btn ghost" id="solo-light" type="button">Lightning</button>' +
        '<button class="btn ghost" id="solo-decoy" type="button">Decoy</button>' +
        '<button class="btn ghost" id="solo-flights" type="button">Flights</button>' +
        '<button class="btn ghost" id="solo-sjt" type="button">SJT</button>' +
        "</div>" +
        heatmap() +
        '<div class="row"><button class="btn ghost" id="export" type="button">Export progress</button><label class="btn ghost">Import<input id="import" type="file" accept="application/json" class="sr"></label><button class="btn ghost" id="back" type="button">Title</button></div>';
    }
    var item = s.current;
    var choices = PDG.choiceView(item);
    var html = '<p class="kicker">Quiet Hours · ' + (s.pos + 1) + " / " + s.deck.length + " · ch " + PDG.esc(PDG.chapterOf(item) || "") + "</p>";
    html += '<h2 class="prompt">' + PDG.esc(item.question) + "</h2>";
    if (!s.revealed) {
      html += '<div class="choices">' + choices.map(function (c) {
        return '<button class="choice" type="button" data-choice="' + c.index + '">' + markHTML(c) + "<div>" + PDG.esc(c.text) + "</div></button>";
      }).join("") + "</div>";
      html += '<p class="fine">Keys 1–4 or A–D.</p>';
    } else {
      html += '<div class="choices">' + choiceHTML(choices, "c" + item.answerIndex) + "</div>";
      html += '<div class="cite">' + PDG.esc(PDG.citeLabel(item.cite)) + "</div><p>" + PDG.esc(item.explain) + "</p>";
      if (item.source && item.source !== item.explain) html += '<div class="source"><strong>Handbook locator. </strong>' + PDG.esc(item.source) + "</div>";
      html += '<div class="row"><button class="btn" data-q="1" type="button">Again</button><button class="btn" data-q="3" type="button">Hard</button><button class="btn amber" data-q="4" type="button">Good</button><button class="btn" data-q="5" type="button">Easy</button></div>';
    }
    html += '<button class="btn ghost" id="solo-stop" type="button">Stop drill</button>';
    return html;
  }

  function heatmap() {
    var data = PDG.sr.load();
    var cells = (bank.chapters || []).filter(function (c) { return c.waps !== "off"; }).map(function (c) {
      var b = data.chapters[c.chapter] || data.chapters[String(c.chapter)] || { correct: 0, wrong: 0 };
      var total = b.correct + b.wrong;
      var pct = total ? Math.round(100 * b.correct / total) : 0;
      var tone = !total ? "cold" : pct < 60 ? "hot" : pct < 80 ? "warm" : "ok";
      return '<div class="heat-cell ' + tone + '"><b>' + pct + "%</b>Ch " + c.chapter + " · " + total + " seen</div>";
    }).join("");
    return '<div class="heat" aria-label="Chapter heat">' + cells + "</div>";
  }

  function slotStrip(mock) {
    var html = '<div class="slots" aria-label="80 mock slots">';
    for (var i = 0; i < 80; i++) {
      var cls = "slot";
      if (i < mock.answers.length) cls += mock.answers[i] && mock.answers[i].correct ? " good" : " bad";
      else if (i === mock.pos && !mock.done) cls += " now";
      html += '<i class="' + cls + '"></i>';
    }
    return html + "</div>";
  }

  function mockHTML() {
    var m = ui.mock;
    if (!m) return '<p>Mock is empty.</p><button class="btn" id="back" type="button">Back</button>';
    if (m.done) return rollupHTML();
    var item = m.items[m.pos];
    var left = Math.max(0, m.limit - (Date.now() - m.started));
    var mins = Math.floor(left / 60000);
    var secs = Math.floor((left % 60000) / 1000);
    var clock = mins + ":" + String(secs).padStart(2, "0");
    var head = slotStrip(m) + '<p class="kicker">Mock PFE · ' + (m.pos + 1) + " / " + m.items.length + " · " + clock + "</p>";
    if (!item) return head + '<p>No item.</p>';
    if (item.kind === "sjt") {
      return head + '<h2 class="prompt">' + PDG.esc(item.scenario) + "</h2>" +
        '<div class="sjt-board"><div><p class="kicker">Most</p><p>' + (m.sjtMost == null ? "Choose most." : "Most locked.") + '</p></div><div><p class="kicker">Least</p><p>Same scenario.</p></div></div>' +
        (item.actions || []).map(function (text, i) {
          var picked = m.sjtMost === i ? " picked" : "";
          return '<button class="choice' + picked + '" type="button" data-sjt="' + i + '">' + PDG.esc(text) + "</button>";
        }).join("") +
        '<button class="btn ghost" id="back-solo" type="button">Stop mock</button>';
    }
    var choices = PDG.choiceView(item);
    return head + '<h2 class="prompt">' + PDG.esc(item.question) + "</h2>" +
      '<div class="choices">' + choices.map(function (c) {
        return '<button class="choice" type="button" data-mock="' + c.index + '">' + markHTML(c) + "<div>" + PDG.esc(c.text) + "</div></button>";
      }).join("") + "</div>" +
      '<button class="btn ghost" id="back-solo" type="button">Stop mock</button>';
  }

  function decoyEmptyHTML() {
    return '<p class="kicker">Decoy Brief</p><h2>No decoy pack yet.</h2>' +
      "<p>This mode needs items with a stem, the handbook line, and exactly three decoys. The bank does not have that pack yet.</p>" +
      "<p>Quiet Hours, Boards, Lightning, Flights, and SJT still run on the multiple-choice bank.</p>" +
      '<div class="row"><button class="btn amber" id="back-desk" type="button">Study desk</button><button class="btn" id="back" type="button">Title</button></div>';
  }

  function patchLive() {
    var bar = $("timerbar");
    var clock = $("clock");
    if (!bar || !game || game.phase !== "collect") return;
    var total = (game.roundSeconds || 1) * 1000;
    var left = Math.max(0, game.deadline - Date.now());
    bar.style.width = Math.max(0, Math.min(100, (left / total) * 100)) + "%";
    if (clock) clock.textContent = Math.ceil(left / 1000) + "s";
    var timer = bar.parentElement;
    if (timer && game.modeId === "lightning") timer.classList.toggle("urgent", left <= 5000 && left > 0);
    if (left <= 5000 && left > 0 && Math.ceil(left / 1000) !== patchLive._tick) {
      patchLive._tick = Math.ceil(left / 1000);
      PDG.audio.play("tick");
    }
  }

  function readSettings() {
    var rank = $("rank");
    if (!rank) return;
    game.configure({
      rank: rank.value,
      rounds: Number($("rounds").value),
      roast: $("roast").value,
      flights: Number($("flights").value),
      demo: $("demo").value === "yes"
    });
  }

  function openSession(modeId) {
    var data = PDG.sr.load();
    ui.attempts = [];
    ui.sessionUnlocked = [];
    ui.comboPeak = 0;
    ui.fools = 0;
    ui.stole = false;
    ui.judgment = false;
    ui.streak = 0;
    ui.capturedKey = "";
    ui.mockScore = null;
    ui.session = {
      id: PDG.makeSessionId(),
      modeId: modeId,
      track: game.settings.rank,
      priorAnswered: Object.keys(data.seen || {}).length,
      priorWeak: loadFocus(),
      closed: false
    };
  }

  function award(live) {
    if (!ui.session) return [];
    var data = PDG.sr.load();
    var ach = loadAch();
    var ids = PDG.evaluateAchievements({
      live: !!live,
      liveOnly: live ? LIVE_AWARDS : null,
      modeId: ui.session.modeId,
      attempts: ui.attempts,
      comboPeak: ui.comboPeak,
      already: Object.keys(ach.unlocked || {}),
      priorAnswered: ui.session.priorAnswered,
      mockComplete: ui.session.modeId === "mock" && !!(ui.mock && ui.mock.done),
      mockScore: ui.mockScore,
      fools: ui.fools,
      stole: ui.stole,
      judgment: ui.judgment,
      cardsStudied: Object.keys(data.cards || {}).length,
      dueCount: PDG.sr.dueIds(data).length,
      studyDays: (data.days || []).length,
      priorWeakChapters: ui.session.priorWeak || []
    });
    ids.forEach(function (id) {
      ach.unlocked[id] = Date.now();
      if (ui.sessionUnlocked.indexOf(id) === -1) ui.sessionUnlocked.push(id);
      var meta = PDG.ACHIEVEMENTS[id];
      ui.toasts.push({ id: id, title: meta.title, copy: meta.copy, icon: meta.icon });
      setTimeout(function () {
        ui.toasts = (ui.toasts || []).filter(function (t) { return t.id !== id; });
        lastKey = "";
        if (!rendering) render();
      }, 4200);
    });
    if (ids.length) saveAch(ach);
    return ids;
  }

  function finalizeSession() {
    if (!ui.session || ui.session.closed) return ui.stats;
    ui.session.closed = true;
    award(false);
    var stats = PDG.buildSessionStats({
      sessionId: ui.session.id,
      endedAt: new Date().toISOString(),
      modeId: ui.session.modeId,
      rankTrack: ui.session.track || game.settings.rank,
      solo: !ui.party,
      attempts: ui.attempts,
      achievementsUnlocked: ui.sessionUnlocked.slice()
    });
    ui.stats = stats;
    PDG.lastSession = stats;
    try { localStorage.setItem("pdg-party-last-session", JSON.stringify(stats)); } catch (e) { /* ignore */ }
    saveFocus(stats.focusRollup);
    game.focusRollup = stats.focusRollup;
    return stats;
  }

  function captureReveal() {
    if (!game || game.phase !== "reveal" || !game.reveal || !game.reveal.grades) return;
    var key = (game.modeId || "") + ":" + game.index;
    if (ui.capturedKey === key) return;
    ui.capturedKey = key;
    var grades = game.reveal.grades;
    Object.keys(grades).forEach(function (pid) {
      var g = grades[pid];
      ui.attempts.push({
        playerId: pid,
        id: g.itemId,
        chapter: g.chapter,
        section: g.section || "",
        correct: !!g.correct,
        latencyMs: g.latencyMs || 0,
        wagerDelta: g.wagerDelta || 0,
        wager: g.wager || 0
      });
    });
    game.active().forEach(function (p) {
      if ((p.combo || 0) > ui.comboPeak) ui.comboPeak = p.combo || 0;
    });
    if (localPlay() && game.modeId === "boards" && grades["host-seat"]) {
      ui.streak = grades["host-seat"].correct ? ui.streak + 1 : 0;
      if (ui.streak > ui.streakBest) ui.streakBest = ui.streak;
    }
    if (game.modeId === "lightning") {
      Object.keys(grades).forEach(function (pid) {
        if (!grades[pid].correct) noteHeat(game.current);
      });
    }
    if (game.reveal.foolCounts) {
      Object.keys(game.reveal.foolCounts).forEach(function (k) { ui.fools += game.reveal.foolCounts[k] || 0; });
    }
    if (game.reveal.stealSuccess) ui.stole = true;
    if (game.modeId === "sjt") {
      Object.keys(grades).forEach(function (pid) { if (grades[pid].correct) ui.judgment = true; });
    }
    award(true);
  }

  function noteHeat(item) {
    var data = PDG.sr.load();
    var ch = PDG.chapterOf(item);
    if (!ch) return;
    var bucket = data.chapters[ch] || data.chapters[String(ch)] || { correct: 0, wrong: 0 };
    bucket.wrong += 1;
    data.chapters[ch] = bucket;
    PDG.sr.save(data);
  }

  function begin(mode, opts) {
    opts = opts || {};
    ui.error = "";
    if (ui.party) readSettings();
    if (opts.rank) game.configure({ rank: opts.rank });
    if (opts.demo) game.configure({ demo: true, rounds: 6 });
    if (mode === "flights") mode = "teams";
    if (mode === "teams" && game.active().length < 2) {
      if (ui.party) {
        ui.error = "Flight vs Flight needs two players.";
        render();
        return;
      }
      ui.notice = "Flight vs Flight needs two flights. This laptop is running Boards & Brief.";
      mode = "boards";
    }
    if (mode === "decoy") {
      var allDecoys = PDG.decoyItems(bank);
      var ranked = allDecoys.filter(function (item) { return PDG.matchesTrack(item, game.settings.rank); });
      if (!allDecoys.length) {
        ui.screen = "decoy-empty";
        render();
        return;
      }
      if (!ranked.length) {
        ui.error = "No decoys for this rank track.";
        render();
        return;
      }
    }
    if (ui.stats && ui.stats.focusRollup) game.focusRollup = ui.stats.focusRollup;
    openSession(publicMode(mode));
    ui.session.track = game.settings.rank;
    var previous = ui.screen;
    ui.screen = "game";
    var res = game.start(mode, opts);
    if (!res.ok) {
      ui.session = null;
      ui.screen = previous === "game" ? (ui.party ? "lobby" : "solo") : previous;
      ui.error = mode === "decoy" ? "No decoy items are ready for that track." : res.reason;
      if (mode === "decoy") ui.screen = "decoy-empty";
      render();
      return;
    }
    PDG.audio.preload(["correct", "wrong", "tick", "reveal", "fanfare", "roast"]);
    render();
  }

  function copySettings(soloFlag) {
    return {
      rank: game.settings.rank,
      rounds: game.settings.rounds,
      roast: game.settings.roast,
      flights: game.settings.flights,
      demo: !!game.settings.demo,
      solo: !!soloFlag
    };
  }

  function resumePausedClock() {
    if (ui.mock && ui.mock.pausedAt) {
      ui.mock.started += Date.now() - ui.mock.pausedAt;
      ui.mock.pausedAt = 0;
    }
  }

  function landSolo(preferRollup) {
    resumePausedClock();
    if (ui.mock && !ui.mock.done) {
      ui.screen = "mock";
      if (!ui.session || ui.session.closed || ui.session.modeId !== "mock") {
        openSession("mock");
        ui.session.track = ui.mock.track || game.settings.rank;
      }
      return;
    }
    if (ui.solo && ui.solo.current) {
      ui.screen = "solo";
      if (!ui.session || ui.session.closed || ui.session.modeId !== "quiet") {
        openSession("quiet");
        ui.session.track = ui.solo.track || game.settings.rank;
      }
      ui.shownAt = Date.now();
      return;
    }
    if (preferRollup && ui.stats) {
      ui.screen = "rollup";
      return;
    }
    var prior = ui.solo || {};
    ui.screen = "solo";
    ui.solo = { track: prior.track || game.settings.rank || "E5" };
    if (prior.chapter) ui.solo.chapter = prior.chapter;
    if (prior.empty) ui.solo.empty = prior.empty;
  }

  function enterMultiplayer() {
    if (PDG.account && PDG.account.demoOnly && PDG.account.demoOnly()) {
      ui.error = "Demo Quiet Hours stays on this screen. Register to host a room.";
      ui.screen = "solo";
      render();
      return;
    }
    if (ui.party) return;
    var settings = copySettings(false);
    var rankEl = $("solo-rank");
    var chapterEl = $("solo-chapter");
    if (rankEl && rankEl.value) {
      settings.rank = rankEl.value;
      if (ui.solo && !ui.solo.current) ui.solo.track = rankEl.value;
    }
    if (chapterEl && ui.solo && !ui.solo.current) {
      ui.solo.chapter = chapterEl.value && chapterEl.value !== "all" ? Number(chapterEl.value) : null;
    }
    if (ui.session && !ui.session.closed && ui.attempts.length) finalizeSession();
    else if (ui.session && !ui.session.closed) ui.session = null;
    if (ui.mock && !ui.mock.done) ui.mock.pausedAt = Date.now();
    ui.party = true;
    ui.screen = "lobby";
    ui.notice = "";
    ui.error = "";
    ui.wager = null;
    game.players = game.players.filter(function (p) { return p.id !== "host-seat"; });
    game.hostLine = "Same Wi-Fi. Phones join with the room code.";
    game.toLobby();
    game.configure(settings);
    connectHost();
    refreshJoin();
    render();
  }

  function leaveMultiplayer() {
    if (!ui.party) return;
    var settings = copySettings(true);
    var partySession = ui.session && !ui.session.closed && ui.session.modeId !== "quiet" && ui.session.modeId !== "mock";
    var rolled = false;
    if (partySession && ui.attempts.length) {
      finalizeSession();
      rolled = true;
    } else if (partySession) ui.session = null;
    closePartyLink();
    ui.error = "";
    ui.notice = "";
    ui.wager = null;
    ui.hostSjt = null;
    game.players = [];
    landSolo(rolled);
    game.hostLine = "Quiet Hours. This screen is the whole session.";
    game.configure(settings);
    game.toLobby();
    render();
  }

  function playSolo(mode, opts) {
    closePartyLink();
    ui.notice = "";
    if (ui.session && !ui.session.closed && ui.attempts.length) finalizeSession();
    game.toLobby();
    game.players = [];
    game.addPlayer({ id: "host-seat", name: "You", avatar: "open-book" });
    var track = soloTrack();
    game.configure({ rank: track, solo: true });
    var nextOpts = Object.assign({ rank: track }, opts || {});
    if (PDG.account && PDG.account.demoOnly && PDG.account.demoOnly()) nextOpts.demo = true;
    begin(mode, nextOpts);
  }

  function emptyCopy(kind) {
    if (kind === "due") return "Nothing is due. The queue is clear.";
    if (kind === "missed") return "The missed queue is empty.";
    if (kind === "block") return "No recommended chapters yet. Run a longer block first.";
    return "No items match that chapter and rank.";
  }

  function startDrill(kind) {
    if (ui.session && !ui.session.closed && ui.attempts.length) finalizeSession();
    closePartyLink();
    var track = soloTrack();
    var chapter = soloChapter();
    var pool = PDG.filterBank(bank.questions, track, "mcq");
    if (chapter) pool = pool.filter(function (q) { return Number(PDG.chapterOf(q)) === chapter; });
    var data = PDG.sr.load();
    if (kind === "due") {
      var due = {};
      PDG.sr.dueIds(data).forEach(function (id) { due[id] = true; });
      pool = pool.filter(function (q) { return due[q.id]; });
      pool.sort(function (a, b) { return (data.cards[a.id].due || 0) - (data.cards[b.id].due || 0); });
    } else if (kind === "missed") {
      pool = pool.filter(function (q) {
        var seen = data.seen[q.id];
        return seen && seen.wrong > seen.correct;
      });
    } else if (kind === "block") {
      var wanted = ui.blockChapters || [];
      pool = pool.filter(function (q) { return wanted.indexOf(PDG.chapterOf(q)) !== -1 || wanted.indexOf(Number(PDG.chapterOf(q))) !== -1; });
      pool = PDG.shuffle(pool);
    } else {
      pool = PDG.shuffle(pool);
    }
    if (PDG.account && PDG.account.demoOnly && PDG.account.demoOnly()) {
      pool = pool.filter(function (q) { return q.demo; });
    }
    pool = pool.slice(0, 15);
    ui.solo = { track: track, chapter: chapter, deck: pool, pos: 0, current: pool[0] || null, revealed: false, empty: pool.length ? "" : emptyCopy(kind) };
    ui.screen = "solo";
    if (pool.length) {
      openSession("quiet");
      ui.session.track = track;
      ui.shownAt = Date.now();
    }
    render();
  }

  function startMock() {
    if (PDG.account && PDG.account.demoOnly && PDG.account.demoOnly()) {
      ui.error = "The mock PFE needs a verified account on an active trial or subscription.";
      render();
      return;
    }
    if (ui.session && !ui.session.closed && ui.attempts.length) finalizeSession();
    closePartyLink();
    var track = soloTrack();
    var mcqPool = PDG.shuffle(PDG.filterBank(bank.questions, track, "mcq"));
    var sjtPool = PDG.shuffle(PDG.filterBank(bank.sjt, track, "sjt"));
    var mcq = mcqPool.slice(0, 60);
    var sjt = sjtPool.slice(0, 20);
    var spare = mcqPool.slice(mcq.length);
    while (mcq.length + sjt.length < 80 && spare.length) mcq.push(spare.shift());
    var items = mcq.map(function (q) { q.kind = "mcq"; return q; }).concat(sjt.map(function (s) { s.kind = "sjt"; return s; }));
    items = PDG.shuffle(items);
    if (!items.length) {
      ui.screen = "solo";
      ui.solo = { track: track, empty: "No items for that rank track." };
      render();
      return;
    }
    ui.mock = { items: items, pos: 0, answers: [], started: Date.now(), limit: 80 * 60 * 1000, done: false, sjtMost: null, track: track };
    ui.screen = "mock";
    ui.shownAt = Date.now();
    openSession("mock");
    ui.session.track = track;
    render();
  }

  function recordStudy(item, correct, latencyMs) {
    ui.attempts.push({
      playerId: "host-seat",
      id: item.id,
      chapter: PDG.chapterOf(item),
      section: (item.cite && item.cite.section) || "",
      correct: !!correct,
      latencyMs: latencyMs || 0,
      wager: 0,
      wagerDelta: 0
    });
    award(true);
  }

  function advanceQuiet(quality) {
    var item = ui.solo.current;
    if (!ui.solo.wasCorrect) quality = Math.min(quality, 2);
    PDG.sr.grade(PDG.sr.load(), item, quality);
    recordStudy(item, ui.solo.wasCorrect, ui.solo.latencyMs || 0);
    ui.solo.pos += 1;
    ui.solo.current = ui.solo.deck[ui.solo.pos] || null;
    ui.solo.revealed = false;
    ui.shownAt = Date.now();
    if (!ui.solo.current) {
      finalizeSession();
      ui.solo = { track: ui.solo.track };
      ui.screen = "rollup";
    }
    render();
  }

  function finishMock() {
    while (ui.mock.answers.length < 80) {
      ui.mock.answers.push({ correct: false, chapter: 0, blank: true });
      ui.attempts.push({ playerId: "host-seat", correct: false, latencyMs: 0, wagerDelta: 0, wager: 0, omitGroup: true });
    }
    ui.mock.answers = ui.mock.answers.slice(0, 80);
    ui.mock.done = true;
    var correct = ui.mock.answers.filter(function (a) { return a.correct; }).length;
    ui.mockScore = PDG.pfeScore(correct, 80);
    var data = PDG.sr.load();
    data.mocks = data.mocks || [];
    data.mocks.push({ at: Date.now(), score: ui.mockScore, track: ui.mock.track });
    PDG.sr.save(data);
    finalizeSession();
    ui.screen = "rollup";
  }

  function advanceMock() {
    ui.mock.pos += 1;
    ui.shownAt = Date.now();
    if (ui.mock.pos >= ui.mock.items.length || (Date.now() - ui.mock.started) > ui.mock.limit) finishMock();
    render();
  }

  function stopMock() {
    if (ui.mock && !ui.mock.done && ui.attempts.length) {
      finishMock();
      render();
      return;
    }
    ui.screen = "solo";
    ui.solo = { track: (ui.mock && ui.mock.track) || "E5" };
    ui.mock = null;
    render();
  }

  function goDesk() {
    ui.screen = "solo";
    ui.solo = { track: soloTrack() };
    ui.mock = null;
    game.hostLine = "Quiet Hours. This screen is the whole session.";
    render();
  }

  function wash() {
    if (ui.stats && ui.stats.focusRollup) game.focusRollup = ui.stats.focusRollup;
    if (ui.party && game.active().length) begin("hotwash", { keepScore: true });
    else playSolo("hotwash", { keepScore: true });
  }

  function bind() {
    var map = {
      host: enterMultiplayer,
      "mode-party": enterMultiplayer,
      "mode-solo": leaveMultiplayer,
      solo: function () {
        if (ui.party) {
          leaveMultiplayer();
          return;
        }
        closePartyLink();
        ui.screen = "solo";
        ui.solo = { track: soloTrack() };
        game.phase = "attract";
        game.hostLine = "Quiet Hours. This screen is the whole session.";
        render();
      },
      about: function () { ui.screen = "about"; render(); },
      back: function () {
        closePartyLink();
        ui.screen = "attract";
        game.phase = "attract";
        game.toLobby();
        render();
      },
      "back-solo": stopMock,
      "back-desk": goDesk,
      mute: function () { PDG.audio.toggleMute(); lastKey = ""; render(); },
      quiet: function () { PDG.audio.toggleQuiet(); lastKey = ""; render(); },
      next: function () { game.advance(); },
      skip: function () { game.advance(); },
      lobby: function () {
        if (ui.party) { ui.screen = "lobby"; game.toLobby(); render(); }
        else goDesk();
      },
      hot: wash,
      "go-boards": function () { begin("boards"); },
      "go-decoy": function () { begin("decoy"); },
      "go-light": function () { begin("lightning"); },
      "go-teams": function () { begin("teams"); },
      "go-sjt": function () { begin("sjt"); },
      "go-hot": function () { begin("hotwash", { keepScore: true }); },
      "go-demo": function () { begin("boards", { demo: true }); },
      "solo-boards": function () { playSolo("boards"); },
      "solo-light": function () { playSolo("lightning"); },
      "solo-decoy": function () { playSolo("decoy"); },
      "solo-flights": function () { playSolo("teams"); },
      "solo-sjt": function () { playSolo("sjt"); },
      drill: function () { startDrill("chapter"); },
      due: function () { startDrill("due"); },
      missed: function () { startDrill("missed"); },
      mock: startMock,
      "quiet-block": function () {
        ui.blockChapters = (ui.stats && ui.stats.focusRollup && ui.stats.focusRollup.recommendedNext) || [];
        startDrill("block");
      },
      "solo-stop": function () {
        if (ui.attempts.length) finalizeSession();
        ui.screen = ui.stats ? "rollup" : "solo";
        ui.solo = { track: ui.solo && ui.solo.track || "E5" };
        render();
      },
      export: function () {
        var blob = new Blob([PDG.sr.exportJson()], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "pdg-party-save.json";
        a.click();
      }
    };
    Object.keys(map).forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("click", map[id]);
    });
    ["rank", "rounds", "roast", "flights", "demo"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", readSettings);
    });
    document.querySelectorAll("[data-wager]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        ui.wager = Number(btn.getAttribute("data-wager"));
        lastKey = "";
        render();
      });
    });
    document.querySelectorAll("[data-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var item = ui.solo.current;
        ui.solo.picked = Number(btn.getAttribute("data-choice"));
        ui.solo.revealed = true;
        ui.solo.wasCorrect = ui.solo.picked === item.answerIndex;
        ui.solo.latencyMs = Math.max(0, Date.now() - (ui.shownAt || Date.now()));
        PDG.audio.play(ui.solo.wasCorrect ? "correct" : "wrong");
        render();
      });
    });
    document.querySelectorAll("[data-q]").forEach(function (btn) {
      btn.addEventListener("click", function () { advanceQuiet(Number(btn.getAttribute("data-q"))); });
    });
    document.querySelectorAll("[data-mock]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var item = ui.mock.items[ui.mock.pos];
        var picked = Number(btn.getAttribute("data-mock"));
        var ok = picked === item.answerIndex;
        ui.mock.answers.push({ correct: ok, chapter: item.cite && item.cite.chapter });
        recordStudy(item, ok, Math.max(0, Date.now() - (ui.shownAt || Date.now())));
        advanceMock();
      });
    });
    document.querySelectorAll("[data-sjt]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-sjt"));
        var item = ui.mock.items[ui.mock.pos];
        if (ui.mock.sjtMost == null) { ui.mock.sjtMost = idx; render(); return; }
        if (ui.mock.sjtMost === idx) return;
        var pts = PDG.sjtPoints(item.mostIndex, item.leastIndex, ui.mock.sjtMost, idx);
        ui.mock.answers.push({ correct: pts === 1000, chapter: item.cite && item.cite.chapter, partial: pts });
        recordStudy(item, pts === 1000, Math.max(0, Date.now() - (ui.shownAt || Date.now())));
        if (pts === 1000) ui.judgment = true;
        ui.mock.sjtMost = null;
        advanceMock();
      });
    });
    document.querySelectorAll("[data-host-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (wagerGateOpen()) return;
        var id = btn.getAttribute("data-host-choice");
        game.receive("host-seat", { type: "choice", choice: id, optionId: id, wager: ui.wager || 0 });
      });
    });
    document.querySelectorAll("[data-host-sponsor]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-host-sponsor");
        game.receive("host-seat", { type: "sponsor", optionId: id, wager: ui.wager || 0 });
      });
    });
    document.querySelectorAll("[data-host-sjt]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-host-sjt"));
        if (ui.hostSjt == null) { ui.hostSjt = idx; lastKey = ""; render(); return; }
        if (ui.hostSjt === idx) return;
        game.receive("host-seat", { type: "sjt", most: ui.hostSjt, least: idx });
      });
    });
    if (PDG.account && PDG.account.bindPanel) PDG.account.bindPanel();
    var importer = $("import");
    if (importer) importer.addEventListener("change", function () {
      var file = importer.files && importer.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { PDG.sr.importJson(String(reader.result)); ui.error = ""; }
        catch (e) { ui.error = "Could not read that save file."; }
        render();
      };
      reader.readAsText(file);
    });
  }

  function clickChoice(selector, index) {
    var buttons = document.querySelectorAll(selector);
    if (buttons[index]) buttons[index].click();
  }

  document.addEventListener("keydown", function (ev) {
    if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    var tag = ev.target && ev.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if ((ev.key === "m" || ev.key === "M") && ui.screen !== "mock") {
      PDG.audio.toggleMute();
      lastKey = "";
      render();
      return;
    }
    if (wagerGateOpen() && ev.key >= "0" && ev.key <= "3") {
      ev.preventDefault();
      ui.wager = Number(ev.key);
      lastKey = "";
      render();
      return;
    }
    var letter = { a: 0, b: 1, c: 2, d: 3, A: 0, B: 1, C: 2, D: 3 };
    var index = letter[ev.key];
    if (index == null && ev.key >= "1" && ev.key <= "4") index = Number(ev.key) - 1;
    if (index != null) {
      if (ui.screen === "solo" && ui.solo && ui.solo.current) {
        ev.preventDefault();
        if (!ui.solo.revealed) clickChoice("[data-choice]", index);
        else clickChoice("[data-q]", index);
        return;
      }
      if (ui.screen === "mock" && ui.mock && !ui.mock.done) {
        ev.preventDefault();
        var item = ui.mock.items[ui.mock.pos];
        if (item && item.kind === "sjt") clickChoice("[data-sjt]", index);
        else clickChoice("[data-mock]", index);
        return;
      }
      if (ui.screen === "game" && localPlay() && game && game.phase === "collect") {
        ev.preventDefault();
        if (game.modeId === "sjt") clickChoice("[data-host-sjt]", index);
        else clickChoice("[data-host-choice], [data-host-sponsor]", index);
        return;
      }
    }
    if ((ev.key === " " || ev.key === "Enter" || ev.key === "n" || ev.key === "N") && game && ui.screen === "game" && (game.phase === "reveal" || game.phase === "interstitial")) {
      ev.preventDefault();
      game.advance();
    }
  });

  PDG.enterDemo = function () {
    closePartyLink();
    ui.party = false;
    ui.screen = "solo";
    ui.solo = { track: "E5" };
    if (game) {
      game.configure({ demo: true });
      game.hostLine = "Demo Quiet Hours. Register to keep progress and open the full bank.";
    }
    lastKey = "";
    render();
  };
  PDG.requestRender = function () { lastKey = ""; render(); };

  loadBank().then(function (loaded) {
    bank = loaded;
    bank.questions = bank.questions || [];
    bank.sjt = bank.sjt || [];
    bank.decoys = bank.decoys || [];
    bank.lines = bank.lines || { dares: [] };
    game = new PDG.Game(bank);
    var boot = (PDG.account && PDG.account.boot) ? PDG.account.boot() : Promise.resolve();
    return boot.then(function () {
    game.on(function () { pushState(); render(); });
    var params = new URLSearchParams(location.search);
    var offlineSolo = params.get("quiet") === "1" || location.protocol === "file:";
    if (PDG.account && PDG.account.saas) {
      if (!PDG.account.blocksPlay()) {
        if (PDG.account.demoOnly()) {
          ui.screen = "solo";
          ui.solo = { track: "E5" };
          game.configure({ demo: true });
          game.hostLine = "Demo Quiet Hours. Register to keep progress and open the full bank.";
        } else {
          ui.screen = "attract";
          game.hostLine = "This laptop can run the whole session. Phones join when you host a room.";
        }
      }
    } else if (offlineSolo) {
      ui.screen = "solo";
      ui.solo = { track: "E5" };
      game.hostLine = "Quiet Hours. This screen is the whole session.";
    }
    refreshJoin();
    setInterval(refreshJoin, 15000);
    window.addEventListener("focus", refreshJoin);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") refreshJoin();
    });
    render();
    setInterval(function () {
      patchLive();
      if (ui.screen === "mock" && ui.mock && !ui.mock.done) {
        if ((Date.now() - ui.mock.started) >= ui.mock.limit) advanceMock();
      }
    }, 250);
    });
  }).catch(function (err) {
    var app = $("app");
    if (app) app.innerHTML = '<div class="panel"><h1>PDG PARTY</h1><p class="disclaimer">Unofficial study aid. Not an Air Force product.</p><p>Question bank failed to load. Use the launcher (start.sh) so the folder is served over http, or rebuild with python3 tools/build_bank.py.</p><p class="fine">' + PDG.esc(String(err)) + "</p></div>";
  });
})();
