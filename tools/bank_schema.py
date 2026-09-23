"""Shared checks for MCQ, Decoy Brief, and SJT bank rows.

Host still reads `type` and `cite.para`. Decoy Brief also stamps the frozen
`kind` and `cite.paragraph` keys. This module accepts either cite key and
mirrors them so one reader can use both.
"""
from __future__ import annotations

OFF_WAPS = {2, 3, 4, 6, 10, 21, 23}
E6_ONLY = {13, 16}
KINDS = {"mcq", "decoy", "sjt"}


def kind_of(item: dict) -> str:
    return str(item.get("kind") or item.get("type") or "").strip()


def paragraph_of(cite: dict) -> str:
    if not isinstance(cite, dict):
        return ""
    return str(cite.get("paragraph") or cite.get("para") or "").strip()


def locator(para: str, title: str) -> str:
    label = title.strip() or "AFH 1"
    return f"AFH 1 (2025) para {para} — {label}."


def normalize_item(item: dict) -> dict:
    """Return a copy with kind/type aligned and cite keys mirrored."""
    out = dict(item)
    kind = kind_of(out)
    if kind:
        out["kind"] = kind
        out["type"] = kind
    cite = dict(out.get("cite") or {})
    para = paragraph_of(cite)
    if para:
        cite["para"] = para
        cite["paragraph"] = para
    if cite.get("pageHint") is not None:
        cite["pageHint"] = str(cite["pageHint"])
    elif out.get("pageHint") is not None and "pageHint" not in cite:
        cite["pageHint"] = str(out["pageHint"])
    out["cite"] = cite
    explain = str(out.get("explain") or "").strip()
    source = str(out.get("source") or "").strip()
    if explain:
        out["explain"] = explain
    if not source and para:
        title = str(cite.get("title") or cite.get("section") or "")
        source = locator(para, title)
    if source:
        out["source"] = source
    if not out.get("sourceEdition"):
        out["sourceEdition"] = "AFH1-2025"
    return out


def validate_item(item: dict, *, strict_waps: bool = True) -> list[str]:
    """Return human-readable errors. Empty list means the row is usable."""
    errors: list[str] = []
    item_id = item.get("id") or "<no id>"
    if not isinstance(item.get("id"), str) or not item["id"].strip():
        errors.append("missing id")
    kind = kind_of(item)
    if item.get("type") == "fibbage" or item.get("kind") == "fibbage":
        errors.append("fibbage free-text items are not accepted")
        return [f"{item_id}: {msg}" for msg in errors]
    if kind not in KINDS:
        errors.append(f"kind/type must be mcq, decoy, or sjt (got {kind or 'missing'})")
    if item.get("kind") and item.get("type") and item["kind"] != item["type"]:
        errors.append("kind and type disagree")
    cite = item.get("cite")
    if not isinstance(cite, dict):
        errors.append("cite must be an object")
        cite = {}
    chapter = cite.get("chapter")
    if not isinstance(chapter, int):
        errors.append("cite.chapter must be an integer")
    if not str(cite.get("section") or "").strip():
        errors.append("cite.section is required")
    para = paragraph_of(cite)
    if not para:
        errors.append("cite.paragraph or cite.para is required")
    ranks = item.get("ranks")
    if not isinstance(ranks, list) or not ranks or any(r not in ("E5", "E6") for r in ranks):
        errors.append("ranks must be a non-empty list of E5 and/or E6")
    if strict_waps and isinstance(chapter, int):
        if chapter in OFF_WAPS:
            errors.append(f"chapter {chapter} is off the 2026 WAPS list and stays empty")
        if chapter in E6_ONLY and ranks != ["E6"]:
            errors.append("chapters 13 and 16 are E-6 only")
        if chapter not in E6_ONLY and isinstance(ranks, list) and "E5" not in ranks and chapter not in OFF_WAPS:
            errors.append("E-5/E-6 chapters need E5 in ranks")
    explain = str(item.get("explain") or "").strip()
    source = str(item.get("source") or "").strip()
    if not explain:
        errors.append("explain is required")
    if not source:
        errors.append("source locator is required and must differ from explain")
    elif explain and source == explain:
        errors.append("explain must be study copy, not a copy of the source line")
    if item.get("sourceEdition") != "AFH1-2025":
        errors.append("sourceEdition must be AFH1-2025")
    if not isinstance(item.get("difficulty"), int) or not 1 <= item["difficulty"] <= 5:
        errors.append("difficulty must be an integer from 1 to 5")

    if kind == "mcq":
        choices = item.get("choices")
        if not isinstance(choices, list) or len(choices) != 4:
            errors.append("mcq needs exactly 4 choices")
        elif len({str(c).strip().casefold() for c in choices}) != 4:
            errors.append("mcq choices must be unique")
        answer = item.get("answerIndex")
        if not isinstance(answer, int) or answer < 0 or answer > 3:
            errors.append("answerIndex must be 0..3")
        if not str(item.get("question") or "").strip():
            errors.append("mcq needs a question")
    elif kind == "decoy":
        if not str(item.get("stem") or "").strip():
            errors.append("decoy needs a stem")
        truth = str(item.get("truth") or "").strip()
        decoys = item.get("decoys")
        if not truth:
            errors.append("decoy needs a truth")
        if not isinstance(decoys, list) or len(decoys) != 3:
            errors.append("decoy needs exactly 3 decoys")
        else:
            texts = [truth] + [str(d).strip() for d in decoys]
            if any(not t for t in texts) or len({t.casefold() for t in texts}) != 4:
                errors.append("truth and the three decoys must be four unique lines")
    elif kind == "sjt":
        actions = item.get("actions")
        if not isinstance(actions, list) or len(actions) != 4:
            errors.append("sjt needs exactly 4 actions")
        elif len({str(a).strip().casefold() for a in actions}) != 4:
            errors.append("sjt actions must be unique")
        most = item.get("mostIndex")
        least = item.get("leastIndex")
        if not isinstance(most, int) or most < 0 or most > 3:
            errors.append("mostIndex must be 0..3")
        if not isinstance(least, int) or least < 0 or least > 3:
            errors.append("leastIndex must be 0..3")
        if isinstance(most, int) and most == least:
            errors.append("mostIndex and leastIndex must differ")
        if not str(item.get("scenario") or "").strip():
            errors.append("sjt needs a scenario")
        if not str(item.get("competency") or "").strip():
            errors.append("sjt needs a competency")
        if str(item.get("competency") or "").strip().casefold() == "fosters inclusion":
            errors.append("Fosters Inclusion is not a competency in this bank (14E deleted)")
    return [f"{item_id}: {msg}" for msg in errors]
