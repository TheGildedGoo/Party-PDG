# Swapping the question file

The game reads `bundle.js` first (so a double-clicked `START.html` still works) and can also fetch these JSON files when the launcher is running.

To drop in a later catalog year without touching the game:

1. Build a JSON list of items. Each item needs `id`, `kind` (`mcq`, `decoy`, or `sjt`), and the same value on `type` so older filters keep working.
2. MCQ needs `question`, four unique `choices`, and `answerIndex` from 0 to 3.
3. Decoy Brief needs `stem`, `truth`, and exactly three `decoys`. Free-text Fibbage (`prompt` / `answer` / `lies`) is rejected.
4. SJT needs `scenario`, four unique `actions`, `mostIndex`, and `leastIndex`.
5. Every item needs `cite.chapter`, `cite.section`, and either `cite.paragraph` or `cite.para` (the importer copies whichever one you send onto both keys). Tag `ranks` as `["E5","E6"]` or `["E6"]` (chapters 13 and 16). Set `sourceEdition` to `AFH1-2025`.
6. `explain` is study teaching copy. `source` is the handbook locator. They must not be the same string.
7. Run:

```
python3 tools/import_questions.py path/to/items.json
```

Matching ids are replaced. New ids are added. A bad row rejects the whole file. `bundle.js` and `COUNTS.md` are rewritten. Restart the launcher.

To rebuild the whole starter bank from the source files instead:

```
python3 tools/build_bank.py
```

Pictures and tones:

```
python3 tools/build_assets.py
```

Neither command needs pip. The launcher itself is only Python's standard library.

Cite mapping for Host: MCQ and SJT historically used `cite.para`. Decoy Brief uses `cite.paragraph`. Shipped items fill both with the same anchor. `cite.section` is the WAPS letter code (`9D`, `17B`), not a dotted paragraph. Decoy `cite.pageHint` is a string. MCQ and SJT still expose a numeric top-level `pageHint`.
