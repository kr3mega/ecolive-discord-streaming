# EcoLive - Low-Latency Distributed Streaming Platform

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0-emerald.svg?style=for-the-badge" alt="Version 2.0.0" />
  <img src="https://img.shields.io/badge/security-Zero--Trust%20Vault-blue.svg?style=for-the-badge" alt="Security: Zero-Trust Vault" />
  <img src="https://img.shields.io/badge/cryptography-HMAC--SHA256%20256bit-indigo.svg?style=for-the-badge" alt="Cryptography: HMAC-SHA256" />
  <img src="https://img.shields.io/badge/next.js-16%20(Turbopack)-black.svg?style=for-the-badge" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/webrtc-LiveKit%20SFU-orange.svg?style=for-the-badge" alt="LiveKit SFU" />
  <img src="https://img.shields.io/badge/streaming-1080p%20%40%20120%20FPS-purple.svg?style=for-the-badge" alt="1080p 120 FPS" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Proprietary-red.svg?style=for-the-badge" alt="License: Proprietary" /></a>
</p>

> **Plataforma de transmissão WebRTC de ultra-baixa latência integrada ao ecossistema Discord com autenticação oficial OAuth2. Suporta streaming em tempo real pelo navegador e ingestão profissional via OBS Studio (WHIP Passthrough) com até 120 FPS.**  
> *Autor: Kayque Reis ([@kr3mega](https://github.com/kr3mega))*

---

## 1. Visão Geral

O **EcoLive** é uma infraestrutura de streaming em tempo real projetada para entregar transmissão de alta fidelidade (**1080p a 60 / 120 FPS**) com latência inferior a **200ms**, eliminando o atraso de 5 a 15 segundos comum em plataformas tradicionais.

A arquitetura opera sobre cluster WebRTC SFU (*Selective Forwarding Unit*), otimizando a distribuição de pacotes de mídia diretamente aos clientes autorizados.

---

## 2. Arquitetura e Diferenciais

* **Latência Ultra-Baixa Real (< 200ms):** Transporte de pacotes de mídia via UDP/SRTP diretamente aos nós de distribuição, sem segmentação HLS/DASH.
* **Autenticação e Identidade Discord:** Integração com Discord OAuth2 para identificação de participantes, renderização de avatares oficiais e validação de permissões de guilda.
* **Transmissão Sob Demanda:** Inscrição seletiva de faixas de vídeo. Espectadores que não estão assistindo consomem 0 kbps de tráfego de rede no servidor.
* **Ingestão Profissional OBS Studio (WHIP):** Suporte nativo ao protocolo WHIP (*WebRTC HTTP Ingestion*). O fluxo de mídia é codificado diretamente por hardware (NVENC/AMF/AV1) e entregue ao servidor sem impacto no processador.
* **Grid Multistream Dinâmico:** Visualização simultânea de múltiplos participantes em mosaico com adaptação de resolução por simulcast.

---

## 3. Segurança e Governança (Zero-Trust Architecture)

A plataforma implementa um modelo estrito de segurança **Zero-Trust**:

* **Isolamento Total de Segredos:** Todas as chaves mestras de API, segredos de criptografia e credenciais residem exclusivamente em cofres de ambiente da infraestrutura de nuvem, nunca no repositório de código.
* **Sessões Criptográficas com HMAC-SHA256:** As sessões de usuários e administradores utilizam tokens assinados criptograficamente com HMAC-SHA256 e validação em tempo constante (*timing-safe*).
* **Row-Level Security (RLS) Estrito em APIs:** Endpoints de gestão de mídia e geração de chaves validam a identidade verificada da sessão criptográfica, impedindo requisições forjadas ou acesso a recursos de terceiros.
* **Tokens Efêmeros de Mídia:** Tokens de acesso ao SFU WebRTC possuem ciclo de vida curto (TTL estrito) e escopo restrito à sala designada.
* **Proteção de Transporte:** Comunicação de borda blindada com TLS 1.3 obrigatório e isolamento de portas internas no firewall.

---

## 4. Stack Tecnológica

| Camada | Tecnologias Utilizadas |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS |
| **Streaming & WebRTC** | LiveKit Client SDK, LiveKit Components, LiveKit Server SDK |
| **Identidade** | Discord OAuth2 API, CDN Avatars, HMAC-SHA256 Session Vault |
| **Distribuição de Mídia** | LiveKit SFU (Go), LiveKit Ingress (WHIP Server), Redis Cluster |
| **Borda e Proxy** | Caddy Server (TLS automático, HTTP/3), UFW Firewall |
| **Infraestrutura** | Containers Docker isolados, Linux Enterprise Server |

---

## Licença e Direitos Autorais

Este é um software proprietário desenvolvido por **Kayque Reis** ([@kr3mega](https://github.com/kr3mega)). Todos os direitos estão reservados.

O código-fonte é disponibilizado publicamente exclusivamente sob os termos da [Licença Proprietária de Uso Restrito e Isenção de Responsabilidade](LICENSE):
* **Permissões concedidas:** Leitura, auditoria técnica e clonagem local estritamente para estudo pessoal, fins acadêmicos ou avaliação profissional por recrutadores.
* **Restrições absolutas:** Proibida qualquer exploração comercial, redistribuição, revenda, sublicenciamento ou operação como serviço (SaaS/plataforma concorrente) sem autorização prévia, expressa e formal por escrito do autor.
* **Isenção de Garantia e Responsabilidade ("AS IS"):** O software é fornecido no estado em que se encontra, sem garantias de qualquer natureza. Em nenhuma hipótese o autor será responsável por danos, perdas operacionais, interrupções ou custos decorrentes do uso deste código.

---

<p align="center">
  Desenvolvido por <a href="https://github.com/kr3mega">Kayque Reis</a>.
</p>
