@echo off
chcp 65001 >nul
title Noor Server - nour
cd /d "%~dp0"
echo ============================================
echo   nour - local server  (127.0.0.1:4173)
echo   Keep this window open while using the app.
echo   If it stops, it restarts automatically.
echo ============================================
start "" "http://127.0.0.1:4173/"
:loop
node server.js
echo.
echo Server stopped - restarting in 3 seconds (Ctrl+C to exit completely)
timeout /t 3 /nobreak >nul
goto loop
