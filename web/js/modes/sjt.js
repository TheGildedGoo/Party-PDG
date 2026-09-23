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
      game.answers[player.id] = { most: act.most, least: act.least };
    },
    complete: function (game) {
      var actives = game.active();
      return actives.length > 0 && actives.every(function (p) { return game.answers[p.id]; });
    },
    score: function (game) {
      var item = game.current;
      var deltas = {};
      var missed = false;
      game.active().forEach(function (p) {
        var a = game.answers[p.id] || {};
        var pts = PDG.sjtPoints(item.mostIndex, item.leastIndex, a.most, a.least);
        deltas[p.id] = pts;
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
        bucket: "sjt"
      };
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
