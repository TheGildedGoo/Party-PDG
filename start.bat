@echo off
REM PDG Party — Windows one-click launcher. Double-click. Needs Python 3. No pip install.
setlocal
cd /d "%~dp0"

call :try py -3
if defined PY goto run
call :try python
if defined PY goto run
call :try python3
if defined PY goto run

echo Python 3 was not found. Tried py -3, python, and python3.
echo Open START.html for solo study, or install Python 3 from python.org and run this again.
pause
exit /b 1

:try
where %~1 >nul 2>nul
if errorlevel 1 exit /b 0
%* -c "import sys; raise SystemExit(0 if sys.version_info[0] >= 3 else 1)" >nul 2>nul
if errorlevel 1 exit /b 0
set "PY=%*"
exit /b 0

:run
echo Using %PY%
%PY% server.py
set "RC=%ERRORLEVEL%"
pause
exit /b %RC%
