@echo off
chcp 65001 >nul
rem Start a local web server for this app, then open it in the browser.
rem Close this window to stop the server.
cd /d "%~dp0"
start "" http://localhost:8080/
python serve.py 8080
pause
