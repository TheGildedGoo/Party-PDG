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
    if (cite.para) bits.push("para " + cite.para);
    if (cite.section) bits.push("sec " + cite.section);
    if (cite.chapter) bits.push("ch " + cite.chapter);
    var head = "AFH 1 (2025)";
    if (cite.title) head += " — " + cite.title;
    return head + (bits.length ? " (" + bits.join(", ") + ")" : "");
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
    roomCode: roomCode
  };
});
