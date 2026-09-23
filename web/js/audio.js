/* Stingers live in assets/audio. Visual feedback still runs when muted. */
(function (root) {
  var PDG = root.PDG = root.PDG || {};
  var cache = {};
  var state = { muted: false, quiet: false };

  function remember() {
    try {
      localStorage.setItem("pdg-audio", JSON.stringify(state));
    } catch (e) { /* private mode */ }
  }

  try {
    var saved = JSON.parse(localStorage.getItem("pdg-audio") || "{}");
    if (typeof saved.muted === "boolean") state.muted = saved.muted;
    if (typeof saved.quiet === "boolean") state.quiet = saved.quiet;
  } catch (e) { /* ignore */ }

  function play(name) {
    if (state.muted) return;
    if (state.quiet && name !== "correct" && name !== "wrong" && name !== "tick") return;
    var audio = cache[name];
    if (!audio) {
      audio = new Audio("assets/audio/" + name + ".wav");
      audio.preload = "auto";
      cache[name] = audio;
    }
    try {
      audio.currentTime = 0;
      var pending = audio.play();
      if (pending && pending.catch) pending.catch(function () {});
    } catch (e) { /* autoplay gate */ }
  }

  function preload(names) {
    (names || []).forEach(function (name) {
      if (cache[name]) return;
      var audio = new Audio("assets/audio/" + name + ".wav");
      audio.preload = "auto";
      cache[name] = audio;
    });
  }

  PDG.audio = {
    get muted() { return state.muted; },
    get quiet() { return state.quiet; },
    toggleMute: function () { state.muted = !state.muted; remember(); return state.muted; },
    toggleQuiet: function () { state.quiet = !state.quiet; remember(); return state.quiet; },
    play: play,
    preload: preload
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
