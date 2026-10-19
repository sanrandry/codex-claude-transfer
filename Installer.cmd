@echo off
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js est requis. Installez Node.js, puis relancez ce fichier.
  pause
  exit /b 1
)
node "%~dp0install.mjs"
if errorlevel 1 (
  echo Installation interrompue. Voir le message ci-dessus.
  pause
  exit /b 1
)
pause
