@echo off
echo [EcoLive] Inicializador de Tunel Seguro (Ngrok)

if not exist "%~dp0.env" (
    echo [AVISO] Arquivo infra\.env nao encontrado!
    echo Crie o arquivo infra\.env baseado em infra\.env.example e insira seu NGROK_AUTHTOKEN.
    exit /b 1
)

echo [*] Iniciando containers do LiveKit e Ngrok...
docker compose --profile tunnel up -d

timeout /t 3 /nobreak >nul

docker ps --filter "name=ecolive-ngrok" --format "table {{.Names}}\t{{.Status}}"
echo.
echo [+] Tunel ativo! Painel Web Local (com as URLs HTTPS):
echo     http://localhost:4040
echo.
echo Para inspecionar logs:
echo   docker logs ecolive-ngrok
