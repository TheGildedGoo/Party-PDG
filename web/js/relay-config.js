/* Hosted room relay for https://pdg-play.com.
   The LAN launcher (ports 8741–8750) ignores this and uses same-origin /ws.
   This static site has no server env injection. The string below is the client config.
   After `npx wrangler deploy`, set it to wss://pdg-party-relay.<subdomain>.workers.dev/ws */
(function (root) {
  if (!root.PDG_RELAY_URL) {
    root.PDG_RELAY_URL = "wss://pdg-party-relay.SUBDOMAIN.workers.dev/ws";
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
