Write-Host ""
Write-Host "  Data2Dash - Knowledge Graph Server"
Write-Host "  Starting on http://localhost:8001"
Write-Host ""
Set-Location $PSScriptRoot
uvicorn kg_app:app --host 0.0.0.0 --port 8001 --reload
