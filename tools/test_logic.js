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

console.log("logic ok");
