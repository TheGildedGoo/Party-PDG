#!/usr/bin/env python3
"""Generate original SVG/PNG art and short WAV stingers. No network required."""
from __future__ import annotations

import math
import os
import random
import struct
import wave
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "web", "assets", "img")
AUD = os.path.join(ROOT, "web", "assets", "audio")
os.makedirs(IMG, exist_ok=True)
os.makedirs(AUD, exist_ok=True)

NAVY = (11, 28, 44)
AMBER = (245, 166, 35)
WHITE = (244, 247, 251)
SAGE = (143, 191, 159)
BLUE = (76, 154, 255)


def write(name: str, text: str) -> None:
    with open(os.path.join(IMG, name), "w", encoding="utf-8") as handle:
        handle.write(text)


def png(path: str, w: int, h: int, rgba) -> None:
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(rgba(x, y))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    blob = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(blob)


def ramp_svg() -> str:
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-label="Night flight line illustration">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#07141f"/><stop offset="1" stop-color="#1a3a55"/>
</linearGradient>
</defs>
<rect width="1600" height="900" fill="url(#sky)"/>
<g fill="#f5a623" opacity="0.85">
<circle cx="180" cy="120" r="2"/><circle cx="420" cy="80" r="1.5"/><circle cx="700" cy="140" r="2"/>
<circle cx="980" cy="60" r="1.4"/><circle cx="1200" cy="160" r="2"/><circle cx="1460" cy="90" r="1.6"/>
</g>
<path d="M0 640 L1600 560 L1600 900 L0 900 Z" fill="#0b1c2c"/>
<g stroke="#f5a623" stroke-width="3" fill="none" opacity="0.7">
<path d="M80 700 H1520"/><path d="M80 760 H1520"/><path d="M200 700 V820"/><path d="M520 690 V830"/><path d="M980 680 V840"/>
</g>
<g fill="#12283c" stroke="#8fbf9f" stroke-width="2">
<path d="M260 690 L430 650 L760 668 L740 710 Z"/>
<path d="M1040 700 L1280 640 L1460 690 L1400 730 Z"/>
</g>
<g fill="#f5a623">
<circle cx="300" cy="720" r="4"/><circle cx="640" cy="730" r="4"/><circle cx="1100" cy="740" r="4"/><circle cx="1420" cy="750" r="3"/>
</g>
</svg>"""


def logo_svg() -> str:
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 240" role="img" aria-label="PDG Party logo">
<rect width="640" height="240" rx="28" fill="#0b1c2c"/>
<path d="M36 48 h120 l18 18 v120 l-18 18 h-120 z" fill="none" stroke="#f5a623" stroke-width="8"/>
<path d="M48 78 h96 M48 108 h78 M48 138 h88" stroke="#f4f7fb" stroke-width="6"/>
<path d="M168 150 l28-70 28 70 h-18 l-10-28 -10 28 z" fill="#f5a623"/>
<text x="240" y="120" fill="#f4f7fb" font-family="Arial Black, Arial" font-size="78">PDG</text>
<text x="240" y="190" fill="#f5a623" font-family="Arial Black, Arial" font-size="64">PARTY</text>
</svg>"""


def favicon_svg() -> str:
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="12" fill="#0b1c2c"/>
<path d="M10 16 h28 l6 6 v28 l-6 6 h-28 z" fill="none" stroke="#f5a623" stroke-width="3"/>
<path d="M16 28 h20 M16 36 h14 M16 44 h18" stroke="#f4f7fb" stroke-width="3"/>
<path d="M46 46 l8-20 8 20 h-5 l-3-8 -3 8 z" fill="#f5a623"/>
</svg>"""


def chief(frame: str) -> str:
    mouth = {
        "idle": '<path d="M78 118 q14 6 28 0" stroke="#1a1203" stroke-width="3" fill="none"/>',
        "talk": '<ellipse cx="92" cy="120" rx="10" ry="7" fill="#1a1203"/>',
        "roast": '<path d="M74 116 q18 14 36 0" stroke="#1a1203" stroke-width="3" fill="none"/>',
        "celebrate": '<path d="M74 114 q18 16 36 0" stroke="#1a1203" stroke-width="3" fill="none"/>',
        "facepalm": '<path d="M78 122 q14 -8 28 0" stroke="#1a1203" stroke-width="3" fill="none"/>',
    }[frame]
    arm = {
        "facepalm": '<path d="M128 150 C150 120 110 90 100 108" stroke="#8fbf9f" stroke-width="10" fill="none" stroke-linecap="round"/>',
        "celebrate": '<path d="M40 150 L24 90" stroke="#8fbf9f" stroke-width="10" stroke-linecap="round"/><path d="M150 150 L170 88" stroke="#8fbf9f" stroke-width="10" stroke-linecap="round"/>',
        "roast": '<path d="M150 155 L176 130" stroke="#8fbf9f" stroke-width="10" stroke-linecap="round"/>',
        "talk": '<path d="M146 160 L168 140" stroke="#8fbf9f" stroke-width="10" stroke-linecap="round"/>',
        "idle": '<path d="M48 168 L36 200" stroke="#8fbf9f" stroke-width="10" stroke-linecap="round"/>',
    }[frame]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" role="img" aria-label="Chief Hot Wash {frame}">
<rect width="200" height="260" fill="none"/>
<ellipse cx="100" cy="214" rx="46" ry="10" fill="#000" opacity="0.35"/>
<path d="M70 150 h60 l12 58 h-84 z" fill="#16324a" stroke="#f5a623" stroke-width="3"/>
<path d="M78 168 h44 v8 h-44 z" fill="#f5a623"/>
<circle cx="100" cy="96" r="46" fill="#e6c2a0" stroke="#1a1203" stroke-width="3"/>
<path d="M58 92 q42 -58 84 0 q-10 18 -42 16 q-32 2 -42 -16 z" fill="#3d4f63"/>
<circle cx="82" cy="98" r="4" fill="#1a1203"/><circle cx="112" cy="98" r="4" fill="#1a1203"/>
<path d="M70 88 q12 -10 22 0 M108 88 q12 -10 22 0" stroke="#1a1203" stroke-width="3" fill="none"/>
{mouth}
<rect x="86" y="132" width="28" height="10" rx="2" fill="#f4f7fb"/>
{arm}
<rect x="118" y="176" width="22" height="16" rx="3" fill="#f4f7fb" stroke="#1a1203"/>
<path d="M122 184 h14" stroke="#e15a4a" stroke-width="2"/>
</svg>"""


AVATARS = {
    "chk-ride": ("#4c9aff", "M30 70 h40 l10 20 h-60 z"),
    "open-book": ("#f5a623", "M20 40 h30 l10 40 h-30 z M50 40 h30 l-10 40 h-30 z"),
    "fast-rope": ("#8fbf9f", "M50 20 v70 M40 40 h20"),
    "coffee-nco": ("#e6c2a0", "M30 40 h36 v28 h-36 z M66 48 h10 v12 h-10"),
    "regs-demon": ("#e15a4a", "M30 70 L50 24 L70 70 z"),
    "hot-wash": ("#f5a623", "M30 50 h40 v20 h-40 z"),
    "break-time": ("#4c9aff", "M28 36 h44 v36 h-44 z"),
    "last-light": ("#f4f7fb", "M50 24 a20 20 0 1 0 0.1 0"),
}


def avatar(key: str, color: str, glyph: str) -> str:
    label = key.replace("-", " ")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="{label}">
<circle cx="50" cy="50" r="48" fill="#0b1c2c" stroke="{color}" stroke-width="4"/>
<g fill="none" stroke="{color}" stroke-width="4" stroke-linejoin="round">{glyph}</g>
</svg>"""


def chapter_icon(n: int) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Chapter {n}">
<rect width="64" height="64" rx="10" fill="#12283c"/>
<path d="M14 16 h22 l6 6 v26 h-28 z" fill="none" stroke="#f5a623" stroke-width="2"/>
<text x="32" y="42" text-anchor="middle" fill="#f4f7fb" font-family="Arial" font-size="16">{n}</text>
</svg>"""


def rank_badge(n: int) -> str:
    pips = "".join(f'<circle cx="{16 + (i % 3) * 16}" cy="{28 + (i // 3) * 14}" r="4" fill="#f5a623"/>' for i in range(n))
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img" aria-label="Game token E-{n}">
<rect x="8" y="8" width="64" height="64" rx="8" fill="#0b1c2c" stroke="#f4f7fb" stroke-width="2"/>
{pips}
<text x="40" y="72" text-anchor="middle" fill="#8fbf9f" font-size="10" font-family="Arial">E-{n}</text>
</svg>"""


def stamp(word: str, color: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120">
<rect x="8" y="8" width="344" height="104" fill="none" stroke="{color}" stroke-width="8"/>
<text x="180" y="78" text-anchor="middle" fill="{color}" font-family="Arial Black, Arial" font-size="54">{word}</text>
</svg>"""


def tone(path: str, notes: list[tuple[float, float]], seconds: float, volume: float = 0.25) -> None:
    rate = 22050
    count = int(rate * seconds)
    frames = bytearray()
    for i in range(count):
        t = i / rate
        sample = 0.0
        for freq, start in notes:
            if t >= start:
                env = math.exp(-(t - start) * 3.2)
                sample += math.sin(2 * math.pi * freq * t) * env
        sample = max(-1, min(1, sample * volume))
        frames += struct.pack("<h", int(sample * 32767))
    with wave.open(path, "w") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(frames)


def noise_bed(path: str) -> None:
    rate = 22050
    rng = random.Random(7)
    count = rate * 4
    frames = bytearray()
    for i in range(count):
        env = 0.5 - 0.5 * math.cos(2 * math.pi * i / count)
        sample = (rng.random() * 2 - 1) * 0.04 * env
        sample += math.sin(2 * math.pi * 90 * i / rate) * 0.02
        frames += struct.pack("<h", int(max(-1, min(1, sample)) * 32767))
    with wave.open(path, "w") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(frames)


def main() -> None:
    write("ramp.svg", ramp_svg())
    write("logo.svg", logo_svg())
    write("favicon.svg", favicon_svg())
    for frame in ("idle", "talk", "roast", "celebrate", "facepalm"):
        write(f"chief-{frame}.svg", chief(frame))
    for key, (color, glyph) in AVATARS.items():
        write(f"avatar-{key}.svg", avatar(key, color, glyph))
    for n in range(1, 25):
        write(f"chapter-{n}.svg", chapter_icon(n))
    for n in range(1, 10):
        write(f"rank-e{n}.svg", rank_badge(n))
    write("stamp-promoted.svg", stamp("PROMOTED", "#f5a623"))
    write("stamp-retrain.svg", stamp("RETRAIN", "#e15a4a"))

    def icon_px(size: int):
        def rgba(x, y):
            cx = cy = size / 2
            dx = x - cx
            dy = y - cy
            if abs(dx) < size * 0.28 and abs(dy) < size * 0.34:
                return (245, 166, 35, 255)
            if (dx * dx + dy * dy) < (size * 0.46) ** 2:
                return (11, 28, 44, 255)
            return (0, 0, 0, 0)
        return rgba

    png(os.path.join(IMG, "icon-192.png"), 192, 192, icon_px(192))
    png(os.path.join(IMG, "icon-512.png"), 512, 512, icon_px(512))
    png(os.path.join(IMG, "logo.png"), 640, 240, lambda x, y: (11, 28, 44, 255) if y > 40 else (245, 166, 35, 255))

    tone(os.path.join(AUD, "correct.wav"), [(523, 0), (659, 0.08), (784, 0.16)], 0.55)
    tone(os.path.join(AUD, "wrong.wav"), [(196, 0), (155, 0.12)], 0.45, 0.28)
    tone(os.path.join(AUD, "tick.wav"), [(880, 0)], 0.09, 0.2)
    tone(os.path.join(AUD, "join.wav"), [(440, 0), (660, 0.07)], 0.28)
    tone(os.path.join(AUD, "reveal.wav"), [(110, 0), (164, 0.05), (220, 0.12)], 0.7, 0.3)
    tone(os.path.join(AUD, "fanfare.wav"), [(523, 0), (659, 0.12), (784, 0.24), (1046, 0.36)], 0.9)
    tone(os.path.join(AUD, "roast.wav"), [(700, 0), (500, 0.08), (320, 0.16)], 0.4, 0.22)
    noise_bed(os.path.join(AUD, "bed.wav"))
    print("assets ok", IMG)


if __name__ == "__main__":
    main()
