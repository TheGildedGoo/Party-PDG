#!/usr/bin/env python3
"""Build questions.json, sjt.json, lines.json, chapters.json, demo.json, and bundle.js.

Questions are original to this project. Facts are taken from the public
AFH 1 (15 February 2025) text and the 2026 WAPS chapter lists. Commercial
bank wording is not used.
"""
from __future__ import annotations

import json
import os
import random
import re
from collections import Counter

from bank_schema import locator, validate_item

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "web", "data")
SRC = os.path.join(ROOT, "tools", "bank_src")
os.makedirs(DATA, exist_ok=True)

CHAPTERS = [
    {"chapter": 1, "title": "Professionalism", "page": 18, "waps": "both", "sections": ["1A", "1B", "1C", "1D"]},
    {"chapter": 2, "title": "Aviation History", "page": 27, "waps": "off", "sections": ["2A", "2B", "2C", "2D"]},
    {"chapter": 3, "title": "USAF Heritage", "page": 48, "waps": "off", "sections": ["3A", "3B", "3C"]},
    {"chapter": 4, "title": "Air and Cyberpower", "page": 74, "waps": "off", "sections": ["4A", "4B", "4C"]},
    {"chapter": 5, "title": "Military Organization and Command", "page": 89, "waps": "both", "sections": ["5A", "5B", "5C", "5D", "5E"]},
    {"chapter": 6, "title": "Doctrine and Joint Force", "page": 109, "waps": "off", "sections": ["6A", "6B", "6C"]},
    {"chapter": 7, "title": "Enlisted Force Development", "page": 125, "waps": "both", "sections": ["7A", "7B", "7C", "7D", "7E", "7F", "7G", "7H"]},
    {"chapter": 8, "title": "Assessments and Recognition", "page": 152, "waps": "both", "sections": ["8A", "8B", "8C", "8D"]},
    {"chapter": 9, "title": "Enlisted Promotions", "page": 171, "waps": "both", "sections": ["9A", "9B", "9C", "9D", "9E"]},
    {"chapter": 10, "title": "Assignments and Occupational Codes", "page": 181, "waps": "off", "sections": ["10A", "10B", "10C"]},
    {"chapter": 11, "title": "Personnel Programs and Benefits", "page": 202, "waps": "both", "sections": ["11A", "11B", "11C", "11D"]},
    {"chapter": 12, "title": "Finance, Manpower, and Resources", "page": 225, "waps": "both", "sections": ["12A", "12B", "12C", "12D", "12E"]},
    {"chapter": 13, "title": "Developing Organizations", "page": 246, "waps": "e6", "sections": ["13A", "13B", "13C"]},
    {"chapter": 14, "title": "Developing Others", "page": 260, "waps": "both", "sections": ["14A", "14B", "14C", "14D"]},
    {"chapter": 15, "title": "Developing Self", "page": 279, "waps": "both", "sections": ["15A", "15B", "15C", "15D", "15E", "15F"]},
    {"chapter": 16, "title": "Developing Ideas", "page": 304, "waps": "e6", "sections": ["16A", "16B", "16C", "16D"]},
    {"chapter": 17, "title": "Emergency Management", "page": 321, "waps": "both", "sections": ["17A", "17B", "17C", "17D", "17E", "17F"]},
    {"chapter": 18, "title": "Security", "page": 342, "waps": "both", "sections": ["18A", "18B", "18C", "18D", "18E"]},
    {"chapter": 19, "title": "Standards of Conduct", "page": 362, "waps": "both", "sections": ["19A", "19B", "19C"]},
    {"chapter": 20, "title": "Enforcing Military Standards", "page": 377, "waps": "both", "sections": ["20A", "20B", "20C", "20D"]},
    {"chapter": 21, "title": "Military Justice", "page": 399, "waps": "off", "sections": ["21A", "21B", "21C", "21D"]},
    {"chapter": 22, "title": "Fitness and Readiness", "page": 414, "waps": "both", "sections": ["22A", "22B", "22C", "22D", "22E"]},
    {"chapter": 23, "title": "Dress and Appearance", "page": 440, "waps": "off", "sections": ["23A", "23B"]},
    {"chapter": 24, "title": "Military Customs and Courtesies", "page": 543, "waps": "both", "sections": ["24A", "24B", "24C", "24D", "24E", "24F"]},
]


def ranks_for(flag: str, chapter: int) -> list[str]:
    if flag == "e6" or chapter in (13, 16):
        return ["E6"]
    if flag == "off":
        return []
    return ["E5", "E6"]


def pack_mcq(raw: dict, number: int) -> dict:
    choices = [raw["correct"], raw["w1"], raw["w2"], raw["w3"]]
    if len(set(choices)) != 4:
        raise SystemExit(f"duplicate choices in {raw['question'][:80]}")
    rng = random.Random(f"{raw['ch']}-{raw['para']}-{number}-{raw['question']}")
    order = [0, 1, 2, 3]
    rng.shuffle(order)
    shuffled = [choices[i] for i in order]
    answer = shuffled.index(raw["correct"])
    chapter = int(raw["ch"])
    flag = raw.get("ranks") or ("e6" if chapter in (13, 16) else "both")
    para = str(raw["para"])
    slug = re.sub(r"[^0-9A-Za-z]+", "", para)[:12]
    explain = raw["explain"].strip()
    supplied = (raw.get("source") or "").strip()
    if supplied and supplied == explain:
        raise SystemExit("explain duplicates source: " + raw["question"][:80])
    source = supplied or locator(para, raw["title"])
    page = int(raw["page"])
    return {
        "id": f"q-{chapter:02d}-{slug}-{number:02d}",
        "kind": "mcq",
        "type": "mcq",
        "question": raw["question"].strip(),
        "choices": shuffled,
        "answerIndex": answer,
        "explain": explain,
        "source": source,
        "cite": {
            "chapter": chapter,
            "section": raw["sec"],
            "para": para,
            "paragraph": para,
            "title": raw["title"],
            "pageHint": str(page),
        },
        "pageHint": page,
        "ranks": ranks_for(flag, chapter),
        "difficulty": int(raw["diff"]),
        "tags": [t.strip() for t in raw.get("tags", "waps").split(",") if t.strip()],
        "sourceEdition": "AFH1-2025",
        "demo": bool(raw.get("demo")),
    }


def pack_decoy(raw: dict, number: int) -> dict:
    chapter = int(raw["ch"])
    flag = raw.get("ranks") or ("e6" if chapter in (13, 16) else "both")
    para = str(raw.get("para") or raw.get("paragraph"))
    decoys = [str(raw["decoys"][0]).strip(), str(raw["decoys"][1]).strip(), str(raw["decoys"][2]).strip()]
    truth = raw["truth"].strip()
    explain = raw["explain"].strip()
    supplied = (raw.get("source") or "").strip()
    if not supplied or supplied == explain:
        raise SystemExit("decoy explain must differ from source: " + raw["stem"][:80])
    page = raw.get("page", raw.get("pageHint"))
    page_text = str(page)
    return {
        "id": f"decoy-ch{chapter:02d}-{number:03d}",
        "kind": "decoy",
        "type": "decoy",
        "stem": raw["stem"].strip(),
        "question": raw["stem"].strip(),
        "truth": truth,
        "decoys": decoys,
        "explain": explain,
        "source": supplied,
        "cite": {
            "chapter": chapter,
            "section": raw["sec"],
            "paragraph": para,
            "para": para,
            "title": raw["title"],
            "pageHint": page_text,
        },
        "pageHint": int(page) if str(page).isdigit() else page_text,
        "ranks": ranks_for(flag, chapter),
        "difficulty": int(raw["diff"]),
        "tags": ["decoy", "waps"] + (["e6"] if flag == "e6" or chapter in (13, 16) else []),
        "sourceEdition": "AFH1-2025",
        "demo": False,
    }


def pack_sjt(raw: dict, number: int) -> dict:
    actions = [raw["most"], raw["least"], raw["mid1"], raw["mid2"]]
    rng = random.Random("sjt-" + str(number) + raw["scenario"][:40])
    order = [0, 1, 2, 3]
    rng.shuffle(order)
    shuffled = [actions[i] for i in order]
    chapter = int(raw["ch"])
    flag = "e6" if chapter in (13, 16) else "both"
    para = str(raw["para"])
    explain = raw["explain"].strip()
    supplied = (raw.get("source") or "").strip()
    if supplied and supplied == explain:
        raise SystemExit("sjt explain duplicates source: " + raw["scenario"][:80])
    source = supplied or locator(para, raw["title"])
    page = int(raw["page"])
    return {
        "id": f"sjt-{number:03d}",
        "kind": "sjt",
        "type": "sjt",
        "scenario": raw["scenario"].strip(),
        "actions": shuffled,
        "mostIndex": shuffled.index(raw["most"]),
        "leastIndex": shuffled.index(raw["least"]),
        "explain": explain,
        "source": source,
        "competency": raw["competency"],
        "category": raw["category"],
        "cite": {
            "chapter": chapter,
            "section": raw["sec"],
            "para": para,
            "paragraph": para,
            "title": raw["title"],
            "pageHint": str(page),
        },
        "pageHint": page,
        "ranks": ranks_for(flag, chapter),
        "difficulty": int(raw["diff"]),
        "tags": ["sjt", raw["competency"].lower().replace(" ", "-")],
        "sourceEdition": "AFH1-2025",
        "demo": bool(raw.get("demo")),
    }


def load_rows(path: str) -> list[dict]:
    rows = []
    if not os.path.isfile(path):
        return rows
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            rows.append(json.loads(line))
    return rows


def lines() -> dict:
    mild_correct = [
        "There it is. That is the paragraph. Put it in your hip pocket.",
        "Correct. The handbook agrees with you, which is a pleasant change.",
        "You recalled the cite, not the vibe. That is the job.",
        "Clean lock. Write that one on a sticky note.",
        "Right answer. The room can unclench.",
        "That is the sentence. Do not upgrade it in the retelling.",
        "Good. You studied the page, not the rumor.",
        "Locked and legal. Next item.",
    ]
    chief_correct = [
        "There it is. Hip pocket. Do not loan it to a bad summary.",
        "Correct. I almost smiled. Do not get used to it.",
        "You brought the paragraph, not a motivational poster.",
        "That recall was sharp enough to cut a bad excuse.",
        "Right. The coffee was not wasted on you.",
        "You remembered the words the book actually used. Outstanding novelty.",
        "Clean. If the rest of the flight copies you, we go home early.",
        "That is the standard. Act like you have met it before.",
    ]
    mild_wrong = [
        "Confident. Wrong. The chapter is not a vibe.",
        "Close to a nearby paragraph, which is how these misses happen.",
        "That choice would fail a open-book check. We are doing better than that.",
        "Not the cite. The distractor was dressed up and you saluted it.",
        "Wrong lock. The explanation is on the screen. Read it once.",
        "The handbook did not say that. Your memory edited it.",
        "Miss. We will see this chapter again if it keeps winning.",
        "Incorrect. The right line is shorter than the story you told yourself.",
    ]
    chief_wrong = [
        "Confident. Wrong. Chapter knowledge is not a personality trait.",
        "You picked the cousin of the right answer and called it family.",
        "That lock was fast and fictional. Speed is not a cite.",
        "Wrong. The book has been patient. I am less so.",
        "You answered the question you wish we had asked.",
        "Miss. Put the paragraph back where you found the rumor.",
        "Incorrect. Sloppy recall is still sloppy when the room laughs.",
        "That was a sister-service answer wearing our colors. Take it off.",
    ]
    return {
        "correct": {"mild": mild_correct, "chief": chief_correct},
        "wrong": {"mild": mild_wrong, "chief": chief_wrong},
        "fibfool": {
            "mild": [
                "That lie picked up votes. The handbook did not.",
                "People bought it. That is why we show the cite after.",
                "Nice bluff. It is still not policy.",
                "The room promoted a fake. We are demoting it now.",
                "Believable and false. That is the dangerous kind.",
            ],
            "chief": [
                "You just promoted a lie to policy. Outstanding.",
                "The flight saluted a sentence you invented. Fix your face.",
                "That bluff had better handwriting than the truth. Still fake.",
                "Congratulations. You wrote unofficial guidance and people believed you.",
                "A clean lie. The paragraph is here to embarrass it.",
            ],
        },
        "fibtruth": {
            "mild": [
                "You found the real line. That is the whole point of the round.",
                "Truth located. The liars can sit down.",
                "That one is the handbook. The others were confident fiction.",
                "Correct source. Read the cite out loud once.",
            ],
            "chief": [
                "You spotted the real sentence in a pile of swagger. Good eye.",
                "Handbook wins. The liars can brief their creativity later.",
                "That was the actual line. Try to remember it longer than the joke.",
                "Truth pays more. That was not an accident.",
            ],
        },
        "join": {
            "mild": [
                "Another phone is on the net. Callsign is live.",
                "Welcome in. Pick a brain, not just an avatar.",
                "Checked in. The room code worked. Miracles continue.",
            ],
            "chief": [
                "Another volunteer. The paragraph does not care about your confidence.",
                "You are in. Try not to guess like it is a personality.",
                "Joined. I already miss the quiet.",
            ],
        },
        "win": {
            "mild": [
                "Board is closed. Winner keeps the coffee, loser keeps the cite.",
                "That is the score. Hot wash is optional only if you were honest.",
                "Done. Screenshot nothing. Study the misses.",
            ],
            "chief": [
                "Winner buys nothing. Loser rereads the chapter that hurt.",
                "Scores posted. Bragging is authorized. Forgetting is not.",
                "Game over. The handbook is still undefeated.",
            ],
        },
        "lightning": {
            "mild": [
                "Break time. Water, then back on the clock.",
                "Five down. Shake out your hands.",
                "Pause. Combo can wait eight seconds while you breathe.",
            ],
            "chief": [
                "Break time. Do not study your neighbor's face.",
                "Pause. If your combo died, that was the question's fault and also yours.",
                "Five items. Stretch. The next five are not nicer.",
            ],
        },
        "sjt": {
            "mild": [
                "Score the behavior, not the speech you would give later.",
                "Most and least are both graded. A swap is a zero.",
                "Use the competency on purpose.",
            ],
            "chief": [
                "That least-effective move was a choice. Own it.",
                "Competency language, not vibes. The rubric is not your mood.",
                "You ranked a dodge above the repair. We noticed.",
            ],
        },
        "hotwash": {
            "mild": ["Same chapters. Cleaner answers. That is the deal."],
            "chief": ["We are not leaving this room until that chapter stops beating you."],
        },
        "dares": [
            "Optional: ten push-ups, or recite the first stanza of the Airman's Creed. The host can skip this.",
            "Optional: the lowest score names the chapter they will reread tonight. Skip if the room is done.",
            "Optional: everyone stands for one breath and sits back down. Courage was not required. Skip is allowed.",
            "Optional: winner picks a paragraph number. Loser says the title only. Skip if you want the next item.",
        ],
        "nicks": [
            "Tabbed for Later",
            "Closed Book",
            "Needs a Refly",
            "Page Marker",
            "Bold Guess",
        ],
    }


THIN_SECTIONS = ["7D", "7H", "11C", "11D", "12E", "15D", "15E", "15F", "16A", "17B", "18D", "24F"]
SINGLE_COMPETENCIES = [
    "Resilience", "Flexibility", "Decision Making", "Creative Thinking", "Fostering Innovation",
    "Influence", "Results Focus", "Strategic Thinking", "Resource Management", "Precision",
    "Information Seeking", "Digital Literacy",
]


def line_card_count(line_bank: dict) -> int:
    total = sum(len(v.get("mild", [])) + len(v.get("chief", [])) for v in line_bank.values() if isinstance(v, dict))
    return total + len(line_bank.get("dares", [])) + len(line_bank.get("nicks", []))


def write_counts(questions: list, sjts: list, line_bank: dict | None = None) -> str:
    """Refresh web/data/COUNTS.md from the shipped lists."""
    mcqs = [q for q in questions if (q.get("kind") or q.get("type")) == "mcq"]
    decoys = [q for q in questions if (q.get("kind") or q.get("type")) == "decoy"]
    other = [q for q in questions if (q.get("kind") or q.get("type")) not in ("mcq", "decoy")]
    mcq_counts = Counter(q["cite"]["chapter"] for q in mcqs)
    decoy_counts = Counter(q["cite"]["chapter"] for q in decoys)
    sec_counts = Counter(q["cite"]["section"] for q in mcqs)
    if line_bank is None:
        line_path = os.path.join(DATA, "lines.json")
        if os.path.isfile(line_path):
            with open(line_path, encoding="utf-8") as handle:
                line_bank = json.load(handle)
        else:
            line_bank = {}
    report = [
        "# Bank counts",
        "",
        f"- MCQ: {len(mcqs)}",
        f"- Decoy: {len(decoys)}",
        f"- SJT: {len(sjts)}",
        "- Fibbage: 0 (free-text prompts are not shipped)",
        f"- Chief lines and cards: {line_card_count(line_bank)}",
        "",
        "## MCQ and Decoy by chapter",
    ]
    for ch in CHAPTERS:
        report.append(
            f"- Chapter {ch['chapter']} {ch['title']}: {mcq_counts[ch['chapter']]} MCQ, "
            f"{decoy_counts[ch['chapter']]} Decoy ({ch['waps']})"
        )
    report.extend(["", "## Formerly thin MCQ sections (floor is 3)"])
    for sec in THIN_SECTIONS:
        report.append(f"- {sec}: {sec_counts[sec]} MCQ")
    comps = Counter(s.get("competency", "") for s in sjts)
    report.extend(["", "## SJT competencies"])
    for name, count in sorted(comps.items()):
        report.append(f"- {name}: {count}")
    if other:
        report.extend(["", f"- Other question types still in the file: {len(other)}"])
    report.extend([
        "",
        "## Cite keys for Host and rollup",
        "",
        "- Every shipped item has `kind` and the same value on `type`: `mcq`, `decoy`, or `sjt`.",
        "- `kind` is the rollup stamp. `type` stays so existing filters that compare `item.type` still skip Decoy packs when they ask for `mcq`.",
        "- `cite.chapter` is the chapter number. `cite.section` is the WAPS section code (`7D`, `17B`), the same codes as `chapters.json`.",
        "- MCQ and SJT keep `cite.para`. Decoy Brief uses the frozen key `cite.paragraph`.",
        "- Both keys are filled with the same paragraph or section anchor, so a reader can use either.",
        "- Decoy `cite.pageHint` is a string, matching the frozen shape. MCQ and SJT still keep a top-level numeric `pageHint`, and copy that number onto `cite.pageHint` as a string.",
        "- `explain` is study teaching copy. `source` is the handbook locator (`AFH 1 (2025) para …`). Those two strings are not the same.",
        "- `ranks` is `[\"E5\", \"E6\"]` or `[\"E6\"]` for chapters 13 and 16. `sourceEdition` is `AFH1-2025`.",
        "- Off-WAPS chapters 2, 3, 4, 6, 10, 21, and 23 stay empty.",
        "- Free-text Fibbage (`prompt` / `answer` / `lies`) is not in `questions.json` or `bundle.js`. Old prompt files are parked in `tools/parked/fibbage/` and are not loaded.",
        "- Decoy packs are MCQ: `stem`, `truth`, and exactly three `decoys`. `question` repeats `stem` for readers that look for a question string.",
        "",
    ])
    text = "\n".join(report)
    with open(os.path.join(DATA, "COUNTS.md"), "w", encoding="utf-8") as handle:
        handle.write(text)
    return text


def _reject(items: list[dict]) -> None:
    bad = []
    for item in items:
        bad.extend(validate_item(item))
    if bad:
        raise SystemExit("bank schema failed:\n" + "\n".join(bad[:30]))


def main() -> None:
    from bank_items import DECOY, MCQ, SJT  # noqa: WPS433

    mcq_rows = list(MCQ)
    decoy_rows = list(DECOY)
    sjt_rows = list(SJT)
    extra = os.path.join(SRC, "extra_mcq.jsonl")
    mcq_rows.extend(load_rows(extra))

    questions = []
    seen_q = set()
    for i, row in enumerate(mcq_rows, start=1):
        item = pack_mcq(row, i)
        if item["question"] in seen_q:
            raise SystemExit("duplicate question: " + item["question"][:80])
        seen_q.add(item["question"])
        questions.append(item)

    decoys = []
    per_chapter: Counter = Counter()
    seen_stem = set()
    for row in decoy_rows:
        chapter = int(row["ch"])
        per_chapter[chapter] += 1
        item = pack_decoy(row, per_chapter[chapter])
        stem_key = " ".join(item["stem"].split()).casefold()
        if stem_key in seen_stem:
            raise SystemExit("duplicate decoy stem: " + item["stem"][:80])
        seen_stem.add(stem_key)
        decoys.append(item)

    # Demo seed stays on MCQ and a few SJT items. Decoy packs are not in the 3-minute brief.
    demo_ids = []
    for item in questions:
        if item.get("demo") and len(demo_ids) < 20:
            demo_ids.append(item["id"])
    if len(demo_ids) < 20:
        for item in questions:
            if item["id"] not in demo_ids:
                item["demo"] = True
                demo_ids.append(item["id"])
            if len(demo_ids) == 20:
                break

    sjts = [pack_sjt(row, i) for i, row in enumerate(sjt_rows, start=1)]
    for item in sjts[:4]:
        item["demo"] = True
        demo_ids.append(item["id"])

    payload_q = questions + decoys
    _reject(payload_q + sjts)
    if any((q.get("kind") or q.get("type")) == "fibbage" for q in payload_q):
        raise SystemExit("fibbage item survived the build")

    sec_counts = Counter(q["cite"]["section"] for q in questions)
    short = [sec for sec in THIN_SECTIONS if sec_counts[sec] < 3]
    if short:
        detail = ", ".join(f"{sec}={sec_counts[sec]}" for sec in short)
        raise SystemExit("thin MCQ sections remain: " + detail)
    starved = [ch for ch in (17, 20, 22) if per_chapter[ch] < 6]
    if starved:
        raise SystemExit("decoy chapters still thin: " + ", ".join(str(ch) for ch in starved))
    comps = Counter(s["competency"] for s in sjts)
    if "Fosters Inclusion" in comps:
        raise SystemExit("Fosters Inclusion is not a competency in this bank")
    still_single = [name for name in SINGLE_COMPETENCIES if comps[name] < 2]
    if still_single:
        raise SystemExit("SJT competencies still at one scenario: " + ", ".join(still_single))

    with open(os.path.join(DATA, "questions.json"), "w", encoding="utf-8") as handle:
        json.dump(payload_q, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    with open(os.path.join(DATA, "sjt.json"), "w", encoding="utf-8") as handle:
        json.dump(sjts, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    line_bank = lines()
    with open(os.path.join(DATA, "lines.json"), "w", encoding="utf-8") as handle:
        json.dump(line_bank, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    with open(os.path.join(DATA, "chapters.json"), "w", encoding="utf-8") as handle:
        json.dump(CHAPTERS, handle, indent=2)
        handle.write("\n")
    with open(os.path.join(DATA, "demo.json"), "w", encoding="utf-8") as handle:
        json.dump({"ids": demo_ids, "note": "Lobby 3-minute brief uses items flagged demo."}, handle, indent=2)
        handle.write("\n")

    bundle = {
        "questions": payload_q,
        "sjt": sjts,
        "lines": line_bank,
        "chapters": CHAPTERS,
    }
    with open(os.path.join(DATA, "bundle.js"), "w", encoding="utf-8") as handle:
        handle.write("window.PDG_BUNDLE = ")
        json.dump(bundle, handle, ensure_ascii=False)
        handle.write(";\n")

    text = write_counts(payload_q, sjts, line_bank)
    print(text)
    if len(questions) < 250 or len(decoys) < 40 or len(sjts) < 30:
        raise SystemExit("bank below the required floor")


if __name__ == "__main__":
    main()
