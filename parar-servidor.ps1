# EcoLive - Parar Servidor (PowerShell)
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   [X] EcoLive - Desligando Servidor de Streaming" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

Write-Host "[1/3] Encerrando Tuneis Cloudflare..." -ForegroundColor Yellow
Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
Write-Host "      Tuneis Cloudflare finalizados." -ForegroundColor Gray

Write-Host "[2/3] Encerrando servidor Next.js na porta 3000..." -ForegroundColor Yellow
$p = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($p) {
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
}
Write-Host "      Frontend Next.js finalizado." -ForegroundColor Gray

Write-Host "[3/3] Parando containers Docker (LiveKit + Ingress + Redis)..." -ForegroundColor Yellow
docker stop ecolive-ingress ecolive-livekit ecolive-redis >$null 2>&1
Write-Host "      Containers Docker pausados." -ForegroundColor Gray

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " [OK] Servidor EcoLive desligado com sucesso!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Todos os servicos foram interrompidos e seus recursos"
Write-Host "de memoria e processador foram liberados."
Write-Host "========================================================" -ForegroundColor Cyan
