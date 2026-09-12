# Script para parar o Tunel do Ngrok
# Uso: .\stop-tunnel.ps1

Write-Host "[*] Parando container do Ngrok..." -ForegroundColor Yellow
docker stop ecolive-ngrok
docker rm ecolive-ngrok
Write-Host "[+] Tunel Ngrok finalizado. LiveKit Server continua em execucao." -ForegroundColor Green

