
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

## 💰 4. Infraestrutura, FinOps & Segurança Zero-Leakage

O projeto opera sob uma estratégia de **validação de custo zero e máxima segurança**:
- **Ambiente Local via Docker:** Servidor LiveKit SFU de alta performance rodando localmente sem custos de infraestrutura de nuvem nesta fase de validação.
- **Túnel Seguro via Ngrok:** Exposição do frontend HTTPS e da sinalização WSS com criptografia TLS ponta a ponta para homologação imediata no ecossistema de Activities do Discord.
- **Cap Inteligente (FinOps):** Teto de Bitrate de 8 Mbps configurado via `livekit.yaml` (`limit.bytes_per_sec: 1000000`).
- **🛡️ Isolamento Estrito de Credenciais (Server-Side Only):**
  - **Zero-Leakage no Frontend:** Nenhuma chave de API, secret ou authtoken possui o prefixo `NEXT_PUBLIC_`. Elas residem exclusivamente no runtime do servidor Node.js/Next.js.
  - **Tokens com TTL de Curta Duração:** O frontend recebe apenas JWTs temporários assinados com prazo de expiração estrito.
  - **Anti-Cache:** Respostas de autenticação possuem cabeçalhos `Cache-Control: no-store` para impedir armazenamento em proxies intermediários.

---

## 🗺️ 5. Roadmap de Execução Consolidado

- [x] **Fase 1: O Coração da Mídia (Ambiente Local)**
  - [x] Container LiveKit Server (`ecolive-livekit`) configurado com limites FinOps e portas UDP.
  - [x] Frontend Next.js com PlayWeb Casual (`getDisplayMedia`) e Simulcast em 3 camadas por hardware a 60 FPS.
  - [x] Grid Multi Stream dinâmico em mosaico e HUD de telemetria em tempo real no `VideoPlayer`.
- [x] **Fase 2: O Túnel Seguro & Blindagem de Credenciais (Ngrok + Zero-Leakage)**
  - [x] Configuração declarativa de túneis seguros via `infra/ngrok.yml` e Docker Compose.
  - [x] Remoção de todas as variáveis `NEXT_PUBLIC_` para isolamento total de chaves e segredos no servidor.
  - [x] Proteção global de credenciais via `.gitignore` raiz e criação de templates `.env.example`.
  - [x] Rota `/api/token` blindada com TTL curto e cabeçalhos anti-cache.
- [ ] **Fase 3: Bot do Discord & Sensor de Presença Local**
  - [ ] Bot local no Discord (`discord.js`) atuando como monitor de presença no canal de voz.
  - [ ] Comandos Slash para iniciar e consultar o status da sessão do EcoLive.
- [ ] **Fase 4: O Encaixe Perfeito (Discord Embedded App)**
  - [ ] Integração do `@discord/embedded-app-sdk` no frontend para contexto do usuário (avatar, username).
  - [ ] Validação das modalidades PlayWeb e OBS diretamente dentro do Iframe oficial do Discord.

---

## 🚀 Como Executar Localmente

### 1. Iniciar o SFU Local (LiveKit Server)
```bash
cd infra
docker compose up -d
```
Verifique se o servidor está ativo em `http://127.0.0.1:7880` (deve retornar `OK`).

### 2. Iniciar o Frontend (Next.js)
Em outro terminal:
```bash
cd frontend
npm run dev
```
Acesse `http://localhost:3000` no seu navegador.

### 3. (Opcional) Iniciar o Túnel Seguro do Ngrok
Para expor a aplicação em HTTPS público para testes no Discord:
1. Configure seu authtoken no arquivo `infra/.env` (veja `infra/.env.example`).
2. Execute o script:
```powershell
cd infra
.\start-tunnel.ps1
```

---

## ⚖️ Licença e Direitos Autorais

Este é um projeto proprietário e de portfólio pessoal de **Kayque Reis**. Todos os direitos reservados.
Proibida a reprodução ou uso comercial não autorizado.


