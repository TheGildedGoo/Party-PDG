(function (root) {
  var PDG = root.PDG = root.PDG || {};
  PDG.modes = PDG.modes || {};

  function deck(game, limit) {
    var pool = PDG.filterBank(game.bank.questions, game.settings.rank, "mcq");
    if (game.settings.demo) {
      var demo = pool.filter(function (q) { return q.demo; });
      if (demo.length) pool = demo;
    }
    pool = PDG.shuffle(pool);
    var n = limit || game.settings.rounds || 8;
    return pool.slice(0, Math.max(1, n));
  }

  PDG.modes.boards = {
    id: "boards",
    title: "Boards & Brief",
    autoAdvance: false,
    seconds: 20,
    buildDeck: function (game) { return deck(game); },
    present: function (game, item) {
      return {
        kind: "mcq",
        subphase: "answer",
        seconds: 20,
        prompt: item.question,
        choices: PDG.choiceView(item),
        hideOnHost: true,
        hostLine: game.active().length > 1 ? "Answers are on the phones. Lock a stripe, then the choice." : "Wager a stripe, then lock it on this screen."
      };
    },
    ingest: function (game, player, act) {
      if (player.audience) {
        if (act.type === "choice") game.audienceVotes = game.audienceVotes || {}, game.audienceVotes[player.id] = act.choice;
        return;
      }
      if (act.type !== "choice" || game.answers[player.id]) return;
      if (game.steal && player.team != null) return;
      game.answers[player.id] = { choice: act.choice, at: Date.now(), wager: PDG.clampWager(act.wager) };
    },
    complete: function (game) {
      var actives = game.active();
      if (!actives.length) return false;
      return actives.every(function (p) { return game.answers[p.id]; });
    },
    score: function (game) {
      var item = game.current;
      var correctId = "c" + item.answerIndex;
      var fastest = null;
      var fastestAt = Infinity;
      var missed = false;
      game.active().forEach(function (p) {
        var a = game.answers[p.id];
        if (a && a.choice === correctId && a.at < fastestAt) {
          fastestAt = a.at;
          fastest = p.id;
        }
      });
      var total = (game.roundSeconds || 20) * 1000;
      var started = game.deadline - total;
      var party = game.active().length > 1;
      var deltas = {};
      var grades = {};
      var cite = item.cite || {};
      game.active().forEach(function (p) {
        var a = game.answers[p.id];
        var ok = !!(a && a.choice === correctId);
        var left = a ? Math.max(0, game.deadline - a.at) : 0;
        var speed = 0;
        if (ok && party) speed = PDG.boardsPoints(true, left, total, p.id === fastest) - 1000;
        var wagerDelta = PDG.wagerPoints(ok, PDG.BOARDS_BASE, a && a.wager);
        deltas[p.id] = wagerDelta + speed;
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
        bucket: missed ? "wrong" : "correct"
      };
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
