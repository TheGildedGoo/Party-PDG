#!/usr/bin/env python3
"""Merge a JSON question file into the bank by id and rebuild bundle.js.

Does not change game code. A future catalog year is a new JSON file.

Usage:
  python3 tools/import_questions.py path/to/items.json

items.json is a list of objects, or an object with an `items` or `questions`
list. Each row needs an id and a kind or type of mcq, decoy, or sjt.

  mcq or decoy -> web/data/questions.json
  sjt          -> web/data/sjt.json

Free-text fibbage rows are rejected. Matching ids are replaced. New ids are
appended. Bad rows reject the whole file, so a partial bank is not written.
Then bundle.js and web/data/COUNTS.md are refreshed.
"""
from __future__ import annotations

import json
import os
import sys

from bank_schema import normalize_item, validate_item
from build_bank import write_counts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "web", "data")


def load(name: str):
    with open(os.path.join(DATA, name), encoding="utf-8") as handle:
        return json.load(handle)


def save(name: str, payload) -> None:
    with open(os.path.join(DATA, name), "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def kind_of(item: dict) -> str:
    return str(item.get("kind") or item.get("type") or "").strip()


def prepare(incoming: list) -> list[dict]:
    errors = []
    seen = set()
    prepared = []
    if not incoming:
        raise SystemExit("No items to import.")
    for index, raw in enumerate(incoming, start=1):
        if not isinstance(raw, dict):
            errors.append(f"row {index}: expected an object")
            continue
        if raw.get("type") == "fibbage" or raw.get("kind") == "fibbage":
            errors.append(f"{raw.get('id', 'row ' + str(index))}: fibbage free-text items are not accepted")
            continue
        item = normalize_item(raw)
        item_id = item.get("id")
        if isinstance(item_id, str) and item_id in seen:
            errors.append(f"{item_id}: duplicate id in the import file")
        if isinstance(item_id, str):
            seen.add(item_id)
        row_errors = validate_item(item)
        if row_errors:
            errors.extend(row_errors)
            continue
        prepared.append(item)
    if errors:
        preview = "\n".join(errors[:40])
        extra = "" if len(errors) <= 40 else f"\n... {len(errors) - 40} more"
        raise SystemExit(f"Import rejected {len(errors)} problem(s). No files were changed.\n{preview}{extra}")
    return prepared


def merge(existing: list, incoming: list) -> tuple[list, int, int]:
    by_id = {}
    order = []
    for item in existing:
        if "id" not in item:
            raise SystemExit("Existing bank row is missing an id.")
        by_id[item["id"]] = item
        order.append(item["id"])
    replaced = 0
    added = 0
    for item in incoming:
        if item["id"] in by_id:
            replaced += 1
        else:
            added += 1
            order.append(item["id"])
        by_id[item["id"]] = item
    return [by_id[i] for i in order], replaced, added


def write_bundle(questions: list, sjt: list) -> None:
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


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 tools/import_questions.py items.json")
    with open(sys.argv[1], encoding="utf-8") as handle:
        incoming = json.load(handle)
    if isinstance(incoming, dict):
        incoming = incoming.get("items") or incoming.get("questions") or []
    if not isinstance(incoming, list):
        raise SystemExit("Expected a JSON list of questions.")

    prepared = prepare(incoming)
    questions = load("questions.json")
    sjt = load("sjt.json")
    q_in = [item for item in prepared if kind_of(item) in ("mcq", "decoy")]
    s_in = [item for item in prepared if kind_of(item) == "sjt"]
    unknown = [item.get("id") for item in prepared if kind_of(item) not in ("mcq", "decoy", "sjt")]
    if unknown:
        raise SystemExit("Unknown kind on: " + ", ".join(str(i) for i in unknown))

    questions, q_rep, q_add = merge(questions, q_in)
    sjt, s_rep, s_add = merge(sjt, s_in)
    # Re-check the rows we just merged so a bad join cannot land in the file.
    joined_errors = []
    for item in q_in + s_in:
        joined_errors.extend(validate_item(item))
    if joined_errors:
        raise SystemExit("Import rejected after merge checks. No files were changed.\n" + "\n".join(joined_errors[:40]))

    save("questions.json", questions)
    save("sjt.json", sjt)
    write_bundle(questions, sjt)
    report = write_counts(questions, sjt)
    print(f"questions replaced {q_rep}, added {q_add}; sjt replaced {s_rep}, added {s_add}")
    print(report)
    print("bundle.js and COUNTS.md updated. Restart the launcher if it is already open.")


if __name__ == "__main__":
    main()
