@echo off
title Bildsharing Plattform - Server
chcp 65001 > nul

echo ==================================================
echo         BILDSHARING PLATTFORM SERVER
echo ==================================================
echo.

:: PrÃ¼fen ob node_modules existiert, andernfalls npm install ausfÃ¼hren
if not exist "%~dp0node_modules" (
    echo node_modules-Ordner nicht gefunden.
    echo Installiere ProjektabhÃ¤ngigkeiten...
    call npm install
    if errorlevel 1 (
        echo.
        echo [FEHLER] Fehler bei der Installation der AbhÃ¤ngigkeiten.
        echo Bitte stellen Sie sicher, dass Node.js installiert ist.
        pause
        exit /b
    )
    echo AbhÃ¤ngigkeiten erfolgreich installiert!
    echo.
)

:: Browser zeitverzÃ¶gert Ã¶ffnen (damit der Server Zeit zum Booten hat)
echo Ã–ffne WeboberflÃ¤che im Standardbrowser...
start http://localhost:3000
echo.

:: Server starten
echo Starte Node.js Server...
node server.js

if errorlevel 1 (
    echo.
    echo [FEHLER] Der Server konnte nicht gestartet werden oder wurde unerwartet beendet.
    pause
)
