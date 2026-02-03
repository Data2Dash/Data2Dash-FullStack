@echo off
echo Starting DATA2DASH Backend Server...
cd backend_python
call venv\Scripts\activate.bat
set GROQ_API_KEY=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
python main.py
