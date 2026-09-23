/* Merge device cache with the account snapshot. localStorage stays a cache. */
(function (root) {
  function emptySr() {
    return { cards: {}, seen: {}, chapters: {}, mocks: [], days: [] };
  }

  function mergeSr(a, b) {
    a = a || emptySr();
    b = b || emptySr();
    var cards = {};
    Object.keys(a.cards || {}).forEach(function (id) { cards[id] = a.cards[id]; });
    Object.keys(b.cards || {}).forEach(function (id) {
      var left = cards[id];
      var right = b.cards[id];
      if (!left) { cards[id] = right; return; }
      var leftReps = left.reps || 0;
      var rightReps = right.reps || 0;
      if (rightReps > leftReps || (rightReps === leftReps && (right.due || 0) > (left.due || 0))) cards[id] = right;
    });
    var seen = {};
    function takeSeen(bag) {
      Object.keys(bag || {}).forEach(function (id) {
        var prev = seen[id] || { correct: 0, wrong: 0, last: 0 };
        var next = bag[id] || {};
        seen[id] = {
          correct: Math.max(prev.correct || 0, next.correct || 0),
          wrong: Math.max(prev.wrong || 0, next.wrong || 0),
          last: Math.max(prev.last || 0, next.last || 0)
        };
      });
    }
    takeSeen(a.seen);
    takeSeen(b.seen);
    var chapters = {};
    function takeChapters(bag) {
      Object.keys(bag || {}).forEach(function (id) {
        var prev = chapters[id] || { correct: 0, wrong: 0 };
        var next = bag[id] || {};
        chapters[id] = {
          correct: Math.max(prev.correct || 0, next.correct || 0),
          wrong: Math.max(prev.wrong || 0, next.wrong || 0)
        };
      });
    }
    takeChapters(a.chapters);
    takeChapters(b.chapters);
    var days = {};
    (a.days || []).concat(b.days || []).forEach(function (day) { if (day) days[day] = true; });
    var mocks = [];
    var seenMock = {};
    (a.mocks || []).concat(b.mocks || []).forEach(function (mock) {
      if (!mock || seenMock[mock.at]) return;
      seenMock[mock.at] = true;
      mocks.push(mock);
    });
    return { cards: cards, seen: seen, chapters: chapters, mocks: mocks, days: Object.keys(days).sort() };
  }

  function mergeAch(a, b) {
    var unlocked = {};
    function take(bag) {
      var map = (bag && bag.unlocked) || {};
      Object.keys(map).forEach(function (id) {
        if (!unlocked[id] || map[id] < unlocked[id]) unlocked[id] = map[id];
      });
    }
    take(a);
    take(b);
    return { unlocked: unlocked };
  }

  function ended(snapshot) {
    var session = snapshot && snapshot.lastSession;
    return (session && session.endedAt) || "";
  }

  function mergeSnapshots(server, client) {
    server = server || {};
    client = client || {};
    var newer = ended(client) >= ended(server) ? client : server;
    var older = newer === client ? server : client;
    var focus = newer.focus && newer.focus.weakChapters ? newer.focus : (older.focus || {});
    return {
      sr: mergeSr(server.sr, client.sr),
      achievements: mergeAch(server.achievements, client.achievements),
      focus: focus || {},
      lastSession: newer.lastSession || older.lastSession || null
    };
  }

  var api = { emptySr: emptySr, mergeSr: mergeSr, mergeSnapshots: mergeSnapshots };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  var PDG = root.PDG = root.PDG || {};
  PDG.mergeSnapshots = mergeSnapshots;
})(typeof globalThis !== "undefined" ? globalThis : this);
