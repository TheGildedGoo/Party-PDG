# Bank counts

- MCQ: 579
- Decoy: 108
- SJT: 46
- Fibbage: 0 (free-text prompts are not shipped)
- Chief lines and cards: 85

## MCQ and Decoy by chapter
- Chapter 1 Professionalism: 44 MCQ, 11 Decoy (both)
- Chapter 2 Aviation History: 0 MCQ, 0 Decoy (off)
- Chapter 3 USAF Heritage: 0 MCQ, 0 Decoy (off)
- Chapter 4 Air and Cyberpower: 0 MCQ, 0 Decoy (off)
- Chapter 5 Military Organization and Command: 48 MCQ, 10 Decoy (both)
- Chapter 6 Doctrine and Joint Force: 0 MCQ, 0 Decoy (off)
- Chapter 7 Enlisted Force Development: 53 MCQ, 8 Decoy (both)
- Chapter 8 Assessments and Recognition: 31 MCQ, 3 Decoy (both)
- Chapter 9 Enlisted Promotions: 44 MCQ, 10 Decoy (both)
- Chapter 10 Assignments and Occupational Codes: 0 MCQ, 0 Decoy (off)
- Chapter 11 Personnel Programs and Benefits: 36 MCQ, 6 Decoy (both)
- Chapter 12 Finance, Manpower, and Resources: 34 MCQ, 7 Decoy (both)
- Chapter 13 Developing Organizations: 31 MCQ, 4 Decoy (e6)
- Chapter 14 Developing Others: 34 MCQ, 6 Decoy (both)
- Chapter 15 Developing Self: 39 MCQ, 6 Decoy (both)
- Chapter 16 Developing Ideas: 26 MCQ, 3 Decoy (e6)
- Chapter 17 Emergency Management: 27 MCQ, 8 Decoy (both)
- Chapter 18 Security: 27 MCQ, 4 Decoy (both)
- Chapter 19 Standards of Conduct: 26 MCQ, 4 Decoy (both)
- Chapter 20 Enforcing Military Standards: 26 MCQ, 7 Decoy (both)
- Chapter 21 Military Justice: 0 MCQ, 0 Decoy (off)
- Chapter 22 Fitness and Readiness: 26 MCQ, 8 Decoy (both)
- Chapter 23 Dress and Appearance: 0 MCQ, 0 Decoy (off)
- Chapter 24 Military Customs and Courtesies: 27 MCQ, 3 Decoy (both)

## Formerly thin MCQ sections (floor is 3)
- 7D: 3 MCQ
- 7H: 3 MCQ
- 11C: 3 MCQ
- 11D: 3 MCQ
- 12E: 3 MCQ
- 15D: 3 MCQ
- 15E: 3 MCQ
- 15F: 3 MCQ
- 16A: 3 MCQ
- 17B: 3 MCQ
- 18D: 3 MCQ
- 24F: 3 MCQ

## SJT competencies
- Accountability: 2
- Analytical Thinking: 2
- Change Management: 2
- Communication: 2
- Creative Thinking: 2
- Decision Making: 2
- Develops People: 2
- Digital Literacy: 2
- Flexibility: 2
- Fostering Innovation: 2
- Influence: 2
- Information Seeking: 2
- Initiative: 2
- Leadership: 2
- Perseverance: 2
- Precision: 2
- Resilience: 2
- Resource Management: 2
- Results Focus: 2
- Self-Control: 2
- Service Mindset: 2
- Strategic Thinking: 2
- Teamwork: 2

## Cite keys for Host and rollup

- Every shipped item has `kind` and the same value on `type`: `mcq`, `decoy`, or `sjt`.
- `kind` is the rollup stamp. `type` stays so existing filters that compare `item.type` still skip Decoy packs when they ask for `mcq`.
- `cite.chapter` is the chapter number. `cite.section` is the WAPS section code (`7D`, `17B`), the same codes as `chapters.json`.
- MCQ and SJT keep `cite.para`. Decoy Brief uses the frozen key `cite.paragraph`.
- Both keys are filled with the same paragraph or section anchor, so a reader can use either.
- Decoy `cite.pageHint` is a string, matching the frozen shape. MCQ and SJT still keep a top-level numeric `pageHint`, and copy that number onto `cite.pageHint` as a string.
- `explain` is study teaching copy. `source` is the handbook locator (`AFH 1 (2025) para …`). Those two strings are not the same.
- `ranks` is `["E5", "E6"]` or `["E6"]` for chapters 13 and 16. `sourceEdition` is `AFH1-2025`.
- Off-WAPS chapters 2, 3, 4, 6, 10, 21, and 23 stay empty.
- Free-text Fibbage (`prompt` / `answer` / `lies`) is not in `questions.json` or `bundle.js`. Old prompt files are parked in `tools/parked/fibbage/` and are not loaded.
- Decoy packs are MCQ: `stem`, `truth`, and exactly three `decoys`. `question` repeats `stem` for readers that look for a question string.
