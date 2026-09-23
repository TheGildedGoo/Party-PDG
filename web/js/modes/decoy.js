/* Decoy Brief. MCQ only: one handbook line and exactly three decoys. */
(function (root) {
  var PDG = root.PDG = root.PDG || {};
  PDG.modes = PDG.modes || {};

  function itemStem(item) {
    return item.stem || item.prompt || "";
  }

  function citeOf(item) {
    return item.cite || {};
  }

  function enterVote(game) {
    var sponsors = {};
    var wagers = {};
    game.active().forEach(function (p) {
      var a = game.answers[p.id];
      if (!a) return;
      if (a.optionId) sponsors[p.id] = a.optionId;
      wagers[p.id] = PDG.clampWager(a.wager);
    });
    game.decoySponsors = sponsors;
    game.decoyWagers = wagers;
    game.answers = {};
    game.view = {
      kind: "decoy-vote",
      subphase: "vote",
      seconds: 18,
      prompt: itemStem(game.current),
      choices: game.decoyOptions || [],
      hideOnHost: false,
      hostLine: "Vote the handbook line. You cannot vote for the decoy you sponsored."
    };
    game.openCollect();
  }

  PDG.modes.decoy = {
    id: "decoy",
    title: "Decoy Brief",
    autoAdvance: false,
    seconds: 20,
    buildDeck: function (game) {
      var pool = PDG.decoyItems(game.bank).filter(function (item) {
        return PDG.matchesTrack(item, game.settings.rank);
      });
      pool = pool.filter(function (item) { return PDG.buildDecoyOptions(item).length === 4; });
      return PDG.shuffle(pool).slice(0, Math.max(1, Math.min(game.settings.rounds || 6, pool.length)));
    },
    present: function (game, item) {
      game.decoyOptions = PDG.buildDecoyOptions(item);
      game.decoySponsors = {};
      game.decoyWagers = {};
      var solo = game.active().length < 2;
      if (solo) {
        return {
          kind: "decoy-pick",
          subphase: "answer",
          seconds: 20,
          prompt: itemStem(item),
          choices: game.decoyOptions,
          hideOnHost: false,
          hostLine: "Four lines. One is the handbook. Wager, then pick."
        };
      }
      return {
        kind: "decoy-sponsor",
        subphase: "sponsor",
        seconds: 20,
        prompt: itemStem(item),
        choices: (game.decoyOptions || []).filter(function (o) { return !o.truth; }),
        hideOnHost: true,
        hostLine: "Sponsor one decoy. The vote uses the same four lines."
      };
    },
    ingest: function (game, player, act) {
      if (player.audience) return;
      var sub = game.subphase;
      if (sub === "sponsor") {
        if (act.type !== "sponsor" && act.type !== "choice") return;
        if (game.answers[player.id]) return;
        var id = act.optionId || act.choice;
        var lie = (game.decoyOptions || []).filter(function (o) { return o.id === id && !o.truth; })[0];
        if (!lie) return;
        game.answers[player.id] = { optionId: id, sponsored: true, wager: PDG.clampWager(act.wager), at: Date.now() };
        return;
      }
      if (sub === "vote" || sub === "answer") {
        if (act.type !== "decoyvote" && act.type !== "choice") return;
        if (game.answers[player.id] && game.answers[player.id].optionId) return;
        var pick = act.optionId || act.choice;
        var known = (game.decoyOptions || []).some(function (o) { return o.id === pick; });
        if (!known) return;
        var own = game.decoySponsors && game.decoySponsors[player.id];
        if (own && own === pick) return;
        var wager = act.wager != null ? act.wager : (game.decoyWagers && game.decoyWagers[player.id]);
        game.answers[player.id] = { optionId: pick, choice: pick, at: Date.now(), wager: PDG.clampWager(wager) };
      }
    },
    complete: function (game) {
      var actives = game.active();
      if (!actives.length) return false;
      if (game.subphase === "sponsor") {
        var ready = actives.every(function (p) { return game.answers[p.id]; });
        if (ready) enterVote(game);
        return false;
      }
      return actives.every(function (p) { return game.answers[p.id] && game.answers[p.id].optionId; });
    },
    onTimeout: function (game) {
      if (game.subphase === "sponsor") {
        enterVote(game);
        return "stay";
      }
      return "score";
    },
    score: function (game) {
      var item = game.current;
      var options = game.decoyOptions || [];
      var truth = options.filter(function (o) { return o.truth; })[0];
      var truthId = truth && truth.id;
      var votes = {};
      var deltas = {};
      var grades = {};
      var missed = false;
      var total = (game.roundSeconds || 20) * 1000;
      var started = game.deadline - total;
      var cite = citeOf(item);
      game.active().forEach(function (p) {
        var a = game.answers[p.id] || {};
        var pick = a.optionId || a.choice;
        votes[p.id] = pick;
        var ok = !!(truthId && pick === truthId);
        var wagerDelta = PDG.wagerPoints(ok, PDG.DECOY_BASE, a.wager);
        deltas[p.id] = wagerDelta;
        grades[p.id] = {
          correct: ok,
          latencyMs: a.at ? Math.max(0, a.at - started) : total,
          wager: PDG.clampWager(a.wager),
          wagerDelta: wagerDelta,
          itemId: item.id,
          chapter: PDG.chapterOf(item),
          section: cite.section || ""
        };
        if (!ok) missed = true;
      });
      var foolCounts = {};
      var sponsors = game.decoySponsors || {};
      Object.keys(sponsors).forEach(function (pid) {
        var oid = sponsors[pid];
        if (!oid || oid === truthId) return;
        Object.keys(votes).forEach(function (voter) {
          if (voter === pid) return;
          if (votes[voter] !== oid) return;
          deltas[pid] = (deltas[pid] || 0) + PDG.DECOY_FOOL;
          foolCounts[oid] = (foolCounts[oid] || 0) + 1;
        });
      });
      if (missed) game.noteChapterMiss(item);
      return {
        correctId: truthId,
        correctText: item.truth,
        explain: item.explain,
        cite: item.cite,
        source: item.source || "",
        deltas: deltas,
        grades: grades,
        decoyOptions: options,
        foolCounts: foolCounts,
        bucket: missed ? "wrong" : "correct"
      };
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
