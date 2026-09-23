#!/usr/bin/env python3
"""PDG Party local server. Python 3 standard library only.

Binds 0.0.0.0:8741, serves the web/ folder, and relays WebSocket
messages. The host browser is authoritative. This process does not
score rounds or store questions.
"""
from __future__ import annotations

import hashlib
import json
import os
import socket
import struct
import threading
import webbrowser
from base64 import b64encode

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
PORT = 8741
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

ROOMS: dict[str, dict] = {}
ROOMS_LOCK = threading.Lock()
# socket.socket has no instance dict, so ownership cannot be stored on the conn.
HANDED: set[int] = set()


def lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        sock.close()


def recvn(conn: socket.socket, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = conn.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("socket closed")
        buf += chunk
    return buf


def read_http_head(conn: socket.socket) -> tuple[str, dict[str, str], bytes]:
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(4096)
        if not chunk:
            raise ConnectionError("closed before headers")
        data += chunk
        if len(data) > 65536:
            raise ConnectionError("headers too large")
    head, rest = data.split(b"\r\n\r\n", 1)
    lines = head.decode("iso-8859-1", "replace").split("\r\n")
    request = lines[0]
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.strip().lower()] = value.strip()
    return request, headers, rest


def ws_send(conn: socket.socket, text: str) -> None:
    payload = text.encode("utf-8")
    n = len(payload)
    header = bytearray([0x81])
    if n < 126:
        header.append(n)
    elif n < 65536:
        header.append(126)
        header += struct.pack(">H", n)
    else:
        header.append(127)
        header += struct.pack(">Q", n)
    conn.sendall(bytes(header) + payload)


def ws_read(conn: socket.socket) -> tuple[int, bytes]:
    b1, b2 = recvn(conn, 2)
    opcode = b1 & 0x0F
    masked = (b2 & 0x80) != 0
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack(">H", recvn(conn, 2))[0]
    elif length == 127:
        length = struct.unpack(">Q", recvn(conn, 8))[0]
    if length > 1_000_000:
        raise ConnectionError("frame too large")
    mask = recvn(conn, 4) if masked else b""
    data = recvn(conn, length) if length else b""
    if masked:
        data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    return opcode, data


def send_http(conn: socket.socket, status: int, body: bytes, content_type: str, extra: dict | None = None) -> None:
    reason = {200: "OK", 301: "Moved", 304: "Not Modified", 404: "Not Found", 400: "Bad Request", 426: "Upgrade Required"}.get(status, "OK")
    headers = [
        f"HTTP/1.1 {status} {reason}",
        f"Content-Type: {content_type}",
        f"Content-Length: {len(body)}",
        "Cache-Control: no-cache",
        "X-Content-Type-Options: nosniff",
        "Content-Security-Policy: default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; manifest-src 'self'; worker-src 'self'",
        "Connection: close",
    ]
    for key, value in (extra or {}).items():
        headers.append(f"{key}: {value}")
    conn.sendall(("\r\n".join(headers) + "\r\n\r\n").encode("ascii") + body)


MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".ico": "image/x-icon",
}


def resolve_path(url_path: str) -> str | None:
    path = url_path.split("?", 1)[0]
    if path in ("/", "/index.html"):
        rel = "index.html"
    elif path in ("/play", "/play/", "/play.html"):
        rel = "play.html"
    else:
        rel = path.lstrip("/")
    rel = os.path.normpath(rel)
    if rel.startswith("..") or rel.startswith("/"):
        return None
    full = os.path.join(WEB, rel)
    if not os.path.isfile(full):
        return None
    web_root = os.path.realpath(WEB)
    if not os.path.realpath(full).startswith(web_root + os.sep) and os.path.realpath(full) != web_root:
        return None
    return full


def room_of(code: str) -> dict | None:
    code = (code or "").strip().upper()
    with ROOMS_LOCK:
        return ROOMS.get(code)


def ensure_room(code: str) -> dict:
    code = code.strip().upper()
    with ROOMS_LOCK:
        if code not in ROOMS:
            ROOMS[code] = {"code": code, "host": None, "clients": {}}
        return ROOMS[code]


def drop_client(room: dict, client_id: str) -> None:
    client = room["clients"].pop(client_id, None)
    if room.get("host") and room["host"][0] == client_id:
        room["host"] = None
        dead = list(room["clients"].items())
        room["clients"].clear()
        for _cid, (_conn, _role) in dead:
            try:
                ws_send(_conn, json.dumps({"op": "hostgone"}))
            except OSError:
                pass
        return
    host = room.get("host")
    if host:
        try:
            ws_send(host[1], json.dumps({"op": "left", "id": client_id}))
        except OSError:
            pass


class ClientThread(threading.Thread):
    def __init__(self, conn: socket.socket, room_code: str, client_id: str):
        super().__init__(daemon=True)
        self.conn = conn
        self.room_code = room_code
        self.client_id = client_id

    def run(self) -> None:
        try:
            while True:
                opcode, data = ws_read(self.conn)
                if opcode == 0x8:
                    break
                if opcode == 0x9:
                    # pong
                    try:
                        payload = data
                        header = bytearray([0x8A, len(payload)])
                        self.conn.sendall(bytes(header) + payload)
                    except OSError:
                        break
                    continue
                if opcode != 0x1:
                    continue
                self.handle(data.decode("utf-8", "replace"))
        except ConnectionError:
            pass
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            print(f"  ws closed {self.room_code} {self.client_id}: {type(exc).__name__}: {exc}", flush=True)
        finally:
            room = room_of(self.room_code)
            if room:
                with ROOMS_LOCK:
                    drop_client(room, self.client_id)
            try:
                self.conn.close()
            except OSError:
                pass

    def handle(self, raw: str) -> None:
        msg = json.loads(raw)
        op = msg.get("op")
        room = room_of(self.room_code)
        if not room:
            return
        if op == "state":
            host = room.get("host")
            if not host or host[0] != self.client_id:
                return
            blob = json.dumps({"op": "state", "state": msg.get("state")})
            for cid, (conn, _role) in list(room["clients"].items()):
                if cid == self.client_id:
                    continue
                try:
                    ws_send(conn, blob)
                except OSError:
                    pass
        elif op == "priv":
            host = room.get("host")
            if not host or host[0] != self.client_id:
                return
            target = str(msg.get("to") or "")
            entry = room["clients"].get(target)
            if not entry:
                return
            try:
                ws_send(entry[0], json.dumps({"op": "priv", "payload": msg.get("payload")}))
            except OSError:
                pass
        elif op == "act":
            host = room.get("host")
            if not host:
                return
            try:
                ws_send(host[1], json.dumps({"op": "act", "from": self.client_id, "payload": msg.get("payload")}))
            except OSError:
                pass
        elif op == "meta":
            # player updates name/avatar after join
            host = room.get("host")
            if not host:
                return
            try:
                ws_send(host[1], json.dumps({"op": "meta", "from": self.client_id, "payload": msg.get("payload")}))
            except OSError:
                pass


def accept_ws(conn: socket.socket, headers: dict[str, str], first_path: str) -> None:
    key = headers.get("sec-websocket-key")
    if not key:
        send_http(conn, 400, b"missing websocket key", "text/plain")
        conn.close()
        return
    accept = b64encode(hashlib.sha1((key + WS_GUID).encode("ascii")).digest()).decode("ascii")
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n"
        "\r\n"
    )
    conn.sendall(response.encode("ascii"))
    # The first client message declares role and room.
    opcode, data = ws_read(conn)
    if opcode != 0x1:
        conn.close()
        return
    hello = json.loads(data.decode("utf-8", "replace"))
    role = hello.get("role")
    code = str(hello.get("room") or "").strip().upper()
    if role not in ("host", "player", "audience") or len(code) < 4:
        ws_send(conn, json.dumps({"op": "err", "msg": "Need a role and a 4-character room code."}))
        conn.close()
        return
    code = code[:4]
    room = ensure_room(code)
    client_id = os.urandom(4).hex()
    with ROOMS_LOCK:
        if role == "host":
            if room["host"] is not None:
                ws_send(conn, json.dumps({"op": "err", "msg": "That room already has a host."}))
                conn.close()
                return
            room["host"] = (client_id, conn)
            room["clients"][client_id] = (conn, "host")
        else:
            if room["host"] is None:
                ws_send(conn, json.dumps({"op": "err", "msg": "No host is waiting on that code."}))
                conn.close()
                return
            active = sum(1 for _cid, (_c, r) in room["clients"].items() if r == "player")
            asked = "audience" if role == "audience" or hello.get("audience") else "player"
            if asked == "player" and active >= 8:
                asked = "audience"
            room["clients"][client_id] = (conn, asked)
            host_conn = room["host"][1]
            try:
                ws_send(host_conn, json.dumps({
                    "op": "joined",
                    "player": {
                        "id": client_id,
                        "name": str(hello.get("name") or "Airman")[:18],
                        "avatar": str(hello.get("avatar") or "open-book")[:40],
                        "audience": asked == "audience",
                    },
                }))
            except OSError:
                pass
    ws_send(conn, json.dumps({"op": "welcome", "id": client_id, "role": role if role == "host" else room["clients"][client_id][1], "room": code}))
    print(f"  joined {code} as {role} id={client_id}", flush=True)
    HANDED.add(id(conn))
    ClientThread(conn, code, client_id).start()


def handle_http(conn: socket.socket, request: str) -> None:
    parts = request.split(" ")
    if len(parts) < 2:
        send_http(conn, 400, b"bad request", "text/plain")
        return
    method, path = parts[0], parts[1]
    if method != "GET":
        send_http(conn, 400, b"GET only", "text/plain")
        return
    clean = path.split("?", 1)[0]
    if clean == "/api/info":
        ip = lan_ip()
        body = json.dumps({"ip": ip, "port": PORT, "join": f"http://{ip}:{PORT}/play"}).encode("utf-8")
        send_http(conn, 200, body, "application/json; charset=utf-8")
        return
    full = resolve_path(clean)
    if not full:
        send_http(conn, 404, b"Not found", "text/plain")
        return
    ext = os.path.splitext(full)[1].lower()
    ctype = MIME.get(ext, "application/octet-stream")
    with open(full, "rb") as handle:
        body = handle.read()
    send_http(conn, 200, body, ctype)


def client_thread(conn: socket.socket, _addr) -> None:
    try:
        request, headers, _rest = read_http_head(conn)
        path = request.split(" ")[1].split("?", 1)[0] if " " in request else "/"
        upgrade = headers.get("upgrade", "").lower()
        if path == "/ws" and upgrade == "websocket":
            accept_ws(conn, headers, path)
            if id(conn) in HANDED:
                return
        else:
            handle_http(conn, request)
    except Exception:
        try:
            send_http(conn, 400, b"request failed", "text/plain")
        except OSError:
            pass
    try:
        conn.close()
    except OSError:
        pass


def serve() -> None:
    ip = lan_ip()
    host_url = f"http://127.0.0.1:{PORT}/"
    join_url = f"http://{ip}:{PORT}/play"
    print("")
    print("  PDG PARTY")
    print("  Unofficial study aid. Not an Air Force product.")
    print("")
    print(f"  Host screen:  {host_url}")
    print(f"  Phones join:  {join_url}")
    print(f"  Listening on 0.0.0.0:{PORT}")
    print("  Leave this window open. Ctrl+C stops the game.")
    print("")
    try:
        threading.Timer(0.6, lambda: webbrowser.open(host_url)).start()
    except Exception:
        pass
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", PORT))
    sock.listen(64)
    try:
        while True:
            conn, addr = sock.accept()
            threading.Thread(target=client_thread, args=(conn, addr), daemon=True).start()
    except KeyboardInterrupt:
        print("\n  Shutting down.")
    finally:
        sock.close()


if __name__ == "__main__":
    serve()
