# 🍃 EcoLive Frontend - Discord Streaming Web App (v1.5.1)

> **Aplicação Web Next.js 16 (App Router + Turbopack) integrada ao Discord Embedded App SDK e LiveKit Client para transmissões de tela em tempo real.**

---

## ⚡ Tecnologias

* **Framework:** Next.js 16.3.4 (App Router)
* **Linguagem:** TypeScript 5
* **Estilização:** Tailwind CSS v4
* **WebRTC & Streaming:** `@livekit/components-react` v2, `livekit-client` v2, `livekit-server-sdk` v2
* **Discord SDK:** `@discord/embedded-app-sdk` v2.5.0

---

## 📁 Estrutura de Pastas

```text
frontend/
├── app/
│   ├── api/
│   │   ├── ingress/route.ts   # Endpoint de geração de credenciais WHIP para OBS
│   │   └── token/route.ts     # Endpoint de geração de JWT autenticado para LiveKit
│   ├── layout.tsx             # Layout global com fontes Geist
│   └── page.tsx               # Interface principal (HUD, Player, Modais de Streaming)
├── components/
│   └── VideoPlayer.tsx        # Player WebRTC dinâmico com overlay de telemetria
├── hooks/
│   └── useLiveKit.ts          # Hook customizado de controle de conexão, feeds e captura
├── public/                    # Assets estáticos
├── Dockerfile                 # Multi-stage build otimizado para produção
└── next.config.ts             # Configuração de rewrites e origens permitidas
```

---

## 🚀 Execução Local

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local

# 3. Iniciar servidor de desenvolvimento
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no seu navegador.

---

## ⚖️ Licença

Projeto proprietário desenvolvido por [Kayque Reis](https://github.com/kr3mega). Todos os direitos reservados.
