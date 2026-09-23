#!/usr/bin/env python3
"""PDG Party local server. Python 3 standard library only.

Binds 0.0.0.0, preferring port 8741 and falling through 8750 if that
port is taken. Serves the web/ folder and relays WebSocket messages.
The host browser is authoritative. This process does not score rounds
or store questions.
"""
from __future__ import annotations

import ctypes
import ctypes.util
import hashlib
import json
import os
import re
import socket
import struct
import sys
import threading
import webbrowser
from base64 import b64encode

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
PORT_FIRST = 8741
PORT_LAST = 8750
# Idle rooms still need traffic or some NATs drop the TCP session.
PING_EVERY = 20
HOST_GRACE_SEC = 12
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

ROOMS: dict[str, dict] = {}
ROOMS_LOCK = threading.Lock()
SEND_LOCKS: dict[int, threading.Lock] = {}
SEND_LOCKS_GUARD = threading.Lock()
# socket.socket has no instance dict, so ownership cannot be stored on the conn.
HANDED: set[int] = set()
# Set once bind succeeds. /api/info reports this, not the preferred port.
BOUND_PORT = PORT_FIRST

# Obvious tunnel, VPN, and virtual NIC names. Real Wi-Fi and Ethernet stay.
_VPN_NAME = re.compile(
    r"(?:^|[^a-z0-9])(?:tun|tap|wg|ppp|utun|zt|vpn|cni)\d*|"
    r"tailscale|zerotier|wireguard|nordlynx|wintun|hamachi|teredo|isatap|"
    r"docker|veth|vmnet|vbox|virbr|flannel|proton|openvpn|anyconnect|"
    r"tunnel|ipsec|bluetooth|awdl|llw|hyper-?v|vethernet|virtualbox|vmware|"
    r"mullvad|warp|globalprotect|fortinet",
    re.IGNORECASE,
)
_TUNNEL_TYPES = {23, 131}  # PPP, TUNNEL
_LOOP_TYPES = {24}
_VIRTUAL_TYPES = {53}


class IdleTimeout(Exception):
    """No WebSocket bytes arrived before the keepalive interval."""


def _octets(ip: str) -> tuple[int, int, int, int] | None:
    parts = (ip or "").split(".")
    if len(parts) != 4:
        return None
    try:
        nums = tuple(int(part) for part in parts)
    except ValueError:
        return None
    if any(num < 0 or num > 255 for num in nums):
        return None
    return nums  # type: ignore[return-value]


def _ip_kind(ip: str) -> str:
    nums = _octets(ip)
    if not nums:
        return "bad"
    first, second = nums[0], nums[1]
    if first == 127 or first == 0:
        return "loop" if first == 127 else "bad"
    if first == 169 and second == 254:
        return "link"
    if first == 10:
        return "priv10"
    if first == 192 and second == 168:
        return "priv192"
    if first == 172 and 16 <= second <= 31:
        return "priv172"
    if first == 100 and 64 <= second <= 127:
        return "cgnat"
    return "global"


def _vpnish_name(name: str) -> bool:
    return bool(name) and _VPN_NAME.search(name) is not None


def score_lan_candidate(name: str, ip: str, iftype: int | None = None) -> int | None:
    """Higher is a better phone-reachable IPv4. None means unusable."""
    kind = _ip_kind(ip)
    if kind in ("bad", "loop") or iftype in _LOOP_TYPES:
        return None
    base = {
        "priv192": 300,
        "priv10": 280,
        "priv172": 260,
        "global": 120,
        "cgnat": 80,
        "link": 20,
    }[kind]
    if _vpnish_name(name) or iftype in _TUNNEL_TYPES:
        base -= 200
    elif iftype in _VIRTUAL_TYPES:
        base -= 40
    return base


def pick_lan(candidates: list[tuple[str, str, int | None]]) -> tuple[str, bool] | None:
    """Pick the best (ip, reachable) pair. VPN loses when a LAN address exists."""
    best_ip = None
    best_score = None
    best_vpn = False
    for name, ip, iftype in candidates:
        score = score_lan_candidate(name, ip, iftype)
        if score is None:
            continue
        if best_score is None or score > best_score:
            best_ip = ip
            best_score = score
            best_vpn = _vpnish_name(name) or iftype in _TUNNEL_TYPES
    if not best_ip:
        return None
    kind = _ip_kind(best_ip)
    reachable = (not best_vpn) and kind in ("priv192", "priv10", "priv172", "global")
    return best_ip, reachable


def _udp_source(target: str) -> str | None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect((target, 80))
        ip = sock.getsockname()[0]
    except OSError:
        return None
    finally:
        sock.close()
    if not ip or _ip_kind(ip) in ("bad", "loop"):
        return None
    return ip


def _unix_candidates() -> list[tuple[str, str, int | None]]:
    libc_name = ctypes.util.find_library("c")
    if not libc_name:
        return []
    libc = ctypes.CDLL(libc_name, use_errno=True)

    class IfAddrs(ctypes.Structure):
        pass

    IfAddrs._fields_ = [
        ("ifa_next", ctypes.POINTER(IfAddrs)),
        ("ifa_name", ctypes.c_char_p),
        ("ifa_flags", ctypes.c_uint),
        ("ifa_addr", ctypes.c_void_p),
        ("ifa_netmask", ctypes.c_void_p),
        ("ifa_ifu", ctypes.c_void_p),
        ("ifa_data", ctypes.c_void_p),
    ]
    getifaddrs = libc.getifaddrs
    getifaddrs.argtypes = [ctypes.POINTER(ctypes.POINTER(IfAddrs))]
    getifaddrs.restype = ctypes.c_int
    freeifaddrs = libc.freeifaddrs
    freeifaddrs.argtypes = [ctypes.POINTER(IfAddrs)]
    freeifaddrs.restype = None

    head = ctypes.POINTER(IfAddrs)()
    if getifaddrs(ctypes.byref(head)) != 0:
        return []
    found: list[tuple[str, str, int | None]] = []
    iff_up = 0x1
    iff_loopback = 0x8
    try:
        cursor = head
        while cursor:
            ifa = cursor.contents
            name = ifa.ifa_name.decode("utf-8", "replace") if ifa.ifa_name else ""
            flags = int(ifa.ifa_flags)
            addr = ifa.ifa_addr
            if addr and (flags & iff_up) and not (flags & iff_loopback):
                raw = ctypes.string_at(addr, 16)
                if sys.platform == "darwin":
                    family = raw[1]
                else:
                    family = struct.unpack_from("=H", raw, 0)[0]
                if family == socket.AF_INET:
                    ip = socket.inet_ntoa(raw[4:8])
                    found.append((name, ip, None))
            cursor = ifa.ifa_next
    finally:
        if head:
            freeifaddrs(head)
    return found


def _windows_candidates() -> list[tuple[str, str, int | None]]:
    from ctypes import wintypes

    class SockAddr(ctypes.Structure):
        _fields_ = [("sa_family", wintypes.USHORT), ("sa_data", ctypes.c_char * 14)]

    class SocketAddress(ctypes.Structure):
        _fields_ = [("lpSockaddr", ctypes.POINTER(SockAddr)), ("iSockaddrLength", wintypes.INT)]

    class Unicast(ctypes.Structure):
        pass

    Unicast._fields_ = [
        ("Length", wintypes.ULONG),
        ("Flags", wintypes.DWORD),
        ("Next", ctypes.POINTER(Unicast)),
        ("Address", SocketAddress),
        ("PrefixOrigin", ctypes.c_int),
        ("SuffixOrigin", ctypes.c_int),
        ("DadState", ctypes.c_int),
        ("ValidLifetime", wintypes.ULONG),
        ("PreferredLifetime", wintypes.ULONG),
        ("LeaseLifetime", wintypes.ULONG),
        ("OnLinkPrefixLength", ctypes.c_uint8),
    ]

    class Adapter(ctypes.Structure):
        pass

    Adapter._fields_ = [
        ("Length", wintypes.ULONG),
        ("IfIndex", wintypes.DWORD),
        ("Next", ctypes.POINTER(Adapter)),
        ("AdapterName", ctypes.c_char_p),
        ("FirstUnicastAddress", ctypes.POINTER(Unicast)),
        ("FirstAnycastAddress", ctypes.c_void_p),
        ("FirstMulticastAddress", ctypes.c_void_p),
        ("FirstDnsServerAddress", ctypes.c_void_p),
        ("DnsSuffix", ctypes.c_wchar_p),
        ("Description", ctypes.c_wchar_p),
        ("FriendlyName", ctypes.c_wchar_p),
        ("PhysicalAddress", ctypes.c_ubyte * 8),
        ("PhysicalAddressLength", wintypes.DWORD),
        ("Flags", wintypes.DWORD),
        ("Mtu", wintypes.DWORD),
        ("IfType", wintypes.DWORD),
        ("OperStatus", ctypes.c_int),
    ]

    af_inet = 2
    flags = 0x0002 | 0x0004 | 0x0008  # skip anycast, multicast, DNS
    overflow = 111
    iphlpapi = ctypes.WinDLL("iphlpapi")
    get_adapters = iphlpapi.GetAdaptersAddresses
    get_adapters.argtypes = [
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_void_p,
        ctypes.POINTER(Adapter),
        ctypes.POINTER(ctypes.c_ulong),
    ]
    get_adapters.restype = ctypes.c_ulong

    size = ctypes.c_ulong(16 * 1024)
    buf = None
    ret = overflow
    for _ in range(4):
        buf = ctypes.create_string_buffer(size.value)
        ret = get_adapters(af_inet, flags, None, ctypes.cast(buf, ctypes.POINTER(Adapter)), ctypes.byref(size))
        if ret != overflow:
            break
    if ret != 0 or buf is None:
        return []

    found: list[tuple[str, str, int | None]] = []
    cursor = ctypes.cast(buf, ctypes.POINTER(Adapter))
    while cursor:
        adapter = cursor.contents
        if adapter.FriendlyName:
            name = str(adapter.FriendlyName)
        elif adapter.AdapterName:
            name = adapter.AdapterName.decode("ascii", "replace")
        else:
            name = ""
        uni = adapter.FirstUnicastAddress
        while uni:
            entry = uni.contents
            sockaddr = entry.Address.lpSockaddr
            if sockaddr and int(sockaddr.contents.sa_family) == af_inet:
                raw = bytes(sockaddr.contents.sa_data)
                ip = socket.inet_ntoa(raw[2:6])
                found.append((name, ip, int(adapter.IfType)))
            uni = entry.Next
        cursor = adapter.Next
    return found


def _interface_candidates() -> list[tuple[str, str, int | None]]:
    if sys.platform == "win32":
        return _windows_candidates()
    return _unix_candidates()


def lan_endpoint() -> tuple[str, bool]:
    """LAN-reachable IPv4 and whether phones on the same Wi-Fi can use it."""
    candidates: list[tuple[str, str, int | None]] = []
    try:
        candidates.extend(_interface_candidates())
    except Exception:
        candidates = []
    chosen = pick_lan(candidates)
    if chosen:
        return chosen
    probed: list[tuple[str, str, int | None]] = []
    seen: set[str] = set()
    for target in ("192.168.1.1", "192.168.0.1", "10.1.1.1", "10.0.0.1", "172.16.0.1", "8.8.8.8"):
        ip = _udp_source(target)
        if ip and ip not in seen:
            seen.add(ip)
            probed.append(("", ip, None))
    chosen = pick_lan(probed)
    if chosen:
        return chosen
    try:
        host_ip = socket.gethostbyname(socket.gethostname())
    except OSError:
        host_ip = "127.0.0.1"
    chosen = pick_lan([("", host_ip, None)])
    if chosen:
        return chosen
    return "127.0.0.1", False


def lan_ip() -> str:
    return lan_endpoint()[0]


def info_payload() -> dict:
    ip, reachable = lan_endpoint()
    port = BOUND_PORT
    return {
        "ip": ip,
        "port": port,
        "join": f"http://{ip}:{port}/play",
        "reachable": reachable,
    }


def lock_for(conn: socket.socket) -> threading.Lock:
    key = id(conn)
    with SEND_LOCKS_GUARD:
        lock = SEND_LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            SEND_LOCKS[key] = lock
        return lock


def forget_conn(conn: socket.socket) -> None:
    with SEND_LOCKS_GUARD:
        SEND_LOCKS.pop(id(conn), None)


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


def _ws_frame(opcode: int, payload: bytes) -> bytes:
    n = len(payload)
    header = bytearray([0x80 | (opcode & 0x0F)])
    if n < 126:
        header.append(n)
    elif n < 65536:
        header.append(126)
        header += struct.pack(">H", n)
    else:
        header.append(127)
        header += struct.pack(">Q", n)
    return bytes(header) + payload


def ws_send(conn: socket.socket, text: str) -> None:
    frame = _ws_frame(0x1, text.encode("utf-8"))
    with lock_for(conn):
        conn.sendall(frame)


def ws_ping(conn: socket.socket) -> None:
    with lock_for(conn):
        conn.sendall(bytes([0x89, 0x00]))


def ws_pong(conn: socket.socket, payload: bytes) -> None:
    if len(payload) > 125:
        payload = payload[:125]
    with lock_for(conn):
        conn.sendall(bytes([0x8A, len(payload)]) + payload)


def ws_read(conn: socket.socket) -> tuple[int, bytes]:
    """Read one frame. Raise IdleTimeout when the socket is quiet."""
    conn.settimeout(PING_EVERY)
    try:
        try:
            first = conn.recv(2)
        except TimeoutError:
            raise IdleTimeout()
    finally:
        conn.settimeout(None)
    if not first:
        raise ConnectionError("socket closed")
    if len(first) == 1:
        first += recvn(conn, 1)
    b1, b2 = first[0], first[1]
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
        "Content-Security-Policy: default-src 'self'; connect-src 'self' ws: wss: https://*.workers.dev; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; manifest-src 'self'; worker-src 'self'",
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
            ROOMS[code] = {"code": code, "host": None, "clients": {}, "host_token": 0}
        return ROOMS[code]


def _expire_host(code: str, token: int) -> None:
    victims: list[tuple] = []
    with ROOMS_LOCK:
        room = ROOMS.get(code)
        if not room or room.get("host_token") != token or room.get("host"):
            return
        victims = list(room["clients"].items())
        room["clients"].clear()
        room.pop("host_grace", None)
    for _cid, (conn, _role) in victims:
        try:
            ws_send(conn, json.dumps({"op": "hostgone"}))
        except OSError:
            pass
        try:
            conn.close()
        except OSError:
            pass


def _schedule_host_expiry(room: dict) -> None:
    old = room.pop("host_grace", None)
    if old:
        old.cancel()
    token = int(room.get("host_token") or 0) + 1
    room["host_token"] = token
    timer = threading.Timer(HOST_GRACE_SEC, _expire_host, args=(room["code"], token))
    timer.daemon = True
    room["host_grace"] = timer
    timer.start()


def _claim_host(room: dict, client_id: str, conn: socket.socket) -> None:
    old = room.pop("host_grace", None)
    if old:
        old.cancel()
    room["host_token"] = int(room.get("host_token") or 0) + 1
    room["host"] = (client_id, conn)
    room["clients"][client_id] = (conn, "host")


def drop_client(room: dict, client_id: str) -> None:
    room["clients"].pop(client_id, None)
    host = room.get("host")
    if host and host[0] == client_id:
        room["host"] = None
        # Keep phones in the room long enough for the TV to reconnect.
        _schedule_host_expiry(room)
        return
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
                try:
                    opcode, data = ws_read(self.conn)
                except IdleTimeout:
                    try:
                        ws_ping(self.conn)
                    except OSError:
                        break
                    continue
                if opcode == 0x8:
                    break
                if opcode == 0x9:
                    try:
                        ws_pong(self.conn, data)
                    except OSError:
                        break
                    continue
                if opcode == 0xA or opcode != 0x1:
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
            forget_conn(self.conn)

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
    try:
        opcode, data = ws_read(conn)
    except IdleTimeout:
        conn.close()
        return
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
            _claim_host(room, client_id, conn)
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
    role_now = role if role == "host" else room["clients"][client_id][1]
    ws_send(conn, json.dumps({"op": "welcome", "id": client_id, "role": role_now, "room": code}))
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
        body = json.dumps(info_payload()).encode("utf-8")
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
    forget_conn(conn)


def bind_server() -> tuple[socket.socket, int]:
    """Bind 8741, then 8742–8750. Exit with a clear message if every port fails."""
    errors: list[str] = []
    for port in range(PORT_FIRST, PORT_LAST + 1):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("0.0.0.0", port))
            sock.listen(64)
            return sock, port
        except OSError as exc:
            reason = exc.strerror or str(exc)
            errors.append(f"  {port}: {reason}")
            try:
                sock.close()
            except OSError:
                pass
    print("", flush=True)
    print("  PDG PARTY could not start.", flush=True)
    print(f"  Every port from {PORT_FIRST} through {PORT_LAST} failed:", flush=True)
    for line in errors:
        print(line, flush=True)
    print("  Close the other PDG Party window, or free one of those ports, then start again.", flush=True)
    print("", flush=True)
    raise SystemExit(1)


def serve() -> None:
    global BOUND_PORT
    sock, port = bind_server()
    BOUND_PORT = port
    ip, reachable = lan_endpoint()
    host_url = f"http://127.0.0.1:{port}/"
    join_url = f"http://{ip}:{port}/play"
    print("", flush=True)
    print("  PDG PARTY", flush=True)
    print("  Unofficial study aid. Not an Air Force product.", flush=True)
    print("", flush=True)
    print(f"  Chosen port:  {port}", flush=True)
    if port != PORT_FIRST:
        print(f"  Port {PORT_FIRST} was busy. Using {port} instead.", flush=True)
    print(f"  Host screen:  {host_url}", flush=True)
    print(f"  Phones join:  {join_url}", flush=True)
    print(f"  Listening on  0.0.0.0:{port}", flush=True)
    if not reachable:
        print("  No LAN address found. Phones cannot join until this computer has a Wi-Fi or Ethernet IP.", flush=True)
    print("  Leave this window open. Ctrl+C stops the game.", flush=True)
    print("", flush=True)
    try:
        threading.Timer(0.6, lambda: webbrowser.open(host_url)).start()
    except Exception:
        pass
    try:
        while True:
            conn, addr = sock.accept()
            threading.Thread(target=client_thread, args=(conn, addr), daemon=True).start()
    except KeyboardInterrupt:
        print("\n  Shutting down.", flush=True)
    finally:
        sock.close()


if __name__ == "__main__":
    serve()
