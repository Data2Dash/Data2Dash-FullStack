# Start DATA2DASH Backend Server
Write-Host "Starting DATA2DASH Backend Server..." -ForegroundColor Green
Set-Location backend_python
$env:GROQ_API_KEY = "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"
.\venv\Scripts\python.exe main.py
