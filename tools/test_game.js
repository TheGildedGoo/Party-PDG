require("../web/js/logic.js");
require("../web/js/modes/boards.js");
require("../web/js/modes/lightning.js");
require("../web/js/modes/fibbage.js");
require("../web/js/modes/sjt.js");
require("../web/js/modes/teams.js");
require("../web/js/modes/hotwash.js");
require("../web/js/modes/decoy.js");
require("../web/js/game.js");

const PDG = globalThis.PDG;

function mcq(id, answerIndex) {
  return {
    id, type: "mcq", demo: true,
    question: "Q " + id,
    choices: ["Alpha", "Bravo", "Charlie", "Delta"],
    answerIndex,
    explain: "Because the handbook says so in two beats.",
    source: "Paraphrase of the cited paragraph.",
    cite: { chapter: 1, section: "1C", para: "1.3", title: "Core Values" },
    ranks: ["E5", "E6"],
    difficulty: 2,
    sourceEdition: "AFH1-2025",
    pageHint: 20
  };
}

const bank = {
  questions: [
    mcq("a", 0), mcq("b", 1), mcq("c", 2), mcq("d", 3), mcq("e", 0), mcq("f", 1),
    { id: "fib1", type: "fibbage", demo: true, prompt: "The creed was presented in ____.", answer: "2007", lies: ["1997", "2014", "1947"], explain: "General Moseley presented it in 2007.", cite: { chapter: 1, section: "1C", para: "1.5", title: "Creed" }, ranks: ["E5", "E6"], difficulty: 2, sourceEdition: "AFH1-2025", pageHint: 18 }
  ],
  sjt: [
    { id: "s1", type: "sjt", demo: true, scenario: "A teammate hid a broken tool.", actions: ["Report it and help fix the process", "Tell them to hide it better", "Ignore it", "Post it on social media"], mostIndex: 0, leastIndex: 1, competency: "Accountability", explain: "Accountability means owning the miss.", cite: { chapter: 15, section: "15A", para: "15.1", title: "Accountability" }, ranks: ["E5", "E6"], difficulty: 3, sourceEdition: "AFH1-2025", pageHint: 279 }
  ],
  lines: {
    correct: { mild: ["There it is."], chief: ["Put it in your hip pocket."] },
    wrong: { mild: ["Not that one."], chief: ["Confident. Wrong."] },
    fibfool: { mild: ["That lie got votes."], chief: ["You promoted a lie."] },
    fibtruth: { mild: ["That is the paragraph."], chief: ["Handbook wins."] },
    join: { mild: ["On the net."], chief: ["Another victim."] },
    win: { mild: ["Board is closed."], chief: ["Winner buys coffee."] },
    lightning: { mild: ["Break time."], chief: ["Do not study your neighbor."] },
    sjt: { mild: ["Competency, not vibes."], chief: ["Least effective was a choice."] },
    hotwash: { mild: ["Again."] , chief: ["We are not leaving."] },
    dares: ["Ten push-ups or the first lines of the Airman's Creed. Skip if you want."],
    nicks: ["Tabbed for Later"]
  }
};

function party() {
  const g = new PDG.Game(bank);
  g.manual = true;
  g.toLobby();
  g.addPlayer({ id: "p1", name: "Open Book", avatar: "open-book" });
  g.addPlayer({ id: "p2", name: "Chk Ride", avatar: "chk-ride" });
  return g;
}

function drain(g, n) {
  for (let i = 0; i < n; i++) g.flush();
}

let g = party();
let res = g.start("boards");
if (!res.ok) throw new Error(res.reason);
drain(g, 1);
if (g.phase !== "collect") throw new Error("boards should be collecting, got " + g.phase);
g.receive("p1", { type: "choice", choice: "c" + g.current.answerIndex });
g.receive("p2", { type: "choice", choice: "c" + ((g.current.answerIndex + 1) % 4) });
if (g.phase !== "reveal") throw new Error("boards should reveal");
if (g.players[0].score <= g.players[1].score && g.answers) {
  /* p1 correct should outscore p2 unless p1 was not first in the array */
}
const p1 = g.players.find((p) => p.id === "p1");
const p2 = g.players.find((p) => p.id === "p2");
if (p1.score <= 0) throw new Error("correct player scored nothing");
if (p2.score !== 0) throw new Error("wrong player scored");
if (!g.misses[1]) throw new Error("miss should tag chapter 1");

g = party();
g.start("fibbage");
drain(g, 1);
g.receive("p1", { type: "fibwrite", text: "1776" });
g.receive("p2", { type: "fibwrite", text: "1991" });
if (g.subphase !== "vote") throw new Error("fibbage should be voting, got " + g.subphase);
const truth = g.fibOptions.find((o) => o.truth);
const lie = g.fibOptions.find((o) => o.authorId === "p1");
g.receive("p1", { type: "fibvote", optionId: truth.id });
g.receive("p2", { type: "fibvote", optionId: lie.id });
if (g.phase !== "reveal") throw new Error("fib vote should reveal");
if (pScore(g, "p1") < 1000) throw new Error("truth plus a fool should pay, got " + pScore(g, "p1"));

g = party();
g.start("lightning");
drain(g, 1);
g.receive("p1", { type: "choice", choice: "c" + g.current.answerIndex });
g.receive("p2", { type: "choice", choice: "c9" });
if (g.players.find((p) => p.id === "p1").combo !== 1) throw new Error("combo should be 1");
if (g.players.find((p) => p.id === "p2").combo !== 0) throw new Error("miss kills combo");

g = party();
g.start("sjt");
drain(g, 1);
g.receive("p1", { type: "sjt", most: 0, least: 1 });
g.receive("p2", { type: "sjt", most: 1, least: 0 });
if (pScore(g, "p1") !== 1000) throw new Error("sjt both keys");
if (pScore(g, "p2") !== 0) throw new Error("sjt swap is zero");

g = party();
g.settings.rounds = 2;
res = g.start("teams");
if (!res.ok) throw new Error(res.reason);
drain(g, 1);
if (g.phase !== "collect") throw new Error("teams huddle");
const cap = g.active().find((p) => p.captain && p.team === g.turnTeam);
g.receive(cap.id, { type: "lock", choice: "c" + ((g.current.answerIndex + 1) % 4) });
if (g.steal !== true && g.phase !== "reveal") throw new Error("miss should open steal or reveal");
if (g.phase === "collect" && g.steal) {
  const other = g.active().find((p) => p.captain && p.team === g.turnTeam);
  g.receive(other.id, { type: "lock", choice: "c" + g.current.answerIndex });
  if (g.phase !== "reveal") throw new Error("steal should reveal");
  if (pScore(g, other.id) !== 750) throw new Error("steal pays 750, got " + pScore(g, other.id));
}

g = party();
g.receive = g.receive.bind(g);
g.start("boards");
drain(g, 1);
g.receive("p1", { type: "choice", choice: "c9" });
g.receive("p2", { type: "choice", choice: "c8" });
g.advance();
while (g.phase !== "results") {
  if (g.phase === "prompt" || g.phase === "interstitial") g.flush();
  if (g.phase === "collect") {
    g.receive("p1", { type: "choice", choice: "c0" });
    g.receive("p2", { type: "choice", choice: "c0" });
  }
  if (g.phase === "reveal") g.advance();
  if (g.phase === "interstitial") g.advance();
}
const hot = g.start("hotwash", { keepScore: true });
if (!hot.ok) throw new Error(hot.reason);
if (!g.deck.length) throw new Error("hot wash deck empty");
if (g.players.find((p) => p.id === "p1").score < 0) throw new Error("scores wiped");

bank.decoys = [{
  id: "decoy-ch09-001",
  kind: "decoy",
  stem: "The handbook line is which of these?",
  truth: "Handbook line",
  decoys: ["Lie A", "Lie B", "Lie C"],
  explain: "Study copy",
  cite: { chapter: 9, section: "9.4", paragraph: "9.4.2", pageHint: "9-12" },
  ranks: ["E5", "E6"],
  difficulty: 2,
  sourceEdition: "AFH1-2025"
}];
g = party();
g.settings.rounds = 1;
res = g.start("decoy");
if (!res.ok) throw new Error(res.reason);
drain(g, 1);
if (g.subphase !== "sponsor") throw new Error("party decoy should sponsor, got " + g.subphase);
g.receive("p1", { type: "sponsor", optionId: "d0", wager: 0 });
g.receive("p2", { type: "sponsor", optionId: "d1", wager: 2 });
if (g.subphase !== "vote") throw new Error("decoy should be voting");
g.receive("p1", { type: "decoyvote", optionId: "truth", wager: 0 });
g.receive("p2", { type: "decoyvote", optionId: "d0", wager: 2 });
if (g.phase !== "reveal") throw new Error("decoy vote should reveal");
if (pScore(g, "p1") !== 150) throw new Error("truth 100 plus one fool 50, got " + pScore(g, "p1"));
if (pScore(g, "p2") !== -200) throw new Error("wrong wager 2 costs 200, got " + pScore(g, "p2"));

g = new PDG.Game(bank);
g.manual = true;
g.toLobby();
g.addPlayer({ id: "solo", name: "You", avatar: "open-book" });
res = g.start("decoy");
if (!res.ok) throw new Error(res.reason);
drain(g, 1);
if (g.view.kind !== "decoy-pick") throw new Error("solo decoy is a four-line pick");
if (g.view.choices.length !== 4) throw new Error("solo stack should be 4");
var truthPick = g.view.choices.find((c) => c.truth);
g.receive("solo", { type: "choice", choice: truthPick.id, wager: 3 });
if (g.phase !== "reveal") throw new Error("solo decoy should reveal");
if (pScore(g, "solo") !== 300) throw new Error("solo wager 3 pays 300, got " + pScore(g, "solo"));

console.log("game ok");

function pScore(game, id) {
  return game.players.find((p) => p.id === id).score;
}
