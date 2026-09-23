(function () {
  var PDG = window.PDG;
  var ui = { screen: "attract", error: "", solo: null, mock: null, install: null, lanUnreachable: false };
  var joinInfo = null;
  var COACH = "Use the same Wi-Fi, not a guest network, and allow Python through the firewall.";
  var bank = null;
  var game = null;
  var link = null;
  var lastKey = "";
  var lastPhase = "";

  function $(id) { return document.getElementById(id); }

  function choiceHTML(list, revealId) {
    return (list || []).map(function (c) {
      var cls = "choice";
      if (revealId && c.id === revealId) cls += " right";
      else if (revealId) cls += " wrong";
      var markInner = c.shape === "diamond" ? "<span>" + PDG.esc(c.letter || "") + "</span>" : PDG.esc(c.letter || "");
      return '<div class="' + cls + '"><div class="mark ' + PDG.esc(c.shape || "square") + '">' + markInner + '</div><div>' + PDG.esc(c.text) + "</div></div>";
    }).join("");
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
      return { questions: parts[0], sjt: parts[1], lines: parts[2], chapters: parts[3] };
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
    if (!link || !game) return;
    link.sendState(game.playerView(null));
    game.players.forEach(function (p) {
      var priv = game.privateFor(p.id);
      if (priv) link.sendPriv(p.id, priv);
    });
  }

  function render() {
    var app = $("app");
    if (!app || !game) return;
    var key = ui.screen + "|" + game.phase + "|" + game.index + "|" + game.subphase + "|" + (game.reveal ? 1 : 0) + "|" + game.players.length + "|" + Object.keys(game.answers || {}).length + "|" + (game.interstitial ? 1 : 0);
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
    app.innerHTML = shell(screen());
    bind();
    patchLive();
  }

  function shell(inner) {
    var muteLabel = PDG.audio.muted ? "Sound off" : "Sound on";
    var quietLabel = PDG.audio.quiet ? "Quiet on" : "Quiet mode";
    return '' +
      '<div class="sky">' +
      '<div class="hazard"></div>' +
      '<header class="topbar">' +
      '<div class="brand">PDG <span>PARTY</span></div>' +
      '<div class="roompill">ROOM ' + PDG.esc(game.room) + "</div>" +
      '<div class="top-actions">' +
      '<button class="icon-btn" id="mute" type="button">' + PDG.esc(muteLabel) + "</button>" +
      '<button class="icon-btn" id="quiet" type="button">' + PDG.esc(quietLabel) + "</button>" +
      '<button class="icon-btn" id="about" type="button">About</button>' +
      "</div></header>" +
      '<div class="stage"><aside class="chief-col"><img class="chief" alt="Chief Hot Wash, the game host" src="' + chiefFrame() + '"><div class="bubble" aria-live="polite">' + PDG.esc(game.hostLine) + "</div></aside>" +
      '<section class="panel" id="panel">' + inner + "</section></div>" +
      '<footer class="scorestrip" id="scores">' + scoreHTML() + "</footer></div>";
  }

  function scoreHTML() {
    if (!game.players.length) return '<div class="fine">Players show up here.</div>';
    return game.players.filter(function (p) { return p.connected !== false; }).map(function (p) {
      var tag = p.audience ? "Audience" : (p.team != null ? "Flight " + (p.team + 1) : "Player");
      if (p.captain) tag += " · Captain";
      if (p.nickname) tag += " · " + p.nickname;
      return '<div class="player-chip"><img alt="" src="' + avatarImg(p.avatar) + '"><div><strong>' + PDG.esc(p.name) + '</strong><div class="meta">' + PDG.esc(tag) + (p.combo ? " · combo " + p.combo : "") + '</div></div><div>' + p.score + "</div></div>";
    }).join("");
  }

  function screen() {
    if (ui.screen === "about") return aboutHTML();
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
      '<div class="row">' +
      '<button class="btn amber" id="host" type="button">Host a room</button>' +
      '<button class="btn" id="solo" type="button">Quiet Hours</button>' +
      '<button class="btn ghost" id="install" type="button">Install</button>' +
      "</div>" +
      (ui.error ? '<p class="warn">' + PDG.esc(ui.error) + "</p>" : "");
  }

  function lobbyHTML() {
    var s = game.settings;
    var qr = "";
    try {
      if (window.qrcode && game.joinUrl) {
        qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
        var q = qrcode(0, "M");
        q.addData(game.joinUrl);
        q.make();
        qr = q.createSvgTag(4, 2);
      }
    } catch (e) { qr = ""; }
    var roster = game.players.filter(function (p) { return p.connected !== false; }).map(function (p) {
      return '<div class="chip"><img alt="" src="' + avatarImg(p.avatar) + '"><div><strong>' + PDG.esc(p.name) + '</strong><div class="meta">' + (p.audience ? "Audience" : "Player") + "</div></div></div>";
    }).join("") || '<p class="fine">Waiting for phones. Late join closes when round 1 starts. Cap is 8 players. Audience is uncapped.</p>';
    return '' +
      '<p class="kicker">Lobby</p><h2>Same Wi-Fi. Type the code.</h2>' +
      '<div class="grid-2"><div>' +
      '<div class="row">' +
      fieldRank(s.rank) + fieldRounds(s.rounds) + fieldRoast(s.roast) + fieldFlights(s.flights) +
      "</div>" +
      '<label class="field"><span>Demo seed</span><select id="demo"><option value="no"' + (s.demo ? "" : " selected") + '>Full bank</option><option value="yes"' + (s.demo ? " selected" : "") + ">3-minute demo</option></select></label>" +
      '<div class="row">' +
      '<button class="btn amber" id="go-boards" type="button">Boards & Brief</button>' +
      '<button class="btn" id="go-fib" type="button">Fibbage</button>' +
      '<button class="btn" id="go-light" type="button">Lightning</button>' +
      '<button class="btn" id="go-teams" type="button">Flight vs Flight</button>' +
      '<button class="btn" id="go-sjt" type="button">SJT</button>' +
      '<button class="btn ghost" id="go-hot" type="button">Hot Wash</button>' +
      '<button class="btn ghost" id="go-demo" type="button">3-minute brief</button>' +
      "</div>" +
      (ui.error ? '<p class="warn">' + PDG.esc(ui.error) + "</p>" : "") +
      '<div class="roster">' + roster + "</div></div>" +
      '<div><div class="qr" id="qr">' + qr + '</div><p class="fine">Join URL</p><p>' + PDG.esc(game.joinUrl || "Starting local server…") + "</p>" +
      (ui.lanUnreachable ? '<p class="warn">Phones cannot reach this computer. ' + PDG.esc(COACH) + "</p>" : "") +
      '<p class="fine">Open a second browser at /play to be a phone.</p></div></div>';
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

  function stageHTML() {
    var view = game.view || {};
    var round = (game.index + 1) + " / " + game.deck.length;
    var title = game.mode ? game.mode.title : "";
    var body = '<p class="kicker">' + PDG.esc(title) + " · " + PDG.esc(round) + (game.steal ? " · STEAL" : "") + "</p>";
    body += '<div class="timer" aria-hidden="true"><span id="timerbar"></span></div>';
    body += '<div id="clock" class="fine"></div>';
    if (game.phase === "interstitial" && game.interstitial) {
      body += "<h2>" + PDG.esc(game.interstitial.title) + "</h2><p class=\"prompt\">" + PDG.esc(game.interstitial.body) + "</p>";
      if (game.interstitial.dare) body += '<div class="row"><button class="btn amber" id="skip" type="button">Skip dare</button><button class="btn" id="next" type="button">Done</button></div>';
      return body;
    }
    body += '<h2 class="prompt">' + PDG.esc(view.prompt || "") + "</h2>";
    var showChoices = game.phase === "reveal" || (view.kind === "fibvote" && game.phase === "collect");
    if (showChoices && game.phase === "reveal" && game.reveal && game.reveal.options && game.reveal.options.length) {
      body += '<div class="choices">' + game.reveal.options.map(function (o) {
        var who = o.truth ? "Handbook" : (o.example ? "House lie" : "Player lie");
        return '<div class="choice ' + (o.truth ? "right" : "wrong") + '"><div class="mark ' + (o.shape || "square") + '">' + PDG.esc(o.letter || "") + "</div><div><strong>" + PDG.esc(o.text) + "</strong><div class=\"meta\">" + who + "</div></div></div>";
      }).join("") + "</div>";
    } else if (showChoices && view.choices && !view.hideOnHost) {
      body += '<div class="choices">' + choiceHTML(view.choices, null) + "</div>";
    } else if (game.phase === "reveal" && view.choices) {
      body += '<div class="choices">' + choiceHTML(view.choices, game.reveal && game.reveal.correctId) + "</div>";
    } else if (game.phase === "collect") {
      body += '<p class="fine">Phones are live. ' + Object.keys(game.answers).length + " locked.</p>";
    }
    if (game.phase === "reveal" && game.reveal) {
      var stamp = (game.reveal.bucket === "wrong") ? '<div class="stamp retrain">RETRAIN</div>' : '<div class="stamp">PROMOTED</div>';
      body += stamp;
      body += '<div class="cite">' + PDG.esc(PDG.citeLabel(game.reveal.cite)) + "</div>";
      body += '<p>' + PDG.esc(game.reveal.explain || "") + "</p>";
      if (game.reveal.competency) body += '<p class="fine">Competency: ' + PDG.esc(game.reveal.competency) + "</p>";
      if (game.reveal.leastText) body += '<p class="fine">Least effective: ' + PDG.esc(game.reveal.leastText) + "</p>";
      body += '<div class="source"><strong>Open source paragraph. </strong>' + PDG.esc(game.reveal.source || "") + "</div>";
      if (!game.mode || !game.mode.autoAdvance) body += '<div class="row"><button class="btn amber" id="next" type="button">Next</button></div>';
    }
    return body;
  }

  function resultsHTML() {
    var rows = game.active().slice().sort(function (a, b) { return b.score - a.score; });
    var list = rows.map(function (p, i) {
      return "<li><strong>" + (i + 1) + ". " + PDG.esc(p.name) + "</strong> — " + p.score + (p.nickname ? " (" + PDG.esc(p.nickname) + ")" : "") + "</li>";
    }).join("");
    var missed = Object.keys(game.misses).map(function (ch) { return "Ch " + ch + " ×" + game.misses[ch]; }).join(", ") || "No chapter took a bite. Suspicious.";
    return '<p class="kicker">Results</p><h2>Board is closed.</h2><ol>' + list + "</ol><p>Misses: " + PDG.esc(missed) + '</p><div class="row"><button class="btn amber" id="hot" type="button">Hot Wash the misses</button><button class="btn" id="lobby" type="button">Back to lobby</button></div>';
  }

  function aboutHTML() {
    var chapters = (bank.chapters || []).map(function (c) {
      var tag = c.waps === "both" ? "E-5 and E-6" : c.waps === "e6" ? "E-6 only" : "Not on 2026 PFE";
      return "<li>Ch " + c.chapter + " " + PDG.esc(c.title) + " — " + tag + "</li>";
    }).join("");
    return '<p class="kicker">About</p><h2>Read this before you trust a score.</h2>' +
      '<p class="disclaimer">Unofficial study aid. Not an Air Force product, not a substitute for AFH 1 (15 February 2025), and not how the Air Force writes the PFE. PFE content is determined solely by the Air Force. Group study for the purpose of enlisted promotion testing is prohibited by DAFMAN 36-2664.</p>' +
      "<p>Questions are original to this game. They are tagged with chapter, section, paragraph or section anchor, page hint, ranks, difficulty, and sourceEdition AFH1-2025. They are not copied from commercial banks.</p>" +
      "<p>Branding is original: chevron-inspired geometry, not the Air Force seal and not a Hap Arnold wings lockup. Rank pips on the scoreboard are game tokens, not official insignia.</p>" +
      "<ul>" + chapters + "</ul>" +
      '<p class="fine">Icons: Lucide (ISC). QR: Kazuhiko Arase (MIT). Type: Barlow Condensed and Source Sans 3 (OFL). Audio: original generated tones. Illustrations: original.</p>' +
      '<button class="btn" id="back" type="button">Back</button>';
  }

  function soloHTML() {
    var s = ui.solo;
    if (!s || !s.current) {
      return '<p class="kicker">Quiet Hours</p><h2>Solo study. No room code.</h2>' +
        '<div class="row">' + fieldRank(s && s.track || "E5").replace('id="rank"', 'id="solo-rank"') +
        '<button class="btn amber" id="drill" type="button">Chapter drill</button>' +
        '<button class="btn" id="due" type="button">Due today</button>' +
        '<button class="btn" id="missed" type="button">Missed queue</button>' +
        '<button class="btn" id="mock" type="button">Mock PFE</button>' +
        "</div>" + heatmap() +
        '<div class="row"><button class="btn ghost" id="export" type="button">Export progress</button><label class="btn ghost">Import<input id="import" type="file" accept="application/json" class="sr"></label><button class="btn ghost" id="back" type="button">Title</button></div>';
    }
    var item = s.current;
    var choices = PDG.choiceView(item);
    var html = '<p class="kicker">Quiet Hours · ' + (s.pos + 1) + " / " + s.deck.length + "</p>";
    html += '<h2 class="prompt">' + PDG.esc(item.question) + "</h2>";
    if (!s.revealed) {
      html += '<div class="choices">' + choices.map(function (c) {
        return '<button class="choice" type="button" data-choice="' + c.index + '"><div class="mark ' + c.shape + '">' + (c.shape === "diamond" ? "<span>" + c.letter + "</span>" : c.letter) + "</div><div>" + PDG.esc(c.text) + "</div></button>";
      }).join("") + "</div>";
    } else {
      html += '<div class="choices">' + choiceHTML(choices, "c" + item.answerIndex) + "</div>";
      html += '<div class="cite">' + PDG.esc(PDG.citeLabel(item.cite)) + "</div><p>" + PDG.esc(item.explain) + "</p>";
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
      return "<div><b>" + pct + "%</b>Ch " + c.chapter + " · " + total + " seen</div>";
    }).join("");
    return '<div class="heat">' + cells + "</div>";
  }

  function mockHTML() {
    var m = ui.mock;
    if (!m) return '<p>Mock is empty.</p><button class="btn" id="back" type="button">Back</button>';
    if (m.done) {
      var correct = m.answers.filter(function (a) { return a.correct; }).length;
      var score = PDG.pfeScore(correct, 80);
      var by = {};
      m.answers.forEach(function (a) {
        var ch = a.chapter || 0;
        if (!by[ch]) by[ch] = { correct: 0, wrong: 0 };
        if (a.correct) by[ch].correct += 1; else by[ch].wrong += 1;
      });
      var lines = Object.keys(by).map(function (ch) {
        var t = by[ch].correct + by[ch].wrong;
        return "<li>Chapter " + ch + ": " + by[ch].correct + "/" + t + "</li>";
      }).join("");
      return '<p class="kicker">Mock PFE</p><h2>' + score + " / 100</h2><p>Study timer result. Not an official score. " + correct + " of " + m.items.length + " keyed items were right. Blank items count wrong. Each of 80 slots is 1.25 points.</p><ul>" + lines + '</ul><button class="btn" id="back-solo" type="button">Quiet Hours</button>';
    }
    var item = m.items[m.pos];
    var left = Math.max(0, m.limit - (Date.now() - m.started));
    var mins = Math.floor(left / 60000);
    var secs = Math.floor((left % 60000) / 1000);
    var clock = mins + ":" + String(secs).padStart(2, "0");
    if (item.kind === "sjt") {
      return '<p class="kicker">Mock PFE · ' + (m.pos + 1) + " / " + m.items.length + " · " + clock + "</p>" +
        '<h2 class="prompt">' + PDG.esc(item.scenario) + "</h2>" +
        "<p>Pick most effective, then least effective.</p>" +
        (item.actions || []).map(function (text, i) {
          return '<button class="choice" type="button" data-sjt="' + i + '">' + PDG.esc(text) + "</button>";
        }).join("") +
        '<p class="fine">' + (m.sjtMost == null ? "Choose MOST." : "Choose LEAST. Most is locked.") + "</p>" +
        '<button class="btn ghost" id="back-solo" type="button">Stop mock</button>';
    }
    var choices = PDG.choiceView(item);
    return '<p class="kicker">Mock PFE · ' + (m.pos + 1) + " / " + m.items.length + " · " + clock + "</p>" +
      '<h2 class="prompt">' + PDG.esc(item.question) + "</h2>" +
      '<div class="choices">' + choices.map(function (c) {
        return '<button class="choice" type="button" data-mock="' + c.index + '"><div class="mark ' + c.shape + '">' + c.letter + "</div><div>" + PDG.esc(c.text) + "</div></button>";
      }).join("") + "</div>" +
      '<button class="btn ghost" id="back-solo" type="button">Stop mock</button>';
  }

  function patchLive() {
    var bar = $("timerbar");
    var clock = $("clock");
    if (!bar || game.phase !== "collect") return;
    var total = (game.roundSeconds || 1) * 1000;
    var left = Math.max(0, game.deadline - Date.now());
    bar.style.width = Math.max(0, Math.min(100, (left / total) * 100)) + "%";
    if (clock) clock.textContent = Math.ceil(left / 1000) + "s";
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

  function begin(mode, opts) {
    readSettings();
    ui.error = "";
    if (opts && opts.demo) game.configure({ demo: true, rounds: 6 });
    var res = game.start(mode, opts || {});
    if (!res.ok) { ui.error = res.reason; render(); return; }
    ui.screen = "game";
    PDG.audio.preload(["correct", "wrong", "tick", "reveal", "fanfare", "roast"]);
    render();
  }

  function startDrill(kind) {
    var track = ($("solo-rank") && $("solo-rank").value) || (ui.solo && ui.solo.track) || "E5";
    var pool = PDG.filterBank(bank.questions, track, "mcq");
    var data = PDG.sr.load();
    if (kind === "due") {
      var due = {};
      PDG.sr.dueIds(data).forEach(function (id) { due[id] = true; });
      var filtered = pool.filter(function (q) { return due[q.id] || !data.cards[q.id]; });
      if (filtered.length) pool = filtered;
    } else if (kind === "missed") {
      var bad = pool.filter(function (q) {
        var seen = data.seen[q.id];
        return seen && seen.wrong > seen.correct;
      });
      if (bad.length) pool = bad;
    }
    pool = PDG.shuffle(pool).slice(0, 15);
    ui.solo = { track: track, deck: pool, pos: 0, current: pool[0] || null, revealed: false };
    ui.screen = "solo";
    render();
  }

  function startMock() {
    var track = ($("solo-rank") && $("solo-rank").value) || "E5";
    var mcqPool = PDG.shuffle(PDG.filterBank(bank.questions, track, "mcq"));
    var sjtPool = PDG.shuffle(PDG.filterBank(bank.sjt, track, "sjt"));
    var mcq = mcqPool.slice(0, 60);
    var sjt = sjtPool.slice(0, 20);
    var spare = mcqPool.slice(mcq.length);
    while (mcq.length + sjt.length < 80 && spare.length) mcq.push(spare.shift());
    var items = mcq.map(function (q) { q.kind = "mcq"; return q; }).concat(sjt.map(function (s) { s.kind = "sjt"; return s; }));
    items = PDG.shuffle(items);
    ui.mock = { items: items, pos: 0, answers: [], started: Date.now(), limit: 80 * 60 * 1000, done: false, sjtMost: null, track: track };
    ui.screen = "mock";
    render();
  }

  function bind() {
    var map = {
      host: function () { ui.screen = "lobby"; game.toLobby(); connectHost(); refreshJoin(); },
      solo: function () { ui.screen = "solo"; ui.solo = { track: "E5" }; render(); },
      about: function () { ui.screen = "about"; render(); },
      back: function () { ui.screen = game.phase === "lobby" ? "lobby" : "attract"; if (ui.screen === "attract") game.phase = "attract"; render(); },
      "back-solo": function () { ui.screen = "solo"; ui.solo = { track: (ui.mock && ui.mock.track) || "E5" }; ui.mock = null; render(); },
      install: function () { if (ui.install) ui.install.prompt(); },
      mute: function () { PDG.audio.toggleMute(); lastKey = ""; render(); },
      quiet: function () { PDG.audio.toggleQuiet(); lastKey = ""; render(); },
      next: function () { game.advance(); },
      skip: function () { game.advance(); },
      lobby: function () { ui.screen = "lobby"; game.toLobby(); },
      hot: function () { begin("hotwash", { keepScore: true }); },
      "go-boards": function () { begin("boards"); },
      "go-fib": function () { begin("fibbage"); },
      "go-light": function () { begin("lightning"); },
      "go-teams": function () { begin("teams"); },
      "go-sjt": function () { begin("sjt"); },
      "go-hot": function () { begin("hotwash", { keepScore: true }); },
      "go-demo": function () { begin("boards", { demo: true }); },
      drill: function () { startDrill("chapter"); },
      due: function () { startDrill("due"); },
      missed: function () { startDrill("missed"); },
      mock: function () { startMock(); },
      "solo-stop": function () { ui.solo = { track: ui.solo.track }; render(); },
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
    document.querySelectorAll("[data-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var item = ui.solo.current;
        ui.solo.picked = Number(btn.getAttribute("data-choice"));
        ui.solo.revealed = true;
        ui.solo.wasCorrect = ui.solo.picked === item.answerIndex;
        render();
      });
    });
    document.querySelectorAll("[data-q]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var q = Number(btn.getAttribute("data-q"));
        if (!ui.solo.wasCorrect) q = Math.min(q, 2);
        PDG.sr.grade(PDG.sr.load(), ui.solo.current, q);
        ui.solo.pos += 1;
        ui.solo.current = ui.solo.deck[ui.solo.pos] || null;
        ui.solo.revealed = false;
        if (!ui.solo.current) ui.solo = { track: ui.solo.track };
        render();
      });
    });
    document.querySelectorAll("[data-mock]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var item = ui.mock.items[ui.mock.pos];
        var picked = Number(btn.getAttribute("data-mock"));
        ui.mock.answers.push({ correct: picked === item.answerIndex, chapter: item.cite && item.cite.chapter });
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
        ui.mock.sjtMost = null;
        advanceMock();
      });
    });
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

  function advanceMock() {
    ui.mock.pos += 1;
    if (ui.mock.pos >= ui.mock.items.length || (Date.now() - ui.mock.started) > ui.mock.limit) {
      while (ui.mock.answers.length < 80) ui.mock.answers.push({ correct: false, chapter: 0 });
      ui.mock.answers = ui.mock.answers.slice(0, 80);
      ui.mock.done = true;
      var data = PDG.sr.load();
      data.mocks.push({ at: Date.now(), score: PDG.pfeScore(ui.mock.answers.filter(function (a) { return a.correct; }).length, 80), track: ui.mock.track });
      PDG.sr.save(data);
    }
    render();
  }

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "m" && ev.target.tagName !== "INPUT" && ev.target.tagName !== "TEXTAREA") {
      PDG.audio.toggleMute();
      lastKey = "";
      render();
    }
    if ((ev.key === " " || ev.key === "Enter" || ev.key === "n") && game && (game.phase === "reveal" || game.phase === "interstitial")) {
      if (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA" || ev.target.tagName === "SELECT") return;
      ev.preventDefault();
      game.advance();
    }
  });

  window.addEventListener("beforeinstallprompt", function (ev) {
    ev.preventDefault();
    ui.install = ev;
  });

  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  loadBank().then(function (loaded) {
    bank = loaded;
    bank.questions = bank.questions || [];
    bank.sjt = bank.sjt || [];
    bank.lines = bank.lines || { dares: [] };
    game = new PDG.Game(bank);
    game.on(function () { pushState(); render(); });
    var params = new URLSearchParams(location.search);
    if (params.get("quiet") === "1") { ui.screen = "solo"; ui.solo = { track: "E5" }; }
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
        var clock = document.querySelector(".kicker");
        if (clock) {
          var left = Math.max(0, ui.mock.limit - (Date.now() - ui.mock.started));
          if (left === 0) advanceMock();
        }
      }
    }, 250);
  }).catch(function (err) {
    $("app").innerHTML = '<div class="panel"><h1>PDG PARTY</h1><p>Question bank failed to load. Use the launcher (start.sh) so the folder is served over http, or rebuild with python3 tools/build_bank.py.</p><p class="fine">' + PDG.esc(String(err)) + "</p></div>";
  });
})();
