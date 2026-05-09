param (
    [Parameter(Position=0)]
    [ValidateSet("ollama", "openrouter", "nvidia")]
    [string]$Provider = "openrouter"
)

Clear-Host
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Ultimate Multi-Account Proxy Switcher  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "MODE      : $Provider" -ForegroundColor Green
Write-Host "PROXY URL : http://127.0.0.1:8080" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proxy is running... DO NOT CLOSE this window." -ForegroundColor Green
Write-Host "Buka terminal baru lalu jalankan: .\run-claude.ps1 $Provider" -ForegroundColor Green
Write-Host ""

node "$PSScriptRoot\proxy.js" $Provider