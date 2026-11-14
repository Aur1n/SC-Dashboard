@echo off
title SC-Dashboard
cd /d "%~dp0"
node server.js %*
pause
