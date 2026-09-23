const L = require("../web/js/logic.js");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(L.boardsPoints(false, 1000, 20000, false) === 0, "wrong boards is zero");
assert(L.boardsPoints(true, 20000, 20000, false) === 1500, "full speed bonus");
assert(L.boardsPoints(true, 0, 20000, true) === 1200, "fastest with no time left still gets first-lock");
assert(L.lightningResult(true, 2).points === 300, "combo multiplier");
assert(L.lightningResult(false, 4).combo === 0, "miss kills combo");

const players = [
  { id: "a", audience: false },
  { id: "b", audience: false },
  { id: "c", audience: true }
];
const options = [
  { id: "truth", truth: true, authorId: null },
  { id: "lie-a", truth: false, authorId: "a" }
];
const votes = { a: "truth", b: "lie-a", c: "lie-a" };
const pts = L.fibbagePoints(players, options, votes);
assert(pts.a === 1500, "truth pays 1000 and one real fool pays the author 500");
assert(pts.b === 0, "the voter does not get the fool points");
assert(pts.c === 0, "audience vote does not pay");

assert(L.sjtPoints(0, 3, 0, 3) === 1000, "both keys");
assert(L.sjtPoints(0, 3, 3, 0) === 0, "swap is zero");
assert(L.sjtPoints(0, 3, 0, 1) === 500, "most only");
assert(L.pfeScore(80, 80) === 100, "perfect pfe");
assert(L.pfeScore(40, 80) === 50, "half pfe");

const card = L.sm2({ ef: 2.5, interval: 0, reps: 0 }, 5);
assert(card.reps === 1 && card.interval === 1, "first sm2 success");
const fail = L.sm2(card, 1);
assert(fail.reps === 0 && fail.interval === 1, "lapse resets reps");

const built = L.buildFibOptions(
  { answer: "Integrity First", lies: ["Honor First", "Duty First", "Service First"] },
  { a: "", b: "Loyalty First" },
  [{ id: "a" }, { id: "b" }],
  function () { return 0.5; }
);
assert(built.some((o) => o.truth), "truth present");
assert(built.some((o) => o.text === "Loyalty First"), "player lie kept");
assert(built.filter((o) => o.example).length >= 1, "blank filled with example lie");

assert(L.matchesTrack({ ranks: ["E6"] }, "E5") === false, "e6 hidden from e5");
assert(L.matchesTrack({ ranks: ["E5", "E6"] }, "E5") === true, "shared item on e5");
assert(L.WAPS.e5.length === 15, "fifteen e5 chapters");
assert(L.WAPS.e6Only.join() === "13,16", "e6 only chapters");

assert(L.wagerPoints(true, 100, 0) === 100, "wager 0 still pays base");
assert(L.wagerPoints(true, 100, 1) === 100, "wager 1 pays base");
assert(L.wagerPoints(true, 100, 2) === 200, "wager 2 doubles boards base");
assert(L.wagerPoints(false, 100, 3) === -300, "wrong costs base times wager");
assert(L.wagerPoints(true, 50, 3) === 150, "lightning-style base times wager");
assert(L.clampWager(9) === 3 && L.clampWager(null) === 0, "wager clamps");

var decoyOpts = L.buildDecoyOptions(
  { truth: "Handbook line", decoys: ["Lie A", "Lie B", "Lie C"] },
  function () { return 0; }
);
assert(decoyOpts.length === 4, "decoy stack is four");
assert(decoyOpts.filter((o) => o.truth).length === 1, "one truth");
assert(decoyOpts.filter((o) => !o.truth).length === 3, "exactly three decoys");
assert(
  decoyOpts.map((o) => o.text).slice().sort().join("|") === ["Handbook line", "Lie A", "Lie B", "Lie C"].sort().join("|"),
  "decoy texts preserved"
);
assert(L.buildDecoyOptions({ truth: "x", decoys: ["only"] }).length === 0, "reject a short decoy list");

var attempts = [];
for (var i = 0; i < 5; i++) {
  attempts.push({ playerId: "p", id: "m" + i, chapter: 9, section: "9.4", correct: i < 2, latencyMs: 1000, wagerDelta: i < 2 ? 100 : -100, wager: 1 });
}
for (var j = 0; j < 5; j++) {
  attempts.push({ playerId: "p", id: "n" + j, chapter: 1, section: "1C", correct: true, latencyMs: 500, wagerDelta: 100, wager: 0 });
}
var stats = L.buildSessionStats({
  sessionId: "s",
  endedAt: "2026-09-23T00:00:00.000Z",
  modeId: "boards",
  rankTrack: "E5",
  solo: true,
  attempts: attempts,
  achievementsUnlocked: ["first-light"]
});
assert(stats.schemaVersion === 1, "schema version 1");
assert(stats.totals.answered === 10 && stats.totals.correct === 7, "totals");
assert(stats.totals.wagerNet === 400, "wager net");
assert(stats.focusRollup.recommendedNext[0] === 9, "worst chapter first");
assert(stats.focusRollup.recommendedNext.length === 2, "two chapters cleared the n>=5 bar");
assert(stats.byChapter[0].chapter === 1 && stats.byChapter[0].missIds.length === 0, "chapter group");
assert(stats.byChapter[1].missIds.length === 3, "miss ids");
assert(stats.achievementsUnlocked[0] === "first-light", "achievements pass through");

var fresh = L.evaluateAchievements({
  modeId: "boards",
  attempts: [1, 2, 3, 4, 5].map(function () { return { playerId: "p", correct: true, wager: 3, chapter: 1, section: "1C" }; }),
  already: [],
  priorAnswered: 0,
  cardsStudied: 5,
  dueCount: 0,
  studyDays: 7,
  priorWeakChapters: [1]
});
["first-light", "queue-zero", "chapter-cleared", "seven-day-desk", "boards-ace", "high-stakes", "weakness-closed"].forEach(function (id) {
  assert(fresh.indexOf(id) !== -1, "expected " + id);
});
var live = L.evaluateAchievements({
  live: true,
  liveOnly: ["lightning-streak-10"],
  modeId: "lightning",
  comboPeak: 10,
  attempts: [],
  already: []
});
assert(live.join() === "lightning-streak-10", "live awards stay on the allow list");

console.log("logic ok");
