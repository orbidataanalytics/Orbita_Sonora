@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
    py -3 scripts\abrir_local.py
) else (
    python scripts\abrir_local.py
)
if errorlevel 1 (
    echo El visor requiere Python 3. Abre LEER_PRIMERO.md.
    pause
)
