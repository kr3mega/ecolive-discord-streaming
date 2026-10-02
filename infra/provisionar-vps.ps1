# =========================================================================
# [EcoLive v2.0.0] - Provisionamento Seguro do Cofre de Credenciais na VPS
# Transfere chaves criptográficas locais para a VPS via canal SSH/SCP seguro.
# =========================================================================

param(
    [string]$VpsHost = "124.198.128.214",
    [string]$VpsUser = "root",
    [string]$RemoteDir = "/root/ecolive-discord-streaming"
)

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  [EcoLive Security] Provisionamento Zero-Trust na VPS" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

$RootPath = Split-Path -Parent $PSScriptRoot
$FrontendEnv = Join-Path $RootPath "frontend\.env.local"
$InfraEnv = Join-Path $RootPath "infra\.env"

if (-not (Test-Path $FrontendEnv)) {
    Write-Error "[ERRO] Arquivo frontend\.env.local não encontrado!"
    exit 1
}

if (-not (Test-Path $InfraEnv)) {
    Write-Error "[ERRO] Arquivo infra\.env não encontrado!"
    exit 1
}

Write-Host "`n[1/3] Enviando variáveis do Frontend para a VPS ($VpsHost)..." -ForegroundColor Yellow
scp -o KexAlgorithms=curve25519-sha256 "$FrontendEnv" "${VpsUser}@${VpsHost}:${RemoteDir}/frontend/.env"

Write-Host "`n[2/3] Enviando variáveis de Infraestrutura para a VPS ($VpsHost)..." -ForegroundColor Yellow
scp -o KexAlgorithms=curve25519-sha256 "$InfraEnv" "${VpsUser}@${VpsHost}:${RemoteDir}/infra/.env"

Write-Host "`n[3/3] Aplicando permissão restrita chmod 600 e reiniciando containers..." -ForegroundColor Yellow
ssh -o KexAlgorithms=curve25519-sha256 "${VpsUser}@${VpsHost}" @"
    chmod 600 ${RemoteDir}/frontend/.env ${RemoteDir}/infra/.env
    if [ -d "${RemoteDir}/infra" ]; then
        cd ${RemoteDir}/infra
        docker compose down
        docker compose up -d redis livekit ingress
    fi
"@

Write-Host "`n[OK] Credenciais provisionadas e containers reiniciados com sucesso na VPS!" -ForegroundColor Green
