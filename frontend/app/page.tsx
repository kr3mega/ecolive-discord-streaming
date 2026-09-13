'use client';

import { useState, useEffect } from 'react';
import { useLiveKit } from '@/hooks/useLiveKit';
import { VideoPlayer } from '@/components/VideoPlayer';

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

  // Auto-detecta o ID do canal de voz do Discord e restaura preferências salvas
  useEffect(() => {
    if (typeof window !== 'undefined') {
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
    }
  }, []);

  // Estados do Modal de Transmissão (Web vs OBS)
  const [isStreamModalOpen, setIsStreamModalOpen] = useState(false);
  const [streamModalView, setStreamModalView] = useState<'choose' | 'obs_details'>('choose');
  const [isGeneratingWhip, setIsGeneratingWhip] = useState(false);
  const [whipCredentials, setWhipCredentials] = useState<WhipCredentials | null>(null);
  const [whipError, setWhipError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const {
    isConnected,
    isScreenSharing,
    remoteFeeds,
    currentIdentity,
    currentRoom,
    localScreenTrack,
    connect,
    disconnect,
    toggleScreenShare,
    setQuality,
  } = useLiveKit();

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
      await connect(channelId.trim() || 'call-discord-alpha', uniqueUserId, 'web', name);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Falha ao conectar à sala.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleOpenStreamModal = () => {
    setStreamModalView('choose');
    setWhipError(null);
    setIsStreamModalOpen(true);
  };

  const handleChooseWeb = async () => {
    setIsStreamModalOpen(false);
    if (!isScreenSharing) {
      await toggleScreenShare();
    }
  };

  const handleChooseObs = async () => {
    setStreamModalView('obs_details');
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
              <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                v0.9.0
              </span>
            </div>
            <p className="hidden md:block text-[11px] text-zinc-400 truncate">Streaming Descentralizado • Latência Ultra-Baixa & 120 FPS</p>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="hidden lg:flex items-center gap-2 text-xs bg-zinc-900/90 border border-zinc-800/90 px-3.5 py-1.5 rounded-xl shadow-inner">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-zinc-400">Sala:</span>
              <strong className="text-zinc-200 font-mono text-[11px]">{currentRoom}</strong>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">Streamer:</span>
              <strong className="text-zinc-200 text-[11px]">{displayName || currentIdentity}</strong>
            </div>

            {/* BOTÃO ÚNICO DE TRANSMISSÃO */}
            {isScreenSharing ? (
              <button
                type="button"
                onClick={toggleScreenShare}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-rose-900/30 transition-all cursor-pointer"
              >
                <span className="h-2 w-2 rounded-full bg-white animate-ping shrink-0" />
                <span className="hidden sm:inline">Parar Transmissão</span>
                <span className="sm:hidden">Parar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenStreamModal}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-indigo-900/30 transition-all cursor-pointer"
              >
                <span>🚀</span>
                <span className="hidden sm:inline">Iniciar Transmissão</span>
                <span className="sm:hidden">Transmitir</span>
              </button>
            )}

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
              <div className="text-center mb-6">
                <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-indigo-600 items-center justify-center font-black text-xl text-white shadow-xl shadow-emerald-500/20 mb-3">
                  🍃
                </div>
                <h2 className="text-lg font-bold text-zinc-100">Bem-vindo ao EcoLive</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Transmissões ao vivo em tempo real com até 120 FPS.
                </p>
              </div>

              {isSimulatingExternal && (
                <div className="mb-4 flex flex-col gap-2">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2.5 shadow-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">🔬</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-amber-200 truncate">Simulador de Amigo Externo Ativo</p>
                        <p className="text-[11px] text-amber-400/80 leading-relaxed truncate">
                          Rotas locais bloqueadas. Testando via operadora.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLogWindow(!showLogWindow)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-bold text-amber-200 transition shrink-0 cursor-pointer"
                    >
                      {showLogWindow ? 'Ocultar Logs' : 'Ver Logs'}
                    </button>
                  </div>

                  {showLogWindow && (
                    <div className="p-3 rounded-2xl bg-black/95 border border-zinc-800 text-zinc-300 shadow-2xl flex flex-col gap-2">
                      <div className="flex items-center justify-between pb-2 border-b border-zinc-800 text-xs font-mono">
                        <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          Diagnóstico ({debugLogs.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(debugLogs.join('\n'));
                            setLogsCopied(true);
                            setTimeout(() => setLogsCopied(false), 2000);
                          }}
                          className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-[11px] font-medium text-zinc-200 transition cursor-pointer"
                        >
                          {logsCopied ? '✓ Copiado!' : 'Copiar Logs'}
                        </button>
                      </div>
                      <div className="h-40 overflow-y-auto font-mono text-[10px] space-y-1 pr-1 select-text scrollbar-thin scrollbar-thumb-zinc-800">
                        {debugLogs.length === 0 ? (
                          <p className="text-zinc-600 italic">Nenhum log registrado ainda. Clique em Entrar para iniciar.</p>
                        ) : (
                          debugLogs.map((log, idx) => (
                            <p
                              key={idx}
                              className={`leading-tight break-all ${
                                log.includes('[ERR]') ? 'text-rose-400' :
                                log.includes('[WARN]') ? 'text-amber-400' : 'text-zinc-400'
                              }`}
                            >
                              {log}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {joinError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300">
                  {joinError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Seu Nome de Exibição
                  </label>
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

                {/* Opções Avançadas (Ocultas por padrão) */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-[11px] text-zinc-500 hover:text-zinc-400 transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showAdvanced ? '▾ Ocultar canal de voz' : '▸ Escolher canal de voz específico'}</span>
                  </button>

                  {showAdvanced && (
                    <div className="mt-2.5">
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                        Canal da Sala
                      </label>
                      <input
                        type="text"
                        value={channelId}
                        onChange={(e) => setChannelId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleJoin();
                          }
                        }}
                        placeholder="call-discord-alpha"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                      />
                    </div>
                  )}
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
            {(!isScreenSharing || !localScreenTrack) && remoteFeeds.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 border border-dashed border-zinc-800/80 rounded-3xl text-center bg-zinc-900/20 my-auto">
                <div className="h-16 w-16 rounded-2xl bg-zinc-800/60 border border-zinc-700/40 flex items-center justify-center text-3xl mb-4 shadow-inner">
                  📺
                </div>
                <h3 className="text-base font-bold text-zinc-100">A sala está pronta</h3>
                <p className="text-xs text-zinc-400 max-w-sm mt-1.5 mb-6 leading-relaxed">
                  Você está conectado como <strong className="text-zinc-200 font-semibold">{displayName || currentIdentity}</strong>. Nenhuma transmissão ativa no momento.
                </p>

                {/* BOTÃO ÚNICO DE TRANSMISSÃO NO CENTRO */}
                {!isScreenSharing && (
                  <button
                    type="button"
                    onClick={handleOpenStreamModal}
                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white text-sm font-semibold rounded-xl shadow-xl shadow-indigo-600/25 transition-all flex items-center gap-2.5 cursor-pointer"
                  >
                    <span>🚀 Iniciar Transmissão</span>
                  </button>
                )}
              </div>
            ) : (
              <div
                className={`grid gap-4 w-full ${
                  (isScreenSharing && localScreenTrack ? 1 : 0) + remoteFeeds.length === 1
                    ? 'grid-cols-1 max-w-5xl mx-auto'
                    : (isScreenSharing && localScreenTrack ? 1 : 0) + remoteFeeds.length === 2
                    ? 'grid-cols-1 lg:grid-cols-2'
                    : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                }`}
              >
                {/* 1. Preview da Transmissão Local (quando transmitindo pelo navegador) */}
                {isScreenSharing && localScreenTrack && (
                  <VideoPlayer
                    localTrack={localScreenTrack}
                    participantIdentity={currentIdentity}
                    participantName={displayName ? `${displayName} (Sua Transmissão)` : 'Sua Transmissão'}
                    isLocal={true}
                  />
                )}

                {/* 2. Transmissões Remotas (outros streamers ou seu OBS Studio) */}
                {remoteFeeds.map((feed) => (
                  <VideoPlayer
                    key={feed.publication.trackSid}
                    publication={feed.publication}
                    participant={feed.participant}
                    participantIdentity={feed.participantIdentity}
                    participantName={feed.participantName}
                    isObs={feed.isObs}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL DE TRANSMISSÃO: Escolha entre Web e OBS */}
      {isStreamModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900/95 border border-zinc-800/90 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 backdrop-blur-md">
            {/* Header do Modal */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🚀</span>
                <h3 className="text-base font-bold text-zinc-100">
                  {streamModalView === 'choose' ? 'Como deseja transmitir?' : 'Configuração do OBS Studio'}
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

            {/* Vista 1: Escolha entre Web e OBS */}
            {streamModalView === 'choose' && (
              <div className="space-y-3">
                {/* Opção 1: Via Navegador */}
                <button
                  type="button"
                  onClick={handleChooseWeb}
                  className="w-full text-left p-4 rounded-2xl border border-zinc-800/90 bg-zinc-950/60 hover:border-indigo-500/60 hover:bg-zinc-950 transition-all group cursor-pointer shadow-sm hover:shadow-indigo-950/20 active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🌐</span>
                      <strong className="text-sm text-zinc-100 group-hover:text-indigo-300 transition">
                        Pelo Navegador (Casual)
                      </strong>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      60 FPS
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Zero instalações. Compartilhe sua tela, janela de jogo ou aba diretamente com 1 clique.
                  </p>
                </button>

                {/* Opção 2: Via OBS Studio */}
                <button
                  type="button"
                  onClick={handleChooseObs}
                  className="w-full text-left p-4 rounded-2xl border border-purple-900/50 bg-purple-950/20 hover:border-purple-500/60 hover:bg-purple-950/40 transition-all group cursor-pointer shadow-sm hover:shadow-purple-950/30 active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🎥</span>
                      <strong className="text-sm text-zinc-100 group-hover:text-purple-300 transition">
                        Pelo OBS Studio (Pro / Gamer)
                      </strong>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                      ⚡ 120 FPS ULTRA
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Transmita jogos pesados a 120 FPS via NVENC com o protocolo nativo WHIP e bitrate liberado.
                  </p>
                </button>
              </div>
            )}

            {/* Vista 2: Credenciais e Guia do OBS */}
            {streamModalView === 'obs_details' && (
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

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setStreamModalView('choose')}
                    className="text-xs font-medium text-zinc-400 hover:text-zinc-200 px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition cursor-pointer"
                  >
                    ← Voltar
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsStreamModalOpen(false)}
                    className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-xs font-semibold rounded-xl text-zinc-100 transition cursor-pointer"
                  >
                    Pronto
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}