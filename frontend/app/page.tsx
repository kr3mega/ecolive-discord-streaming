'use client';

import { useState, useEffect, useRef } from 'react';
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
  const [displayName, setDisplayName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ecolive_display_name') || '';
    }
    return '';
  });
  const [channelId, setChannelId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('channel_id');
      if (fromQuery && fromQuery.trim()) return fromQuery.trim();
      const fromStorage = localStorage.getItem('ecolive_room_id');
      if (fromStorage && fromStorage.trim() && fromStorage !== 'call-discord-alpha') {
        return fromStorage.trim();
      }
    }
    return 'call-discord-alpha';
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const isJoiningRef = useRef(false);
  const [isDiscordReady, setIsDiscordReady] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [autoJoinEnabled, setAutoJoinEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ecolive_auto_join') !== 'false';
    }
    return true;
  });
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
      setIsDiscordReady(true);
      return;
    }

    let clientId = currentHost.split('.')[0];
    if (!clientId || clientId === 'discord' || clientId.includes('sslip') || clientId.includes('trycloudflare') || clientId === 'localhost') {
      const candidate = params.get('client_id') || params.get('app_id') || params.get('application_id');
      if (candidate) {
        clientId = candidate;
      }
    }

    if (!isDiscordDomain && !params.get('frame_id')) {
      const statusMsg = 'Navegador externo (sem frame_id)';
      setDiscordSdkStatus(statusMsg);
      console.log('[Discord SDK] Executando fora do ambiente Discord. Host:', currentHost);
      setIsDiscordReady(true);
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

        
        const allowedGuilds = ['1506471002757140660', '1550327956231028817'];
        if (discordSdk.guildId && !allowedGuilds.includes(discordSdk.guildId)) {
            console.log('[Discord SDK] Acesso negado para o servidor:', discordSdk.guildId);
            setIsRestricted(true);
            setIsDiscordReady(true);
            return;
        }

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

                // Obtém o ID e o nome amigável do canal de voz no Discord (ex: "Estádio")
                try {
                  const targetChannelId = discordSdk.channelId || params.get('channel_id');
                  if (targetChannelId) {
                    console.log('[Discord SDK] Canal ID detectado:', targetChannelId);
                    setChannelId(targetChannelId);
                    localStorage.setItem('ecolive_room_id', targetChannelId);
                    const channel = await discordSdk.commands.getChannel({ channel_id: targetChannelId }).catch(() => null);
                    if (channel?.name) {
                      console.log('[Discord SDK] Canal detectado:', channel.name);
                      setChannelName(channel.name);
                      localStorage.setItem('ecolive_channel_name', channel.name);
                    }

                    // 🛡️ Trava na Call: Encerra a mídia do Software Externo se, e somente se o usuário sair do canal de voz
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      await (discordSdk as any).subscribe(
                        'VOICE_STATE_UPDATE',
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (voiceEvent: any) => {
                          if (voiceEvent?.user?.id === authenticatedUser?.id) {
                            const currentVoiceChannel = voiceEvent?.voice_state?.channel_id;
                            if (!currentVoiceChannel || currentVoiceChannel !== targetChannelId) {
                              console.log('[Discord SDK] 🛑 Usuário desconectou do canal de voz! Encerrando mídia OBS...');
                              const clean = localStorage.getItem('ecolive_user_clean_id') || authenticatedUser?.username;
                              if (clean) {
                                fetch('/api/ingress/terminate', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ channelId: targetChannelId, userId: clean, deleteIngress: false }),
                                  keepalive: true,
                                }).catch(() => {});
                              }
                            }
                          }
                        },
                        { channel_id: targetChannelId }
                      );
                    } catch (voiceSubErr) {
                      console.log('[Discord SDK] Inscrição VOICE_STATE_UPDATE dispensada:', voiceSubErr);
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
      } finally {
        setIsDiscordReady(true);
      }
    };

    initDiscord();
  }, []);

  // Estados do Modal de Mídia via Software Externo
  const [isStreamModalOpen, setIsStreamModalOpen] = useState(false);
  const [isGeneratingWhip, setIsGeneratingWhip] = useState(false);
  const [whipCredentials, setWhipCredentials] = useState<WhipCredentials | null>(null);
  const [whipError, setWhipError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  // Modal de confirmação inline para "Redefinir Chave" (substitui o confirm() nativo bloqueado pelo Discord)
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // Controla se o modal foi aberto ENQUANTO a live já estava no ar
  // Se sim, o modal NÃO fecha automaticamente ao detectar a mídia
  const modalOpenedDuringLiveRef = useRef(false);

  const {
    isConnected,
    remoteFeeds,
    currentIdentity,
    currentRoom,
    connect,
    disconnect,
    setQuality,
    trackViewers,
    sendWatchUpdate,
  } = useLiveKit();

  // Tem alguma live ativa transmitindo na sala?
  const hasActiveStreams = isConnected && remoteFeeds.length > 0;

  // Identifica se a minha própria mídia do Software Externo está ativa nesta sala
  const myCleanUserId = (
    currentIdentity ||
    (typeof window !== 'undefined' ? localStorage.getItem('ecolive_user_clean_id') : '') ||
    displayName ||
    ''
  ).replace(/^(user_|obs_)/, '');

  const hasMyActiveObsStream = isConnected && remoteFeeds.some((f) => f.participantIdentity === `obs_${myCleanUserId}`);

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

  // Mídias remotas assistidas sob demanda (estilo Discord)
  const [watchedTrackSids, setWatchedTrackSids] = useState<Set<string>>(new Set());

  // Limpa SIDs de mídias encerradas
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
      sendWatchUpdate(trackSid, shouldWatch, displayName, avatarUrl);
      return next;
    });
  };

  const handleJoin = async (e?: React.SyntheticEvent, nameOverride?: string) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isJoiningRef.current || isConnected) return;

    // Resolução resiliente do nome: nameOverride > displayName > localStorage > DiscordSDK
    const name = (
      nameOverride ||
      displayName ||
      (typeof window !== 'undefined' ? localStorage.getItem('ecolive_display_name') : '') ||
      (detectedDiscordUser ? (detectedDiscordUser.global_name || detectedDiscordUser.username) : '') ||
      ''
    ).trim();

    if (!name) {
      setJoinError('Por favor, informe seu Nome de Exibição.');
      return;
    }

    // Gera um ID limpo derivado do nome do usuário
    const sanitizedId = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '')
      .substring(0, 16);

    // 🛡️ Identidade Estável: Preserva o mesmo ID em qualquer sala, chamada ou reconexão
    let cleanUserId = '';
    if (detectedDiscordUser && detectedDiscordUser.id) {
      cleanUserId = `${sanitizedId}_${detectedDiscordUser.id.substring(detectedDiscordUser.id.length - 6)}`;
    } else if (typeof window !== 'undefined') {
      const savedCleanId = localStorage.getItem('ecolive_user_clean_id');
      if (savedCleanId && (savedCleanId === sanitizedId || savedCleanId.startsWith(sanitizedId))) {
        cleanUserId = savedCleanId;
      }
    }

    if (!cleanUserId) {
      cleanUserId = sanitizedId;
      if (typeof window !== 'undefined') {
        localStorage.setItem('ecolive_user_clean_id', cleanUserId);
      }
    }

    const effectiveAvatar =
      avatarUrl ||
      (typeof window !== 'undefined' ? localStorage.getItem('ecolive_avatar_url') : '') ||
      (detectedDiscordUser ? getDiscordAvatarUrl(detectedDiscordUser.id, detectedDiscordUser.avatar) : undefined) ||
      undefined;

    // Resolução resiliente da sala (canal de voz do Discord):
    // Prioriza canal detectado pelo SDK ou parâmetro de URL antes do fallback estático
    const targetRoom = (
      (channelId && channelId.trim() !== 'call-discord-alpha' ? channelId.trim() : '') ||
      (typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('channel_id') || localStorage.getItem('ecolive_room_id')) : '') ||
      (channelId ? channelId.trim() : '') ||
      'call-discord-alpha'
    ).trim();

    if (typeof window !== 'undefined') {
      localStorage.setItem('ecolive_display_name', name);
      if (autoJoinEnabled) {
        localStorage.setItem('ecolive_session_active', 'true');
      } else {
        localStorage.removeItem('ecolive_session_active');
      }
      localStorage.setItem('ecolive_room_id', targetRoom);
      if (effectiveAvatar) {
        localStorage.setItem('ecolive_avatar_url', effectiveAvatar);
      }
    }

    if (!displayName || displayName !== name) {
      setDisplayName(name);
    }
    if (effectiveAvatar && avatarUrl !== effectiveAvatar) {
      setAvatarUrl(effectiveAvatar);
    }

    isJoiningRef.current = true;
    setIsJoining(true);
    setJoinError(null);
    try {
      console.log(`[EcoApp Join] Conectando à sala "${targetRoom}" como "${name}" (${cleanUserId})...`);
      await connect(targetRoom, cleanUserId, 'web', name, effectiveAvatar);

      // 🚀 Sincronização Automática de Ingress entre Salas:
      // Ao entrar em qualquer sala (Call X -> Call Y), atualiza o Ingress existente para apontar para a nova sala
      // sem exigir que o usuário reabra o modal ou reconfigure o OBS!
      fetch('/api/ingress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: targetRoom,
          userId: cleanUserId,
          name: name,
          avatar: effectiveAvatar,
        }),
      }).catch((syncErr) => {
        console.warn('[EcoApp Ingress Sync] Falha ao sincronizar sala do Ingress:', syncErr);
      });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Falha ao conectar à sala.');
    } finally {
      setIsJoining(false);
      isJoiningRef.current = false;
    }
  };

  // 🔄 Auto-reconexão ultrarrápida (Nova Janela / Popout / F5):
  // Dispara a entrada na sala de forma instantânea (exatamente como ao clicar no botão),
  // sem nenhum atraso artificial!
  useEffect(() => {
    if (isConnected || isJoining || isJoiningRef.current) return;
    if (typeof window === 'undefined') return;

    const isAutoJoin = localStorage.getItem('ecolive_auto_join') !== 'false';
    const sessionActive = localStorage.getItem('ecolive_session_active') === 'true';
    if (!isAutoJoin || !sessionActive) return;

    const targetName = (
      displayName ||
      localStorage.getItem('ecolive_display_name') ||
      (detectedDiscordUser ? (detectedDiscordUser.global_name || detectedDiscordUser.username) : '') ||
      ''
    ).trim();

    if (!targetName) return;

    // Se estamos no Discord e ainda não temos nenhum ID de sala (nem na URL nem no storage),
    // aguarda o Discord SDK identificar o canal para não cair no fallback genérico
    const hasKnownRoom = Boolean(
      (channelId && channelId.trim() !== 'call-discord-alpha') ||
      new URLSearchParams(window.location.search).get('channel_id') ||
      (localStorage.getItem('ecolive_room_id') && localStorage.getItem('ecolive_room_id') !== 'call-discord-alpha')
    );

    const isInsideDiscord =
      window.location.hostname.includes('discordsays.com') ||
      window.location.hostname.includes('discord.com') ||
      new URLSearchParams(window.location.search).has('frame_id') ||
      (typeof window !== 'undefined' && window.self !== window.top);

    if (isInsideDiscord && !hasKnownRoom && !isDiscordReady) {
      return;
    }

    console.log('[EcoApp Auto-Join] Disparando entrada instantânea exatamente como no clique...');
    handleJoin();
  }, [isConnected, isJoining, isDiscordReady, channelId, displayName, detectedDiscordUser]);

  const handleExitRoom = () => {
    isJoiningRef.current = false;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ecolive_session_active');
      const savedCleanId = localStorage.getItem('ecolive_user_clean_id');
      const user = currentIdentity || savedCleanId || displayName.trim() || 'streamer';
      const room = currentRoom || channelId.trim() || 'call-discord-alpha';
      fetch('/api/ingress/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: room, userId: user, deleteIngress: false }),
        keepalive: true,
      }).catch(() => {});
    }
    disconnect();
  };

  // 🛡️ Encerra a mídia na chamada caso a aba/janela ou iframe seja fechado (chave permanente preservada)
  useEffect(() => {
    const handleLeave = () => {
      if (typeof window === 'undefined') return;
      const savedCleanId = localStorage.getItem('ecolive_user_clean_id');
      const user = currentIdentity || savedCleanId || displayName.trim();
      const room = currentRoom || channelId.trim();
      if (user && room) {
        const payload = JSON.stringify({ channelId: room, userId: user, deleteIngress: false });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon('/api/ingress/terminate', blob);
        } else {
          fetch('/api/ingress/terminate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('beforeunload', handleLeave);
    window.addEventListener('pagehide', handleLeave);
    return () => {
      window.removeEventListener('beforeunload', handleLeave);
      window.removeEventListener('pagehide', handleLeave);
    };
  }, [currentIdentity, currentRoom, channelId, displayName]);

  const [isResettingKey, setIsResettingKey] = useState(false);

  const handleOpenObsModal = async (forceNew: boolean = false) => {
    // Sempre abre com a chave oculta por segurança
    setShowKey(false);
    // Registra se a live do Software Externo já estava ativa quando o modal foi aberto
    // Usado para impedir que o modal feche automaticamente (está revisando configs, não configurando)
    modalOpenedDuringLiveRef.current = hasMyActiveObsStream;
    setIsStreamModalOpen(true);
    setIsGeneratingWhip(true);
    setWhipError(null);
    try {
      const room = currentRoom || channelId.trim() || 'call-discord-alpha';
      const savedCleanId = typeof window !== 'undefined' ? localStorage.getItem('ecolive_user_clean_id') : null;
      const user = currentIdentity || savedCleanId || displayName.trim() || 'streamer';
      const res = await fetch('/api/ingress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: room,
          userId: user,
          name: displayName.trim() || undefined,
          avatar: avatarUrl || undefined,
          forceNew,
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
      setIsResettingKey(false);
    }
  };

  // Abre o painel de confirmação inline (substitui confirm() bloqueado pelo Discord)
  const handleResetKey = () => {
    setShowResetConfirm(true);
  };

  // Executado após o usuário confirmar no painel inline
  const handleConfirmResetKey = async () => {
    setShowResetConfirm(false);
    setIsResettingKey(true);
    setShowKey(false);
    await handleOpenObsModal(true);
  };


  const handleOpenStreamModal = handleOpenObsModal;

  // ✅ Fecha o modal automaticamente quando o OBS inicia a mídia com a chave correta.
  // Só fecha se o modal foi aberto ANTES de a live começar (primeira configuração).
  // Se o usuário abriu o modal enquanto a live já estava no ar, ele permanece aberto.
  useEffect(() => {
    if (
      isStreamModalOpen &&
      hasMyActiveObsStream &&
      !isGeneratingWhip &&
      !modalOpenedDuringLiveRef.current
    ) {
      setIsStreamModalOpen(false);
    }
  }, [hasMyActiveObsStream, isStreamModalOpen, isGeneratingWhip]);



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

  if (isRestricted) {
    return (
      <main className="min-h-screen bg-[#0d0e12] text-zinc-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-900/80 border border-red-500/30 p-8 rounded-2xl text-center space-y-4">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">⛔</span>
          </div>
          <h2 className="text-2xl font-bold text-red-400">Acesso Restrito</h2>
          <p className="text-zinc-400 text-sm">
            Este aplicativo privado não está autorizado para uso neste servidor do Discord.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d0e12] text-zinc-100 flex flex-col items-center selection:bg-indigo-600/40">
      {/* Barra de Navegação Superior */}
      <header className="w-full border-b border-zinc-800/80 bg-[#0d0e12] sticky top-0 z-40 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 shadow-lg shadow-black/50">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center font-black text-xs sm:text-sm text-white shadow-lg shadow-emerald-500/20 shrink-0">
            🍃
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-sm font-bold tracking-tight text-zinc-100 truncate">EcoApp</h1>
              <span className="text-[9px] sm:text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-indigo-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm shadow-emerald-500/10 shrink-0">
                v1.5.3
              </span>
            </div>
            <p className="hidden md:block text-[11px] text-zinc-400 truncate">Sincronização P2P Otimizada • Latência Ultra-Baixa</p>
          </div>
        </div>

        {/* Monitor Discreto de Rede do Servidor (Visível apenas dentro da sala) */}
        {isConnected && serverBandwidth && (
          <div
            className="hidden md:flex items-center gap-2.5 px-3 py-1 rounded-xl bg-zinc-900/80 border border-zinc-800 text-[11px] font-mono shadow-inner select-none shrink-0"
            title={`Tráfego Geral do Servidor (P2P + Servidor)\nDownload: ${serverBandwidth.rxMbps} Mbps | Upload: ${serverBandwidth.txMbps} Mbps\nCota do Servidor: ${serverBandwidth.totalUsedGB} GB usados de ${serverBandwidth.totalQuotaTB} TB (${serverBandwidth.quotaPercent}%)`}
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

            {/* BOTÃO INICIAR TRANSMISSÃO OBS */}
            <button
              type="button"
              onClick={() => handleOpenObsModal(false)}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-indigo-900/30 transition-all cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M4 4.5A2.5 2.5 0 001.5 7v10A2.5 2.5 0 004 19.5h11a2.5 2.5 0 002.5-2.5v-2.586l3.293 3.293A1 1 0 0022 17V7a1 1 0 00-1.707-.707L17 9.586V7A2.5 2.5 0 0014.5 4.5H4z" />
              </svg>
              <span className="hidden sm:inline">Iniciar Mídia</span>
              <span className="sm:hidden">Software Externo</span>
            </button>

            <button
              type="button"
              onClick={handleExitRoom}
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-[11px] sm:text-xs font-medium text-zinc-300 hover:text-white rounded-xl border border-zinc-800 transition cursor-pointer"
            >
              Sair
            </button>
          </div>
        )}
      </header>

      {/* Conteúdo Central */}
      <div className="w-full max-w-7xl px-3 sm:px-6 py-3 sm:py-5 flex-1 flex flex-col">
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
                <h2 className="text-lg font-bold text-zinc-100">Bem-vindo ao EcoApp</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Mídias em tempo real via Software Externo.
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
                    <div className="h-11 w-11 rounded-xl bg-zinc-950 border border-zinc-700/70 flex items-center justify-center shrink-0 overflow-hidden shadow-sm ring-1 ring-white/5 transition-all">
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

                {/* Opção discreta de auto-login com visual Dark Theme */}
                <label className="flex items-center justify-center gap-2 pt-1.5 cursor-pointer select-none group">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={autoJoinEnabled}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setAutoJoinEnabled(val);
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('ecolive_auto_join', val ? 'true' : 'false');
                          if (!val) {
                            localStorage.removeItem('ecolive_session_active');
                          }
                        }
                      }}
                      className="sr-only"
                    />
                    <div
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                        autoJoinEnabled
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-600/30'
                          : 'bg-zinc-950 border-zinc-700/80 group-hover:border-zinc-500 text-transparent'
                      }`}
                    >
                      <svg
                        className={`w-2.5 h-2.5 transition-transform ${autoJoinEnabled ? 'scale-100' : 'scale-0'}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="3.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium tracking-tight text-zinc-400 group-hover:text-zinc-300 transition-colors">
                    Entrar automaticamente da próxima vez
                  </span>
                </label>
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
                  Nenhuma mídia ativa no momento.
                </p>

                {/* BOTÃO INICIAR TRANSMISSÃO NO CENTRO */}
                <button
                  type="button"
                  onClick={() => handleOpenObsModal(false)}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white text-sm font-semibold rounded-xl shadow-xl shadow-indigo-600/25 transition-all flex items-center gap-2.5 cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M4 4.5A2.5 2.5 0 001.5 7v10A2.5 2.5 0 004 19.5h11a2.5 2.5 0 002.5-2.5v-2.586l3.293 3.293A1 1 0 0022 17V7a1 1 0 00-1.707-.707L17 9.586V7A2.5 2.5 0 0014.5 4.5H4z" />
                  </svg>
                  <span>Iniciar Mídia</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-full">
                <div
                  className={`grid gap-4 w-full ${
                    remoteFeeds.length === 1
                      ? 'grid-cols-1 max-w-5xl mx-auto'
                      : 'grid-cols-1 lg:grid-cols-2'
                  }`}
                >
                  {/* Mídias dos Participantes via Software Externo */}
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
                        viewers={trackViewers[feed.publication.trackSid] || []}
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
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-zinc-100">
                    Configuração do Software Externo
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                    Chave Permanente
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setIsStreamModalOpen(false); setShowResetConfirm(false); }}
                className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800/60 transition cursor-pointer"
                title="Fechar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Credenciais e Guia do Software Externo */}
            <div className="space-y-4">
              {whipError && (
                <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300">
                  {whipError}
                </div>
              )}

              {isGeneratingWhip ? (
                <div className="py-8 text-center text-xs text-zinc-400 space-y-2">
                  <div className="h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>{isResettingKey ? 'Gerando nova chave exclusiva...' : 'Buscando sua chave permanente...'}</p>
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

                  {/* Chave de Mídia */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 text-[11px]">
                      <span className="text-zinc-400 font-semibold">2. Chave de Mídia (Fixa)</span>
                      <div className="flex items-center gap-2.5">
                        {!showResetConfirm && (
                          <button
                            type="button"
                            onClick={handleResetKey}
                            disabled={isResettingKey || isGeneratingWhip}
                            className="text-zinc-500 hover:text-rose-400 disabled:opacity-50 cursor-pointer text-[10px] transition-colors"
                            title="Gera uma nova chave e invalida a anterior caso você tenha vazado em live"
                          >
                            {isResettingKey ? 'Redefinindo...' : 'Redefinir Chave'}
                          </button>
                        )}
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

                    {/* Painel de confirmação inline — aparece abaixo do campo de chave */}
                    {showResetConfirm && (
                      <div className="mt-2 p-3 rounded-xl bg-rose-950/60 border border-rose-700/50 flex flex-col gap-2">
                        <p className="text-[11px] text-rose-300 leading-snug">
                          ⚠️ <strong>A chave anterior será invalidada.</strong> Você precisará colar a nova chave no Software Externo antes de transmitir novamente. Deseja continuar?
                        </p>
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setShowResetConfirm(false)}
                            className="px-3 py-1 text-[11px] rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer transition"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmResetKey}
                            className="px-3 py-1 text-[11px] rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-semibold cursor-pointer transition"
                          >
                            Sim, gerar nova chave
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dica — oculta enquanto o painel de confirmação estiver visível */}
                  {!showResetConfirm && (
                    <div className="pt-2 text-[11px] text-zinc-400 border-t border-zinc-800/80 leading-relaxed">
                      Dica: Esta é a sua <strong className="text-emerald-400">Chave Pessoal Permanente</strong> (estilo Twitch)! Configure uma única vez no Software Externo. Depois disso, basta entrar na chamada com seus amigos e apertar <strong className="text-zinc-200">Iniciar Mídia</strong> no Software Externo para a mídia iniciar automaticamente.
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={() => { setIsStreamModalOpen(false); setShowResetConfirm(false); }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-xs font-semibold rounded-xl text-white shadow-lg shadow-indigo-600/25 transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}