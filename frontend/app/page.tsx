'use client';

import { useState, useEffect } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { useLiveKit } from '@/hooks/useLiveKit';
import { VideoPlayer } from '@/components/VideoPlayer';

interface DiscordParticipant {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string | null;
  global_name?: string | null;
  nickname?: string;
}

export function getDiscordAvatarUrl(userId: string, avatarHash?: string | null): string {
  if (avatarHash) {
    const isAnimated = avatarHash.startsWith('a_');
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${isAnimated ? 'gif' : 'png'}?size=128`;
  }
  try {
    const index = Number((BigInt(userId) >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return `https://cdn.discordapp.com/embed/avatars/0.png`;
  }
}

interface WhipCredentials {
  serverUrl: string;
  streamKey: string;
  whipEndpoint: string;
  channelId: string;
  participantIdentity: string;
}

export default function Home() {
  const [displayName, setDisplayName] = useState('');
  const [channelId, setChannelId] = useState('call-discord-alpha');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isSimulatingExternal, setIsSimulatingExternal] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showLogWindow, setShowLogWindow] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);

  // Captura logs do console para a janelinha de diagnóstico em tempo real
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;

    const addLog = (level: string, ...args: unknown[]) => {
      const text = args
        .map((arg) => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(' ');
      setDebugLogs((prev) => [...prev.slice(-150), `[${new Date().toLocaleTimeString()}] [${level}] ${text}`]);
    };

    console.log = (...args) => { origLog(...args); addLog('LOG', ...args); };
    console.warn = (...args) => { origWarn(...args); addLog('WARN', ...args); };
    console.error = (...args) => { origErr(...args); addLog('ERR', ...args); };

    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origErr;
    };
  }, []);

  // Estados de Perfil e Avatar do Discord
  const [channelName, setChannelName] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [detectedDiscordUser, setDetectedDiscordUser] = useState<DiscordParticipant | null>(null);
  const [discordSdkStatus, setDiscordSdkStatus] = useState<string>('Verificando conexão...');

  // Monitoramento discreto de banda da VPS
  const [serverBandwidth, setServerBandwidth] = useState<{
    currentMbps: number;
    maxMbps: number;
    percent: number;
    rxMbps: number;
    txMbps: number;
    totalUsedGB: number;
    totalQuotaTB: number;
    quotaPercent: number;
  } | null>(null);


  // Auto-detecta o ID do canal de voz do Discord, participantes conectados e restaura preferências salvas
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const discordChannel = params.get('channel_id');
    if (discordChannel) {
      setChannelId(discordChannel);
    }
    const sim = params.get('simulate_external') === 'true' || params.get('simular_externo') === 'true';
    if (sim) {
      setIsSimulatingExternal(true);
    }
    const savedName = localStorage.getItem('ecolive_display_name');
    if (savedName) {
      setDisplayName(savedName);
    }
    const savedAvatar = localStorage.getItem('ecolive_avatar_url');
    if (savedAvatar) {
      setAvatarUrl(savedAvatar);
    }
    const savedChannelName = localStorage.getItem('ecolive_channel_name');
    if (savedChannelName) {
      setChannelName(savedChannelName);
    }

    const currentHost = window.location.hostname;
    const currentSearch = window.location.search;
    console.log('[Discord Init] Host:', currentHost, '| Query:', currentSearch);

    // Verifica se está dentro do ambiente de Activity do Discord
    const hasFrameId = params.has('frame_id');
    const isDiscordDomain = currentHost.includes('discordsays.com') || currentHost.includes('discord.com');
    const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

    if (!isDiscordDomain && !hasFrameId && !isInsideIframe) {
      const statusMsg = `Navegador externo (${currentHost})`;
      setDiscordSdkStatus(statusMsg);
      console.log('[Discord SDK] Executando fora do iframe oficial da Atividade do Discord:', currentHost);
      return;
    }

    let clientId = currentHost.split('.')[0];
    if (!clientId || clientId === 'discord' || clientId.includes('sslip') || clientId.includes('trycloudflare') || clientId === 'localhost') {
      const candidate = params.get('client_id') || params.get('app_id') || params.get('application_id');
      if (candidate) {
        clientId = candidate;
      }
    }

    if (!params.get('frame_id')) {
      const statusMsg = 'Aguardando Atividade no Discord (frame_id ausente)';
      setDiscordSdkStatus(statusMsg);
      console.warn('[Discord SDK] Parâmetro frame_id ausente na URL. Aberto como link direto? Host:', currentHost);
      return;
    }

    const initDiscord = async () => {
      try {
        setDiscordSdkStatus(`Iniciando SDK (${clientId})...`);
        console.log(`[Discord SDK] Instanciando DiscordSDK com client_id: ${clientId}`);
        const discordSdk = new DiscordSDK(clientId);

        setDiscordSdkStatus('Aguardando handshake do Discord...');
        await Promise.race([
          discordSdk.ready(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Handshake com o Discord demorou mais de 4s')), 4000)
          ),
        ]);

        let authenticatedUser: DiscordParticipant | null = null;

        // 1. Tenta autenticar a sessão oficial do Discord Activity
        try {
          setDiscordSdkStatus('Autenticando sessão do usuário...');
          let code: string | null = null;
          try {
            const authRes = await discordSdk.commands.authorize({
              client_id: clientId,
              response_type: 'code',
              state: '',
              prompt: 'none',
              scope: ['identify', 'guilds'],
            });
            code = authRes.code;
          } catch (silentErr: unknown) {
            const silentStr = typeof silentErr === 'object' ? JSON.stringify(silentErr) : String(silentErr);
            console.log('[Discord SDK] prompt: none falhou:', silentStr);
            if (silentStr.includes('redirect_uri')) {
              throw silentErr;
            }
            const authRes = await discordSdk.commands.authorize({
              client_id: clientId,
              response_type: 'code',
              state: '',
              scope: ['identify', 'guilds'],
            });
            code = authRes.code;
          }

          if (code) {
            const tokenRes = await fetch('/api/discord/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code }),
            });

            if (tokenRes.ok) {
              const tokenData = await tokenRes.json();
              if (tokenData.access_token) {
                const authResult = await discordSdk.commands.authenticate({
                  access_token: tokenData.access_token,
                });
                if (authResult?.user) {
                  authenticatedUser = {
                    id: authResult.user.id,
                    username: authResult.user.username,
                    discriminator: authResult.user.discriminator,
                    avatar: authResult.user.avatar,
                    global_name: authResult.user.global_name,
                  };
                  console.log('[Discord SDK] Usuário autenticado com sucesso:', authenticatedUser);
                  const chosenName = authenticatedUser.global_name || authenticatedUser.username;
                  setDisplayName(chosenName);
                  localStorage.setItem('ecolive_display_name', chosenName);
                  const avatar = getDiscordAvatarUrl(authenticatedUser.id, authenticatedUser.avatar);
                  setAvatarUrl(avatar);
                  localStorage.setItem('ecolive_avatar_url', avatar);
                  setDetectedDiscordUser(authenticatedUser);
                  setDiscordSdkStatus(`Conectado como ${chosenName}`);
                }

                // Obtém o nome amigável do canal de voz no Discord (ex: "Estádio")
                try {
                  const targetChannelId = discordSdk.channelId || params.get('channel_id');
                  if (targetChannelId) {
                    const channel = await discordSdk.commands.getChannel({ channel_id: targetChannelId });
                    if (channel?.name) {
                      console.log('[Discord SDK] Canal detectado:', channel.name);
                      setChannelName(channel.name);
                      localStorage.setItem('ecolive_channel_name', channel.name);
                    }
                  }
                } catch (chErr) {
                  console.warn('[Discord SDK] Falha ao obter nome do canal:', chErr);
                }
              }
            } else {
              const errData = await tokenRes.json().catch(() => ({}));
              console.warn('[Discord Auth Backend]:', errData.error || 'Erro na troca do token');
              setDiscordSdkStatus('Erro ao validar token no backend');
            }
          }
        } catch (authErr: unknown) {
          const errMsg = typeof authErr === 'object' ? JSON.stringify(authErr) : String(authErr);
          console.warn('[Discord SDK Authorize]:', errMsg);
          if (errMsg.includes('redirect_uri')) {
            setDiscordSdkStatus('OAuth2: Adicione https://127.0.0.1 em OAuth2 > Redirects no Developer Portal');
          } else {
            setDiscordSdkStatus('Falha na autorização do Discord');
          }
        }

        if (authenticatedUser) {
          setDiscordSdkStatus('Identidade Oficial Vinculada');
        } else {
          setDiscordSdkStatus('Modo Visitante (Discord não autenticado)');
        }
      } catch (err) {
        let errMsg = '';
        try {
          errMsg = err instanceof Error ? err.message : JSON.stringify(err);
        } catch {
          errMsg = String(err);
        }
        console.warn('[Discord SDK Falhou]:', errMsg);
        setDiscordSdkStatus(`Discord SDK: ${errMsg}`);
      }
    };

    initDiscord();
  }, []);

  // Estados do Modal de Transmissão via OBS
  const [isStreamModalOpen, setIsStreamModalOpen] = useState(false);
  const [isGeneratingWhip, setIsGeneratingWhip] = useState(false);
  const [whipCredentials, setWhipCredentials] = useState<WhipCredentials | null>(null);
  const [whipError, setWhipError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const {
    isConnected,
    remoteFeeds,
    currentIdentity,
    currentRoom,
    connect,
    disconnect,
    setQuality,
  } = useLiveKit();

  // Tem alguma live ativa transmitindo na sala?
  const hasActiveStreams = isConnected && remoteFeeds.length > 0;

  // Monitoramento de banda sob demanda:
  // - Sem live ativa: Zera pooling para poupar rede e define taxa em 0.0 Mbps
  // - Com live ativa: Inicia pooling a cada 3s para acompanhar a taxa em tempo real
  useEffect(() => {
    if (!isConnected) return;

    let isMounted = true;
    const fetchBandwidth = async () => {
      try {
        const res = await fetch('/api/server/bandwidth');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (!hasActiveStreams) {
              data.currentMbps = 0;
              data.rxMbps = 0;
              data.txMbps = 0;
              data.percent = 0;
            }
            setServerBandwidth(data);
          }
        }
      } catch {
        // Silencioso em caso de falha de conexão
      }
    };

    // Busca inicial de cota ao entrar na sala
    fetchBandwidth();

    if (hasActiveStreams) {
      const interval = setInterval(fetchBandwidth, 3000);
      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    } else {
      setServerBandwidth((prev) => (prev ? { ...prev, currentMbps: 0, rxMbps: 0, txMbps: 0, percent: 0 } : null));
    }

    return () => {
      isMounted = false;
    };
  }, [isConnected, hasActiveStreams]);

  // Transmissões remotas assistidas sob demanda (estilo Discord)
  const [watchedTrackSids, setWatchedTrackSids] = useState<Set<string>>(new Set());

  // Limpa SIDs de transmissões encerradas
  useEffect(() => {
    setWatchedTrackSids((prev) => {
      const activeSids = new Set(remoteFeeds.map((f) => f.publication.trackSid));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((sid) => {
        if (activeSids.has(sid)) {
          next.add(sid);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [remoteFeeds]);

  const handleToggleWatch = (trackSid: string, watch?: boolean) => {
    setWatchedTrackSids((prev) => {
      const next = new Set(prev);
      const shouldWatch = watch !== undefined ? watch : !next.has(trackSid);
      if (shouldWatch) {
        next.add(trackSid);
      } else {
        next.delete(trackSid);
      }
      return next;
    });
  };

  const handleWatchAll = () => {
    setWatchedTrackSids(new Set(remoteFeeds.map((f) => f.publication.trackSid)));
  };

  const handleStopWatchAll = () => {
    setWatchedTrackSids(new Set());
  };

  const handleJoin = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const name = displayName.trim();
    if (!name) {
      setJoinError('Por favor, informe seu Nome de Exibição.');
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('ecolive_display_name', name);
      if (avatarUrl) {
        localStorage.setItem('ecolive_avatar_url', avatarUrl);
      }
    }

    // Gera um ID limpo derivado do nome do usuário + sufixo único
    const sanitizedId = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '_')
      .substring(0, 16);
    const uniqueUserId = `${sanitizedId}_${Math.random().toString(36).substring(2, 6)}`;

    setIsJoining(true);
    setJoinError(null);
    try {
      await connect(channelId.trim() || 'call-discord-alpha', uniqueUserId, 'web', name, avatarUrl || undefined);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Falha ao conectar à sala.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleOpenObsModal = async () => {
    setIsStreamModalOpen(true);
    setIsGeneratingWhip(true);
    setWhipError(null);
    try {
      const room = currentRoom || channelId.trim() || 'call-discord-alpha';
      const user = currentIdentity || displayName.trim() || 'streamer';
      const res = await fetch('/api/ingress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: room,
          userId: user,
          name: displayName.trim() || undefined,
          avatar: avatarUrl || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao gerar credenciais WHIP.');
      }

      const data: WhipCredentials = await res.json();
      setWhipCredentials(data);
    } catch (err) {
      setWhipError(err instanceof Error ? err.message : 'Falha ao provisionar sessão WHIP.');
    } finally {
      setIsGeneratingWhip(false);
    }
  };

  const handleOpenStreamModal = handleOpenObsModal;

  const copyToClipboard = async (text: string, fieldName: string) => {
    let success = false;
    // 1. Tenta a API moderna da Clipboard
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        success = true;
      }
    } catch {
      // Ignora bloqueio de política do iframe do Discord
    }

    // 2. Fallback clássico compatível com iframes do Discord
    if (!success && typeof document !== 'undefined') {
      try {
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = text;
        tempTextArea.style.position = 'fixed';
        tempTextArea.style.top = '0';
        tempTextArea.style.left = '0';
        tempTextArea.style.opacity = '0';
        document.body.appendChild(tempTextArea);
        tempTextArea.focus();
        tempTextArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(tempTextArea);
      } catch {
        // Ignora caso também falhe
      }
    }

    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  return (
    <main className="min-h-screen bg-[#0d0e12] text-zinc-100 flex flex-col items-center selection:bg-indigo-600/40">
      {/* Barra de Navegação Superior */}
      <header className="w-full border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center font-black text-xs sm:text-sm text-white shadow-lg shadow-emerald-500/20 shrink-0">
            🍃
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-sm font-bold tracking-tight text-zinc-100 truncate">EcoLive</h1>
              <span className="text-[9px] sm:text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-indigo-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm shadow-emerald-500/10 shrink-0">
                v1.3.0
              </span>
            </div>
            <p className="hidden md:block text-[11px] text-zinc-400 truncate">Streaming Descentralizado • Latência Ultra-Baixa</p>
          </div>
        </div>

        {/* Monitor Discreto de Rede do Servidor (Visível apenas dentro da sala) */}
        {isConnected && serverBandwidth && (
          <div
            className="hidden md:flex items-center gap-2.5 px-3 py-1 rounded-xl bg-zinc-900/80 border border-zinc-800 text-[11px] font-mono shadow-inner select-none shrink-0"
            title={`Tráfego Geral do Servidor (LiveKit + Ingress + Web)\nDownload: ${serverBandwidth.rxMbps} Mbps | Upload: ${serverBandwidth.txMbps} Mbps\nCota do Servidor: ${serverBandwidth.totalUsedGB} GB usados de ${serverBandwidth.totalQuotaTB} TB (${serverBandwidth.quotaPercent}%)`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  hasActiveStreams && serverBandwidth.currentMbps > 0
                    ? serverBandwidth.percent > 85
                      ? 'bg-rose-500 animate-ping'
                      : serverBandwidth.percent > 65
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-emerald-400 animate-pulse'
                    : 'bg-emerald-500/50'
                }`}
              />
              <span className="text-zinc-500 text-[10px] uppercase font-sans font-semibold">Rede:</span>
              <span className="text-zinc-200 font-semibold">
                {hasActiveStreams ? serverBandwidth.currentMbps.toFixed(1) : '0.0'} Mbps
              </span>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-400">
                {serverBandwidth.maxMbps >= 1000
                  ? `${(serverBandwidth.maxMbps / 1000).toFixed(0)} Gbps`
                  : `${serverBandwidth.maxMbps} Mbps`}
              </span>
            </div>

            <span className="text-zinc-700 font-light">|</span>

            {/* Cota Total de 2TB */}
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-zinc-500 font-sans font-semibold">Total:</span>
              <span className="text-emerald-400 font-semibold">{serverBandwidth.quotaPercent}% usado</span>
              <span className="text-zinc-500">de</span>
              <span className="text-zinc-300 font-semibold">{serverBandwidth.totalQuotaTB} TB</span>
            </div>
          </div>
        )}

        {isConnected && (
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="hidden lg:flex items-center gap-2.5 text-xs bg-zinc-900/90 border border-zinc-800/90 px-3 py-1.5 rounded-xl shadow-inner">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-zinc-400">Sala:</span>
              <strong
                className="text-zinc-200 font-semibold text-[11px] truncate max-w-[140px]"
                title={channelName ? `${channelName} (${currentRoom})` : currentRoom}
              >
                {channelName || currentRoom}
              </strong>
              <span className="text-zinc-600">|</span>
              <div className="flex items-center gap-1.5">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName || currentIdentity}
                    className="w-5 h-5 rounded-full object-cover border border-zinc-700/80 shrink-0 shadow-sm"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                    {(displayName || currentIdentity || 'U').trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-zinc-400">Conectado como:</span>
                <strong className="text-zinc-200 text-[11px]">{displayName || currentIdentity}</strong>
              </div>
            </div>

            {/* BOTÃO DE TRANSMISSÃO OBS */}
            <button
              type="button"
              onClick={handleOpenObsModal}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-indigo-900/30 transition-all cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M4 4.5A2.5 2.5 0 001.5 7v10A2.5 2.5 0 004 19.5h11a2.5 2.5 0 002.5-2.5v-2.586l3.293 3.293A1 1 0 0022 17V7a1 1 0 00-1.707-.707L17 9.586V7A2.5 2.5 0 0014.5 4.5H4z" />
              </svg>
              <span className="hidden sm:inline">Transmitir via OBS</span>
              <span className="sm:hidden">OBS</span>
            </button>

            <button
              type="button"
              onClick={disconnect}
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-[11px] sm:text-xs font-medium text-zinc-300 hover:text-white rounded-xl border border-zinc-800 transition cursor-pointer"
            >
              Sair
            </button>
          </div>
        )}
      </header>

      {/* Conteúdo Central */}
      <div className="w-full max-w-7xl px-3 sm:px-6 py-4 sm:py-8 flex-1 flex flex-col">
        {!isConnected ? (
          /* TELA INICIAL SIMPLIFICADA: Pede apenas o Nome de Exibição */
          <div className="max-w-sm w-full mx-auto my-auto flex flex-col gap-4">
            <div className="bg-zinc-900/90 border border-zinc-800/80 p-8 rounded-3xl shadow-2xl backdrop-blur-md">
              <div className="text-center mb-5">
                <div className="inline-flex mb-3">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center font-black text-2xl text-white shadow-xl shadow-emerald-500/20 shrink-0">
                    🍃
                  </div>
                </div>
                <h2 className="text-lg font-bold text-zinc-100">Bem-vindo ao EcoLive</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Transmissões em tempo real via OBS.
                </p>

              </div>

              {joinError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300">
                  {joinError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <div className="mb-1.5">
                    <label className="block text-xs font-semibold text-zinc-300">
                      Seu Nome de Exibição
                    </label>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {/* Preview do Avatar Selecionado */}
                    <div className={`h-11 w-11 rounded-xl bg-zinc-950 border flex items-center justify-center shrink-0 overflow-hidden shadow-inner transition-all ${
                      avatarUrl ? 'border-emerald-500/50 shadow-emerald-500/10 ring-2 ring-emerald-500/20' : 'border-zinc-800'
                    }`}>
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="Avatar"
                          className="h-full w-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <span className="text-base text-zinc-500 font-bold">
                          {displayName ? displayName.trim().charAt(0).toUpperCase() : '👤'}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => {
                        setDisplayName(e.target.value);
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('ecolive_display_name', e.target.value);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleJoin();
                        }
                      }}
                      placeholder="ex: Kayque"
                      autoFocus
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner"
                      required
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleJoin();
                  }}
                  disabled={isJoining}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:bg-zinc-800 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/25 mt-3 cursor-pointer"
                >
                  {isJoining ? 'Entrando na Sala...' : 'Entrar na Sala'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* DENTRO DA SALA: Grid de Vídeos ou Estado Aguardando */
          <div className="flex flex-col gap-6 flex-1">
            {/* Grid Mosaico Dinâmico */}
            {remoteFeeds.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 border border-dashed border-zinc-800/80 rounded-3xl text-center bg-zinc-900/20 my-auto">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-b from-zinc-800/80 to-zinc-900/90 border border-zinc-700/50 flex items-center justify-center mb-4 shadow-xl shadow-black/40 ring-1 ring-white/5">
                  <svg className="w-7 h-7 text-indigo-400 fill-current drop-shadow-sm" viewBox="0 0 24 24">
                    <path d="M4 4.5A2.5 2.5 0 001.5 7v10A2.5 2.5 0 004 19.5h11a2.5 2.5 0 002.5-2.5v-2.586l3.293 3.293A1 1 0 0022 17V7a1 1 0 00-1.707-.707L17 9.586V7A2.5 2.5 0 0014.5 4.5H4z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-100">A sala está pronta</h3>
                <p className="text-xs text-zinc-400 max-w-sm mt-1.5 mb-6 leading-relaxed">
                  Nenhuma transmissão ativa no momento.
                </p>

                {/* BOTÃO DE TRANSMISSÃO OBS NO CENTRO */}
                <button
                  type="button"
                  onClick={handleOpenObsModal}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white text-sm font-semibold rounded-xl shadow-xl shadow-indigo-600/25 transition-all flex items-center gap-2.5 cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M4 4.5A2.5 2.5 0 001.5 7v10A2.5 2.5 0 004 19.5h11a2.5 2.5 0 002.5-2.5v-2.586l3.293 3.293A1 1 0 0022 17V7a1 1 0 00-1.707-.707L17 9.586V7A2.5 2.5 0 0014.5 4.5H4z" />
                  </svg>
                  <span>Transmitir via OBS</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-full">
                {/* Barra de Controle Coletivo de Banda (Exibida quando há 2 ou mais transmissões na sala) */}
                {remoteFeeds.length >= 2 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4 sm:py-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md shadow-lg">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-base">⚡</span>
                      <span className="text-zinc-300 font-medium">
                        {remoteFeeds.length} transmissões ativas:
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-bold font-mono text-[11px] border border-indigo-500/30">
                        {remoteFeeds.filter((f) => watchedTrackSids.has(f.publication.trackSid)).length} assistindo
                      </span>
                      {remoteFeeds.length > remoteFeeds.filter((f) => watchedTrackSids.has(f.publication.trackSid)).length && (
                        <span className="hidden md:inline text-[11px] text-emerald-400 font-medium">
                          ({remoteFeeds.length - remoteFeeds.filter((f) => watchedTrackSids.has(f.publication.trackSid)).length} fechadas poupando internet)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleWatchAll}
                        className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-xs font-semibold text-zinc-100 transition cursor-pointer flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5 text-emerald-400 fill-current" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        <span>Assistir Todas</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleStopWatchAll}
                        className="px-3 py-1.5 rounded-xl bg-zinc-800/60 hover:bg-rose-950/60 border border-zinc-700/40 hover:border-rose-800/50 active:scale-95 text-xs font-semibold text-zinc-400 hover:text-rose-200 transition cursor-pointer flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>Fechar Todas</span>
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className={`grid gap-4 w-full ${
                    remoteFeeds.length === 1
                      ? 'grid-cols-1 max-w-5xl mx-auto'
                      : remoteFeeds.length === 2
                      ? 'grid-cols-1 lg:grid-cols-2'
                      : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                  }`}
                >
                  {/* Transmissões dos Participantes via OBS Studio */}
                  {remoteFeeds.map((feed) => {
                    let remoteAvatar: string | undefined = undefined;
                    if (feed.participant?.metadata) {
                      try {
                        const meta = JSON.parse(feed.participant.metadata);
                        remoteAvatar = meta.avatar;
                      } catch {
                        remoteAvatar = feed.participant.metadata;
                      }
                    }
                    const fallbackAvatar = remoteAvatar || (feed.participantIdentity === currentIdentity ? avatarUrl : undefined);

                    return (
                      <VideoPlayer
                        key={feed.publication.trackSid}
                        publication={feed.publication}
                        participant={feed.participant}
                        participantIdentity={feed.participantIdentity}
                        participantName={feed.participantName}
                        isObs={feed.isObs}
                        isWatching={watchedTrackSids.has(feed.publication.trackSid)}
                        onToggleWatch={(watching) => handleToggleWatch(feed.publication.trackSid, watching)}
                        avatarUrl={fallbackAvatar}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL DE TRANSMISSÃO OBS */}
      {isStreamModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900/95 border border-zinc-800/90 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 backdrop-blur-md">
            {/* Header do Modal */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M4 4.5A2.5 2.5 0 001.5 7v10A2.5 2.5 0 004 19.5h11a2.5 2.5 0 002.5-2.5v-2.586l3.293 3.293A1 1 0 0022 17V7a1 1 0 00-1.707-.707L17 9.586V7A2.5 2.5 0 0014.5 4.5H4z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-100">
                  Configuração do OBS Studio
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStreamModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800/60 transition cursor-pointer"
                title="Fechar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Credenciais e Guia do OBS */}
            <div className="space-y-4">
              {whipError && (
                <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300">
                  {whipError}
                </div>
              )}

              {isGeneratingWhip ? (
                <div className="py-8 text-center text-xs text-zinc-400 space-y-2">
                  <div className="h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Provisionando servidor WHIP...</p>
                </div>
              ) : whipCredentials ? (
                <div className="space-y-3.5 bg-zinc-950 border border-zinc-800/90 rounded-2xl p-4 shadow-inner">
                  {/* Servidor */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 text-[11px]">
                      <span className="text-zinc-400 font-semibold">1. Servidor WHIP (URL)</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(whipCredentials.serverUrl, 'obs_url')}
                        className="text-purple-400 hover:text-purple-300 font-medium cursor-pointer text-[11px]"
                      >
                        {copiedField === 'obs_url' ? '✓ Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <input
                      type="text"
                      readOnly
                      value={whipCredentials.serverUrl}
                      onClick={(e) => e.currentTarget.select()}
                      className="w-full bg-zinc-900/90 border border-zinc-800 px-3.5 py-2 rounded-xl font-mono text-xs text-zinc-200 focus:outline-none focus:border-purple-500/50 cursor-pointer select-all"
                    />
                  </div>

                  {/* Chave de Transmissão */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 text-[11px]">
                      <span className="text-zinc-400 font-semibold">2. Chave de Transmissão / Bearer Token</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="text-zinc-500 hover:text-zinc-300 cursor-pointer text-[11px]"
                        >
                          {showKey ? 'Ocultar' : 'Revelar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(whipCredentials.streamKey, 'obs_key')}
                          className="text-purple-400 hover:text-purple-300 font-medium cursor-pointer text-[11px]"
                        >
                          {copiedField === 'obs_key' ? '✓ Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>
                    <input
                      type={showKey ? 'text' : 'password'}
                      readOnly
                      value={whipCredentials.streamKey}
                      onClick={(e) => e.currentTarget.select()}
                      className="w-full bg-zinc-900/90 border border-zinc-800 px-3.5 py-2 rounded-xl font-mono text-xs text-zinc-200 focus:outline-none focus:border-purple-500/50 cursor-pointer select-all"
                    />
                  </div>

                  <div className="pt-2 text-[11px] text-zinc-400 border-t border-zinc-800/80 leading-relaxed">
                    Dica: Clique dentro do campo para selecionar tudo e aperte <strong className="text-zinc-200">Ctrl + C</strong>, ou use o botão <strong>Copiar</strong>. No OBS, vá em <strong>Configurações ➔ Transmissão</strong>, selecione <strong>Serviço: WHIP</strong> e cole os dados.
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setIsStreamModalOpen(false)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-xs font-semibold rounded-xl text-white shadow-lg shadow-indigo-600/25 transition cursor-pointer"
                >
                  Entendido / Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}