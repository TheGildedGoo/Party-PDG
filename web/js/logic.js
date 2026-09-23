/* Pure rules for PDG Party. No DOM. Scoring comments mark the non-obvious bits. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PDG = root.PDG || {};
  Object.assign(root.PDG, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var WAPS = {
    edition: "AFH1-2025",
    catalogNote: "2026 E-5 (SSgt) and E-6 (TSgt) WAPS catalogs, studyguides.af.mil",
    e5: [1, 5, 7, 8, 9, 11, 12, 14, 15, 17, 18, 19, 20, 22, 24],
    e6Only: [13, 16],
    untested2026: [2, 3, 4, 6, 10, 21, 23]
  };

  var AVATARS = [
    { id: "chk-ride", name: "Chk Ride" },
    { id: "open-book", name: "Open Book" },
    { id: "fast-rope", name: "Fast Rope" },
    { id: "coffee-nco", name: "Coffee NCO" },
    { id: "regs-demon", name: "Regs Demon" },
    { id: "hot-wash", name: "Hot Wash" },
    { id: "break-time", name: "Break Time" },
    { id: "last-light", name: "Last Light" }
  ];

  var SHAPES = ["square", "triangle", "circle", "diamond"];
  var LETTERS = ["A", "B", "C", "D"];

  function chapterOf(item) {
    if (!item) return null;
    if (item.cite && item.cite.chapter) return item.cite.chapter;
    return item.chapter || null;
  }

  function ranksOf(item) {
    return (item && item.ranks) || [];
  }

  function matchesTrack(item, track) {
    var ranks = ranksOf(item);
    if (track === "all") return true;
    if (track === "E5") return ranks.indexOf("E5") !== -1;
    if (track === "E6") return ranks.indexOf("E6") !== -1;
    if (track === "mixed") return ranks.indexOf("E5") !== -1 || ranks.indexOf("E6") !== -1;
    return true;
  }

  function filterBank(items, track, type) {
    return (items || []).filter(function (item) {
      if (type && item.type && item.type !== type) return false;
      return matchesTrack(item, track || "mixed");
    });
  }

  function shuffle(list, rng) {
    var a = list.slice();
    var rand = rng || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function choiceView(question) {
    return (question.choices || []).map(function (text, i) {
      return { id: "c" + i, letter: LETTERS[i] || String(i + 1), shape: SHAPES[i] || "square", text: text, index: i };
    });
  }

  /* Base 1000. Speed bonus scales with time left, cap 500. Fastest correct lock gets +200. */
  function boardsPoints(correct, timeLeftMs, timeTotalMs, isFastest) {
    if (!correct) return 0;
    var ratio = timeTotalMs > 0 ? Math.max(0, Math.min(1, timeLeftMs / timeTotalMs)) : 0;
    return 1000 + Math.round(ratio * 500) + (isFastest ? 200 : 0);
  }

  /* Combo is the streak BEFORE this item. A hit multiplies; a miss zeros it. */
  function lightningResult(correct, comboBefore) {
    if (!correct) return { points: 0, combo: 0 };
    var combo = (comboBefore || 0) + 1;
    return { points: 100 * combo, combo: combo };
  }

  /*
   * Fibbage: fooling another active player is +500 each.
   * Spotting the handbook answer is +1000, which pays more than a single fool.
   * You cannot score a fool off yourself, and audience votes do not pay.
   */
  function fibbagePoints(players, options, votes) {
    var active = {};
    players.forEach(function (p) {
      if (!p.audience) active[p.id] = true;
    });
    var points = {};
    players.forEach(function (p) { points[p.id] = 0; });
    var votersByOption = {};
    Object.keys(votes || {}).forEach(function (pid) {
      if (!active[pid]) return;
      var oid = votes[pid];
      if (!votersByOption[oid]) votersByOption[oid] = [];
      votersByOption[oid].push(pid);
    });
    (options || []).forEach(function (opt) {
      var voters = votersByOption[opt.id] || [];
      if (opt.truth) {
        voters.forEach(function (pid) { points[pid] += 1000; });
      } else if (opt.authorId && active[opt.authorId]) {
        voters.forEach(function (pid) {
          if (pid !== opt.authorId) points[opt.authorId] += 500;
        });
      }
    });
    return points;
  }

  /* Official-style SJT: most and least are scored separately. A swap scores zero. */
  function sjtPoints(keyMost, keyLeast, pickMost, pickLeast) {
    if (pickMost == null || pickLeast == null) return 0;
    if (pickMost === pickLeast) return 0;
    var pts = 0;
    if (pickMost === keyMost) pts += 500;
    if (pickLeast === keyLeast) pts += 500;
    return pts;
  }

  /* Mock PFE: 1.25 each, 80 items, 100 max. */
  function pfeScore(correctCount, itemCount) {
    var n = itemCount || 80;
    var raw = (correctCount || 0) * (100 / n);
    return Math.round(raw * 100) / 100;
  }

  function sm2(card, quality) {
    var ef = card && card.ef ? card.ef : 2.5;
    var interval = card && card.interval ? card.interval : 0;
    var reps = card && card.reps ? card.reps : 0;
    var q = Math.max(0, Math.min(5, quality));
    if (q < 3) {
      reps = 0;
      interval = 1;
    } else {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 6;
      else interval = Math.max(1, Math.round(interval * ef));
      ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      if (ef < 1.3) ef = 1.3;
      reps += 1;
    }
    return {
      ef: Math.round(ef * 100) / 100,
      interval: interval,
      reps: reps,
      due: Date.now() + interval * 86400000,
      last: Date.now(),
      quality: q
    };
  }

  function norm(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function buildFibOptions(item, writes, players, rng) {
    var truth = item.answer;
    var options = [{ id: "truth", text: truth, truth: true, authorId: null, example: false }];
    var used = {};
    used[norm(truth)] = true;
    var lies = (item.lies || []).slice();
    (players || []).forEach(function (p) {
      if (p.audience) return;
      var text = (writes && writes[p.id]) || "";
      text = String(text).trim().slice(0, 90);
      if (!text || used[norm(text)]) {
        var standIn = null;
        while (lies.length && !standIn) {
          var candidate = lies.shift();
          if (!used[norm(candidate)]) standIn = candidate;
        }
        if (standIn) {
          options.push({ id: "ex-" + p.id, text: standIn, truth: false, authorId: null, example: true });
          used[norm(standIn)] = true;
        }
        return;
      }
      options.push({ id: "lie-" + p.id, text: text, truth: false, authorId: p.id, example: false });
      used[norm(text)] = true;
    });
    while (options.length < 3 && lies.length) {
      var extra = lies.shift();
      if (!used[norm(extra)]) {
        options.push({ id: "pad-" + options.length, text: extra, truth: false, authorId: null, example: true });
        used[norm(extra)] = true;
      }
    }
    return shuffle(options, rng).map(function (opt, i) {
      opt.letter = LETTERS[i] || String(i + 1);
      opt.shape = SHAPES[i % SHAPES.length];
      return opt;
    });
  }

  function pickLine(lines, bucket, roast, rng) {
    var bank = (lines && lines[bucket]) || {};
    var mild = bank.mild || [];
    var chief = bank.chief || [];
    var pool = roast === "chief" ? (chief.length ? chief : mild) : mild;
    if (!pool.length) return "";
    var rand = rng || Math.random;
    return pool[Math.floor(rand() * pool.length)];
  }

  function citeLabel(cite) {
    if (!cite) return "";
    var bits = [];
    var para = cite.para || cite.paragraph;
    if (para) bits.push("para " + para);
    if (cite.section) bits.push("sec " + cite.section);
    if (cite.chapter) bits.push("ch " + cite.chapter);
    if (cite.pageHint) bits.push("p. " + cite.pageHint);
    var head = "AFH 1 (2025)";
    if (cite.title) head += " — " + cite.title;
    return head + (bits.length ? " (" + bits.join(", ") + ")" : "");
  }

  /* Stripe wager. w is 0..3. Correct pays base * max(1, w). Wrong costs base * w. */
  var BOARDS_BASE = 100;
  var LIGHTNING_STEP = 50;
  var DECOY_BASE = 100;
  var DECOY_FOOL = 50;

  function clampWager(w) {
    if (w == null || w === "") return 0;
    var n = Math.round(Number(w));
    if (!isFinite(n) || n < 0) return 0;
    if (n > 3) return 3;
    return n;
  }

  function wagerPoints(correct, base, wager) {
    var w = clampWager(wager);
    var b = Number(base) || 0;
    if (correct) return b * Math.max(1, w);
    return -b * w;
  }

  function decoyItems(bank) {
    var list = [];
    var seen = {};
    function take(item, fromPack) {
      if (!item || (item.id && seen[item.id])) return;
      if (!fromPack && item.kind !== "decoy" && item.type !== "decoy") return;
      if (!item.decoys || item.decoys.length !== 3 || !item.truth) return;
      if (item.id) seen[item.id] = true;
      list.push(item);
    }
    ((bank && bank.decoys) || []).forEach(function (item) { take(item, true); });
    ((bank && bank.questions) || []).forEach(function (item) { take(item, false); });
    return list;
  }

  /* Truth plus exactly three decoys, shuffled into four MCQ lines. */
  function buildDecoyOptions(item, rng) {
    if (!item || !item.decoys || item.decoys.length !== 3 || !item.truth) return [];
    var options = [{ id: "truth", text: item.truth, truth: true }];
    item.decoys.forEach(function (text, i) {
      options.push({ id: "d" + i, text: text, truth: false });
    });
    return shuffle(options, rng).map(function (opt, i) {
      opt.letter = LETTERS[i] || String(i + 1);
      opt.shape = SHAPES[i % SHAPES.length];
      return opt;
    });
  }

  function round3(n) {
    return Math.round((Number(n) || 0) * 1000) / 1000;
  }

  function makeSessionId(rng) {
    var rand = rng || Math.random;
    return "ses_" + Math.floor(rand() * 1e9).toString(36) + Date.now().toString(36);
  }

  /*
   * schemaVersion 1. Weak rule: a chapter or section needs n>=5 answers,
   * then sort ascending accuracy. recommendedNext is the worst three chapters.
   */
  function buildSessionStats(input) {
    input = input || {};
    var attempts = input.attempts || [];
    var byPlayer = {};
    var groups = {};
    var chapters = {};
    var sections = {};
    var latency = 0;
    var correct = 0;
    var wagerNet = 0;
    attempts.forEach(function (a) {
      var ok = !!a.correct;
      if (ok) correct += 1;
      latency += Number(a.latencyMs) || 0;
      wagerNet += Number(a.wagerDelta) || 0;
      var pid = a.playerId || "_";
      if (!byPlayer[pid]) byPlayer[pid] = { streak: 0, best: 0 };
      if (ok) {
        byPlayer[pid].streak += 1;
        if (byPlayer[pid].streak > byPlayer[pid].best) byPlayer[pid].best = byPlayer[pid].streak;
      } else byPlayer[pid].streak = 0;
      if (a.omitGroup) return;
      var ch = a.chapter || 0;
      var sec = a.section || "";
      var gk = ch + "\n" + sec;
      if (!groups[gk]) groups[gk] = { chapter: ch, section: sec, answered: 0, correct: 0, latency: 0, missIds: [] };
      var g = groups[gk];
      g.answered += 1;
      g.latency += Number(a.latencyMs) || 0;
      if (ok) g.correct += 1;
      else if (a.id) g.missIds.push(a.id);
      if (!chapters[ch]) chapters[ch] = { chapter: ch, answered: 0, correct: 0 };
      chapters[ch].answered += 1;
      if (ok) chapters[ch].correct += 1;
      if (!sections[gk]) sections[gk] = { chapter: ch, section: sec, answered: 0, correct: 0 };
      sections[gk].answered += 1;
      if (ok) sections[gk].correct += 1;
    });
    var streakBest = 0;
    Object.keys(byPlayer).forEach(function (pid) {
      if (byPlayer[pid].best > streakBest) streakBest = byPlayer[pid].best;
    });
    var byChapter = Object.keys(groups).map(function (k) {
      var g = groups[k];
      return {
        chapter: g.chapter,
        section: g.section,
        answered: g.answered,
        correct: g.correct,
        accuracy: round3(g.answered ? g.correct / g.answered : 0),
        avgLatencyMs: g.answered ? Math.round(g.latency / g.answered) : 0,
        missIds: g.missIds
      };
    }).sort(function (a, b) {
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return String(a.section).localeCompare(String(b.section));
    });
    function weakList(map, withSection) {
      return Object.keys(map).map(function (k) {
        var r = map[k];
        var row = {
          chapter: r.chapter,
          answered: r.answered,
          correct: r.correct,
          accuracy: round3(r.answered ? r.correct / r.answered : 0)
        };
        if (withSection) row.section = r.section;
        return row;
      }).filter(function (r) { return r.answered >= 5; }).sort(function (a, b) {
        return a.accuracy - b.accuracy || a.chapter - b.chapter;
      });
    }
    var weakChapters = weakList(chapters, false);
    var weakSections = weakList(sections, true);
    var answered = attempts.length;
    return {
      schemaVersion: 1,
      sessionId: input.sessionId || "",
      endedAt: input.endedAt || "",
      modeId: input.modeId || "",
      rankTrack: input.rankTrack || "",
      solo: !!input.solo,
      totals: {
        answered: answered,
        correct: correct,
        accuracy: round3(answered ? correct / answered : 0),
        avgLatencyMs: answered ? Math.round(latency / answered) : 0,
        streakBest: streakBest,
        wagerNet: wagerNet
      },
      byChapter: byChapter,
      focusRollup: {
        weakChapters: weakChapters,
        weakSections: weakSections,
        recommendedNext: weakChapters.slice(0, 3).map(function (r) { return r.chapter; })
      },
      achievementsUnlocked: (input.achievementsUnlocked || []).slice()
    };
  }

  var ACHIEVEMENTS = {
    "first-light": { title: "First Light", icon: "sun-moon", copy: "First item is on the desk." },
    "queue-zero": { title: "Queue Zero", icon: "book-open", copy: "Five cards in the box and nothing is due." },
    "chapter-cleared": { title: "Chapter Cleared", icon: "award", copy: "A chapter ran clean across five or more items." },
    "seven-day-desk": { title: "Seven-Day Desk", icon: "heart-pulse", copy: "Seven different days on this desk." },
    "mock-complete": { title: "Mock Complete", icon: "flag", copy: "Eighty slots are filled. This is a study timer, not an official score." },
    "mock-pass-bar": { title: "Mock Pass Bar", icon: "award", copy: "Study mock reached 70. The Air Force sets the real cut score." },
    "lightning-streak-5": { title: "Lightning 5", icon: "zap", copy: "Five straight on the lightning clock." },
    "lightning-streak-10": { title: "Lightning 10", icon: "zap", copy: "Ten straight. The combo is loud." },
    "boards-ace": { title: "Boards Ace", icon: "shield", copy: "A Boards run was clean across five or more items." },
    "decoy-sniper": { title: "Decoy Sniper", icon: "scale", copy: "Three handbook lines spotted in Decoy Brief." },
    "master-of-deceit": { title: "Master of Deceit", icon: "messages-square", copy: "A sponsored decoy took a vote." },
    "steal-artist": { title: "Steal Artist", icon: "flag", copy: "The next flight stole the point." },
    "judgment-call": { title: "Judgment Call", icon: "scale", copy: "Most and least both matched the key." },
    "high-stakes": { title: "High Stakes", icon: "timer", copy: "Wager three, and it was the handbook line." },
    "weakness-closed": { title: "Weakness Closed", icon: "heart-pulse", copy: "A weak chapter came back at 80% or better." }
  };

  function chapterTallies(attempts) {
    var chapters = {};
    (attempts || []).forEach(function (a) {
      if (a.omitGroup) return;
      var ch = a.chapter || 0;
      if (!chapters[ch]) chapters[ch] = { answered: 0, correct: 0 };
      chapters[ch].answered += 1;
      if (a.correct) chapters[ch].correct += 1;
    });
    return chapters;
  }

  function playerBuckets(attempts) {
    var byP = {};
    (attempts || []).forEach(function (a) {
      var id = a.playerId || "_";
      if (!byP[id]) byP[id] = [];
      byP[id].push(a);
    });
    return byP;
  }

  /* Returns newly earned ids. Pass already[] so callers can persist the rest. */
  function evaluateAchievements(ctx) {
    ctx = ctx || {};
    var attempts = ctx.attempts || [];
    var already = {};
    (ctx.already || []).forEach(function (id) { already[id] = true; });
    var fresh = [];
    function grant(id, cond) {
      if (!cond || already[id] || !ACHIEVEMENTS[id]) return;
      if (ctx.live && ctx.liveOnly && ctx.liveOnly.indexOf(id) === -1) return;
      already[id] = true;
      fresh.push(id);
    }
    var chapters = chapterTallies(attempts);
    var cleared = Object.keys(chapters).some(function (ch) {
      var row = chapters[ch];
      return row.answered >= 5 && row.correct === row.answered;
    });
    var byP = playerBuckets(attempts);
    var boardsAce = ctx.modeId === "boards" && Object.keys(byP).some(function (id) {
      var rows = byP[id];
      return rows.length >= 5 && rows.every(function (a) { return a.correct; });
    });
    var decoyHits = ctx.modeId === "decoy" && Object.keys(byP).some(function (id) {
      return byP[id].filter(function (a) { return a.correct; }).length >= 3;
    });
    var highStakes = attempts.some(function (a) { return a.correct && Number(a.wager) === 3; });
    var weaknessClosed = (ctx.priorWeakChapters || []).some(function (ch) {
      var row = chapters[ch] || chapters[String(ch)];
      return row && row.answered >= 5 && row.correct / row.answered >= 0.8;
    });
    grant("first-light", ctx.priorAnswered === 0 && attempts.length > 0);
    grant("queue-zero", (ctx.cardsStudied || 0) >= 5 && (ctx.dueCount || 0) === 0);
    grant("chapter-cleared", cleared);
    grant("seven-day-desk", (ctx.studyDays || 0) >= 7);
    grant("mock-complete", !!ctx.mockComplete);
    grant("mock-pass-bar", !!ctx.mockComplete && Number(ctx.mockScore) >= 70);
    grant("lightning-streak-5", ctx.modeId === "lightning" && (ctx.comboPeak || 0) >= 5);
    grant("lightning-streak-10", ctx.modeId === "lightning" && (ctx.comboPeak || 0) >= 10);
    grant("boards-ace", boardsAce);
    grant("decoy-sniper", decoyHits);
    grant("master-of-deceit", (ctx.fools || 0) >= 1);
    grant("steal-artist", !!ctx.stole);
    grant("judgment-call", !!ctx.judgment);
    grant("high-stakes", highStakes);
    grant("weakness-closed", weaknessClosed);
    return fresh;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function roomCode(rng) {
    var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var rand = rng || Math.random;
    var out = "";
    for (var i = 0; i < 4; i++) out += alphabet[Math.floor(rand() * alphabet.length)];
    return out;
  }

  return {
    WAPS: WAPS,
    AVATARS: AVATARS,
    SHAPES: SHAPES,
    LETTERS: LETTERS,
    chapterOf: chapterOf,
    matchesTrack: matchesTrack,
    filterBank: filterBank,
    shuffle: shuffle,
    choiceView: choiceView,
    boardsPoints: boardsPoints,
    lightningResult: lightningResult,
    fibbagePoints: fibbagePoints,
    sjtPoints: sjtPoints,
    pfeScore: pfeScore,
    sm2: sm2,
    norm: norm,
    buildFibOptions: buildFibOptions,
    pickLine: pickLine,
    citeLabel: citeLabel,
    esc: esc,
    roomCode: roomCode,
    BOARDS_BASE: BOARDS_BASE,
    LIGHTNING_STEP: LIGHTNING_STEP,
    DECOY_BASE: DECOY_BASE,
    DECOY_FOOL: DECOY_FOOL,
    clampWager: clampWager,
    wagerPoints: wagerPoints,
    decoyItems: decoyItems,
    buildDecoyOptions: buildDecoyOptions,
    buildSessionStats: buildSessionStats,
    makeSessionId: makeSessionId,
    ACHIEVEMENTS: ACHIEVEMENTS,
    evaluateAchievements: evaluateAchievements
  };
});
