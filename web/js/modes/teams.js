(function (root) {
  var PDG = root.PDG = root.PDG || {};
  PDG.modes = PDG.modes || {};

  function teamIds(game) {
    var ids = [];
    game.active().forEach(function (p) {
      if (p.team != null && ids.indexOf(p.team) === -1) ids.push(p.team);
    });
    ids.sort(function (a, b) { return a - b; });
    return ids;
  }

  function suggestionsFor(game, team) {
    var counts = {};
    game.active().forEach(function (p) {
      if (p.team !== team) return;
      var s = game.suggests && game.suggests[p.id];
      if (!s) return;
      counts[s] = (counts[s] || 0) + 1;
    });
    var best = null;
    var n = 0;
    Object.keys(counts).forEach(function (id) {
      if (counts[id] > n) { n = counts[id]; best = id; }
    });
    return best;
  }

  PDG.modes.teams = {
    id: "teams",
    title: "Flight vs Flight",
    autoAdvance: false,
    seconds: 25,
    buildDeck: function (game) {
      return PDG.modes.boards.buildDeck(game);
    },
    present: function (game, item) {
      game.turnTeam = teamIds(game)[0];
      game.steal = false;
      game.teamResult = {};
      game.suggests = {};
      return {
        kind: "teams",
        subphase: "huddle",
        seconds: 25,
        prompt: item.question,
        choices: PDG.choiceView(item),
        hideOnHost: true,
        hostLine: "Flight 1 huddles. Captain locks. A miss opens the steal."
      };
    },
    ingest: function (game, player, act) {
      if (player.audience || player.team !== game.turnTeam) return;
      if (act.type === "suggest") {
        game.suggests[player.id] = act.choice;
        return;
      }
      if ((act.type === "lock" || act.type === "choice") && player.captain && !game.answers["team-" + player.team]) {
        game.answers["team-" + player.team] = { choice: act.choice, at: Date.now(), team: player.team };
      }
    },
    complete: function (game) {
      return !!game.answers["team-" + game.turnTeam];
    },
    onTimeout: function (game) {
      if (!game.answers["team-" + game.turnTeam]) {
        var guess = suggestionsFor(game, game.turnTeam);
        game.answers["team-" + game.turnTeam] = { choice: guess, at: Date.now(), team: game.turnTeam, timeout: true };
      }
      return "score";
    },
    score: function (game) {
      var item = game.current;
      var correctId = "c" + item.answerIndex;
      var key = "team-" + game.turnTeam;
      var locked = game.answers[key] || {};
      var ok = locked.choice === correctId;
      var deltas = {};
      var members = game.active().filter(function (p) { return p.team === game.turnTeam; });
      if (ok) {
        var total = (game.roundSeconds || 25) * 1000;
        var left = Math.max(0, game.deadline - (locked.at || game.deadline));
        var pts = game.steal ? 750 : PDG.boardsPoints(true, left, total, true);
        members.forEach(function (p) { deltas[p.id] = pts; });
        game.teamResult[game.turnTeam] = "hit";
        if (!game._teamMissed) {
          /* clean round */
        }
      } else {
        members.forEach(function (p) { deltas[p.id] = 0; });
        game.teamResult[game.turnTeam] = "miss";
        game._teamMissed = true;
        var order = teamIds(game);
        var idx = order.indexOf(game.turnTeam);
        if (idx >= 0 && idx < order.length - 1) {
          game.turnTeam = order[idx + 1];
          game.steal = true;
          game.view = {
            kind: "teams",
            subphase: "steal",
            seconds: 8,
            prompt: item.question,
            choices: PDG.choiceView(item),
            hideOnHost: true,
            hostLine: "Miss. Next flight can steal. The paragraph stays covered."
          };
          game.openCollect();
          return { pending: true };
        }
      }
      if (game._teamMissed) game.noteChapterMiss(item);
      game._teamMissed = false;
      var choice = (PDG.choiceView(item).filter(function (c) { return c.id === correctId; })[0] || {}).text || "";
      return {
        correctId: correctId,
        correctText: choice,
        explain: item.explain,
        cite: item.cite,
        source: item.source || item.explain,
        deltas: deltas,
        bucket: ok ? "correct" : "wrong",
        teamResult: game.teamResult
      };
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
