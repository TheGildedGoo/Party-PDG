"""Aggregate the original AFH 1 bank.

Python modules in tools/items/ carry hand-checked items (including the demo
seed). tools/bank_src/*.txt is the wider original bank, one record per line,
fields separated by §. Duplicate prompts are dropped so the demo wording wins.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from items.fib import FIB as FIB_PY  # noqa: E402
from items.q_a import MCQ as MCQ_A  # noqa: E402
from items.q_b import MCQ as MCQ_B  # noqa: E402
from items.q_c import MCQ as MCQ_C  # noqa: E402
from items.q_d import MCQ as MCQ_D  # noqa: E402

SRC = os.path.join(HERE, "bank_src")


def _key(text: str) -> str:
    return " ".join(str(text).split()).casefold()


def _rows(name: str) -> list[list[str]]:
    path = os.path.join(SRC, name)
    rows = []
    if not os.path.isfile(path):
        return rows
    with open(path, encoding="utf-8") as handle:
        for lineno, line in enumerate(handle, start=1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("§")
            rows.append(parts)
            parts.append(str(lineno))  # type: ignore[attr-defined]
    return rows


def _mcq_from_src() -> list[dict]:
    items = []
    for parts in _rows("mcq.txt"):
        # ch sec para title page ranks diff question correct w1 w2 w3 explain tags?
        if len(parts) < 14:
            raise SystemExit(f"mcq.txt line {parts[-1] if parts else '?'} has {len(parts)} fields")
        tags = parts[13] if len(parts) > 14 else parts[13]
        # lineno was appended, so tags is parts[13] and lineno is last when tags exist
        # layout: 0..12 fixed, 13 tags, 14 lineno
        if len(parts) < 15:
            raise SystemExit("mcq.txt row missing tags or lineno")
        items.append({
            "ch": int(parts[0]),
            "sec": parts[1],
            "para": parts[2],
            "title": parts[3],
            "page": int(parts[4]),
            "ranks": parts[5],
            "diff": int(parts[6]),
            "question": parts[7],
            "correct": parts[8],
            "w1": parts[9],
            "w2": parts[10],
            "w3": parts[11],
            "explain": parts[12],
            "tags": parts[13],
        })
    return items


def _fib_from_src() -> list[dict]:
    items = []
    for parts in _rows("fib.txt"):
        # ch sec para title page ranks diff prompt answer l1 l2 l3 explain lineno
        if len(parts) < 14:
            raise SystemExit(f"fib.txt short row ({len(parts)} fields)")
        items.append({
            "ch": int(parts[0]),
            "sec": parts[1],
            "para": parts[2],
            "title": parts[3],
            "page": int(parts[4]),
            "ranks": parts[5],
            "diff": int(parts[6]),
            "prompt": parts[7],
            "answer": parts[8],
            "l1": parts[9],
            "l2": parts[10],
            "l3": parts[11],
            "explain": parts[12],
        })
    return items


def _sjt_from_src() -> list[dict]:
    items = []
    for parts in _rows("sjt.txt"):
        # competency category diff scenario most least mid1 mid2 explain ch sec para title page lineno
        if len(parts) < 15:
            raise SystemExit(f"sjt.txt short row ({len(parts)} fields)")
        items.append({
            "competency": parts[0],
            "category": parts[1],
            "diff": int(parts[2]),
            "scenario": parts[3],
            "most": parts[4],
            "least": parts[5],
            "mid1": parts[6],
            "mid2": parts[7],
            "explain": parts[8],
            "ch": int(parts[9]),
            "sec": parts[10],
            "para": parts[11],
            "title": parts[12],
            "page": int(parts[13]),
        })
    return items


def _merge(primary: list[dict], extra: list[dict], field: str) -> list[dict]:
    seen = set()
    out = []
    for row in list(primary) + list(extra):
        key = _key(row[field])
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


MCQ = _merge(list(MCQ_A) + list(MCQ_B) + list(MCQ_C) + list(MCQ_D), _mcq_from_src(), "question")
FIB = _merge(list(FIB_PY), _fib_from_src(), "prompt")
SJT = _merge([], _sjt_from_src(), "scenario")
