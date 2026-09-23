/* SM-2 lite schedule plus a localStorage / IndexedDB mirror. No account. */
(function (root) {
  var PDG = root.PDG = root.PDG || {};
  var KEY = "pdg-party-sr-v1";
  var dbPromise = null;

  function empty() {
    return { cards: {}, seen: {}, chapters: {}, mocks: [] };
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      var data = JSON.parse(raw);
      data.cards = data.cards || {};
      data.seen = data.seen || {};
      data.chapters = data.chapters || {};
      data.mocks = data.mocks || [];
      return data;
    } catch (e) {
      return empty();
    }
  }

  function saveLocal(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* quota */ }
    mirrorIdb(data);
  }

  function idb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      if (!root.indexedDB) { resolve(null); return; }
      var req = indexedDB.open("pdg-party", 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
    return dbPromise;
  }

  function mirrorIdb(data) {
    idb().then(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(data, "sr");
      } catch (e) { /* ignore */ }
    });
  }

  function grade(data, item, quality) {
    var id = item.id;
    var prev = data.cards[id] || { ef: 2.5, interval: 0, reps: 0 };
    data.cards[id] = PDG.sm2(prev, quality);
    var seen = data.seen[id] || { correct: 0, wrong: 0 };
    if (quality >= 3) seen.correct += 1;
    else seen.wrong += 1;
    seen.last = Date.now();
    data.seen[id] = seen;
    var ch = (item.cite && item.cite.chapter) || item.chapter || 0;
    var bucket = data.chapters[ch] || { correct: 0, wrong: 0 };
    if (quality >= 3) bucket.correct += 1;
    else bucket.wrong += 1;
    data.chapters[ch] = bucket;
    saveLocal(data);
    return data;
  }

  function dueIds(data, now) {
    now = now || Date.now();
    return Object.keys(data.cards).filter(function (id) {
      return (data.cards[id].due || 0) <= now;
    });
  }

  PDG.sr = {
    load: loadLocal,
    save: saveLocal,
    grade: grade,
    dueIds: dueIds,
    empty: empty,
    exportJson: function () { return JSON.stringify(loadLocal(), null, 2); },
    importJson: function (text) {
      var data = JSON.parse(text);
      if (!data || typeof data !== "object") throw new Error("That file is not a PDG Party save.");
      data.cards = data.cards || {};
      data.seen = data.seen || {};
      data.chapters = data.chapters || {};
      data.mocks = data.mocks || [];
      saveLocal(data);
      return data;
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
