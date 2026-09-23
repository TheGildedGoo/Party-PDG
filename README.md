# PDG Party

Unofficial study party for AFH 1, *The Airman* (15 February 2025). One computer is the TV. Phones on the same Wi-Fi are the controllers. It plays like a living-room game: Boards & Brief, Decoy Brief, a lightning round, flights versus flights, situational judgment, and a solo study desk. Every mode in the bank is multiple choice.

This is **not** an Air Force product, **not** a substitute for AFH 1, and **not** a source the Air Force uses to write the PFE. Promotion-test content is determined solely by the Air Force. Group study for the purpose of enlisted promotion testing is prohibited by DAFMAN 36-2664. Read that again before you put this on a projector at work.

Questions are original to this project. The handbook is the factual base. Wording is not taken from commercial quiz banks.

## Start a room

You need Python 3. Nothing to `pip install`.

1. Mac: double-click `start.command`. Windows: double-click `start.bat`. Linux: double-click `start.sh` or run `./start.sh`.
2. Leave the terminal window open. The host screen opens at `http://127.0.0.1:8741/` (or the next free port through 8750 if 8741 is taken; the window prints the chosen port). On Windows the launcher tries `py -3`, then `python`, then `python3`.
3. Quiet Hours is solo. It does not open a WebSocket or a room code, whether you used a `start` launcher or `START.html`.
4. Click **Host a room** when phones should join. That is the step that opens the relay. Phones use the link in that window (and the QR on the TV), then type the 4-character room code and a callsign.
5. Click **3-minute brief** for a short Boards & Brief, or pick any mode.

The server listens on `0.0.0.0` and prefers port 8741. If that port is busy it tries 8742–8750 and prints the one it picked. `/api/info` returns that port and a LAN address (private Wi-Fi or Ethernet ahead of VPN and tunnel adapters). Same Wi-Fi is required. A guest network that blocks phone-to-computer traffic will not work, and the computer firewall has to allow Python.

No Python? Double-click `START.html`. That opens Quiet Hours in the browser for one person. It does not connect to a relay. Phones cannot join a file opened that way.

## What you can play

- **Lobby.** Rank track (E-5, E-6, mixed, or every chapter), round count, Mild or Chief roast, flight count, demo seed.
- **Boards & Brief.** Multiple choice. Speed adds points. Fastest correct lock gets a bonus.
- **Decoy Brief.** Multiple choice. The handbook line is in the stack with three decoys. Free-text Fibbage prompts are not in the bank. The host screen may still show the old Fibbage button until that mode is rewired; it has no prompts to draw.
- **Lightning.** Up to 20 items, auto-advance, combo scoring, a short break every five.
- **Flight vs Flight.** Two or more players, sequential flights. The captain locks. A miss opens a short steal for the next flight.
- **SJT.** Most effective, then least effective. A swap scores zero.
- **Hot Wash.** After a game, replay chapters the room missed.
- **Quiet Hours.** Solo drills with a light SM-2 schedule, export and import of progress, and a mock PFE: 60 knowledge items plus 20 SJT when the track has them, 80 slots, 1.25 points each.

Late join is allowed until round 1 starts. After that, new phones are audience. Eight players can score. Audience is uncapped.

## First three minutes

On the lobby screen, click **3-minute brief**. That uses the demo seed (core values, the chain of command, ALS, leave, and a few other short items) instead of the full bank. Chief Hot Wash talks after each reveal. Mild is the default roast. Switch to Chief if the room can take it.

## Counts in this build

- 579 original multiple-choice items
- 108 Decoy Brief packs (three decoys plus the handbook line)
- 0 free-text Fibbage prompts
- 46 situational-judgment scenarios
- 85 Chief and Mild lines, dares, and nicknames
- 23 competencies on the SJT items (Fosters Inclusion is omitted; AFH 1 section 14E was deleted)

| Chapter | Title | WAPS 2026 | MCQ | Decoy |
| --- | --- | --- | ---: | ---: |
| 1 | Professionalism | E-5 and E-6 | 44 | 11 |
| 2 | Aviation History | Not tested | 0 | 0 |
| 3 | USAF Heritage | Not tested | 0 | 0 |
| 4 | Air and Cyberpower | Not tested | 0 | 0 |
| 5 | Military Organization and Command | E-5 and E-6 | 48 | 10 |
| 6 | Doctrine and Joint Force | Not tested | 0 | 0 |
| 7 | Enlisted Force Development | E-5 and E-6 | 53 | 8 |
| 8 | Assessments and Recognition | E-5 and E-6 | 31 | 3 |
| 9 | Enlisted Promotions | E-5 and E-6 | 44 | 10 |
| 10 | Assignments and Occupational Codes | Not tested | 0 | 0 |
| 11 | Personnel Programs and Benefits | E-5 and E-6 | 36 | 6 |
| 12 | Finance, Manpower, and Resources | E-5 and E-6 | 34 | 7 |
| 13 | Developing Organizations | E-6 only | 31 | 4 |
| 14 | Developing Others | E-5 and E-6 | 34 | 6 |
| 15 | Developing Self | E-5 and E-6 | 39 | 6 |
| 16 | Developing Ideas | E-6 only | 26 | 3 |
| 17 | Emergency Management | E-5 and E-6 | 27 | 8 |
| 18 | Security | E-5 and E-6 | 27 | 4 |
| 19 | Standards of Conduct | E-5 and E-6 | 26 | 4 |
| 20 | Enforcing Military Standards | E-5 and E-6 | 26 | 7 |
| 21 | Military Justice | Not tested | 0 | 0 |
| 22 | Fitness and Readiness | E-5 and E-6 | 26 | 8 |
| 23 | Dress and Appearance | Not tested | 0 | 0 |
| 24 | Military Customs and Courtesies | E-5 and E-6 | 27 | 3 |

Every item is tagged with `kind` (`mcq`, `decoy`, or `sjt`), chapter, section, paragraph or section anchor, page hint, ranks, difficulty, and `sourceEdition` `AFH1-2025`. `explain` is study copy. `source` is the handbook locator, not a second copy of the explanation. Decoy rows use `cite.paragraph`; MCQ and SJT keep `cite.para`. Shipped items fill both keys with the same anchor. See `web/data/COUNTS.md`.

## Known gaps

- This is a study bank, not the secure WAPS item pool and not an SKT.
- 2026 untested chapters (2, 3, 4, 6, 10, 21, 23) are in the chapter map and are not in the question bank.
- Chapters 13 and 16 are tagged E-6 only.
- Paragraph numbers for chapters 16 through 24 are section anchors such as `17F`. The text extract used while writing those items stopped before the body of those chapters, so those items stay at section level.
- AFH 1 paragraph 9.16 still says the study reference is published as the EPRRC on 1 October. The current catalog name is the WAPS catalog. The date in the handbook is what the items teach.
- Numeric fitness scores are left out on purpose. They change.
- Illustrations are original drawings. There is no Air Force seal and no Hap Arnold trademark lockup. Rank marks in the game are tokens, not official insignia.
- After the first visit through the launcher, the service worker can reopen the host and player pages offline. A room still needs the launcher running if phones are joining.

## Accounts, trial, and billing

The Vercel app (`pdg-play`, root directory `web/`) adds a marketing splash, email login, a 30-day $1/month trial, and an admin panel. The Python launcher still runs Quiet Hours and LAN rooms without that API. Setup for Neon, Resend, Stripe, and the admin bootstrap password is in `docs/SAAS.md`.

```bash
node --test tools/test_saas.mjs
```

## Rebuild

```bash
python3 tools/build_bank.py
python3 tools/build_assets.py
python3 tools/import_questions.py path/to/new-items.json
node tools/test_logic.js
node tools/test_game.js
node tools/test_bank.js
```

`import_questions.py` replaces items with the same id and rebuilds `web/data/bundle.js`. Details are in `web/data/README.md`.

## License

Code is GPL-3. See `LICENSE`. Fonts are SIL Open Font License (`web/assets/OFL.txt` and `web/assets/OFL-source-sans-3.txt`). QR code is MIT. Icons are ISC. See `web/assets/THIRD_PARTY.md`.
