PDG PARTY
Unofficial AFH 1 study party. Not an Air Force product.
Not a substitute for AFH 1. The Air Force alone decides what is on the PFE.
Group study for enlisted promotion testing is prohibited by DAFMAN 36-2664.

HOW TO START
1. Put this folder on the computer that will be the TV.
2. Double-click the launcher for your computer:
   Mac: start.command
   Windows: start.bat
   Linux: start.sh
3. Leave the black window open. A browser opens to the host screen.
4. Phones must be on the same Wi-Fi. They open the join link on the TV
   (or scan the QR) and type the 4-character room code.
5. On the TV, pick a mode. Boards & Brief is the 3-minute demo.

If Python 3 is not installed, double-click START.html. That is solo
Quiet Hours only. Phones cannot join a file opened that way.

MODES
Lobby, Boards & Brief, Fibbage, Lightning, Flight vs Flight,
SJT, Hot Wash (replay the chapters you missed), Quiet Hours
(solo spaced repetition), and a mock PFE (80 slots, 1.25 points each).

REPLACING QUESTIONS
See web/data/README.md. Short version:
  python3 tools/import_questions.py your-file.json

Full starter-bank rebuild:
  python3 tools/build_bank.py
  python3 tools/build_assets.py
