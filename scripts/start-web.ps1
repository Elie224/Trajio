# ---------------------------------------------------------------------------
# Demarre le frontend Next.js en mode developpement.
# Usage : .\scripts\start-web.ps1 [-Port 3000]
# ---------------------------------------------------------------------------

[CmdletBinding()]
param(
    [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $root 'apps/web'

if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
    throw 'Dependances npm absentes. Lancez d''abord .\scripts\setup.ps1'
}

Write-Host "Frontend Trajio : http://localhost:$Port" -ForegroundColor Cyan

Push-Location $webDir
try {
    npm run dev -- --port $Port
} finally {
    Pop-Location
}
