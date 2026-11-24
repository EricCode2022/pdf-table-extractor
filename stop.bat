@echo off
chcp 65001 >nul
echo Stopping PDF Table Extractor...

powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*pdf-table-extractor*next*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Output ('Stopped PID ' + $_.ProcessId) }"

echo.
echo Done.
pause
