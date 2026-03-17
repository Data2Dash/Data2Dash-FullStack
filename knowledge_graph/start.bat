@echo off
echo.
echo  ╔════════════════════════════════════════╗
echo  ║   Data2Dash — Knowledge Graph Server   ║
echo  ╚════════════════════════════════════════╝
echo.
echo  Starting on http://localhost:8001
echo  Press Ctrl+C to stop
echo.
cd /d "%~dp0"
uvicorn kg_app:app --host 0.0.0.0 --port 8001 --reload
