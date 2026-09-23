(function (root) {
  var PDG = root.PDG = root.PDG || {};
  PDG.modes = PDG.modes || {};
  var boards = function () { return PDG.modes.boards; };

  PDG.modes.hotwash = {
    id: "hotwash",
    title: "Hot Wash",
    autoAdvance: false,
    seconds: 20,
    buildDeck: function (game) {
      var ranked = Object.keys(game.misses || {}).map(function (k) {
        return { ch: Number(k), n: game.misses[k] };
      }).sort(function (a, b) { return b.n - a.n; });
      var chapters = ranked.map(function (r) { return r.ch; }).slice(0, 4);
      var pool = PDG.filterBank(game.bank.questions, game.settings.rank, "mcq");
      var focused = pool.filter(function (q) {
        var ch = PDG.chapterOf(q);
        return chapters.indexOf(ch) !== -1;
      });
      if (focused.length < 4) {
        focused = pool.filter(function (q) { return (q.difficulty || 1) >= 3; });
      }
      if (!focused.length) focused = pool;
      return PDG.shuffle(focused).slice(0, Math.max(4, Math.min(8, game.settings.rounds || 6)));
    },
    present: function (game, item) {
      var view = boards().present(game, item);
      var ch = PDG.chapterOf(item);
      view.hostLine = "Hot wash. We are not leaving this room until chapter " + ch + " stops beating you.";
      return view;
    },
    ingest: function (game, player, act) { return boards().ingest(game, player, act); },
    complete: function (game) { return boards().complete(game); },
    score: function (game) {
      var reveal = boards().score(game);
      reveal.bucket = "hotwash";
      return reveal;
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
