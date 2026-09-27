#!/usr/bin/env python3
"""Write web/data/bank.mcq.json for the Pocket PDG device API.

Reads the shipped questions.json and chapters.json. MCQ only.
Decoy and SJT rows are left out. Safe to run after build_bank.py
or import_questions.py.
"""
from __future__ import annotations

import json
import os
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "web", "data")


def waps_label(flag: str) -> str:
    value = str(flag or "").lower()
    if value in ("both", "e5+e6"):
        return "E5+E6"
    if value == "e6":
        return "E6"
    return "off"


def compact_item(item: dict) -> dict | None:
    kind = item.get("kind") or item.get("type")
    if kind != "mcq":
        return None
    cite = item.get("cite") or {}
    para = cite.get("para") or cite.get("paragraph") or ""
    choices = item.get("choices") or []
    if not item.get("id") or not item.get("question") or len(choices) != 4 or not para:
        return None
    if cite.get("chapter") is None or not cite.get("section"):
        return None
    answer = item.get("answerIndex")
    if not isinstance(answer, int) or answer < 0 or answer > 3:
        return None
    packed = {
        "id": str(item["id"]),
        "kind": "mcq",
        "question": str(item["question"]),
        "choices": [str(choice) for choice in choices],
        "answerIndex": answer,
        "difficulty": int(item.get("difficulty") or 1),
        "ranks": [str(rank) for rank in (item.get("ranks") or [])],
        "cite": {
            "chapter": int(cite["chapter"]),
            "section": str(cite["section"]),
            "para": str(para),
        },
        "explain": str(item.get("explain") or ""),
        "source": str(item.get("source") or ""),
    }
    if cite.get("title"):
        packed["cite"]["title"] = str(cite["title"])
    return packed


def emit(questions: list | None = None, chapters: list | None = None) -> str:
    if questions is None:
        with open(os.path.join(DATA, "questions.json"), encoding="utf-8") as handle:
            questions = json.load(handle)
    if chapters is None:
        with open(os.path.join(DATA, "chapters.json"), encoding="utf-8") as handle:
            chapters = json.load(handle)
    items = []
    for raw in questions:
        packed = compact_item(raw)
        if packed:
            items.append(packed)
    payload = {
        "edition": "AFH1-2025",
        "generatedAt": int(time.time()),
        "chapters": [
            {
                "number": int(chapter["chapter"]),
                "title": chapter["title"],
                "waps": waps_label(chapter.get("waps")),
            }
            for chapter in chapters
        ],
        "items": items,
    }
    path = os.path.join(DATA, "bank.mcq.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    return path


if __name__ == "__main__":
    written = emit()
    with open(written, encoding="utf-8") as handle:
        count = len(json.load(handle)["items"])
    print(f"wrote {written} ({count} mcq)")
