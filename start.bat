@echo off
title Data2Dash - Starting...

:: Start backend
start "Data2Dash Backend" cmd /k "cd /d %~dp0backend_python && conda activate venv/ && python main.py"

:: Start frontend
start "Data2Dash Frontend" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo  Backend: http://localhost:8000
echo  Frontend: http://localhost:5173
echo.
echo  Close this window anytime - servers run independently.
