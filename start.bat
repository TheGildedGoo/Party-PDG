@echo off
REM PDG Party — Windows one-click launcher. Double-click. Needs Python 3. No pip install.
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3 was not found. Open START.html for solo study, or install Python 3 from python.org and run this again.
  pause
  exit /b 1
)
python server.py
pause
