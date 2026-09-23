import { DurableObject } from "cloudflare:workers";

/** Match server.py: phones stay through a short host reconnect. */
const HOST_GRACE_MS = 12_000;
const MAX_PLAYERS = 8;
const MAX_AUDIENCE = 32;
const MAX_SOCKETS = 1 + MAX_PLAYERS + MAX_AUDIENCE;
const MAX_MESSAGE_CHARS = 256 * 1024;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 300;
const HELLO_TIMEOUT_MS = 10_000;

type Role = "host" | "player" | "audience";

interface Attachment {
  welcomed: boolean;
  id: string;
  role: Role | "";
  room: string;
  windowStart: number;
  windowCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAttachment(ws: WebSocket): Attachment | null {
  const raw: unknown = ws.deserializeAttachment();
  if (!isRecord(raw) || typeof raw.welcomed !== "boolean") return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const roleRaw = typeof raw.role === "string" ? raw.role : "";
  const role: Role | "" = roleRaw === "host" || roleRaw === "player" || roleRaw === "audience" ? roleRaw : "";
  const room = typeof raw.room === "string" ? raw.room : "";
  const windowStart = typeof raw.windowStart === "number" ? raw.windowStart : 0;
  const windowCount = typeof raw.windowCount === "number" ? raw.windowCount : 0;
  return { welcomed: raw.welcomed, id, role, room, windowStart, windowCount };
}

function writeAttachment(ws: WebSocket, attachment: Attachment): void {
  ws.serializeAttachment(attachment);
}

function clipText(value: unknown, fallback: string, max: number): string {
  const text = typeof value === "string" && value ? value : fallback;
  return text.slice(0, max) || fallback;
}

function clientId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function roomFromUrl(url: URL): string {
  return (url.searchParams.get("room") || "").trim().toUpperCase();
}

function validRoom(code: string): boolean {
  return /^[A-Z0-9]{4}$/.test(code);
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return false;
  const a = nums[0] ?? -1;
  const b = nums[1] ?? -1;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function originAllowed(origin: string | null, extra: string): boolean {
  // Browsers always send Origin. Missing Origin is a non-browser client (wscat, tests).
  if (!origin) return true;
  const allowed = new Set<string>();
  for (const item of extra.split(",")) {
    const trimmed = item.trim();
    if (trimmed) allowed.add(trimmed);
  }
  if (allowed.has(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  return isPrivateIpv4(host);
}

function send(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* closed between the readyState check and send */
  }
}

function reject(ws: WebSocket, msg: string): void {
  send(ws, { op: "err", msg });
  try {
    ws.close(1008, msg.slice(0, 120));
  } catch {
    /* already closing */
  }
}

/**
 * One Durable Object per room code. WebSockets hibernate with the session
 * stored on the socket attachment. Message shapes match server.py.
 */
export class PartyRoom extends DurableObject<Env> {
  private readonly helloTimers = new Map<WebSocket, ReturnType<typeof setTimeout>>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const room = roomFromUrl(new URL(request.url));
    if (!validRoom(room)) {
      return new Response("Need a 4-character room code.", { status: 400 });
    }
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      return new Response("Room is full.", { status: 429 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    writeAttachment(server, {
      welcomed: false,
      id: "",
      role: "",
      room,
      windowStart: 0,
      windowCount: 0,
    });
    const timer = setTimeout(() => {
      this.helloTimers.delete(server);
      const att = readAttachment(server);
      if (!att?.welcomed && server.readyState === WebSocket.OPEN) {
        reject(server, "Need a role and a 4-character room code.");
      }
    }, HELLO_TIMEOUT_MS);
    this.helloTimers.set(server, timer);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const claimedHost = this.onMessage(ws, message);
    if (claimedHost) await this.clearHostGrace();
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.clearHelloTimer(ws);
    if (this.onClose(ws)) await this.scheduleHostGrace();
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "error";
    console.log(JSON.stringify({ event: "ws_error", message }));
    try {
      ws.close(1011, "error");
    } catch {
      /* close handler still runs the roster update */
    }
  }

  async alarm(): Promise<void> {
    if (this.findHost()) {
      await this.ctx.storage.delete("hostGrace");
      return;
    }
    const pending = await this.ctx.storage.get<string>("hostGrace");
    if (!pending) return;
    await this.ctx.storage.delete("hostGrace");
    if (this.findHost()) return;
    for (const sock of this.ctx.getWebSockets()) {
      send(sock, { op: "hostgone" });
      try {
        sock.close(1000, "hostgone");
      } catch {
        /* already gone */
      }
    }
  }

  private onMessage(ws: WebSocket, message: string | ArrayBuffer): boolean {
    if (typeof message !== "string") {
      reject(ws, "Text frames only.");
      return false;
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      reject(ws, "Message too large.");
      return false;
    }
    const att = readAttachment(ws);
    if (!att) {
      reject(ws, "Connection reset.");
      return false;
    }
    if (!this.allowMessage(ws, att)) {
      reject(ws, "Slow down.");
      return false;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      reject(ws, att.welcomed ? "Bad message." : "Need a role and a 4-character room code.");
      return false;
    }
    if (!isRecord(parsed)) {
      reject(ws, att.welcomed ? "Bad message." : "Need a role and a 4-character room code.");
      return false;
    }
    const op = typeof parsed.op === "string" ? parsed.op : "";
    if (!att.welcomed) {
      if (op !== "hello") {
        reject(ws, "Need a role and a 4-character room code.");
        return false;
      }
      return this.hello(ws, parsed);
    }
    if (op === "hello") return false;
    if (op === "state") this.relayState(ws, att, parsed);
    else if (op === "priv") this.relayPriv(ws, att, parsed);
    else if (op === "act") this.relayToHost(ws, att, "act", parsed.payload);
    else if (op === "meta") this.relayToHost(ws, att, "meta", parsed.payload);
    return false;
  }

  private hello(ws: WebSocket, msg: Record<string, unknown>): boolean {
    const role = msg.role;
    const att = readAttachment(ws);
    const named = this.ctx.id.name;
    const room = att?.room && validRoom(att.room) ? att.room : named && validRoom(named) ? named : "";
    const rawRoom = typeof msg.room === "string" ? msg.room.trim().toUpperCase() : "";
    if ((role !== "host" && role !== "player" && role !== "audience") || !room || rawRoom.length < 4 || rawRoom.slice(0, 4) !== room) {
      reject(ws, "Need a role and a 4-character room code.");
      return false;
    }
    const counts = this.counts(ws);
    if (role === "host") {
      if (counts.host > 0) {
        reject(ws, "That room already has a host.");
        return false;
      }
      const id = clientId();
      this.clearHelloTimer(ws);
      writeAttachment(ws, { welcomed: true, id, role: "host", room, windowStart: Date.now(), windowCount: 1 });
      send(ws, { op: "welcome", id, role: "host", room });
      return true;
    }
    if (counts.host < 1) {
      reject(ws, "No host is waiting on that code.");
      return false;
    }
    let asked: Role = role === "audience" || msg.audience ? "audience" : "player";
    if (asked === "player" && counts.players >= MAX_PLAYERS) asked = "audience";
    if (asked === "audience" && counts.audience >= MAX_AUDIENCE) {
      reject(ws, "That room is full.");
      return false;
    }
    const id = clientId();
    const name = clipText(msg.name, "Airman", 18);
    const avatar = clipText(msg.avatar, "open-book", 40);
    this.clearHelloTimer(ws);
    writeAttachment(ws, { welcomed: true, id, role: asked, room, windowStart: Date.now(), windowCount: 1 });
    const host = this.findHost();
    if (host) {
      send(host, {
        op: "joined",
        player: { id, name, avatar, audience: asked === "audience" },
      });
    }
    send(ws, { op: "welcome", id, role: asked, room });
    return false;
  }

  private relayState(ws: WebSocket, att: Attachment, msg: Record<string, unknown>): void {
    if (att.role !== "host") return;
    const blob = JSON.stringify({ op: "state", state: msg.state ?? null });
    for (const sock of this.ctx.getWebSockets()) {
      if (sock === ws || sock.readyState !== WebSocket.OPEN) continue;
      const other = readAttachment(sock);
      if (!other?.welcomed) continue;
      try {
        sock.send(blob);
      } catch {
        /* drop a dead phone; close will notify the host */
      }
    }
  }

  private relayPriv(ws: WebSocket, att: Attachment, msg: Record<string, unknown>): void {
    if (att.role !== "host") return;
    const target = typeof msg.to === "string" ? msg.to : "";
    if (!target) return;
    for (const sock of this.ctx.getWebSockets()) {
      if (sock.readyState !== WebSocket.OPEN) continue;
      const other = readAttachment(sock);
      if (other?.welcomed && other.id === target) {
        send(sock, { op: "priv", payload: msg.payload ?? null });
        return;
      }
    }
  }

  private relayToHost(ws: WebSocket, att: Attachment, op: "act" | "meta", payload: unknown): void {
    if (!att.welcomed || att.role === "host") return;
    const host = this.findHost();
    if (!host || host === ws) return;
    send(host, { op, from: att.id, payload: payload ?? null });
  }

  private onClose(ws: WebSocket): boolean {
    const att = readAttachment(ws);
    if (!att?.welcomed) return false;
    if (att.role === "host") return !this.findHost(ws);
    const host = this.findHost();
    if (host) send(host, { op: "left", id: att.id });
    return false;
  }

  private allowMessage(ws: WebSocket, att: Attachment): boolean {
    const now = Date.now();
    let windowStart = att.windowStart;
    let windowCount = att.windowCount;
    if (!windowStart || now - windowStart >= RATE_WINDOW_MS) {
      windowStart = now;
      windowCount = 0;
    }
    windowCount += 1;
    writeAttachment(ws, { ...att, windowStart, windowCount });
    return windowCount <= RATE_MAX_MESSAGES;
  }

  private counts(except?: WebSocket): { host: number; players: number; audience: number } {
    let host = 0;
    let players = 0;
    let audience = 0;
    for (const sock of this.ctx.getWebSockets()) {
      if (sock === except || sock.readyState !== WebSocket.OPEN) continue;
      const att = readAttachment(sock);
      if (!att?.welcomed) continue;
      if (att.role === "host") host += 1;
      else if (att.role === "player") players += 1;
      else if (att.role === "audience") audience += 1;
    }
    return { host, players, audience };
  }

  private findHost(except?: WebSocket): WebSocket | null {
    for (const sock of this.ctx.getWebSockets()) {
      if (sock === except || sock.readyState !== WebSocket.OPEN) continue;
      const att = readAttachment(sock);
      if (att?.welcomed && att.role === "host") return sock;
    }
    return null;
  }

  private clearHelloTimer(ws: WebSocket): void {
    const timer = this.helloTimers.get(ws);
    if (timer) clearTimeout(timer);
    this.helloTimers.delete(ws);
  }

  private async clearHostGrace(): Promise<void> {
    await this.ctx.storage.delete("hostGrace");
    await this.ctx.storage.deleteAlarm();
  }

  private async scheduleHostGrace(): Promise<void> {
    if (this.findHost()) return;
    const token = crypto.randomUUID();
    await this.ctx.storage.put("hostGrace", token);
    if (this.findHost()) {
      await this.ctx.storage.delete("hostGrace");
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + HOST_GRACE_MS);
    if (this.findHost()) {
      await this.ctx.storage.delete("hostGrace");
      await this.ctx.storage.deleteAlarm();
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return Response.json({ ok: true, service: "pdg-party-relay" });
    }
    if (url.pathname !== "/ws") {
      return new Response("Not found", { status: 404 });
    }
    const room = roomFromUrl(url);
    if (!validRoom(room)) {
      return new Response("Need a 4-character room code.", { status: 400 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const origin = request.headers.get("Origin");
    if (!originAllowed(origin, env.ALLOWED_ORIGINS || "")) {
      return new Response("Origin not allowed", { status: 403 });
    }
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    try {
      const limit = await env.JOIN_LIMIT.limit({ key: ip });
      if (!limit.success) return new Response("Slow down.", { status: 429 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "rate limit failed";
      console.log(JSON.stringify({ event: "rate_limit_error", message }));
    }
    const stub = env.PARTY_ROOM.getByName(room);
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
