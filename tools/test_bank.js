const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "web", "data");
const questions = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
const sjt = JSON.parse(fs.readFileSync(path.join(root, "sjt.json"), "utf8"));

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const mcq = questions.filter((q) => (q.kind || q.type) === "mcq");
const decoy = questions.filter((q) => (q.kind || q.type) === "decoy");
const fib = questions.filter((q) => q.type === "fibbage" || q.kind === "fibbage" || q.prompt);

assert(fib.length === 0, "shipped bank still has fibbage");
assert(mcq.length >= 564, "MCQ count dropped below the previous bank");
assert(decoy.length >= 40, "need at least 40 decoy packs, got " + decoy.length);
assert(sjt.length >= 34, "SJT count dropped");

const thin = ["7D", "7H", "11C", "11D", "12E", "15D", "15E", "15F", "16A", "17B", "18D", "24F"];
thin.forEach((sec) => {
  const n = mcq.filter((q) => q.cite && q.cite.section === sec).length;
  assert(n >= 3, sec + " still thin: " + n);
});

const off = new Set([2, 3, 4, 6, 10, 21, 23]);
questions.concat(sjt).forEach((item) => {
  const kind = item.kind || item.type;
  assert(item.kind === item.type, item.id + " kind/type mismatch");
  assert(["mcq", "decoy", "sjt"].indexOf(kind) !== -1, item.id + " bad kind");
  assert(item.cite && typeof item.cite.chapter === "number", item.id + " missing chapter");
  assert(item.cite.section, item.id + " missing section");
  assert(item.cite.para && item.cite.paragraph && item.cite.para === item.cite.paragraph, item.id + " para mapping");
  assert(off.has(item.cite.chapter) === false, item.id + " off-WAPS chapter");
  assert(item.sourceEdition === "AFH1-2025", item.id + " edition");
  assert(item.explain && item.source && item.explain !== item.source, item.id + " explain/source");
  assert(Array.isArray(item.ranks) && item.ranks.length, item.id + " ranks");
  if (item.cite.chapter === 13 || item.cite.chapter === 16) {
    assert(item.ranks.length === 1 && item.ranks[0] === "E6", item.id + " should be E6 only");
  } else {
    assert(item.ranks.indexOf("E5") !== -1, item.id + " missing E5");
  }
});

decoy.forEach((item) => {
  const lines = [item.truth].concat(item.decoys || []);
  const unique = new Set(lines.map((t) => String(t).trim().toLowerCase()));
  assert(item.decoys && item.decoys.length === 3, item.id + " decoy count");
  assert(unique.size === 4, item.id + " truth/decoys not unique");
  assert(item.stem, item.id + " stem");
  assert(typeof item.cite.pageHint === "string", item.id + " pageHint string");
});

mcq.forEach((item) => {
  assert(item.choices.length === 4, item.id + " choices");
  assert(new Set(item.choices).size === 4, item.id + " duplicate choice");
  assert(item.answerIndex >= 0 && item.answerIndex <= 3, item.id + " answerIndex");
});

const comps = {};
sjt.forEach((item) => {
  assert(item.competency !== "Fosters Inclusion", "deleted competency returned");
  comps[item.competency] = (comps[item.competency] || 0) + 1;
  assert(item.actions.length === 4, item.id + " actions");
  assert(item.mostIndex !== item.leastIndex, item.id + " swap keys");
});
["Resilience", "Flexibility", "Decision Making", "Creative Thinking", "Fostering Innovation", "Influence", "Results Focus", "Strategic Thinking", "Resource Management", "Precision", "Information Seeking", "Digital Literacy"].forEach((name) => {
  assert((comps[name] || 0) >= 2, name + " still has one scenario");
});

[17, 20, 22].forEach((ch) => {
  const n = decoy.filter((q) => q.cite.chapter === ch).length;
  assert(n >= 6, "chapter " + ch + " decoys " + n);
});

const counts = fs.readFileSync(path.join(root, "COUNTS.md"), "utf8");
assert(counts.indexOf("Fibbage: 0") !== -1, "COUNTS still ships fibbage");
assert(counts.indexOf("cite.paragraph") !== -1, "COUNTS missing cite mapping");
assert(counts.indexOf("- Decoy: " + decoy.length) !== -1, "COUNTS decoy total drifted");

console.log("bank ok", { mcq: mcq.length, decoy: decoy.length, sjt: sjt.length });
