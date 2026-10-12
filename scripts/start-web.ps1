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

# Next.js only reads env files inside its own directory, so the root .env is not
# picked up automatically. Forwarding the value keeps a single source of truth
# for the whole stack, both locally and in Docker Compose.
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
    $line = Get-Content -LiteralPath $envFile |
        Where-Object { $_ -match '^\s*NEXT_PUBLIC_API_BASE_URL\s*=' } |
        Select-Object -First 1

    if ($line) {
        $value = ($line -split '=', 2)[1].Trim()
        if ($value) {
            $env:NEXT_PUBLIC_API_BASE_URL = $value
            Write-Host ("API cible : " + $value) -ForegroundColor DarkGray
        }
    }
}

Push-Location $webDir
try {
    npm run dev -- --port $Port
} finally {
    Pop-Location
}
