# ---------------------------------------------------------------------------
# Installe la fondation Trajio sur une machine Windows.
# Idempotent : peut etre relance sans risque.
# Usage : .\scripts\setup.ps1
# ---------------------------------------------------------------------------

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

Step 'Variables d''environnement'
if (Test-Path '.env') {
    Write-Host '    .env existe deja : inchange.'
} else {
    Copy-Item '.env.example' '.env'
    Write-Host '    .env cree depuis .env.example.'
    Write-Host '    Rappel : remplacez SECRET_KEY avant tout deploiement.' -ForegroundColor Yellow
}

Step 'API Python (virtualenv + dependances)'
$apiDir = Join-Path $root 'apps/api'
$python = Join-Path $apiDir '.venv/Scripts/python.exe'

if (Test-Path $python) {
    Write-Host '    virtualenv deja present.'
} else {
    Write-Host '    creation du virtualenv...'
    python -m venv (Join-Path $apiDir '.venv')
}

Push-Location $apiDir
try {
    & $python -m pip install --upgrade pip --quiet
    & $python -m pip install -e '.[dev]'
} finally {
    Pop-Location
}

Step 'Frontend (dependances npm)'
Push-Location (Join-Path $root 'apps/web')
try {
    npm install
} finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Fondation Trajio installee.' -ForegroundColor Green
Write-Host '  API   : .\scripts\start-api.ps1 -Reload'
Write-Host '  Web   : .\scripts\start-web.ps1'
Write-Host '  Stack : docker compose up -d'
