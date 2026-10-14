# ---------------------------------------------------------------------------
# Demarre l'API Trajio avec uvicorn.
# Usage : .\scripts\start-api.ps1 [-Reload] [-Port 8000]
# ---------------------------------------------------------------------------

[CmdletBinding()]
param(
    [switch]$Reload,
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $root 'apps/api'
$python = Join-Path $apiDir '.venv/Scripts/python.exe'

if (-not (Test-Path $python)) {
    throw 'Virtualenv introuvable. Lancez d''abord .\scripts\setup.ps1'
}

Write-Host "API Trajio           : http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host "Documentation OpenAPI: http://127.0.0.1:$Port/docs" -ForegroundColor DarkGray

$uvicornArgs = @('app.main:app', '--app-dir', $apiDir, '--host', '127.0.0.1', '--port', $Port)
if ($Reload) {
    $uvicornArgs += '--reload'
}

Push-Location $apiDir
try {
    & $python -m uvicorn @uvicornArgs
} finally {
    Pop-Location
}
