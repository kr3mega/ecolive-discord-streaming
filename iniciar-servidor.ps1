# EcoLive - Iniciar Servidor (PowerShell)
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   [>] EcoLive - Inicializando Servidor de Streaming" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

Set-Location $PSScriptRoot

Write-Host "[1/3] Iniciando containers Docker..." -ForegroundColor Green
docker compose -f infra/docker-compose.yml up -d redis livekit ingress

Write-Host "[2/3] Iniciando Frontend Next.js..." -ForegroundColor Green
Start-Process cmd -ArgumentList "/k cd frontend && npm run dev"

Write-Host "[3/3] Iniciando Tuneis Cloudflare..." -ForegroundColor Green
Start-Process cmd -ArgumentList "/k `"C:\Program Files (x86)\cloudflared\cloudflared.exe`" tunnel --url http://127.0.0.1:7880"
Start-Sleep -Seconds 2
Start-Process cmd -ArgumentList "/k `"C:\Program Files (x86)\cloudflared\cloudflared.exe`" tunnel --url http://127.0.0.1:3000"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " [OK] Servidor EcoLive iniciado com sucesso!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
