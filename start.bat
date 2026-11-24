@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Starting PDF Table Extractor in background...

powershell -NoProfile -Command "$p = Start-Process -FilePath (Get-Command npm.cmd).Source -ArgumentList 'run','dev','--','-p','3000' -WorkingDirectory '%~dp0' -WindowStyle Hidden -PassThru; Write-Output ('Started PID ' + $p.Id)"

echo.
echo Waiting for server to be ready...
powershell -NoProfile -Command "Start-Sleep -Seconds 10; try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 60; Write-Output 'Server ready at http://localhost:3000' } catch { Write-Output 'Server starting... open http://localhost:3000 in a moment' }"

echo.
echo Open http://localhost:3000 in your browser.
echo Run stop.bat to shut down.
pause
