# ---------------------------------------------------------------------------
# Verifie la fondation Trajio de bout en bout.
# Lance tests, typage, lint et verification de la configuration Compose,
# puis interroge /health si l'API tourne deja.
# Usage : .\scripts\check.ps1 [-SkipWeb]
# ---------------------------------------------------------------------------

[CmdletBinding()]
param(
    [switch]$SkipWeb
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$script:failures = 0

function Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Result {
    param(
        [string]$Message,
        [bool]$Success
    )
    if ($Success) {
        Write-Host '    OK' -ForegroundColor Green
    } else {
        $script:failures++
        Write-Host "    ECHEC - $Message" -ForegroundColor Red
    }
}

Step 'Tests API (pytest)'
& (Join-Path $PSScriptRoot 'test-api.ps1')
Result 'tests pytest' ($LASTEXITCODE -eq 0)

if (-not $SkipWeb) {
    Step 'TypeScript (tsc --noEmit)'
    Push-Location (Join-Path $root 'apps/web')
    try { npm run typecheck } finally { Pop-Location }
    Result 'verification TypeScript' ($LASTEXITCODE -eq 0)

    Step 'ESLint'
    Push-Location (Join-Path $root 'apps/web')
    try { npm run lint } finally { Pop-Location }
    Result 'verification ESLint' ($LASTEXITCODE -eq 0)
}

Step 'Configuration Docker Compose'
docker compose config --quiet
Result 'fichier compose.yaml invalide' ($LASTEXITCODE -eq 0)

Step 'Endpoint /health'
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 5
    $healthOk = $health.status -eq 'ok'
    if ($healthOk) {
        Write-Host ('    {0} v{1} [{2}]' -f $health.service, $health.version, $health.environment)
    }
    Result 'reponse inattendue' $healthOk
} catch {
    Write-Host ('    API non joignable ({0})' -f $_.Exception.Message) -ForegroundColor Yellow
    Write-Host '    Lancez .\scripts\start-api.ps1 puis relancez cette verification.' -ForegroundColor Yellow
    Result 'API injoignable (normal si l''API n''est pas demarree)' $true
}

Write-Host ''
if ($script:failures -gt 0) {
    Write-Host "$($script:failures) verification(s) en echec." -ForegroundColor Red
    exit 1
}
Write-Host 'Toutes les verifications sont passees.' -ForegroundColor Green
