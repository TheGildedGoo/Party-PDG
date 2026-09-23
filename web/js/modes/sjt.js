(function (root) {
  var PDG = root.PDG = root.PDG || {};
  PDG.modes = PDG.modes || {};

  PDG.modes.sjt = {
    id: "sjt",
    title: "Situational Judgment",
    autoAdvance: false,
    seconds: 45,
    buildDeck: function (game) {
      var pool = PDG.filterBank(game.bank.sjt, game.settings.rank, "sjt");
      if (!pool.length) pool = (game.bank.sjt || []).slice();
      if (game.settings.demo) {
        var demo = pool.filter(function (q) { return q.demo; });
        if (demo.length) pool = demo;
      }
      return PDG.shuffle(pool).slice(0, Math.max(1, Math.min(game.settings.rounds || 6, pool.length)));
    },
    present: function (_game, item) {
      var actions = (item.actions || []).map(function (text, i) {
        return { id: "a" + i, text: text, index: i };
      });
      return {
        kind: "sjt",
        subphase: "rank",
        seconds: 45,
        prompt: item.scenario,
        actions: actions,
        hideOnHost: true,
        hostLine: "Most effective and least effective. Competency, not vibes."
      };
    },
    ingest: function (game, player, act) {
      if (player.audience || act.type !== "sjt") return;
      if (act.most == null || act.least == null || act.most === act.least) return;
      game.answers[player.id] = { most: act.most, least: act.least, at: Date.now() };
    },
    complete: function (game) {
      var actives = game.active();
      return actives.length > 0 && actives.every(function (p) { return game.answers[p.id]; });
    },
    score: function (game) {
      var item = game.current;
      var deltas = {};
      var grades = {};
      var missed = false;
      var total = (game.roundSeconds || 45) * 1000;
      var started = game.deadline - total;
      var cite = item.cite || {};
      game.active().forEach(function (p) {
        var a = game.answers[p.id] || {};
        var pts = PDG.sjtPoints(item.mostIndex, item.leastIndex, a.most, a.least);
        deltas[p.id] = pts;
        grades[p.id] = {
          correct: pts === 1000,
          latencyMs: a.at ? Math.max(0, a.at - started) : total,
          wager: 0,
          wagerDelta: 0,
          itemId: item.id,
          chapter: PDG.chapterOf(item),
          section: cite.section || ""
        };
        if (pts < 1000) missed = true;
      });
      if (missed) game.noteChapterMiss(item);
      var actions = item.actions || [];
      return {
        correctText: actions[item.mostIndex],
        leastText: actions[item.leastIndex],
        explain: item.explain,
        cite: item.cite,
        source: item.explain,
        competency: item.competency,
        deltas: deltas,
        grades: grades,
        bucket: "sjt"
      };
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
