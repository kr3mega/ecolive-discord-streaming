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

function isSnowflake(val?: string | null): boolean {
  if (!val) return false;
  return /^\d{16,20}$/.test(val.trim());
}

function getFriendlyRoomName(room?: string | null, friendly?: string | null): string {
  if (friendly && friendly.trim()) return friendly.trim();
  if (!room || room === 'call-discord-alpha' || isSnowflake(room)) {
    return 'Canal de Voz Oficial';
  }
  return room;
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
  const userExitedRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);
  const [isDiscordReady, setIsDiscordReady] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [autoJoinEnabled, setAutoJoinEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ecolive_auto_join') !== 'false';
    }
    return true;
  });
  const [isInsideDiscord, setIsInsideDiscord] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const host = window.location.hostname;
    return (
      host.includes('discordsays.com') ||
      host.includes('discord.com') ||
      params.has('frame_id') ||
      params.has('instance_id') ||
      (window.self !== window.top)
    );
  });
  const [currentGuildId, setCurrentGuildId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('guild_id') || localStorage.getItem('ecolive_guild_id') || '';
    }
    return '';
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
  // Sessão de autenticação Web (OAuth2)
  interface WebUserSession {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    guildId: string;
    guildName: string;
  }
  const [webSession, setWebSession] = useState<WebUserSession | null>(null);
  const [isCheckingWebAuth, setIsCheckingWebAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Consulta sessão ativa do Discord Web OAuth2
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err === 'unauthorized_guild') {
      setAuthError('Acesso Restrito: Sua conta do Discord não é membro de um servidor autorizado.');
    } else if (err === 'auth_denied') {
      setAuthError('Autorização cancelada no Discord.');
    } else if (err === 'token_exchange_failed' || err === 'fetch_user_failed') {
      setAuthError('Erro na comunicação com a API do Discord. Tente novamente.');
    }

    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setWebSession(data.user);
          setDisplayName(data.user.displayName);
          setAvatarUrl(data.user.avatarUrl);
          if (typeof window !== 'undefined') {
            localStorage.setItem('ecolive_display_name', data.user.displayName);
            localStorage.setItem('ecolive_avatar_url', data.user.avatarUrl);
            localStorage.setItem('ecolive_user_clean_id', data.user.username);
            localStorage.setItem('ecolive_guild_id', data.user.guildId);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsCheckingWebAuth(false);
      });
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    handleExitRoom();
    setWebSession(null);
    window.location.href = '/';
  };

  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [detectedDiscordUser, setDetectedDiscordUser] = useState<DiscordParticipant | null>(null);
  const [discordSdkStatus, setDiscordSdkStatus] = useState<string>('Verificando conexão...');


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
      setIsInsideDiscord(false);
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
      setIsInsideDiscord(false);
      return;
    }
    setIsInsideDiscord(true);

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

        
        // =========================================================================
        // [SEGURANÇA / WHITELIST DINÂMICA DE SERVIDORES - PROPOSITAL E MANDATÓRIO]
        // Consulta dinamicamente a autorização da guilda em /api/guilds/verify.
        // Se a guilda não estiver autorizada ou estiver pausada (ex: inadimplência Pix),
        // o aplicativo exibe a tela de erro silencioso ("Falha na Comunicação 503").
        // Servidores cadastrados: 1506471002757140660 (Amigos Amor) e 1550327956231028817 (6WC2026).
        // =========================================================================
        if (discordSdk.guildId) {
          let isAuthorized = false;
          let blockReason = 'unauthorized';

          try {
            const verifyRes = await fetch(`/api/guilds/verify?guildId=${encodeURIComponent(discordSdk.guildId)}`);
            if (verifyRes.ok) {
              const verifyData = await verifyRes.json().catch(() => ({}));
              isAuthorized = verifyData.authorized === true;
              blockReason = verifyData.reason || verifyData.status || 'unauthorized';
            }
          } catch {
            isAuthorized = false;
          }

          if (!isAuthorized) {
            console.log('[Discord SDK] Acesso restrito para o servidor:', discordSdk.guildId, blockReason);
            fetch('/api/admin/report-blocked', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                guildId: discordSdk.guildId,
                channelId: discordSdk.channelId || params.get('channel_id') || undefined,
              }),
            }).catch(() => {});
            setIsRestricted(true);
            setIsDiscordReady(true);
            return;
          }

          setCurrentGuildId(discordSdk.guildId);
          if (typeof window !== 'undefined') {
            localStorage.setItem('ecolive_guild_id', discordSdk.guildId);
          }
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
              body: JSON.stringify({
                code,
                guildId: discordSdk.guildId || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('guild_id') : undefined) || undefined,
              }),
            });

            if (tokenRes.ok) {
              const tokenData = await tokenRes.json();
              if (tokenData.sessionToken && typeof window !== 'undefined') {
                sessionStorage.setItem('ecolive_session_token', tokenData.sessionToken);
              }
              if (tokenData.access_token) {
                const authResult = await discordSdk.commands.authenticate({
                  access_token: tokenData.access_token,
                });
                delete tokenData.access_token;
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

                    // Trava na Call: Encerra a mídia do OBS Studio se, e somente se o usuário sair do canal de voz
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      await (discordSdk as any).subscribe(
                        'VOICE_STATE_UPDATE',
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (voiceEvent: any) => {
                          if (voiceEvent?.user?.id === authenticatedUser?.id) {
                            const currentVoiceChannel = voiceEvent?.voice_state?.channel_id;
                            if (!currentVoiceChannel || currentVoiceChannel !== targetChannelId) {
                              console.log('[Discord SDK] Usuário desconectou do canal de voz! Encerrando transmissão OBS...');
                              const clean = localStorage.getItem('ecolive_user_clean_id') || authenticatedUser?.username;
                              if (clean) {
                                fetch('/api/ingress/terminate', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
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
              const errorMsg = errData.error || 'Erro na troca do token com o backend';
              console.warn('[Discord Auth Backend]:', errorMsg);
              setDiscordSdkStatus(`Falha: ${errorMsg}`);
              setJoinError(errorMsg);
              return;
            }
          }
        } catch (authErr: unknown) {
          const errMsg = typeof authErr === 'object' ? JSON.stringify(authErr) : String(authErr);
          console.warn('[Discord SDK Authorize]:', errMsg);
          if (errMsg.includes('redirect_uri')) {
            const redirectErr = 'OAuth2: Adicione https://127.0.0.1 em OAuth2 > Redirects no Developer Portal';
            setDiscordSdkStatus(redirectErr);
            setJoinError(redirectErr);
          } else {
            const generalErr = `Falha na autorização do Discord: ${errMsg}`;
            setDiscordSdkStatus(generalErr);
            setJoinError(generalErr);
          }
          return;
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

  // Estados do Modal de Mídia via OBS Studio
  const [isStreamModalOpen, setIsStreamModalOpen] = useState(false);
  const [isGeneratingWhip, setIsGeneratingWhip] = useState(false);
  const [whipCredentials, setWhipCredentials] = useState<WhipCredentials | null>(null);
  const [whipError, setWhipError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  // Modal de confirmação inline para "Redefinir Chave" (substitui o confirm() nativo bloqueado pelo Discord)
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // Controla se o modal foi aberto ENQUANTO a live já estava no ar
  // Se sim, o modal NÃO fecha automaticamente ao detectar a transmissão
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

  // Identifica se a minha própria mídia do OBS Studio está ativa nesta sala
  const myCleanUserId = (
    currentIdentity ||
    (typeof window !== 'undefined' ? localStorage.getItem('ecolive_user_clean_id') : '') ||
    displayName ||
    ''
  ).replace(/^(user_|obs_)/, '');

  const hasMyActiveObsStream = isConnected && remoteFeeds.some((f) => f.participantIdentity === `obs_${myCleanUserId}`);



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

    // Identidade Estável: Preserva o mesmo ID em qualquer sala, chamada ou reconexão
    let cleanUserId = '';
    if (webSession && webSession.id) {
      cleanUserId = `${sanitizedId}_${webSession.id.substring(webSession.id.length - 6)}`;
    } else if (detectedDiscordUser && detectedDiscordUser.id) {
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
      webSession?.avatarUrl ||
      avatarUrl ||
      (typeof window !== 'undefined' ? localStorage.getItem('ecolive_avatar_url') : '') ||
      (detectedDiscordUser ? getDiscordAvatarUrl(detectedDiscordUser.id, detectedDiscordUser.avatar) : undefined) ||
      undefined;

    // Resolução resiliente da sala (canal de voz do Discord ou sala Web):
    const targetRoom = (
      (channelId && channelId.trim() !== 'call-discord-alpha' ? channelId.trim() : '') ||
      (typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('channel_id') || localStorage.getItem('ecolive_room_id')) : '') ||
      (channelId ? channelId.trim() : '') ||
      'geral'
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
    userExitedRef.current = false;
    setIsJoining(true);
    setJoinError(null);
    try {
      const activeGuildId = currentGuildId || (typeof window !== 'undefined' ? (localStorage.getItem('ecolive_guild_id') || new URLSearchParams(window.location.search).get('guild_id')) : '') || undefined;
      const sessionToken = typeof window !== 'undefined' ? (sessionStorage.getItem('ecolive_session_token') || undefined) : undefined;
      console.log(`[EcoLive Join] Conectando à sala "${targetRoom}" como "${name}" (${cleanUserId})...`);
      await connect(targetRoom, cleanUserId, 'web', name, effectiveAvatar, activeGuildId, channelName || undefined, sessionToken);

      // Sincronização Automática de Ingress entre Salas
      const ingressHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) {
        ingressHeaders['Authorization'] = `Bearer ${sessionToken}`;
      }
      fetch('/api/ingress', {
        method: 'POST',
        headers: ingressHeaders,
        credentials: 'include',
        body: JSON.stringify({
          channelId: targetRoom,
          userId: cleanUserId,
          name: name,
          avatar: effectiveAvatar,
          guildId: activeGuildId,
          channelName: channelName || undefined,
          authToken: sessionToken,
        }),
      }).catch((syncErr) => {
        console.warn('[EcoLive Ingress Sync] Falha ao sincronizar sala do Ingress:', syncErr);
      });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Falha ao conectar à sala.');
    } finally {
      setIsJoining(false);
      isJoiningRef.current = false;
    }
  };

  // Auto-reconexão ultrarrápida / Auto-Join no Discord:
  // Dispara a entrada na sala de forma instantânea sem exigir clique manual
  useEffect(() => {
    if (isConnected || isJoining || isJoiningRef.current || userExitedRef.current || autoJoinAttemptedRef.current) return;
    if (typeof window === 'undefined') return;

    if (isInsideDiscord) {
      if (!isDiscordReady) return;
      if (isRestricted) return;
      // Só realiza o auto-join se a autenticação com o Discord foi concluída com sucesso
      const hasSessionToken = typeof window !== 'undefined' && Boolean(sessionStorage.getItem('ecolive_session_token'));
      if (!detectedDiscordUser && !hasSessionToken) {
        return;
      }
      autoJoinAttemptedRef.current = true;
      console.log('[EcoLive Auto-Join] Discord Activity autenticada. Conectando de forma transparente à chamada...');
      handleJoin();
      return;
    }

    const isAutoJoin = localStorage.getItem('ecolive_auto_join') !== 'false';
    const sessionActive = localStorage.getItem('ecolive_session_active') === 'true';

    const hasKnownRoom = Boolean(
      (channelId && channelId.trim() !== 'call-discord-alpha') ||
      new URLSearchParams(window.location.search).get('channel_id') ||
      (localStorage.getItem('ecolive_room_id') && localStorage.getItem('ecolive_room_id') !== 'call-discord-alpha')
    );

    const shouldAutoJoin = isAutoJoin && (sessionActive || hasKnownRoom);
    if (!shouldAutoJoin) return;

    const targetName = (
      displayName ||
      localStorage.getItem('ecolive_display_name') ||
      (webSession ? (webSession.displayName || webSession.username) : '') ||
      ''
    ).trim();

    if (!targetName) return;

    autoJoinAttemptedRef.current = true;
    console.log('[EcoLive Auto-Join] Disparando reconexão automática web...');
    handleJoin();
  }, [isConnected, isJoining, isDiscordReady, isInsideDiscord, isRestricted, channelId, displayName, detectedDiscordUser, webSession]);

  const handleExitRoom = () => {
    isJoiningRef.current = false;
    userExitedRef.current = true;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ecolive_session_active');
      const savedCleanId = localStorage.getItem('ecolive_user_clean_id');
      const user = currentIdentity || savedCleanId || displayName.trim() || 'streamer';
      const room = currentRoom || channelId.trim() || 'geral';
      fetch('/api/ingress/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channelId: room, userId: user, deleteIngress: false }),
        keepalive: true,
      }).catch(() => {});
    }
    disconnect();
  };

  // Encerra imediatamente a transmissão e desliga a chamada caso a aba/janela seja fechada
  useEffect(() => {
    const handleLeave = () => {
      if (typeof window === 'undefined') return;
      localStorage.removeItem('ecolive_session_active');
      const savedCleanId = localStorage.getItem('ecolive_user_clean_id');
      const user = currentIdentity || savedCleanId || displayName.trim();
      const room = currentRoom || channelId.trim() || 'geral';
      if (user && room) {
        const payload = JSON.stringify({ channelId: room, userId: user, deleteIngress: false });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon('/api/ingress/terminate', blob);
        } else {
          fetch('/api/ingress/terminate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      }
      disconnect();
    };

    window.addEventListener('beforeunload', handleLeave);
    window.addEventListener('pagehide', handleLeave);
    window.addEventListener('unload', handleLeave);
    return () => {
      window.removeEventListener('beforeunload', handleLeave);
      window.removeEventListener('pagehide', handleLeave);
      window.removeEventListener('unload', handleLeave);
    };
  }, [currentIdentity, currentRoom, channelId, displayName, disconnect]);

  const [isResettingKey, setIsResettingKey] = useState(false);

  const handleOpenObsModal = async (forceNew: boolean = false) => {
    // Sempre abre com a chave oculta por segurança
    setShowKey(false);
    // Registra se a live do OBS Studio já estava ativa quando o modal foi aberto
    // Usado para impedir que o modal feche automaticamente (está revisando configs, não configurando)
    modalOpenedDuringLiveRef.current = hasMyActiveObsStream;
    setIsStreamModalOpen(true);
    setIsGeneratingWhip(true);
    setWhipError(null);
    try {
      const room = currentRoom || channelId.trim() || 'call-discord-alpha';
      const savedCleanId = typeof window !== 'undefined' ? localStorage.getItem('ecolive_user_clean_id') : null;
      const user = currentIdentity || savedCleanId || displayName.trim() || 'streamer';
      const activeGuildId = typeof window !== 'undefined' ? localStorage.getItem('ecolive_guild_id') : undefined;
      const res = await fetch('/api/ingress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          channelId: room,
          userId: user,
          name: displayName.trim() || undefined,
          avatar: avatarUrl || undefined,
          guildId: activeGuildId || undefined,
          channelName: channelName || undefined,
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

  // Fecha o modal automaticamente quando o OBS inicia a transmissão com a chave correta.
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

  // =========================================================================
  // [BLOQUEIO SILENCIOSO PROPOSITAL - NÃO REMOVER OU "CORRIGIR"]
  // Esta tela de "Falha na Comunicação (503)" é 100% INTENCIONAL!
  // Ela serve como disfarce/mascaramento de segurança para servidores do
  // Discord não cadastrados na whitelist. Nunca altere para mensagem de
  // "Acesso Negado" ou permissão para não chamar atenção de terceiros/filtros.
  // =========================================================================
  if (isRestricted) {
    return (
      <main className="min-h-screen bg-[#0d0e12] text-zinc-100 flex flex-col items-center justify-center p-6 select-none">
        <div className="max-w-sm w-full bg-zinc-900/70 border border-zinc-800/80 p-7 rounded-2xl text-center space-y-3 shadow-2xl backdrop-blur-sm">
          <div className="w-11 h-11 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center mx-auto mb-3 text-zinc-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-zinc-200">Falha na Comunicação</h2>
          <p className="text-zinc-400 text-xs leading-relaxed">
            Não foi possível sincronizar com o servidor da aplicação. Verifique os parâmetros de rede e tente novamente mais tarde.
          </p>
          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-center gap-1.5">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Status: ERR_NETWORK_UNAVAILABLE (503)</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d0e12] text-zinc-100 flex flex-col items-center selection:bg-indigo-600/40">
      {/* Barra de Navegação Superior */}
      <header className="w-full border-b border-zinc-800/80 bg-[#0d0e12] sticky top-0 z-40 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 shadow-lg shadow-black/50">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img
            src="/ecolive_icon.png"
            alt="EcoLive"
            className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg object-contain shadow-md shadow-emerald-500/20 shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-sm font-bold tracking-tight text-zinc-100 truncate">EcoLive</h1>
              <span className="text-[9px] sm:text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-indigo-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm shadow-emerald-500/10 shrink-0">
                v2.0.0
              </span>
            </div>
            <p className="hidden md:block text-[11px] text-zinc-400 truncate">Streaming Descentralizado • Latência Ultra-Baixa</p>
          </div>
        </div>



        {isConnected && (
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="hidden lg:flex items-center gap-2.5 text-xs bg-zinc-900/90 border border-zinc-800/90 px-3 py-1.5 rounded-xl shadow-inner">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-zinc-400">Sala:</span>
              <strong
                className="text-zinc-200 font-semibold text-[11px] truncate max-w-[140px]"
                title={getFriendlyRoomName(currentRoom, channelName)}
              >
                {getFriendlyRoomName(currentRoom, channelName)}
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

            {/* BOTÃO INICIAR TRANSMISSÃO */}
            <button
              type="button"
              onClick={() => handleOpenObsModal(false)}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-indigo-900/30 transition-all cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M4 4.5A2.5 2.5 0 001.5 7v10A2.5 2.5 0 004 19.5h11a2.5 2.5 0 002.5-2.5v-2.586l3.293 3.293A1 1 0 0022 17V7a1 1 0 00-1.707-.707L17 9.586V7A2.5 2.5 0 0014.5 4.5H4z" />
              </svg>
              <span className="hidden sm:inline">Iniciar Transmissão</span>
              <span className="sm:hidden">OBS Studio</span>
            </button>

            <button
              type="button"
              onClick={handleExitRoom}
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-[11px] sm:text-xs font-medium text-zinc-300 hover:text-white rounded-xl border border-zinc-800 transition cursor-pointer"
            >
              Sair da Sala
            </button>
          </div>
        )}
      </header>

      {/* Conteúdo Central */}
      <div className="w-full max-w-7xl px-3 sm:px-6 py-3 sm:py-5 flex-1 flex flex-col">
        {!isConnected ? (
          /* CASO 1: AMBIENTE DISCORD ACTIVITY */
          isInsideDiscord ? (
            /* Se o usuário NÃO clicou em Sair da Sala, exibe tela de conexão instantânea */
            !userExitedRef.current ? (
              <div className="max-w-sm w-full mx-auto my-auto flex flex-col gap-4">
                <div className="bg-zinc-900/90 border border-zinc-800/80 p-8 rounded-3xl shadow-2xl backdrop-blur-md text-center">
                  <div className="relative inline-flex mb-4">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={displayName || 'Usuário'}
                        className="h-16 w-16 rounded-2xl border-2 border-indigo-500/50 shadow-xl object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <img
                        src="/ecolive_icon.png"
                        alt={displayName || 'EcoLive'}
                        className="h-16 w-16 rounded-2xl object-cover border-2 border-emerald-500/50 shadow-xl shadow-emerald-500/20 shrink-0"
                      />
                    )}
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-zinc-950 animate-ping" />
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-zinc-950" />
                  </div>

                  <h2 className="text-base font-bold text-zinc-100 truncate">
                    {displayName || 'EcoLive'}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    {getFriendlyRoomName(channelId, channelName)}
                  </p>

                  {joinError ? (
                    <div className="mt-5 space-y-3">
                      <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300">
                        {joinError}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          // Se houve erro de autorização ou ausência de sessão, recarrega para refazer o handshake completo com o Discord
                          if (joinError && (joinError.toLowerCase().includes('autorizado') || joinError.toLowerCase().includes('sessão'))) {
                            window.location.reload();
                          } else {
                            handleJoin();
                          }
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-semibold py-2.5 rounded-xl text-xs transition cursor-pointer"
                      >
                        Tentar Novamente
                      </button>
                    </div>
                  ) : (
                    <div className="mt-6 flex items-center justify-center gap-2.5 text-xs text-indigo-400 font-medium">
                      <svg className="w-4 h-4 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Conectando à chamada...</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Se o usuário clicou voluntariamente em "Sair da Sala", permite reentrar */
              <div className="max-w-sm w-full mx-auto my-auto flex flex-col gap-4">
                <div className="bg-zinc-900/90 border border-zinc-800/80 p-8 rounded-3xl shadow-2xl backdrop-blur-md">
                  <div className="flex items-center gap-3.5 pb-5 border-b border-zinc-800/80">
                    <div className="relative">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={displayName}
                          className="h-12 w-12 rounded-2xl border border-zinc-700/80 shadow-md object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-lg text-white shadow-md">
                          {(displayName || 'U').trim().charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-zinc-500 border-2 border-zinc-950" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-zinc-100 truncate">{displayName}</h3>
                      <p className="text-xs text-zinc-400 font-mono truncate">
                        @{detectedDiscordUser ? detectedDiscordUser.username : displayName}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700/80 text-[10px] font-semibold text-zinc-400">
                          Desconectado
                        </span>
                      </div>
                    </div>
                  </div>

                  {joinError && (
                    <div className="mt-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300">
                      {joinError}
                    </div>
                  )}

                  <div className="space-y-4 mt-5">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        Canal de Transmissão
                      </label>
                      <div className="w-full bg-zinc-950/80 border border-zinc-800/80 rounded-xl px-4 py-3 text-sm text-zinc-200 flex items-center justify-between shadow-inner">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="font-medium truncate">{getFriendlyRoomName(channelId, channelName)}</span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider shrink-0">Discord</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        userExitedRef.current = false;
                        handleJoin();
                      }}
                      disabled={isJoining}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:bg-zinc-800 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/25 cursor-pointer"
                    >
                      {isJoining ? 'Reconectando...' : 'Reentrar na Chamada'}
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : (
            /* CASO 2: NAVEGADOR EXTERNO (FORA DO DISCORD) */
            isCheckingWebAuth ? (
              <div className="max-w-sm w-full mx-auto my-auto flex flex-col gap-4">
                <div className="bg-zinc-900/90 border border-zinc-800/80 p-8 rounded-3xl shadow-2xl backdrop-blur-md text-center">
                  <div className="inline-flex mb-3">
                    <img
                      src="/ecolive_icon.png"
                      alt="EcoLive"
                      className="h-14 w-14 rounded-2xl object-contain shadow-xl shadow-emerald-500/20 shrink-0 animate-pulse"
                    />
                  </div>
                  <h2 className="text-base font-bold text-zinc-100">EcoLive</h2>
                  <p className="text-xs text-zinc-400 mt-2">Verificando autorização...</p>
                </div>
              </div>
            ) : !webSession ? (
              /* TELA DE LOGIN OAUTH2 DISCORD (WEB EXTERNO) */
              <div className="max-w-sm w-full mx-auto my-auto flex flex-col gap-4">
                <div className="bg-zinc-900/90 border border-zinc-800/80 p-8 rounded-3xl shadow-2xl backdrop-blur-md">
                  <div className="text-center mb-6">
                    <div className="inline-flex mb-3">
                      <img
                        src="/ecolive_icon.png"
                        alt="EcoLive"
                        className="h-14 w-14 rounded-2xl object-contain shadow-xl shadow-emerald-500/20 shrink-0"
                      />
                    </div>
                    <h2 className="text-lg font-bold text-zinc-100">EcoLive</h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      Transmissões em tempo real via OBS Studio.
                    </p>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Servidor Autorizado
                    </div>
                  </div>

                  {authError && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300 leading-relaxed">
                      {authError}
                    </div>
                  )}

                  <div className="space-y-4">
                    <a
                      href="/api/auth/discord/login"
                      className="w-full bg-[#5865F2] hover:bg-[#4752C4] active:scale-[0.98] text-white font-semibold py-3.5 px-4 rounded-xl text-sm transition-all shadow-lg shadow-[#5865F2]/25 flex items-center justify-center gap-3 cursor-pointer select-none"
                    >
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 127.14 96.36">
                        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z" />
                      </svg>
                      <span>Entrar com Discord</span>
                    </a>

                    <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
                      Acesso exclusivo para membros de servidores autorizados.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* USUÁRIO AUTENTICADO VIA WEB: PERFIL E ENTRADA NA SALA */
              <div className="max-w-sm w-full mx-auto my-auto flex flex-col gap-4">
                <div className="bg-zinc-900/90 border border-zinc-800/80 p-8 rounded-3xl shadow-2xl backdrop-blur-md">
                  <div className="flex items-center gap-3.5 pb-5 border-b border-zinc-800/80">
                    <div className="relative">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={displayName}
                          className="h-12 w-12 rounded-2xl border border-zinc-700/80 shadow-md object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-lg text-white shadow-md">
                          {(displayName || 'U').trim().charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-zinc-950" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-zinc-100 truncate">{displayName}</h3>
                      <p className="text-xs text-zinc-400 font-mono truncate">
                        @{webSession?.username || displayName}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-400">
                          {webSession?.guildName || 'Servidor Autorizado'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {joinError && (
                    <div className="mt-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300">
                      {joinError}
                    </div>
                  )}

                  <div className="space-y-4 mt-5">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        Sala de Transmissão
                      </label>
                      <div className="w-full bg-zinc-950/80 border border-zinc-800/80 rounded-xl px-4 py-3 text-sm text-zinc-200 flex items-center justify-between shadow-inner">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          <span className="font-medium truncate">{getFriendlyRoomName(channelId, channelName)}</span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider shrink-0">Canal Oficial</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 mt-1 block">
                        Conexão gerenciada automaticamente pelo EcoLive Vault da sua guilda.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleJoin();
                      }}
                      disabled={isJoining}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:bg-zinc-800 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/25 cursor-pointer"
                    >
                      {isJoining ? 'Entrando na Sala...' : 'Entrar na Sala'}
                    </button>

                    <label className="flex items-center justify-center gap-2 pt-1 cursor-pointer select-none group">
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
                        Entrar automaticamente nesta sala
                      </span>
                    </label>

                    {webSession && (
                      <div className="pt-3 border-t border-zinc-800/80 text-center">
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="text-xs text-zinc-500 hover:text-rose-400 transition cursor-pointer"
                        >
                          Desconectar conta Discord
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          )
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

                {/* BOTÃO CARREGAR MÍDIA NO CENTRO */}
                <button
                  type="button"
                  onClick={() => handleOpenObsModal(false)}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white text-sm font-semibold rounded-xl shadow-xl shadow-indigo-600/25 transition-all flex items-center gap-2.5 cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M4 4.5A2.5 2.5 0 001.5 7v10A2.5 2.5 0 004 19.5h11a2.5 2.5 0 002.5-2.5v-2.586l3.293 3.293A1 1 0 0022 17V7a1 1 0 00-1.707-.707L17 9.586V7A2.5 2.5 0 0014.5 4.5H4z" />
                  </svg>
                  <span>Iniciar Transmissão</span>
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
                  {/* Mídias dos Participantes via OBS Studio */}
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
                    Configuração do OBS Studio
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

            {/* Credenciais e Guia do OBS Studio */}
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
                        {copiedField === 'obs_url' ? 'Copiado!' : 'Copiar'}
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
                      <span className="text-zinc-400 font-semibold">2. Chave de Transmissão (Fixa)</span>
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
                          {copiedField === 'obs_key' ? 'Copiado!' : 'Copiar'}
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
                          <strong>A chave anterior será invalidada.</strong> Você precisará colar a nova chave no OBS Studio antes de carregar novamente. Deseja continuar?
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
                      Dica: Esta é a sua <strong className="text-emerald-400">Chave Pessoal Permanente</strong> (estilo Twitch)! Configure uma única vez no OBS Studio. Depois disso, basta entrar na chamada com seus amigos e apertar <strong className="text-zinc-200">Iniciar Mídia</strong> no OBS Studio para a mídia iniciar automaticamente.
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