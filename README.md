
# 🍃 EcoLive - Discord Streaming

> **Plataforma de transmissão WebRTC de alta performance para Discord com sensor de presença e controle dinâmico de custos em nuvem.**

---

## 📋 Sobre o Projeto

O **EcoLive** é um *Embedded App* (Atividade oficial) para o Discord focado em comunidades gamers, projetado para entregar transmissões de tela ultra fluidas (**1080p a 60fps**) com latência inferior a 200ms. 

O grande diferencial do projeto está na sua **arquitetura ecologicamente e financeiramente sustentável (Eco)**. Em vez de manter um servidor robusto na nuvem rodando 24/7 gerando custos desnecessários, o projeto conta com um **bot inteligente** integrado à API da Hetzner Cloud. Ele atua como um sensor de presença: liga a infraestrutura de mídia assim que os usuários entram na call e desliga o servidor automaticamente quando a sala fica vazia.

---

## 🛠️ Pilares Técnicos & Arquitetura

O projeto foi construído dividindo-se em microsserviços e responsabilidades isoladas:

* **O Coração da Mídia (SFU):** Servidor **LiveKit** rodando via **Docker** em uma instância Linux na Hetzner Cloud. Utiliza arquitetura SFU WebRTC sobre portas UDP dinâmicas, garantindo o menor uso de banda possível.
* **Transmissão Inteligente (Simulcast):** O frontend em **React/Next.js** captura a tela e ativa o *Simulcast* por hardware. Isso divide o vídeo em camadas de qualidade (360p, 720p, 1080p60), permitindo que cada espectador escolha a resolução ideal sem afetar a transmissão dos outros.
* **Automação de Custos (O Bot):** Aplicação Node.js/Python monitorando o evento `voiceStateUpdate` do Discord para disparar comandos de `power_on` e `power_off` (com temporizador de segurança) na nuvem.
* **Segurança e Homologação:** Tráfego de sinalização envelopado em **HTTPS/WSS (Porta 443)** através de um Proxy Reverso (Caddy/Nginx), atendendo aos requisitos obrigatórios de segurança do SDK do Discord.

---

## 📂 Estrutura de Desenvolvimento

O roadmap de engenharia foi executado de forma estrita em 4 fases:

1. **Fase 1 (Ambiente Local):** Configuração de containers Docker locais com chaves de teste para validação da API `getDisplayMedia`.
2. **Fase 2 (Automação):** Desenvolvimento do ciclo de vida do bot e integração com os webhooks de controle de energia da VPS.
3. **Fase 3 (Nuvem de Produção):** Provisionamento de infraestrutura, regras de Firewall para portas de mídia (50000-60000 UDP) e certificados SSL.
4. **Fase 4 (Discord Embedded App SDK):** Integração com o ecossistema do Discord para leitura de contexto (avatar e nicknames) e ajustes visuais de resolução.

---

## 🚀 Como Executar Localmente (Modo Desenvolvimento)

*(Em breve - documentação dos comandos de inicialização do Docker e do Frontend)*

---

## ⚖️ Licença e Direitos Autorais

Este é um projeto proprietário e de portfólio pessoal. **Todos os direitos estão reservados.** 

Recrutadores, desenvolvedores e visitantes têm total permissão para visualizar, auditar e clonar o repositório para fins de avaliação técnica e estudo. No entanto, é **estritamente proibida** a cópia, modificação, engenharia reversa, redistribuição ou uso comercial de qualquer parte deste código sem autorização prévia por escrito do autor.

---
<p align="center">
  Desenvolvido com 💚 por [Seu Nome] como parte do meu ecossistema de portfólio.
</p>
