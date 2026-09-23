import { spawn } from "node:child_process";
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const PORT = 8787;
const BASE = `http://127.0.0.1:${PORT}`;

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function once(ws, pred, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for a message"));
    }, ms);
    function onMessage(ev) {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!pred(msg)) return;
      cleanup();
      resolve(msg);
    }
    function onClose() {
      cleanup();
      reject(new Error("socket closed before the expected message"));
    }
    function cleanup() {
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("close", onClose);
    }
    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
  });
}

function connect(room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE.replace("http", "ws")}/ws?room=${room}`);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", () => reject(new Error(`socket error for ${room}`)));
  });
}

async function hello(ws, fields) {
  ws.send(JSON.stringify({ op: "hello", ...fields }));
  return once(ws, (msg) => msg.op === "welcome" || msg.op === "err");
}

function upgradeStatus(path, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        ...headers,
      },
    }, (res) => {
      resolve(res.statusCode || 0);
      res.resume();
    });
    req.on("error", reject);
    req.end();
  });
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function waitHealth() {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* wrangler still booting */ }
    await delay(200);
  }
  throw new Error("wrangler dev did not become ready");
}

async function main() {
  const relayDir = fileURLToPath(new URL("..", import.meta.url));
  const wranglerBin = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  const child = spawn(process.execPath, [wranglerBin, "dev", "--port", String(PORT), "--ip", "127.0.0.1"], {
    cwd: relayDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (buf) => { logs += buf.toString(); });
  child.stderr.on("data", (buf) => { logs += buf.toString(); });
  const stop = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.on("exit", stop);
  try {
    await waitHealth();
    const health = await fetch(`${BASE}/health`);
    assert(health.ok, "health failed");
    const body = await health.json();
    assert(body.service === "pdg-party-relay", "unexpected health body");

    const minted = await fetch(`${BASE}/rooms`, {
      method: "POST",
      headers: { Origin: "https://pdg-play.com" },
    });
    assert(minted.status === 201, `mint should be 201, got ${minted.status}`);
    assert(minted.headers.get("access-control-allow-origin") === "https://pdg-play.com", "mint CORS origin");
    const mintedBody = await minted.json();
    assert(/^[A-HJ-NP-Z2-9]{4}$/.test(mintedBody.room), JSON.stringify(mintedBody));
    const before = await fetch(`${BASE}/rooms/${mintedBody.room}`);
    const beforeBody = await before.json();
    assert(before.ok && beforeBody.host === false && beforeBody.players === 0, JSON.stringify(beforeBody));
    const evilMint = await fetch(`${BASE}/rooms`, {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    assert(evilMint.status === 403, `evil mint should be 403, got ${evilMint.status}`);

    const missing = await fetch(`${BASE}/ws?room=no`);
    assert(missing.status === 400, `bad room should be 400, got ${missing.status}`);
    const denied = await upgradeStatus("/ws?room=ABCD", { Origin: "https://evil.example" });
    assert(denied === 403, `evil origin should be 403, got ${denied}`);

    const emptyCode = roomCode();
    const party = roomCode();
    const emptyPlayer = await connect(emptyCode);
    const refused = await hello(emptyPlayer, { role: "player", room: emptyCode, name: "Nope" });
    assert(refused.op === "err" && refused.msg === "No host is waiting on that code.", JSON.stringify(refused));
    emptyPlayer.close();

    const host = await connect(party);
    const hostWelcome = await hello(host, { role: "host", room: party.toLowerCase() });
    assert(hostWelcome.op === "welcome" && hostWelcome.role === "host" && hostWelcome.room === party, JSON.stringify(hostWelcome));
    const live = await (await fetch(`${BASE}/rooms/${party}`)).json();
    assert(live.host === true && live.players === 0 && live.room === party, JSON.stringify(live));

    const second = await connect(party);
    const clash = await hello(second, { role: "host", room: party });
    assert(clash.op === "err" && clash.msg === "That room already has a host.", JSON.stringify(clash));
    second.close();

    const joined = once(host, (msg) => msg.op === "joined");
    const phone = await connect(party);
    const phoneWelcome = await hello(phone, { role: "player", room: party, name: "Open Book", avatar: "open-book" });
    assert(phoneWelcome.op === "welcome" && phoneWelcome.role === "player", JSON.stringify(phoneWelcome));
    const joinMsg = await joined;
    assert(joinMsg.player.id === phoneWelcome.id, "joined id mismatch");
    assert(joinMsg.player.name === "Open Book" && joinMsg.player.audience === false, JSON.stringify(joinMsg));

    const stateWait = once(phone, (msg) => msg.op === "state");
    host.send(JSON.stringify({ op: "state", state: { phase: "lobby", prompt: "Ready" } }));
    const state = await stateWait;
    assert(state.state.prompt === "Ready", JSON.stringify(state));

    const actWait = once(host, (msg) => msg.op === "act");
    phone.send(JSON.stringify({ op: "act", payload: { type: "choice", choice: "a" } }));
    const act = await actWait;
    assert(act.from === phoneWelcome.id && act.payload.choice === "a", JSON.stringify(act));

    const privWait = once(phone, (msg) => msg.op === "priv");
    host.send(JSON.stringify({ op: "priv", to: phoneWelcome.id, payload: { ownOptionId: "x" } }));
    const priv = await privWait;
    assert(priv.payload.ownOptionId === "x", JSON.stringify(priv));

    const metaWait = once(host, (msg) => msg.op === "meta");
    phone.send(JSON.stringify({ op: "meta", payload: { name: "Regs Demon" } }));
    const meta = await metaWait;
    assert(meta.from === phoneWelcome.id && meta.payload.name === "Regs Demon", JSON.stringify(meta));

    const phones = [phone];
    for (let i = 0; i < 7; i++) {
      const extra = await connect(party);
      const welcome = await hello(extra, { role: "player", room: party, name: "P" + i });
      assert(welcome.role === "player", `player ${i} demoted early: ${welcome.role}`);
      phones.push(extra);
    }
    const ninth = await connect(party);
    const audience = await hello(ninth, { role: "player", room: party, name: "Watching" });
    assert(audience.role === "audience", JSON.stringify(audience));

    const leftWait = once(host, (msg) => msg.op === "left" && msg.id === phoneWelcome.id);
    phone.close();
    const left = await leftWait;
    assert(left.id === phoneWelcome.id, JSON.stringify(left));

    host.close();
    await delay(400);
    const reclaimed = await connect(party);
    const again = await hello(reclaimed, { role: "host", room: party });
    assert(again.op === "welcome" && again.role === "host", `reclaim failed ${JSON.stringify(again)}`);
    const stillThere = once(phones[1], (msg) => msg.op === "state" || msg.op === "hostgone", 2000);
    reclaimed.send(JSON.stringify({ op: "state", state: { phase: "lobby", prompt: "Back" } }));
    const after = await stillThere;
    assert(after.op === "state" && after.state.prompt === "Back", JSON.stringify(after));

    reclaimed.close();
    const gone = once(phones[1], (msg) => msg.op === "hostgone", 15000);
    const hostgone = await gone;
    assert(hostgone.op === "hostgone", JSON.stringify(hostgone));

    for (const sock of phones.concat([ninth])) {
      try { sock.close(); } catch { /* already closed */ }
    }
    console.log("protocol ok");
  } catch (error) {
    console.error(logs.slice(-4000));
    throw error;
  } finally {
    stop();
    await delay(300);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
