import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deviceAccessError } from "../web/api/lib/device-gate.js";
import { shapeBank } from "../web/api/lib/device-bank.js";

const base = {
  id: "u1",
  email: "a@example.com",
  role: "user",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  mustChangePassword: false,
  disabledAt: null,
  deletedAt: null,
  subscriptionStatus: "active",
  currentPeriodEnd: null,
  username: "airman",
};

const catalog = {
  edition: "AFH1-2025",
  generatedAt: 1_700_000_000,
  chapters: [
    { chapter: 1, title: "Professionalism", waps: "both" },
    { chapter: 13, title: "Developing Organizations", waps: "e6" },
    { chapter: 2, title: "Aviation History", waps: "off" },
  ],
  items: [
    {
      id: "q1",
      kind: "mcq",
      question: "Core values?",
      choices: ["A", "B", "C", "D"],
      answerIndex: 0,
      difficulty: 1,
      ranks: ["E5", "E6"],
      cite: { chapter: 1, section: "1C", para: "1.3", paragraph: "1.3", title: "Core Values" },
      explain: "Named in paragraph 1.3.",
      source: "AFH 1 (2025) para 1.3.",
    },
    {
      id: "q13",
      kind: "mcq",
      type: "mcq",
      question: "E-6 only?",
      choices: ["A", "B", "C", "D"],
      answerIndex: 1,
      difficulty: 3,
      ranks: ["E6"],
      cite: { chapter: 13, section: "13A", paragraph: "13.1" },
      explain: "E-6 chapter.",
      source: "AFH 1 (2025) para 13.1.",
    },
    {
      id: "d1",
      kind: "decoy",
      stem: "not for the brick",
      truth: "t",
      decoys: ["a", "b", "c"],
      ranks: ["E5", "E6"],
      cite: { chapter: 1, section: "1A", para: "1.1" },
    },
  ],
};

test("device login rejects unverified, disabled, password, and unpaid accounts", () => {
  assert.equal(deviceAccessError(null).status, 401);
  assert.match(deviceAccessError({ ...base, emailVerifiedAt: null }).message, /Verify your email/);
  assert.equal(deviceAccessError({ ...base, disabledAt: "2026-01-02" }).status, 403);
  assert.match(deviceAccessError({ ...base, mustChangePassword: true }).message, /Change your password/);
  assert.match(deviceAccessError({ ...base, role: "admin", mustChangePassword: true }).message, /Change your password/);
  assert.match(deviceAccessError({ ...base, subscriptionStatus: null }).message, /active plan/);
  assert.match(deviceAccessError({ ...base, subscriptionStatus: "canceled" }).message, /active plan/);
  assert.equal(deviceAccessError(base), null);
  assert.equal(deviceAccessError({ ...base, role: "admin", subscriptionStatus: null, mustChangePassword: false }), null);
});

test("device bank is mcq only and keeps chapter, section, and paragraph", () => {
  const e5 = shapeBank(catalog, { rank: "E5" });
  assert.equal(e5.count, 1);
  assert.equal(e5.items.length, 1);
  assert.equal(e5.items[0].id, "q1");
  assert.equal(e5.items[0].cite.chapter, 1);
  assert.equal(e5.items[0].cite.section, "1C");
  assert.equal(e5.items[0].cite.para, "1.3");
  assert.equal(e5.items[0].cite.title, "Core Values");
  assert.equal(e5.chapters[0].waps, "E5+E6");
  assert.equal(e5.chapters[1].waps, "E6");
  assert.equal(e5.chapters[2].waps, "off");
  assert.equal(JSON.stringify(e5).includes("decoy"), false);

  const e6 = shapeBank(catalog, { rank: "E6" });
  assert.deepEqual(e6.items.map((item) => item.id), ["q1", "q13"]);
  assert.equal(e6.items[1].cite.para, "13.1");

  const same = shapeBank(catalog, { rank: "E5", updated_since: "1700000000" });
  assert.equal(same.unchanged, true);
  assert.equal(same.items, undefined);
  assert.equal(same.hash, e5.hash);
  assert.throws(() => shapeBank(catalog, { rank: "E4" }), /E5 or E6/);
});

test("shipped device bank has no decoy rows and every item is cited", () => {
  const shipped = JSON.parse(readFileSync(new URL("../web/data/bank.mcq.json", import.meta.url), "utf8"));
  const body = shapeBank(shipped, { rank: "E6" });
  assert.ok(body.count > 100);
  for (const item of body.items) {
    assert.equal(item.choices.length, 4);
    assert.ok(item.cite.chapter > 0);
    assert.ok(item.cite.section);
    assert.ok(item.cite.para);
    assert.equal(item.stem, undefined);
    assert.equal(item.scenario, undefined);
  }
  const e5 = shapeBank(shipped, { rank: "E5" });
  assert.equal(e5.items.some((item) => item.cite.chapter === 13 || item.cite.chapter === 16), false);
});

test("bank function config is listed before the api glob", () => {
  const vercel = JSON.parse(readFileSync(new URL("../web/vercel.json", import.meta.url), "utf8"));
  const keys = Object.keys(vercel.functions);
  assert.equal(keys[0], "api/device/bank.js");
  assert.match(vercel.functions["api/device/bank.js"].includeFiles, /bank\.mcq\.json/);
  assert.ok(keys.indexOf("api/**/*.js") > keys.indexOf("api/device/bank.js"));
  assert.ok(keys.indexOf("api/**/*.js") > keys.indexOf("api/device/*.js"));
});

test("device routes stay bearer-only and progress still merges", () => {
  const action = readFileSync(new URL("../web/api/lib/actions/device.js", import.meta.url), "utf8");
  const progress = readFileSync(new URL("../web/api/lib/actions/progress.js", import.meta.url), "utf8");
  assert.doesNotMatch(action, /assertSameOrigin/);
  assert.match(action, /saveMergedProgress/);
  assert.match(progress, /loadMergeSnapshots/);
  assert.doesNotMatch(progress, /createRequire/);
  assert.match(progress, /assertSameOrigin/);
});
