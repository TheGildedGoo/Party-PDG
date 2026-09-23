#!/usr/bin/env python3
"""Merge a JSON question file into the bank by id and rebuild bundle.js.

Does not change game code. A future catalog year is a new JSON file.

Usage:
  python3 tools/import_questions.py path/to/items.json

items.json is a list of objects. Each needs an id and a type:
  mcq or fibbage  -> web/data/questions.json
  sjt             -> web/data/sjt.json

Matching ids are replaced. New ids are appended. Then bundle.js is rewritten
from questions.json, sjt.json, lines.json, and chapters.json.
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "web", "data")


def load(name: str):
    with open(os.path.join(DATA, name), encoding="utf-8") as handle:
        return json.load(handle)


def save(name: str, payload) -> None:
    with open(os.path.join(DATA, name), "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def merge(existing: list, incoming: list) -> tuple[list, int, int]:
    by_id = {item["id"]: item for item in existing}
    replaced = 0
    added = 0
    order = [item["id"] for item in existing]
    for item in incoming:
        if "id" not in item or "type" not in item:
            raise SystemExit("Every item needs an id and a type.")
        if item["id"] in by_id:
            replaced += 1
        else:
            added += 1
            order.append(item["id"])
        by_id[item["id"]] = item
    return [by_id[i] for i in order], replaced, added


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 tools/import_questions.py items.json")
    with open(sys.argv[1], encoding="utf-8") as handle:
        incoming = json.load(handle)
    if isinstance(incoming, dict):
        incoming = incoming.get("items") or incoming.get("questions") or []
    if not isinstance(incoming, list):
        raise SystemExit("Expected a JSON list of questions.")

    questions = load("questions.json")
    sjt = load("sjt.json")
    q_in = [item for item in incoming if item.get("type") in ("mcq", "fibbage")]
    s_in = [item for item in incoming if item.get("type") == "sjt"]
    unknown = [item.get("id") for item in incoming if item.get("type") not in ("mcq", "fibbage", "sjt")]
    if unknown:
        raise SystemExit("Unknown type on: " + ", ".join(str(i) for i in unknown))

    questions, q_rep, q_add = merge(questions, q_in)
    sjt, s_rep, s_add = merge(sjt, s_in)
    save("questions.json", questions)
    save("sjt.json", sjt)

    bundle = {
        "questions": questions,
        "sjt": sjt,
        "lines": load("lines.json"),
        "chapters": load("chapters.json"),
    }
    with open(os.path.join(DATA, "bundle.js"), "w", encoding="utf-8") as handle:
        handle.write("window.PDG_BUNDLE = ")
        json.dump(bundle, handle, ensure_ascii=False)
        handle.write(";\n")
    print(f"questions replaced {q_rep}, added {q_add}; sjt replaced {s_rep}, added {s_add}")
    print("bundle.js updated. Restart the launcher if it is already open.")


if __name__ == "__main__":
    main()
