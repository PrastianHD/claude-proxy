param (
    [Parameter(Position=0)]
    [ValidateSet("ollama", "openrouter", "nvidia")]
    [string]$Provider = "openrouter",

    [Parameter(Position=1)]
    [string]$Model = ""
)

$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8080"
$env:CLAUDE_CODE_USE_POWERSHELL_TOOL = 1

if ($Provider -eq "ollama") {
    $env:ANTHROPIC_API_KEY = $null
    $env:ANTHROPIC_AUTH_TOKEN = "ollama"
    $DefaultModel = "qwen3-coder:480b-cloud"
} 
elseif ($Provider -eq "nvidia") {
    $env:ANTHROPIC_API_KEY = "dummy-key"
    $env:ANTHROPIC_AUTH_TOKEN = $null
    $env:ANTHROPIC_CUSTOM_HEADERS = ""
    # Model ini didukung penuh oleh NVIDIA NIM, kalau mau coba thinking model ganti ke "deepseek-ai/deepseek-r1"
    $DefaultModel = "meta/llama-3.3-70b-instruct" 
} 
else {
    $env:ANTHROPIC_API_KEY = "dummy-key"
    $env:ANTHROPIC_AUTH_TOKEN = $null
    $env:ANTHROPIC_CUSTOM_HEADERS = ""
    $DefaultModel = "nvidia/nemotron-3-super-120b-a12b:free"
}

$FinalModel = if ($Model -ne "") { $Model } else { $DefaultModel }

# Konfigurasi model untuk semua varian Claude Code
$env:ANTHROPIC_MODEL = $FinalModel
$env:ANTHROPIC_DEFAULT_OPUS_MODEL = $FinalModel
$env:ANTHROPIC_DEFAULT_SONNET_MODEL = $FinalModel
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = $FinalModel

Clear-Host
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "   Claude Auto-Launcher                   " -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "PROVIDER : $Provider" -ForegroundColor Green
Write-Host "MODEL    : $FinalModel" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "Starting Claude Code... fr fr..." -ForegroundColor Green

claude --dangerously-skip-permissions