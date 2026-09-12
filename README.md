
# 🍃 EcoLive (Alpha 0.1.0) - Discord Streaming

> **Ecossistema descentralizado de transmissão WebRTC de latência ultra-baixa/estável integrado a canais de voz do Discord (Discord Activity / Iframe).**  
> *Autor: Kayque Reis ([@kr3mega](https://github.com/kr3mega))*

---

## 🎯 1. Objetivo do Sistema

O **EcoLive** é um mini aplicativo web (*Discord Activity / Iframe*) desenvolvido para canais de voz do Discord. O sistema entrega transmissões em tempo real com:
- **Latência Ultra-Baixa e Estável**: Mitigação dos efeitos da distância física através do Atlântico via WebRTC SFU (*Selective Forwarding Unit*).
- **Alta Fidelidade**: Até 1080p a 60fps / 120fps.
- **Imunidade Anti-Cheat**: Blindagem contra bloqueios de ferramentas de kernel (como Riot Vanguard).
- **FinOps e Alta Previsibilidade Financeira**: Operação dentro de uma infraestrutura otimizada para alto tráfego sem custos excedentes.

---

## 🎥 2. Arquitetura Híbrida de Captura (3 Modalidades)

A arquitetura foi desenhada com base em *"camadas progressivas de fricção e segurança"*, aceitando conexões simultâneas das três modalidades na mesma sala:

| Modalidade | Mecanismo | UX & Segurança |
| :--- | :--- | :--- |
| **1. PlayWeb Casual** *(Nativo no Iframe)* | `navigator.mediaDevices.getDisplayMedia` | **Porto Seguro:** Zero downloads, zero scripts, 100% isolado na sandbox do Discord. Suporta Aba, Janela ou Tela Inteira. |
| **2. OBS Auto-config** *(Para Leigos)* | Geração dinâmica de endpoint WHIP (*WebRTC HTTP Ingestion*) | **Anti-Cheat & Áudio do PC:** Fornece URL do WHIP + Bearer Token com guia visual de 3 passos "copiar e colar" para o OBS Studio. Não requer scripts locais. |
| **3. OBS Streamer** *(Power Users)* | Ingestão manual WHIP orientada à preservação de perfil | **Duplicação de Perfil:** Isola a transmissão para o EcoLive mantendo intactos perfis complexos, encoders dedicados (NVENC/AMF/AV1) e blindando a Stream Key da Twitch/YouTube. |

---

## 🛡️ 3. Logística de Isolamento, IDs e Concorrência (Multistream)

- **Isolamento de Chamadas (Rooms):** O ID da sala no servidor é rigorosamente o ID do Canal de Voz do Discord (`channel_id`), globalmente exclusivo. Canais distintos rodam em universos WebRTC 100% isolados.
- **Concorrência (Grid Multi Stream):** Múltiplos publicadores compartilham a mesma sala. Transmissores PlayWeb e transmissores OBS compartilham a mesma grid dinâmica em mosaico.
- **Identidade Única (Participant Identity):**
  - PlayWeb Casual assume: `user_[Discord_User_ID]`
  - Modos OBS assumem: `obs_[Discord_User_ID]`

---

## 💰 4. Infraestrutura e Regras de Controle de Banda (FinOps)

O servidor atua puramente como um **roteador de pacotes (SFU)**, sem decodificação ou reencodificação de vídeo na CPU:
- **Hardware e Nuvem:** Instância Ubuntu na Hetzner Cloud (Plano CX23 - Falkenstein/Helsinque, 2 vCPUs, 4 GB RAM, porta de rede compartilhada de 10 Gbps com 20 TB de tráfego mensal gratuito incluso).
- **Cap Inteligente (Proteção):**
  - Teto de Bitrate de 8 Mbps configurado via `livekit.yaml` (`limit.bytes_per_sec: 1000000`).
  - Instâncias de Ingress operam em Modo Passthrough (apenas repasse de codecs originais).
  - Dynamic Simulcast ativo no receptor (Iframe) para pausar e otimizar banda em grids com vídeos minimizados.

---

## 🗺️ 5. Roadmap de Execução

- [x] **Fase 1: O Coração da Mídia (Ambiente Local)**
  - [x] Configuração do Docker e inicialização do container LiveKit Server com limites FinOps e portas UDP.
  - [x] Backend de autenticação de tokens JWT respeitando `channel_id` e identidades `user_` / `obs_`.
  - [x] Frontend React / Next.js consumindo `getDisplayMedia` (PlayWeb Casual) com Simulcast por hardware (360p, 720p60, 1080p60).
  - [x] Componente `VideoPlayer` com HUD de telemetria em tempo real (FPS, Resolução, Bitrate), Document Picture-in-Picture e seletor de camadas.
  - [x] Grid Multi Stream dinâmica com layout mosaico.
- [ ] **Fase 2: O Interruptor Inteligente (Orquestração FinOps)**
  - [ ] Bot no Discord e backend em Node.js ou Python como API intermediária.
  - [ ] Gatilho de Boot: Abertura do Iframe dispara ativação da VPS na Hetzner (`power_on`).
  - [ ] Cron de Desligamento: Webhooks do LiveKit notificando esvaziamento das salas e `power_off` após 15 minutos de inatividade.
- [ ] **Fase 3: A Infraestrutura de Produção (Hetzner Cloud)**
  - [ ] Provisionamento da VPS CX23 na Europa.
  - [ ] Firewall para o range UDP de mídia (50000-60000).
  - [ ] Proxy Reverso (Caddy / Nginx) HTTPS 443 -> WSS e WHIP (porta 8085).
- [ ] **Fase 4: O Encaixe Perfeito (Discord Embedded App)**
  - [ ] Integração do `@discord/embedded-app-sdk` no frontend para leitura de contexto (usuários, avatar).
  - [ ] UI dividida em "PlayWeb Casual" e "OBS Studio" (com geração de credenciais WHIP e onboarding visual).

---

## 🚀 Como Executar Localmente (Fase 1)

### 1. Iniciar o SFU Local (LiveKit Server)
Certifique-se de que o Docker Desktop está em execução e execute:
```bash
cd infra
docker compose up -d
```
Verifique a saúde do servidor em `http://127.0.0.1:7880` (deve retornar `OK`).

### 2. Iniciar o Frontend (Next.js)
Em outro terminal:
```bash
cd frontend
npm run dev
```
Acesse `http://localhost:3000` no seu navegador.

---

## ⚖️ Licença e Direitos Autorais

Este é um projeto proprietário e de portfólio pessoal de **Kayque Reis**. Todos os direitos reservados.
Proibida a reprodução ou uso comercial não autorizado.

