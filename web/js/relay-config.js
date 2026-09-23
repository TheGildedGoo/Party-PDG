/* Hosted room relay for https://pdg-play.com.
   This file is the client config. Vercel env vars are not injected.
   localhost and ?relay=lan ignore this and use same-origin /ws. */
(function (root) {
  if (!root.PDG_RELAY_URL) {
    root.PDG_RELAY_URL = "wss://pdg-party-relay.nalyd0206.workers.dev/ws";
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
