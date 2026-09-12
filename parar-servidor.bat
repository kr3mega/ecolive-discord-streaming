@echo off
chcp 65001 >nul
title EcoLive - Parar Servidor
echo ========================================================
echo    [X] EcoLive - Desligando Servidor de Streaming
echo ========================================================
echo.

echo [1/3] Encerrando Tuneis Cloudflare...
taskkill /F /IM cloudflared.exe >nul 2>&1
echo       Tuneis Cloudflare finalizados.

echo.
echo [2/3] Encerrando servidor Next.js na porta 3000...
powershell -Command "$p = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo       Frontend Next.js finalizado.

echo.
echo [3/3] Parando containers do Docker (LiveKit + Ingress + Redis)...
docker stop ecolive-ingress ecolive-livekit ecolive-redis >nul 2>&1
echo       Containers Docker pausados.

echo.
echo ========================================================
echo  [OK] Servidor EcoLive desligado com sucesso!
echo ========================================================
echo  Todos os servicos foram interrompidos e seus recursos
echo  de memoria e processador foram liberados.
echo ========================================================
echo.
pause
