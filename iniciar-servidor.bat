@echo off
chcp 65001 >nul
title EcoLive - Iniciar Servidor
echo ========================================================
echo    [>] EcoLive - Inicializando Servidor de Streaming
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Iniciando containers do Docker (LiveKit + Redis + Ingress)...
docker compose -f infra/docker-compose.yml up -d redis livekit ingress
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao iniciar containers do Docker. O Docker Desktop esta aberto?
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Iniciando Frontend Next.js na porta 3000...
start "EcoLive - Frontend Next.js (Porta 3000)" cmd /k "cd frontend && npm run dev"

echo.
echo [3/3] Iniciando Tuneis Seguros Cloudflare (SSL)...
start "EcoLive - Tunel LiveKit (Porta 7880)" cmd /k ""C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:7880"
timeout /t 2 /nobreak >nul
start "EcoLive - Tunel Next.js (Porta 3000)" cmd /k ""C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:3000"

echo.
echo ========================================================
echo  [OK] Servidor EcoLive iniciado com sucesso!
echo ========================================================
echo  - LiveKit Server: http://127.0.0.1:7880
echo  - Frontend Web:   http://localhost:3000
echo  - Ingress WHIP:   http://127.0.0.1:8085
echo.
echo  As janelas do Next.js e dos Tuneis Cloudflare foram abertas.
echo  Para desligar tudo quando terminar, execute: parar-servidor.bat
echo ========================================================
echo.
pause
