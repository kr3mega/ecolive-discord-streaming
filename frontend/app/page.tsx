'use client';

import { useState } from 'react';
import { useLiveKit } from '@/hooks/useLiveKit';
import { VideoPlayer } from '@/components/VideoPlayer';

export default function Home() {
  const [channelId, setChannelId] = useState('call-discord-alpha');
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const {
    isConnected,
    isScreenSharing,
    remoteFeeds,
    currentIdentity,
    currentRoom,
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
    if (!channelId.trim() || !userId.trim()) {
      setJoinError('Por favor, informe o Canal de Voz e o ID do Usuário.');
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    try {
      await connect(channelId.trim(), userId.trim(), 'web', displayName.trim() || undefined);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Falha ao conectar à sala.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0d0e12] text-zinc-100 flex flex-col items-center selection:bg-indigo-600/40">
      {/* Barra de Navegação Superior */}
      <header className="w-full border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-emerald-500/20">
            🍃
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-zinc-100">EcoLive</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Alpha 0.1.0
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">WebRTC SFU Descentralizado • Latência Ultra-Baixa</p>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-zinc-400">Canal:</span>
              <strong className="text-zinc-200 font-mono text-[11px]">{currentRoom}</strong>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">ID:</span>
              <strong className="text-zinc-200 font-mono text-[11px]">{currentIdentity}</strong>
            </div>

            {/* Ação Primária: Compartilhamento de Tela (PlayWeb Casual) */}
            <button
              onClick={toggleScreenShare}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition shadow-md ${
                isScreenSharing
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/30'
              }`}
            >
              {isScreenSharing ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                  Parar Transmissão
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Transmitir Tela (1080p60)
                </>
              )}
            </button>

            <button
              onClick={disconnect}
              className="px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-xs font-medium text-zinc-300 hover:text-white rounded-lg transition"
            >
              Sair da Sala
            </button>
          </div>
        )}
      </header>

      {/* Conteúdo Central */}
      <div className="w-full max-w-7xl px-6 py-8 flex-1 flex flex-col">
        {!isConnected ? (
          /* Formulário de Acesso e Apresentação das Modalidades */
          <div className="max-w-md w-full mx-auto my-auto flex flex-col gap-6">
            <div className="bg-zinc-900/90 border border-zinc-800 p-6 rounded-2xl shadow-2xl backdrop-blur-sm">
              <div className="mb-5">
                <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Fase 1 • Ambiente Local</span>
                <h2 className="text-xl font-bold text-zinc-100 mt-1">Entrar no Canal de Transmissão</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Transmissão nativa no navegador (PlayWeb Casual) com Simulcast por hardware e controle FinOps.
                </p>
              </div>

              {joinError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300">
                  {joinError}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleJoin(e);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    ID do Canal de Voz (Discord channel_id)
                  </label>
                  <input
                    type="text"
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    placeholder="ex: call-jogos-01"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                    required
                  />
                  <span className="text-[11px] text-zinc-500 mt-1 block">Cada canal roda em um universo WebRTC totalmente isolado.</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    ID do Usuário Discord (Discord User ID)
                  </label>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="ex: 394829103849 ou seu nick"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono"
                    required
                  />
                  <span className="text-[11px] text-zinc-500 mt-1 block">
                    No modo PlayWeb assume automaticamente: <code className="text-zinc-400">user_[ID]</code>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Nome de Exibição (Opcional)
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="ex: Kayque (Streamer)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleJoin(e);
                  }}
                  disabled={isJoining}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 font-semibold py-2.5 rounded-lg text-sm transition shadow-lg shadow-indigo-600/20 mt-2 cursor-pointer"
                >
                  {isJoining ? 'Conectando ao SFU...' : 'Conectar à Sala'}
                </button>
              </form>
            </div>

            {/* Card Informativo das Modalidades */}
            <div className="bg-zinc-900/40 border border-zinc-800/60 p-4 rounded-xl text-xs space-y-2 text-zinc-400">
              <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                <span className="text-emerald-400">●</span> Modalidade 1: PlayWeb Casual
              </div>
              <p className="text-[11px] leading-relaxed">
                Zero instalações e scripts. O áudio e vídeo são capturados de forma segura e direta pelo navegador via API nativa com aceleração de hardware.
              </p>
            </div>
          </div>
        ) : (
          /* Grid Multi Stream: Concorrência e Mosaico de Transmissões */
          <div className="flex flex-col gap-6 flex-1">
            {/* Notificação de Transmissão Ativa Local */}
            {isScreenSharing && (
              <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-4 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-emerald-400 animate-ping" />
                  <div>
                    <span className="font-semibold text-emerald-200">Você está transmitindo ao vivo</span>
                    <p className="text-zinc-400 text-[11px]">
                      Simulcast ativo com 3 camadas (360p, 720p60, 1080p60). Os espectadores recebem a resolução otimizada via Dynacast.
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleScreenShare}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg transition"
                >
                  Parar
                </button>
              </div>
            )}

            {/* Grid Mosaico Dinâmico */}
            {remoteFeeds.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 border-2 border-dashed border-zinc-800/80 rounded-2xl text-center bg-zinc-900/20">
                <div className="h-12 w-12 rounded-full bg-zinc-800/80 flex items-center justify-center text-xl mb-3">
                  📺
                </div>
                <h3 className="text-sm font-semibold text-zinc-200">Aguardando transmissões na sala</h3>
                <p className="text-xs text-zinc-400 max-w-sm mt-1 mb-4">
                  Você está conectado no canal <strong className="text-zinc-300 font-mono">{currentRoom}</strong> como <strong className="text-zinc-300 font-mono">{currentIdentity}</strong>.
                </p>
                {!isScreenSharing && (
                  <button
                    onClick={toggleScreenShare}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/20 transition flex items-center gap-2"
                  >
                    <span>Transmitir Minha Tela Agora</span>
                  </button>
                )}
                <span className="text-[11px] text-zinc-500 mt-3">
                  Dica: Abra uma nova aba ou navegador anônimo para simular um segundo usuário assistindo ou transmitindo em mosaico.
                </span>
              </div>
            ) : (
              <div
                className={`grid gap-4 w-full ${
                  remoteFeeds.length === 1
                    ? 'grid-cols-1 max-w-5xl mx-auto'
                    : remoteFeeds.length === 2
                    ? 'grid-cols-1 lg:grid-cols-2'
                    : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                }`}
              >
                {remoteFeeds.map((feed) => (
                  <VideoPlayer
                    key={feed.publication.trackSid}
                    publication={feed.publication}
                    participantIdentity={feed.participantIdentity}
                    participantName={feed.participantName}
                    isObs={feed.isObs}
                    onSetQuality={(q) => setQuality(feed.publication, q)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}