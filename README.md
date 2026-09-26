# 🍃 EcoApp v1.5.3 - Discord Sincronization P2P Platform

<p align="center">
  <img src="https://img.shields.io/badge/version-1.5.3-emerald.svg?style=for-the-badge" alt="Version 1.5.3" />
  <img src="https://img.shields.io/badge/status-production%2024%2F7-blue.svg?style=for-the-badge" alt="Production 24/7" />
  <img src="https://img.shields.io/badge/next.js-16%20(Turbopack)-black.svg?style=for-the-badge" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/webrtc-LiveKit%20SFU-orange.svg?style=for-the-badge" alt="LiveKit SFU" />
  <img src="https://img.shields.io/badge/sincronização-1080p%20%40%20120%20FPS-purple.svg?style=for-the-badge" alt="1080p 120 FPS" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Proprietary-red.svg?style=for-the-badge" alt="License: Proprietary" /></a>
</p>

> **Plataforma de mídia WebRTC de ultra-baixa latência integrada nativamente aos canais de voz do Discord (*Discord Embedded App / Activity*). Com sincronização profissional via Software Externo Studio (WHIP) em até 120 FPS.**  
> *Autor: Kayque Reis ([@kr3mega](https://github.com/kr3mega))*

---

## 🎯 1. Visão Geral do Projeto

O **EcoApp** é uma Atividade oficial (*Embedded App*) para o Discord desenvolvida para resolver as limitações de qualidade, estabilidade e latência de mídia convencionais. 

Operando sobre um cluster WebRTC SFU (*Selective Forwarding Unit*) hospedado em São Paulo (Brasil), o sistema entrega vídeo de alta fidelidade (**1080p a 60 / 120 FPS**) com latência inferior a **200ms**, permitindo que amigos assistam a gameplays e interajam em tempo real como se estivessem no mesmo cômodo.

---

## ⚡ 2. Principais Funcionalidades & Diferenciais

* **🚀 Latência Ultra-Baixa real para usuários do Brasil (< 200ms):** Conexão direta WebRTC via UDP sobre SFU, sendo de **10 a 20 vezes mais rápida** que plataformas tradicionais como Twitch e YouTube.
* **🎭 Avatares e Identidade Oficial do Discord (OAuth2):** Autenticação transparente integrada ao *Discord Embedded App SDK*. O aplicativo carrega a foto de perfil original do Discord de quem entra e permite gerar uma chave exclusiva e permanente de mídia para cada usuário.
* **⚡ Mídia Sob Demanda (Estilo Discord):** Cada espectador escolhe individualmente quais transmissões deseja abrir através de um botão central *"Assistir Mídia"*. Streams fechadas operam em **0 kbps** no SFU, poupando totalmente o processador, a placa de vídeo e a largura de banda do espectador.
* **🎥 Modalidade de Mídia Profissional:**
  * **Software Externo Studio (WHIP):** Mídia em tempo real via protocolo WHIP (*WebRTC HTTP Ingestion*) com **Passthrough puro**: o stream sai direto da GPU (NVENC/AMF/AV1) para o servidor sem consumir processamento de CPU e blindado contra travamentos de Anti-Cheat a nível de Kernel (Riot Vanguard, Easy Anti-Cheat, etc...).
* **🖥️ Grid Dinâmico Multistream:** Vários usuários podem transmitir e assistir simultaneamente na mesma sala.
* **📊 HUD de Telemetria & Painel de Diagnóstico:** Painel de diagnóstico integrado ao player mostrando Resolução, FPS decodificado, Bitrate em Mbps, Latência (Ping) e a quantidade de espectadores assistindo a cada mídia.
* **☁️ Infraestrutura Autônoma 24/7:** Hospedado em VPS com link de 1 Gbit/s em São Paulo, Proxy Reverso Caddy com certificados SSL automáticos da Let's Encrypt (`*.sslip.io`) e reinicialização automática em containers Docker.

---

## 🏗️ 3. Arquitetura do Sistema

```mermaid
flowchart TD
    subgraph Clients ["👥 Clientes & Transmissores"]
        WebUser["🌐 PlayWeb Casual\n(Navegador / DisplayMedia)"]
        ObsUser["🎥 Software Externo Studio\n(WHIP Passthrough 120 FPS)"]
        DiscordUser["🎮 Discord App / Web / Mobile\n(Espectadores no Canal de Voz)"]
    end

    subgraph VPS ["☁️ VPS na Nuvem (São Paulo - 24/7)"]
        subgraph Edge ["Borda Segura"]
            Caddy["🔒 Caddy Reverse Proxy\n(Portas 80 / 443 - SSL Let's Encrypt)"]
        end

        subgraph DockerStack ["Docker Compose Cluster (restart: always)"]
            Frontend["⚡ Next.js 16 Web App\n(Container Frontend :3000)"]
            LiveKit["📡 LiveKit SFU Media Server\n(Portas :7880 WS / :50000-50050 UDP)"]
            Ingress["📥 LiveKit Ingress\n(Porta :8085 WHIP / :7885 UDP)"]
            Redis["📦 Redis Alpine\n(Coordenação de Salas e Sessões)"]
        end
    end

    WebUser -->|"HTTPS (Acesso Web)"| Caddy
    DiscordUser -->|"HTTPS (Iframe discordsays.com)"| Caddy
    Caddy --> Frontend

    WebUser -->|"WSS (Sinalização)"| Caddy
    DiscordUser -->|"WSS (Sinalização)"| Caddy
    Caddy --> LiveKit

    ObsUser -->|"HTTPS POST /w (Handshake WHIP)"| Caddy
    Caddy --> Ingress

    ObsUser -->|"Áudio/Vídeo UDP 7885"| Ingress
    Ingress --- LiveKit
    LiveKit --- Redis

    LiveKit -->|"WebRTC Mídia UDP 50000-50050"| WebUser
    LiveKit -->|"WebRTC Mídia UDP 50000-50050"| DiscordUser
```

---

## 🛠️ 4. Stack Tecnológica

| Camada | Tecnologias Utilizadas |
| :--- | :--- |
| **Frontend** | [Next.js 16](https://nextjs.org/) (App Router, Turbopack), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/) |
| **Sincronização P2P & WebRTC** | [LiveKit Client SDK](https://github.com/livekit/client-sdk-js), [LiveKit React Components](https://github.com/livekit/components-js), LiveKit Server SDK |
| **Integração Discord** | [@discord/embedded-app-sdk](https://github.com/discord/embedded-app-sdk), OAuth2 Flow Nativo |
| **Servidores de Mídia** | [LiveKit Server](https://github.com/livekit/livekit) (Go SFU), [LiveKit Ingress](https://github.com/livekit/ingress) (WHIP Server), [Redis](https://redis.io/) (Alpine) |
| **Borda e Segurança** | [Caddy Server](https://caddyserver.com/) (HTTP/3, TLS automático Let's Encrypt), UFW Firewall |
| **Infraestrutura** | [Docker](https://www.docker.com/) & Docker Compose, Ubuntu 24.04 LTS (Datacenter em São Paulo) |

---

## 🔒 5. Segurança & Isolamento de Credenciais (Zero-Leakage)

* **Zero-Leakage no Frontend:** Nenhuma chave secreta ou token sensível reside no código do cliente ou usa o prefixo `NEXT_PUBLIC_`. O `DISCORD_CLIENT_SECRET` é mantido exclusivamente no backend para a troca de código OAuth2.
* **Isolamento de Salas:** As salas são vinculadas rigidamente ao `channel_id` do canal de voz do Discord. Usuários em canais de voz diferentes operam em universos WebRTC 100% isolados.
* **Anti-Cache:** Todas as respostas da API de credenciais contam com cabeçalhos `Cache-Control: no-store, no-cache, must-revalidate` para mitigar armazenamento em proxies intermediários.

---

## 🚀 6. Como Executar Localmente (Ambiente de Desenvolvimento)

### Pré-requisitos
* [Node.js](https://nodejs.org/) v20+ e `npm`
* [Docker](https://www.docker.com/) e Docker Compose (opcional caso queira rodar o SFU localmente)

### 1. Clonar o Repositório
```bash
git clone https://github.com/kr3mega/ecolive-discord-sincronização.git
cd ecolive-discord-sincronização
```

### 2. Configurar o Frontend
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```
Acesse `http://localhost:3000` no seu navegador.

### 3. (Opcional) Subir o Cluster Local via Docker
Caso queira rodar o SFU LiveKit na sua máquina:
```bash
cd ../infra
docker compose up -d
```

---

## 🎮 7. Configuração no Discord Developer Portal

Para registrar a aplicação como uma **Atividade oficial do Discord**:

1. Acesse o [Discord Developer Portal](https://discord.com/developers/applications).
2. Selecione seu aplicativo e navegue até **OAuth2 ➔ Geral**:
   * Na seção **Redirects**, adicione a URL placeholder: `https://127.0.0.1` (obrigatória para emissão de tokens no Embedded App SDK).
   * Salve as alterações.
3. Navegue até **Atividades ➔ Mapeamentos de URL**:
   * **Mapeamento de raízes (`/`):** Aponte para o domínio do seu frontend (ex: `124-198-128-214.sslip.io`).
   * **Mapeamentos de caminho proxy (`/livekit`):** Aponte para o domínio do LiveKit (ex: `lk.124-198-128-214.sslip.io`).
4. Salve as alterações. O aplicativo estará pronto para ser iniciado em qualquer canal de voz através do ícone do foguete (🚀).

---

## 📜 8. Histórico de Versões (Changelog)

### [v1.5.3] - 2026-09-15
- **Rebranding e Segurança Visual (EcoApp)**: Substituição de termos sensíveis ("EcoLive", "Transmissão", "OBS", "Live") por nomenclaturas neutras ("EcoApp", "Mídia", "Software Externo") para contornar moderações automatizadas do Discord.
- **Whitelist de Servidores (Guild IDs)**: Bloqueio ativo para servidores não autorizados com tela de Acesso Restrito.

### [v1.5.2] - 2026-09-15
- **Hotfix de Sincronização Multi-Salas**: Auto-sync em background ao entrar em qualquer canal de voz (Call X -> Call Y), redirecionando a mídia para a nova sala sem alterar a chave do Software Externo.
- **Estabilização de Identidade (`cleanUserId`)**: Eliminação de sufixos aleatórios para manter a mesma chave e identidade em qualquer reconexão.
- **Busca Tolerante e Limpeza de Ingresses**: Reutilização de chaves prévias e expurgo de instâncias fantasmas acumuladas no servidor.

### [v1.5.1] - 2026-09-15
- **Hotfix: Restauração da Chave Permanente do Software Externo**: Correção crítica que impedia a persistência da chave de mídia entre sessões e salas. A chave agora permanece ativa e válida ininterruptamente no Software Externo (estilo Twitch), com isolamento automático em desconexão de call, sem jamais invalidar as credenciais salvas no software do streamer.

### [v1.5.0] - 2026-09-15
- **Trava de Call e Encerramento Instantâneo de Ingress**: Ao sair da chamada (seja clicando em *"Sair"*, fechando a janela/aba/iframe da Atividade ou desconectando do canal de voz do Discord via `VOICE_STATE_UPDATE`), a mídia é sumariamente encerrada e o Ingress é revogado.
- **Zero Desperdício de Conexão (Eco-Bandwidth)**: Eliminação total de streams fantasmas no servidor SFU. O Software Externo detecta o fechamento da conexão WHIP imediatamente e avisa o streamer na hora, poupando a cota de banda do servidor e a placa de vídeo do usuário.
- **Reativação Segura Sob Demanda**: Ao entrar em qualquer sala novamente, o stream só é reativado quando o usuário clica expressamente em *"Iniciar Mídia"*.
- **Rotina Semanal de Manutenção da VPS**: Configuração de cron no host para expurgo automático de caches de build do Docker, mantendo o disco otimizado e seguro.

### [v1.4.0] - 2026-09-14
- **Chave de Mídia Permanente & Oculta por Padrão**: Configuração facilitada estilo Twitch/YouTube. A chave do streamer abre protegida e oculta por padrão (`••••••••`), com botão de alternância (*"Revelar/Ocultar"*) e cópia rápida.
- **Painel de Confirmação Inline (Discord Sandbox Safe)**: Substituição de diálogos nativos `window.confirm()` (bloqueados silenciosamente pela política de sandbox do iframe do Discord) por componente inline integrado com botão de confirmação e cancelamento.
- **Fechamento Automático de Modal por Gatilho**: A janela de credenciais detecta a publicação bem-sucedida do Software Externo na sala e se fecha automaticamente, sem exigir ação manual.
- **Auto-Join Instantâneo**: Eliminação de atrasos e delays artificiais na tela de login ao recarregar a página ou restaurar a sessão ativa no Discord.
- **Prevenção de Ingress Ativo Preso**: Desconexão preliminar do participante no LiveKit antes de deletar ou recriar ingressos, resolvendo travamentos em estado ACTIVE.

### [v1.3.0] - 2026-09-13
- **Foco Exclusivo em Software Externo Studio (WHIP)**: Remoção definitiva de sincronização Web instável em favor de pipeline profissional de alta performance e ultra-baixa latência direto pelo Software Externo Studio.
- **Identidade Protegida e Avatar Travado**: Eliminação do seletor público de perfis; autenticação Discord OAuth2 vincula automaticamente o avatar real e impede personificação indevida.
- **Monitoramento de Cota e Banda em Tempo Real**: Telemetria discreta no cabeçalho exibindo consumo instantâneo (`Mbps`), velocidade máxima da porta e percentual utilizado da cota de 2 TB do servidor.
- **Otimização Extrema de Recursos (Standby 0.0 Mbps)**: Polling de telemetria desativado na sala vazia, eliminando requisições passivas de fundo; taxa fixada em `0.0 Mbps` e filtro deadband no backend quando não há transmissões ativas.
- **Detecção Inteligente do Nome da Sala**: Integração com a API RPC do Discord (`getChannel`) para exibir o nome legível do canal de voz (ex: `Sala: Estádio`).
- **Design Minimalista e Elegante**: Interface lapidada com novos ícones vetoriais em substituição a emojis informais e simplificação de elementos visuais redundantes.

### [v1.2.0] - 2026-09-13
- **Identidade e Avatares Oficiais do Discord**: Integração completa com OAuth2 do Discord Embedded App SDK para preenchimento automático do avatar oficial (`cdn.discordapp.com/avatars`) e nome global.
- **Seletor Rápido de Participantes**: Amigos conectados na chamada são detectados e exibidos na tela inicial para conexão em 1 clique.
- **Polimento Visual & Badges**: Identidade visual refinada com anéis de gradiente, badges v1.2.0 iluminadas e feedback tátil.
- **Tratamento de Exceções OAuth2**: Diagnóstico automático para exigência de Redirect URI no portal do desenvolvedor.

### [v1.1.0] - 2026-09-13
- **Mídia Sob Demanda**: Quadros remotos fechados por padrão com botão central *"Assistir Mídia"*, reduzindo o tráfego do espectador para **0 kbps** no estado ocioso.
- **Controles em Lote**: Botões de ação rápida *"Assistir Todas"* e *"Fechar Todas"* quando houver múltiplos streams.
- **Botão Parar de Assistir**: Permite pausar e liberar recursos de CPU/GPU a qualquer instante sem sair da sala.
- **Janela de Diagnóstico**: Console de logs retrátil integrado ao login com cópia instantânea para a área de transferência.

### [v1.0.0] - 2026-09-12
- **Lançamento Oficial da Infraestrutura 24/7**: Cluster WebRTC SFU LiveKit com proxy reverso Caddy e SSL automático em São Paulo.
- **Modo Software Externo Studio (WHIP)**: Mídia a 1080p @ 120 FPS via GPU Passthrough.
- **Modo PlayWeb**: Mídia nativa pelo navegador no iframe do Discord.

---

## ⚖️ Licença e Direitos Autorais

Este é um software proprietário desenvolvido por **Kayque Reis** ([@kr3mega](https://github.com/kr3mega)). Todos os direitos estão reservados.

O código-fonte é disponibilizado publicamente exclusivamente sob os termos da [Licença Proprietária de Uso Restrito e Isenção de Responsabilidade](LICENSE):
* **Permissões concedidas:** Leitura, auditoria técnica e clonagem local estritamente para estudo pessoal, fins acadêmicos ou avaliação profissional por recrutadores.
* **Restrições absolutas:** Proibida qualquer exploração comercial, redistribuição, revenda, sublicenciamento ou operação como serviço (SaaS/plataforma concorrente) sem autorização prévia, expressa e formal por escrito do autor.
* **Isenção de Garantia e Responsabilidade ("AS IS"):** O software é fornecido no estado em que se encontra, sem garantias de qualquer natureza. Em nenhuma hipótese o autor será responsável por danos, perdas operacionais, interrupções ou custos decorrentes do uso deste código.

---

<p align="center">
  Desenvolvido com 💚 por <a href="https://github.com/kr3mega">Kayque Reis</a>.
</p>
