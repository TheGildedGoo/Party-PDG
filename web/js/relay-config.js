/* Hosted room relay for https://pdg-play.com.
   The LAN launcher (ports 8741–8750) ignores this and uses same-origin /ws.
   This static site has no server env injection. The string below is the client config. */
(function (root) {
  if (!root.PDG_RELAY_URL) {
    root.PDG_RELAY_URL = "wss://pdg-party-relay.nalyd0206.workers.dev/ws";
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
