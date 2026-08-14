$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "====================================" -ForegroundColor DarkYellow
Write-Host " BIPTAG WEB V0.2 - Instalacao" -ForegroundColor White
Write-Host "====================================" -ForegroundColor DarkYellow
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js nao encontrado. Instale o Node.js LTS e execute novamente." -ForegroundColor Red
  exit 1
}

Write-Host "Node:" (node -v)
Write-Host "NPM :" (npm -v)
Write-Host ""
Write-Host "Instalando dependencias..." -ForegroundColor DarkYellow

npm install

Write-Host ""
Write-Host "Instalacao concluida." -ForegroundColor Green
Write-Host "Agora execute: npm run dev" -ForegroundColor White
