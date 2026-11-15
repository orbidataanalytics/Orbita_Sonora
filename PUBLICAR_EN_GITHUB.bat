@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
    py -3 scripts\preparar_github.py --publicar
) else (
    python scripts\preparar_github.py --publicar
)
if errorlevel 1 (
    echo Revisa el mensaje anterior y PUBLICAR.md.
)
pause
