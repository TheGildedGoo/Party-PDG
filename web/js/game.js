/* Authoritative party state. The Python server only relays snapshots. */
(function (root) {
  var PDG = root.PDG = root.PDG || {};

  function Game(bank) {
    this.bank = bank || { questions: [], sjt: [], lines: { dares: [] } };
    this.players = [];
    this.phase = "attract";
    this.settings = { rank: "mixed", rounds: 8, roast: "mild", teams: false, demo: false, flights: 2 };
    this.room = PDG.roomCode();
    this.joinUrl = "";
    this.modeId = null;
    this.mode = null;
    this.deck = [];
    this.index = -1;
    this.current = null;
    this.view = null;
    this.answers = {};
    this.writes = {};
    this.fibOptions = null;
    this.subphase = "";
    this.reveal = null;
    this.hostLine = "Chief Hot Wash is on the mike. Phones up.";
    this.misses = {};
    this.roundSeconds = 20;
    this.deadline = 0;
    this.manual = false;
    this._timer = null;
    this._pending = null;
    this.listeners = [];
    this.interstitial = null;
    this.audienceVotes = {};
    this.suggests = {};
    this.turnTeam = 0;
    this.steal = false;
    this._teamMissed = false;
  }

  Game.prototype.on = function (fn) {
    this.listeners.push(fn);
    return this;
  };

  Game.prototype.emit = function () {
    var self = this;
    this.listeners.forEach(function (fn) {
      try { fn(self); } catch (err) { console.error(err); }
    });
  };

  Game.prototype._clearTimer = function () {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    this._pending = null;
  };

  Game.prototype._arm = function (ms, fn) {
    this._clearTimer();
    if (this.manual) {
      this._pending = fn;
      return;
    }
    this._timer = setTimeout(fn, ms);
  };

  Game.prototype.flush = function () {
    var fn = this._pending;
    this._pending = null;
    if (fn) fn();
  };

  Game.prototype.configure = function (patch) {
    var next = patch || {};
    if (next.rounds) next.rounds = Math.max(1, Math.min(20, Number(next.rounds) || 8));
    Object.assign(this.settings, next);
    this.emit();
  };

  Game.prototype.active = function () {
    return this.players.filter(function (p) { return p.connected !== false && !p.audience; });
  };

  Game.prototype.configureRoom = function (code) {
    if (code) this.room = String(code).toUpperCase().slice(0, 4);
  };

  Game.prototype.addPlayer = function (raw) {
    var existing = null;
    for (var i = 0; i < this.players.length; i++) {
      if (this.players[i].id === raw.id) existing = this.players[i];
    }
    if (existing) {
      existing.connected = true;
      if (raw.name) existing.name = String(raw.name).slice(0, 18);
      if (raw.avatar) existing.avatar = raw.avatar;
      this.emit();
      return existing;
    }
    var late = this.phase !== "lobby" && this.phase !== "attract";
    var audience = !!raw.audience || late || this.active().length >= 8;
    var player = {
      id: raw.id,
      name: String(raw.name || "Airman").slice(0, 18),
      avatar: raw.avatar || "open-book",
      score: 0,
      combo: 0,
      team: null,
      captain: false,
      audience: audience,
      connected: true
    };
    this.players.push(player);
    if (this.phase === "lobby" || this.phase === "attract") this.hostLine = PDG.pickLine(this.bank.lines, "join", this.settings.roast) || (player.name + " checked in.");
    this.emit();
    return player;
  };

  Game.prototype.dropPlayer = function (id) {
    this.players.forEach(function (p) {
      if (p.id === id) p.connected = false;
    });
    this.ensureCaptains();
    this.emit();
  };

  Game.prototype.ensureCaptains = function () {
    var groups = {};
    this.active().forEach(function (p) {
      if (p.team == null) return;
      var key = String(p.team);
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      var has = g.some(function (p) { return p.captain; });
      if (!has && g[0]) {
        g.forEach(function (p) { p.captain = false; });
        g[0].captain = true;
      }
    });
  };

  Game.prototype.assignTeams = function () {
    var act = this.active();
    var flights = Math.max(2, Math.min(4, Number(this.settings.flights) || 2));
    flights = Math.min(flights, Math.max(1, act.length));
    this.settings.flights = flights;
    act.forEach(function (p, i) {
      p.team = i % flights;
      p.captain = false;
    });
    this.ensureCaptains();
  };

  Game.prototype.toLobby = function () {
    this._clearTimer();
    this.phase = "lobby";
    this.modeId = null;
    this.mode = null;
    this.deck = [];
    this.index = -1;
    this.reveal = null;
    this.interstitial = null;
    this.current = null;
    this.view = null;
    this.emit();
  };

  Game.prototype.noteChapterMiss = function (item) {
    var ch = PDG.chapterOf(item);
    if (!ch) return;
    this.misses[ch] = (this.misses[ch] || 0) + 1;
  };

  Game.prototype.start = function (modeId, opts) {
    opts = opts || {};
    var mode = PDG.modes[modeId];
    if (!mode) return { ok: false, reason: "That mode is not loaded." };
    if (this.active().length < 1) return { ok: false, reason: "Need at least one player. Audience phones can watch, but somebody has to answer." };
    if (modeId === "teams" && this.active().length < 2) return { ok: false, reason: "Flight vs Flight needs two players." };
    if (!opts.keepScore) {
      this.players.forEach(function (p) { p.score = 0; p.combo = 0; });
      this.misses = {};
    }
    this.modeId = modeId;
    this.mode = mode;
    if (modeId === "teams") this.assignTeams();
    else this.active().forEach(function (p) { p.team = null; p.captain = false; });
    this.deck = mode.buildDeck(this) || [];
    if (!this.deck.length) return { ok: false, reason: "No items match that rank track." };
    this.index = -1;
    this.reveal = null;
    this._teamMissed = false;
    this.nextRound();
    return { ok: true, count: this.deck.length };
  };

  Game.prototype.nextRound = function () {
    this.index += 1;
    if (this.index >= this.deck.length) {
      this.finish();
      return;
    }
    if (this.modeId === "lightning" && this.index > 0 && this.index % 5 === 0) {
      this.phase = "interstitial";
      this.interstitial = { title: "Break time", body: "Five down. Breathe, then get back on the clock.", dare: false, breakTime: true };
      this.hostLine = PDG.pickLine(this.bank.lines, "lightning", this.settings.roast) || "Break time.";
      this.emit();
      var self = this;
      this._arm(this.manual ? 0 : 2800, function () {
        self.interstitial = null;
        self.openPrompt();
      });
      return;
    }
    this.openPrompt();
  };

  Game.prototype.openPrompt = function () {
    var self = this;
    this.current = this.deck[this.index];
    this.answers = {};
    this.writes = {};
    this.fibOptions = null;
    this.audienceVotes = {};
    this.suggests = {};
    this.reveal = null;
    this.steal = false;
    this.subphase = "read";
    this.phase = "prompt";
    this.view = this.mode.present(this, this.current);
    if (this.view && this.view.hostLine) this.hostLine = this.view.hostLine;
    this.emit();
    this._arm(this.manual ? 0 : 600, function () { self.openCollect(); });
  };

  Game.prototype.openCollect = function () {
    this.phase = "collect";
    this.subphase = (this.view && this.view.subphase) || "answer";
    this.roundSeconds = (this.view && this.view.seconds) || 20;
    this.deadline = Date.now() + this.roundSeconds * 1000;
    if (this.view && this.view.hostLine && this.subphase !== "answer") this.hostLine = this.view.hostLine;
    this.emit();
    var self = this;
    this._arm(this.manual ? 0 : this.roundSeconds * 1000, function () { self.onTimeout(); });
  };

  Game.prototype.onTimeout = function () {
    if (this.phase !== "collect") return;
    if (this.mode && this.mode.onTimeout) {
      var action = this.mode.onTimeout(this);
      if (action === "stay") return;
    }
    this.scoreRound();
  };

  Game.prototype.receive = function (pid, act) {
    var player = null;
    for (var i = 0; i < this.players.length; i++) {
      if (this.players[i].id === pid) player = this.players[i];
    }
    if (!player || player.connected === false) return;
    if (this.phase !== "collect") return;
    if (this.mode && this.mode.ingest) this.mode.ingest(this, player, act || {});
    if (this.mode && this.mode.complete && this.mode.complete(this)) {
      this.scoreRound();
      return;
    }
    this.emit();
  };

  Game.prototype.scoreRound = function () {
    if (!this.mode || !this.current) return;
    if (this.phase === "reveal" || this.phase === "results") return;
    this._clearTimer();
    var reveal = this.mode.score(this) || { deltas: {} };
    if (reveal.pending) return;
    if (reveal.foolCounts) {
      var best = 0;
      Object.keys(reveal.foolCounts).forEach(function (k) {
        if (reveal.foolCounts[k] > best) best = reveal.foolCounts[k];
      });
      if (best > 0) reveal.bucket = "fibfool";
    }
    var self = this;
    Object.keys(reveal.deltas || {}).forEach(function (id) {
      self.players.forEach(function (p) {
        if (p.id === id) p.score += reveal.deltas[id] || 0;
      });
    });
    reveal.hostLine = PDG.pickLine(this.bank.lines, reveal.bucket || "correct", this.settings.roast) || this.hostLine;
    this.hostLine = reveal.hostLine;
    this.reveal = reveal;
    this.phase = "reveal";
    this.emit();
    if (this.mode.autoAdvance) {
      this._arm(this.manual ? 0 : 1700, function () {
        if (self.phase === "reveal") self.advance();
      });
    }
  };

  Game.prototype.maybeDare = function () {
    if (!this.mode || this.mode.autoAdvance) return false;
    if (this.index >= this.deck.length - 1) return false;
    var dares = (this.bank.lines && this.bank.lines.dares) || [];
    if (!dares.length || Math.random() > 0.2) return false;
    this.phase = "interstitial";
    this.interstitial = {
      title: "Dare card",
      body: dares[Math.floor(Math.random() * dares.length)],
      dare: true,
      breakTime: false
    };
    this.hostLine = "Optional. Skip it if the room is done being brave.";
    this.emit();
    return true;
  };

  Game.prototype.advance = function () {
    if (this.phase === "interstitial" && this.interstitial && this.interstitial.breakTime) {
      this._clearTimer();
      this.interstitial = null;
      this.openPrompt();
      return;
    }
    if (this.phase === "interstitial" && this.interstitial && this.interstitial.dare) {
      this.interstitial = null;
      this.nextRound();
      return;
    }
    if (this.phase === "reveal") {
      this._clearTimer();
      if (this.maybeDare()) return;
      this.nextRound();
    }
  };

  Game.prototype.finish = function () {
    this._clearTimer();
    this.phase = "results";
    this.interstitial = null;
    var ranked = this.active().slice().sort(function (a, b) { return b.score - a.score; });
    if (ranked.length) {
      this.hostLine = PDG.pickLine(this.bank.lines, "win", this.settings.roast) || (ranked[0].name + " takes the board.");
      var last = ranked[ranked.length - 1];
      if (ranked.length > 1 && last.score < ranked[0].score) {
        var nicks = (this.bank.lines && this.bank.lines.nicks) || ["Tabbed for Later"];
        last.nickname = nicks[Math.floor(Math.random() * nicks.length)];
      }
    }
    this.emit();
  };

  Game.prototype.playerView = function (pid) {
    var view = this.view || {};
    var reveal = null;
    if (this.reveal) {
      reveal = {
        correctId: this.reveal.correctId || null,
        correctText: this.reveal.correctText || "",
        leastText: this.reveal.leastText || "",
        explain: this.reveal.explain || "",
        citeText: PDG.citeLabel(this.reveal.cite),
        source: this.reveal.source || "",
        competency: this.reveal.competency || "",
        deltas: this.reveal.deltas || {},
        options: (this.reveal.fibOptions || []).map(function (o) {
          return { id: o.id, letter: o.letter, text: o.text, truth: !!o.truth, authorId: o.authorId || null, example: !!o.example };
        })
      };
    }
    var choices = null;
    if (this.phase === "collect" || this.phase === "reveal" || this.phase === "prompt") {
      if (view.kind === "fibvote") {
        choices = (this.fibOptions || []).map(function (o) {
          return { id: o.id, letter: o.letter, shape: o.shape, text: o.text };
        });
      } else if (view.choices && (this.phase !== "prompt")) {
        choices = view.choices;
      } else if (view.actions && this.phase !== "prompt") {
        choices = view.actions;
      }
    }
    return {
      phase: this.phase,
      mode: this.modeId,
      modeTitle: this.mode ? this.mode.title : "",
      subphase: this.subphase,
      room: this.room,
      round: this.index + 1,
      roundTotal: this.deck.length,
      prompt: view.prompt || "",
      kind: view.kind || "",
      choices: choices,
      players: this.players.filter(function (p) { return p.connected !== false; }).map(function (p) {
        return {
          id: p.id, name: p.name, avatar: p.avatar, score: p.score, combo: p.combo || 0,
          team: p.team, captain: !!p.captain, audience: !!p.audience, nickname: p.nickname || ""
        };
      }),
      timerEnds: this.deadline,
      seconds: this.roundSeconds,
      reveal: reveal,
      hostLine: this.hostLine,
      interstitial: this.interstitial,
      turnTeam: this.turnTeam,
      steal: !!this.steal,
      teamLocked: !!this.answers["team-" + this.turnTeam],
      answered: Object.keys(this.answers),
      settings: { roast: this.settings.roast, rank: this.settings.rank },
      youAnswered: !!(pid && this.answers[pid]),
      joinUrl: this.joinUrl
    };
  };

  Game.prototype.privateFor = function (pid) {
    if (this.subphase === "vote" && this.fibOptions) {
      var ownFib = null;
      this.fibOptions.forEach(function (o) { if (o.authorId === pid) ownFib = o.id; });
      return { ownOptionId: ownFib };
    }
    if (this.modeId === "decoy" && this.subphase === "vote" && this.decoySponsors) {
      return { ownOptionId: this.decoySponsors[pid] || null };
    }
    return null;
  };

  PDG.Game = Game;
  if (typeof module !== "undefined" && module.exports) module.exports = PDG;
})(typeof globalThis !== "undefined" ? globalThis : this);
