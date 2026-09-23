#!/usr/bin/env bash
# PDG Party — macOS one-click launcher. Double-click in Finder.
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 was not found. Open START.html for solo study, or install Python 3 from python.org and run this again."
  read -r -p "Press return to close."
  exit 1
fi
python3 server.py
read -r -p "Server stopped. Press return to close."
