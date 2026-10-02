# Script para inicializar o Tunel Seguro do Ngrok via Docker Compose
# Uso: .\start-tunnel.ps1

Write-Host "[EcoLive] Inicializador de Tunel Seguro (Ngrok)" -ForegroundColor Cyan

# Verifica se o arquivo .env existe em infra/
$envFile = Join-Path $PSScriptRoot ".env"
if (-Not (Test-Path $envFile)) {
    Write-Host "[AVISO] Arquivo infra/.env nao encontrado!" -ForegroundColor Yellow
    Write-Host "Por favor, crie o arquivo infra/.env baseado em infra/.env.example e insira seu NGROK_AUTHTOKEN." -ForegroundColor Gray
    exit 1
}

# Sobe os containers com o profile tunnel
Write-Host "[*] Iniciando containers do LiveKit e Ngrok..." -ForegroundColor Green
docker compose --profile tunnel up -d

# Aguarda 3 segundos para estabilizar
Start-Sleep -Seconds 3

# Obtem o status do container
$status = docker ps --filter "name=ecolive-ngrok" --format "{{.Status}}"
if ($status -like "*Up*") {
    Write-Host "[+] Tunel Ngrok ativo com sucesso!" -ForegroundColor Green
    
    try {
        $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction Stop
        Write-Host ""
        Write-Host "[URLs Publicas Seguras (HTTPS)]:" -ForegroundColor Cyan
        foreach ($t in $tunnels.tunnels) {
            Write-Host "  $($t.name.ToUpper()): $($t.public_url)" -ForegroundColor Yellow
        }
        Write-Host ""
        Write-Host "Painel Web do Ngrok: http://localhost:4040" -ForegroundColor White
    } catch {
        Write-Host "Acesse o painel web local para ver as URLs: http://localhost:4040" -ForegroundColor Yellow
    }
} else {
    Write-Host "[-] Falha ao iniciar o container do Ngrok. Verifique os logs com:" -ForegroundColor Red
    Write-Host "  docker logs ecolive-ngrok" -ForegroundColor Gray
}

