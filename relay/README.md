# pdg-party-relay

Cloudflare Worker that hosts PDG Party rooms. One Durable Object per 4-character room code. WebSockets hibernate while the room is idle. The host browser is still authoritative: this Worker only relays the same JSON messages as `server.py`.

## What Dylan runs

From this directory:

```bash
npx wrangler login
npx wrangler deploy
```

`wrangler login` opens a browser OAuth flow. That is the path to use for the first deploy. Creating this Worker requires permission to add a new Worker on the account (Workers product **Admin**, or the OAuth login of an account admin).

API token instead of login:

1. Cloudflare dashboard → My Profile → API Tokens → Create Token.
2. Custom token, account permissions:
   - **Account → Workers Scripts → Edit** (legacy template “Edit Cloudflare Workers”), and
   - **Workers product Admin** if the dashboard offers the newer granular roles. A brand-new Worker name cannot be created with per-Worker Editor, because that scope only exists after the Worker exists.
3. Copy the Account ID from the Workers overview sidebar.

```bash
export CLOUDFLARE_API_TOKEN="paste-token"
export CLOUDFLARE_ACCOUNT_ID="paste-account-id"
npx wrangler deploy
```

Expected URL:

```text
https://pdg-party-relay.<account-subdomain>.workers.dev
```

WebSocket:

```text
wss://pdg-party-relay.<account-subdomain>.workers.dev/ws?room=ABCD
```

`curl https://pdg-party-relay.<account-subdomain>.workers.dev/health` returns `{"ok":true,"service":"pdg-party-relay"}`.

Then paste the `wss://…/ws` URL into `web/js/relay-config.js` as `window.PDG_RELAY_URL` and redeploy https://pdg-play.com. Phones load that file. Vercel environment variables are not read by the static client.

`ALLOWED_ORIGINS` in `wrangler.jsonc` is the extra browser-origin allowlist (default `https://pdg-play.com` and `https://www.pdg-play.com`). Localhost, 127.0.0.1, and private LAN origins are always allowed so the Python launcher can be pointed at this relay later. Add a Vercel preview origin here only if that preview should host rooms.

## How a room works

1. On https://pdg-play.com, click **Host a party**. The TV mints a 4-character code and connects as `host`.
2. The QR and join URL are `https://pdg-play.com/play.html?room=CODE` (`/play` rewrites to that file via `web/vercel.json`).
3. The phone opens the link, confirms a callsign, and connects as `player` (or audience). The 9th scoring phone is demoted to audience, matching the LAN server. Audience caps at 32.
4. Leave the host tab open. If it drops, phones stay for 12 seconds so a refresh can reclaim the room. After that they receive `hostgone`.

Solo and Quiet Hours do not open a socket.

## Local check

```bash
npm install
npm test
```

`npm test` boots `wrangler dev` on port 8787 and runs the host/phone message script.
