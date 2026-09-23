#!/usr/bin/env bash
# PDG Party — Linux one-click launcher. Needs Python 3. No pip install.
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 was not found. Open START.html for solo study, or install Python 3 and run this again."
  exit 1
fi
exec python3 server.py
