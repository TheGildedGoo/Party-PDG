(function (root) {
  var PDG = root.PDG = root.PDG || {};
  PDG.modes = PDG.modes || {};

  function enterVote(game) {
    game.fibOptions = PDG.buildFibOptions(game.current, game.writes, game.active());
    game.answers = {};
    game.view = {
      kind: "fibvote",
      subphase: "vote",
      seconds: 18,
      prompt: game.current.prompt,
      hideOnHost: false,
      hostLine: "Truth is in the stack. You cannot vote for your own lie."
    };
    game.openCollect();
  }

  PDG.modes.fibbage = {
    id: "fibbage",
    title: "Fake the Reg",
    autoAdvance: false,
    seconds: 35,
    buildDeck: function (game) {
      var pool = PDG.filterBank(game.bank.questions, game.settings.rank, "fibbage");
      if (game.settings.demo) {
        var demo = pool.filter(function (q) { return q.demo; });
        if (demo.length) pool = demo;
      }
      return PDG.shuffle(pool).slice(0, Math.max(1, Math.min(game.settings.rounds || 6, pool.length)));
    },
    present: function (_game, item) {
      return {
        kind: "fibwrite",
        subphase: "write",
        seconds: 35,
        prompt: item.prompt,
        hideOnHost: true,
        hostLine: "Write a lie that sounds like the handbook. Blank phones get a house lie."
      };
    },
    ingest: function (game, player, act) {
      if (game.subphase === "write") {
        if (player.audience || act.type !== "fibwrite") return;
        game.writes[player.id] = String(act.text || "").trim().slice(0, 90);
        game.answers[player.id] = { submitted: true };
        return;
      }
      if (game.subphase === "vote" && act.type === "fibvote") {
        if (player.audience) {
          game.audienceVotes = game.audienceVotes || {};
          game.audienceVotes[player.id] = act.optionId;
          return;
        }
        var own = (game.fibOptions || []).filter(function (o) { return o.authorId === player.id; })[0];
        if (own && own.id === act.optionId) return;
        game.answers[player.id] = { optionId: act.optionId };
      }
    },
    complete: function (game) {
      var actives = game.active();
      if (!actives.length) return false;
      if (game.subphase === "write") {
        var all = actives.every(function (p) { return game.answers[p.id]; });
        if (all) enterVote(game);
        return false;
      }
      return actives.every(function (p) { return game.answers[p.id] && game.answers[p.id].optionId; });
    },
    onTimeout: function (game) {
      if (game.subphase === "write") {
        enterVote(game);
        return "stay";
      }
      return "score";
    },
    score: function (game) {
      var votes = {};
      game.active().forEach(function (p) {
        if (game.answers[p.id] && game.answers[p.id].optionId) votes[p.id] = game.answers[p.id].optionId;
      });
      var deltas = PDG.fibbagePoints(game.players, game.fibOptions, votes);
      var truth = (game.fibOptions || []).filter(function (o) { return o.truth; })[0];
      var missed = game.active().some(function (p) { return votes[p.id] !== (truth && truth.id); });
      if (missed) game.noteChapterMiss(game.current);
      var foolCounts = {};
      (game.fibOptions || []).forEach(function (o) {
        if (o.truth || !o.authorId) return;
        foolCounts[o.id] = Object.keys(votes).filter(function (pid) { return votes[pid] === o.id; }).length;
      });
      return {
        correctId: truth && truth.id,
        correctText: game.current.answer,
        explain: game.current.explain,
        cite: game.current.cite,
        source: game.current.explain,
        deltas: deltas,
        fibOptions: game.fibOptions,
        foolCounts: foolCounts,
        bucket: "fibtruth"
      };
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
