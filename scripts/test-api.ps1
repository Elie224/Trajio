# ---------------------------------------------------------------------------
# Lance la suite de tests de l'API Trajio.
# Usage : .\scripts\test-api.ps1 [-Path tests/test_health.py]
# ---------------------------------------------------------------------------

[CmdletBinding()]
param(
    [string[]]$Path = @()
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $root 'apps/api'
$python = Join-Path $apiDir '.venv/Scripts/python.exe'

if (-not (Test-Path $python)) {
    throw 'Virtualenv introuvable. Lancez d''abord .\scripts\setup.ps1'
}

Push-Location $apiDir
try {
    if ($Path.Count -gt 0) {
        & $python -m pytest @Path
    } else {
        & $python -m pytest
    }
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
