# Swapping the question file

The game reads `bundle.js` first (so a double-clicked `START.html` still works) and can also fetch these JSON files when the launcher is running.

To drop in a later catalog year without touching the game:

1. Build a JSON list of items. Each item needs `id`, `type` (`mcq`, `fibbage`, or `sjt`), the prompt fields that type already uses, and a `cite` with chapter, section, para, and title.
2. Tag `ranks` as `["E5","E6"]`, `["E6"]`, or `[]`. Set `sourceEdition` (the starter bank uses `AFH1-2025`).
3. Run:

```
python3 tools/import_questions.py path/to/items.json
```

Matching ids are replaced. New ids are added. `bundle.js` is rewritten. Restart the launcher.

To rebuild the whole starter bank from the source files instead:

```
python3 tools/build_bank.py
```

Pictures and tones:

```
python3 tools/build_assets.py
```

Neither command needs pip. The launcher itself is only Python's standard library.
