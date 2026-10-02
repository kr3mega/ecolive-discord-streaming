@echo off
echo [*] Parando container do Ngrok...
docker stop ecolive-ngrok
docker rm ecolive-ngrok
echo [+] Tunel Ngrok finalizado. LiveKit Server continua em execucao.
