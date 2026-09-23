(function (root) {
  var PDG = root.PDG = root.PDG || {};
  PDG.modes = PDG.modes || {};

  PDG.modes.lightning = {
    id: "lightning",
    title: "Lightning",
    autoAdvance: true,
    seconds: 8,
    buildDeck: function (game) {
      var pool = PDG.filterBank(game.bank.questions, game.settings.rank, "mcq");
      if (game.settings.demo) {
        var demo = pool.filter(function (q) { return q.demo; });
        if (demo.length) pool = demo;
      }
      return PDG.shuffle(pool).slice(0, Math.min(20, pool.length));
    },
    present: function (_game, item) {
      return {
        kind: "mcq",
        subphase: "answer",
        seconds: 8,
        prompt: item.question,
        choices: PDG.choiceView(item),
        hideOnHost: true,
        hostLine: "Eight seconds. Combo dies on a miss. Misses land on the weak-chapter heat."
      };
    },
    ingest: function (game, player, act) {
      if (player.audience || act.type !== "choice" || game.answers[player.id]) return;
      game.answers[player.id] = { choice: act.choice, at: Date.now(), wager: PDG.clampWager(act.wager) };
    },
    complete: function (game) {
      var actives = game.active();
      return actives.length > 0 && actives.every(function (p) { return game.answers[p.id]; });
    },
    score: function (game) {
      var item = game.current;
      var correctId = "c" + item.answerIndex;
      var deltas = {};
      var grades = {};
      var missed = false;
      var total = (game.roundSeconds || 8) * 1000;
      var started = game.deadline - total;
      var cite = item.cite || {};
      game.active().forEach(function (p) {
        var a = game.answers[p.id];
        var ok = !!(a && a.choice === correctId);
        var step = (p.combo || 0) + 1;
        var base = PDG.LIGHTNING_STEP * step;
        var wagerDelta = PDG.wagerPoints(ok, base, a && a.wager);
        var res = PDG.lightningResult(ok, p.combo || 0);
        p.combo = res.combo;
        deltas[p.id] = wagerDelta;
        grades[p.id] = {
          correct: ok,
          latencyMs: a && a.at ? Math.max(0, a.at - started) : total,
          wager: PDG.clampWager(a && a.wager),
          wagerDelta: wagerDelta,
          itemId: item.id,
          chapter: PDG.chapterOf(item),
          section: cite.section || ""
        };
        if (!ok) missed = true;
      });
      if (missed) game.noteChapterMiss(item);
      var choice = (PDG.choiceView(item).filter(function (c) { return c.id === correctId; })[0] || {}).text || "";
      return {
        correctId: correctId,
        correctText: choice,
        explain: item.explain,
        cite: item.cite,
        source: item.source || item.explain,
        deltas: deltas,
        grades: grades,
        bucket: "lightning"
      };
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
